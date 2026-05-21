/**
 * k6 stress test — find the checkout breaking point
 *
 * Ramps VUs aggressively until the system degrades.
 * Goal: identify the maximum sustainable throughput before error rate exceeds 5%.
 *
 * Run: k6 run performance-tests/checkout-stress.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const checkoutErrors = new Rate('checkout_errors');
const paymentDuration = new Trend('payment_duration', true);
const ordersCompleted = new Counter('orders_completed');
const paymentFailures = new Counter('payment_failures');

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Baseline
    { duration: '2m', target: 200 },   // Moderate load
    { duration: '2m', target: 400 },   // High load
    { duration: '2m', target: 600 },   // Stress
    { duration: '2m', target: 800 },   // Breaking point search
    { duration: '2m', target: 1000 },  // Beyond expected capacity
    { duration: '3m', target: 0 },     // Recovery ramp-down
  ],
  thresholds: {
    // Stress test: allow higher error rate — we're looking for the breaking point
    http_req_failed: ['rate<0.10'],
    // Track but don't fail on p95 — we want to observe degradation
    http_req_duration: ['p(99)<10000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${__ENV.API_KEY || 'test-api-key'}`,
};

function randomEmail() {
  return `stress_${__VU}_${__ITER}@example.com`;
}

export default function () {
  let sessionToken = '';

  // Abbreviated flow for stress testing — focus on the payment endpoint
  group('Create session', () => {
    const res = http.post(
      `${BASE_URL}/api/checkout/sessions`,
      JSON.stringify({ email: randomEmail(), type: 'guest' }),
      { headers: HEADERS }
    );

    const ok = check(res, { 'session created': (r) => r.status === 200 });
    checkoutErrors.add(!ok);

    if (ok) {
      try {
        sessionToken = JSON.parse(res.body).sessionId;
      } catch {
        checkoutErrors.add(1);
      }
    }
  });

  if (!sessionToken) {
    sleep(1);
    return;
  }

  group('Add to cart', () => {
    const res = http.post(
      `${BASE_URL}/api/cart`,
      JSON.stringify({ productId: 'prod_001', qty: 1, sessionId: sessionToken }),
      { headers: HEADERS }
    );
    check(res, { 'cart updated': (r) => r.status === 200 });
  });

  group('Submit address + shipping (combined)', () => {
    const res = http.post(
      `${BASE_URL}/api/checkout/address`,
      JSON.stringify({
        sessionId: sessionToken,
        address: { firstName: 'Stress', lastName: 'Test', line1: '1 Load Ave', city: 'Austin', state: 'TX', zip: '78701', country: 'US' },
        shippingOptionId: 'standard',
      }),
      { headers: HEADERS }
    );
    check(res, { 'address+shipping accepted': (r) => r.status === 200 });
  });

  group('Payment', () => {
    const start = Date.now();

    const res = http.post(
      `${BASE_URL}/api/payments`,
      JSON.stringify({
        paymentMethodId: 'pm_test_success',
        sessionId: sessionToken,
        idempotencyKey: `idem_${__VU}_${__ITER}_${Date.now()}`,
      }),
      { headers: HEADERS, timeout: '10s' }
    );

    paymentDuration.add(Date.now() - start);

    const ok = check(res, {
      'payment processed': (r) => r.status === 200 || r.status === 402,
      'payment succeeded': (r) => {
        try { return JSON.parse(r.body).status === 'succeeded'; } catch { return false; }
      },
    });

    if (res.status === 200) {
      ordersCompleted.add(1);
    } else {
      paymentFailures.add(1);
      checkoutErrors.add(1);
    }
  });

  sleep(0.5);
}

export function handleSummary(data) {
  const errorRate = (data.metrics.http_req_failed?.values?.rate || 0) * 100;
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] || 0;
  const p99 = data.metrics.http_req_duration?.values?.['p(99)'] || 0;
  const maxVUs = data.metrics.vus_max?.values?.max || 0;

  return {
    'k6-results/checkout-stress-summary.json': JSON.stringify(data, null, 2),
    stdout: `
=== Checkout Stress Test Summary ===
Peak VUs reached: ${maxVUs}
Total requests: ${data.metrics.http_reqs?.values?.count || 0}
Error rate: ${errorRate.toFixed(2)}%
p95 response time: ${p95.toFixed(0)}ms
p99 response time: ${p99.toFixed(0)}ms
Orders completed: ${data.metrics.orders_completed?.values?.count || 0}
Payment failures: ${data.metrics.payment_failures?.values?.count || 0}

Breaking point analysis:
  Error rate ${errorRate > 5 ? '⚠️  EXCEEDED 5%' : '✅ within 5%'} threshold
  p95 ${p95 > 5000 ? '⚠️  EXCEEDED 5s' : '✅ within 5s'} under stress
`,
  };
}
