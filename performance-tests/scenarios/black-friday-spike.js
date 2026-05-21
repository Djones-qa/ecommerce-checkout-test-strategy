/**
 * k6 Black Friday spike scenario
 *
 * Simulates realistic Black Friday traffic:
 * - Midnight open: sudden spike from 0 → 500 VUs in 2 minutes
 * - Sustained peak: 500 VUs for 10 minutes
 * - Flash sale surge: spike to 800 VUs for 2 minutes
 * - Gradual wind-down
 *
 * Thresholds are stricter than the standard load test — Black Friday
 * is a known event and the system must be pre-scaled.
 *
 * Run: k6 run performance-tests/scenarios/black-friday-spike.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// ─── Custom metrics ───────────────────────────────────────────────────────────

const checkoutErrors = new Rate('checkout_errors');
const paymentDuration = new Trend('payment_duration', true);
const cartAbandonments = new Counter('cart_abandonments');
const ordersCompleted = new Counter('orders_completed');
const activeCheckouts = new Gauge('active_checkouts');

// ─── Scenario configuration ───────────────────────────────────────────────────

export const options = {
  scenarios: {
    black_friday_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },   // Pre-midnight trickle
        { duration: '2m', target: 500 },   // Midnight spike
        { duration: '10m', target: 500 },  // Sustained Black Friday peak
        { duration: '1m', target: 800 },   // Flash sale surge
        { duration: '2m', target: 500 },   // Back to peak
        { duration: '3m', target: 100 },   // Wind-down
        { duration: '1m', target: 0 },     // Done
      ],
      gracefulRampDown: '30s',
    },
  },

  thresholds: {
    // Black Friday SLA: p95 must stay under 2s even at peak
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    // Error rate must stay under 1% — revenue is on the line
    http_req_failed: ['rate<0.01'],
    checkout_errors: ['rate<0.01'],
    // Payment step specifically
    payment_duration: ['p(95)<3000'],
  },
};

// ─── Environment ──────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${__ENV.API_KEY || 'test-api-key'}`,
};

// ─── Realistic product catalog (Black Friday items) ───────────────────────────

const HOT_PRODUCTS = [
  { id: 'prod_tv_65', weight: 30 },       // 65" TV — most popular
  { id: 'prod_laptop_pro', weight: 25 },  // Laptop
  { id: 'prod_headphones', weight: 20 },  // Headphones
  { id: 'prod_phone_case', weight: 15 },  // Accessories
  { id: 'prod_tablet', weight: 10 },      // Tablet
];

function weightedRandomProduct() {
  const total = HOT_PRODUCTS.reduce((sum, p) => sum + p.weight, 0);
  let rand = Math.random() * total;
  for (const product of HOT_PRODUCTS) {
    rand -= product.weight;
    if (rand <= 0) return product.id;
  }
  return HOT_PRODUCTS[0].id;
}

// ─── User behavior profiles ───────────────────────────────────────────────────

// 70% complete checkout, 30% abandon at various stages (realistic Black Friday)
function shouldAbandon(stage) {
  const abandonRates = {
    cart: 0.10,
    address: 0.12,
    shipping: 0.05,
    payment: 0.03,
  };
  return Math.random() < (abandonRates[stage] || 0);
}

// ─── Main scenario ────────────────────────────────────────────────────────────

export default function () {
  activeCheckouts.add(1);

  const email = `bf_${__VU}_${__ITER}_${Date.now()}@example.com`;
  let sessionToken = '';
  let abandoned = false;

  // Step 1: Create session
  group('Session creation', () => {
    const res = http.post(
      `${BASE_URL}/api/checkout/sessions`,
      JSON.stringify({ email, type: 'guest' }),
      { headers: HEADERS }
    );

    const ok = check(res, {
      'session created (200)': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });

    checkoutErrors.add(!ok);
    if (ok) {
      try { sessionToken = JSON.parse(res.body).sessionId; } catch { /* */ }
    }
  });

  if (!sessionToken) { activeCheckouts.add(-1); return; }

  sleep(Math.random() * 2 + 0.5); // Browse time

  // Step 2: Add to cart
  group('Add to cart', () => {
    const productId = weightedRandomProduct();
    const res = http.post(
      `${BASE_URL}/api/cart`,
      JSON.stringify({ productId, qty: 1, sessionId: sessionToken }),
      { headers: HEADERS }
    );

    check(res, {
      'item added (200)': (r) => r.status === 200,
      'response time < 300ms': (r) => r.timings.duration < 300,
    });
  });

  if (shouldAbandon('cart')) {
    cartAbandonments.add(1);
    activeCheckouts.add(-1);
    sleep(1);
    return;
  }

  sleep(Math.random() * 3 + 1); // Decision time

  // Step 3: Address
  group('Submit address', () => {
    const res = http.post(
      `${BASE_URL}/api/checkout/address`,
      JSON.stringify({
        sessionId: sessionToken,
        address: {
          firstName: 'Black',
          lastName: 'Friday',
          line1: `${Math.floor(Math.random() * 9999) + 1} Deal Street`,
          city: 'Austin',
          state: 'TX',
          zip: '78701',
          country: 'US',
        },
      }),
      { headers: HEADERS }
    );

    const ok = check(res, { 'address accepted (200)': (r) => r.status === 200 });
    checkoutErrors.add(!ok);
  });

  if (shouldAbandon('address')) {
    cartAbandonments.add(1);
    activeCheckouts.add(-1);
    sleep(1);
    return;
  }

  sleep(0.5);

  // Step 4: Shipping
  group('Select shipping', () => {
    // On Black Friday, most users pick standard to save money
    const shippingChoice = Math.random() < 0.7 ? 'standard' : 'express';
    const res = http.post(
      `${BASE_URL}/api/checkout/shipping`,
      JSON.stringify({ sessionId: sessionToken, shippingOptionId: shippingChoice }),
      { headers: HEADERS }
    );

    check(res, { 'shipping selected (200)': (r) => r.status === 200 });
  });

  if (shouldAbandon('shipping')) {
    cartAbandonments.add(1);
    activeCheckouts.add(-1);
    sleep(1);
    return;
  }

  sleep(Math.random() * 2 + 1); // Payment form fill time

  // Step 5: Payment — the critical step
  group('Process payment', () => {
    const start = Date.now();

    const res = http.post(
      `${BASE_URL}/api/payments`,
      JSON.stringify({
        paymentMethodId: 'pm_test_success',
        sessionId: sessionToken,
        idempotencyKey: `bf_${__VU}_${__ITER}_${Date.now()}`,
      }),
      { headers: HEADERS, timeout: '15s' }
    );

    const elapsed = Date.now() - start;
    paymentDuration.add(elapsed);

    const ok = check(res, {
      'payment succeeded (200)': (r) => r.status === 200,
      'payment response < 3s': (r) => r.timings.duration < 3000,
      'order ID in response': (r) => {
        try { return Boolean(JSON.parse(r.body).orderId); } catch { return false; }
      },
    });

    checkoutErrors.add(!ok);

    if (ok) {
      ordersCompleted.add(1);
    } else {
      cartAbandonments.add(1);
    }
  });

  activeCheckouts.add(-1);
  sleep(Math.random() * 1 + 0.5);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const errorRate = (data.metrics.http_req_failed?.values?.rate || 0) * 100;
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] || 0;
  const p99 = data.metrics.http_req_duration?.values?.['p(99)'] || 0;
  const completed = data.metrics.orders_completed?.values?.count || 0;
  const abandoned = data.metrics.cart_abandonments?.values?.count || 0;
  const conversionRate = completed / (completed + abandoned) * 100 || 0;

  return {
    'k6-results/black-friday-summary.json': JSON.stringify(data, null, 2),
    stdout: `
╔══════════════════════════════════════════════╗
║       BLACK FRIDAY SPIKE TEST RESULTS        ║
╚══════════════════════════════════════════════╝

Traffic
  Peak VUs:          ${data.metrics.vus_max?.values?.max || 0}
  Total requests:    ${data.metrics.http_reqs?.values?.count || 0}

Performance
  p95 response time: ${p95.toFixed(0)}ms  ${p95 < 2000 ? '✅' : '❌ THRESHOLD BREACHED'}
  p99 response time: ${p99.toFixed(0)}ms
  Payment p95:       ${data.metrics.payment_duration?.values?.['p(95)']?.toFixed(0) || 'N/A'}ms

Reliability
  Error rate:        ${errorRate.toFixed(2)}%  ${errorRate < 1 ? '✅' : '❌ THRESHOLD BREACHED'}

Business
  Orders completed:  ${completed}
  Cart abandonments: ${abandoned}
  Conversion rate:   ${conversionRate.toFixed(1)}%
`,
  };
}
