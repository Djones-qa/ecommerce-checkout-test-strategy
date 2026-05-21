/**
 * k6 load test — standard checkout flow
 *
 * Simulates 100 concurrent users completing the checkout flow.
 * Thresholds: p95 < 2s, error rate < 1%
 *
 * Run: k6 run performance-tests/checkout-load.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ─── Custom metrics ───────────────────────────────────────────────────────────

const checkoutErrors = new Rate('checkout_errors');
const paymentDuration = new Trend('payment_duration', true);
const ordersCompleted = new Counter('orders_completed');

// ─── Test configuration ───────────────────────────────────────────────────────

export const options = {
  stages: [
    { duration: '1m', target: 20 },   // Ramp up to 20 VUs
    { duration: '3m', target: 100 },  // Ramp up to 100 VUs
    { duration: '5m', target: 100 },  // Hold at 100 VUs
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    // p95 response time must be under 2 seconds
    http_req_duration: ['p(95)<2000'],
    // Overall error rate must be under 1%
    http_req_failed: ['rate<0.01'],
    // Checkout-specific error rate
    checkout_errors: ['rate<0.01'],
    // Payment step specifically must be fast
    payment_duration: ['p(95)<3000'],
  },
};

// ─── Environment ──────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,
};

// ─── Test data helpers ────────────────────────────────────────────────────────

function randomEmail() {
  return `loadtest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
}

function randomIdempotencyKey() {
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

const PRODUCTS = ['prod_001', 'prod_002', 'prod_003'];

function randomProduct() {
  return PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
}

// ─── Checkout flow ────────────────────────────────────────────────────────────

export default function () {
  const sessionEmail = randomEmail();
  let sessionToken = '';
  let orderId = '';

  group('1. Create checkout session', () => {
    const res = http.post(
      `${BASE_URL}/api/checkout/sessions`,
      JSON.stringify({ email: sessionEmail, type: 'guest' }),
      { headers: HEADERS }
    );

    const ok = check(res, {
      'session created (200)': (r) => r.status === 200,
      'session ID returned': (r) => {
        try {
          return JSON.parse(r.body).sessionId !== undefined;
        } catch {
          return false;
        }
      },
    });

    checkoutErrors.add(!ok);

    if (ok) {
      sessionToken = JSON.parse(res.body).sessionId;
    }
  });

  sleep(1);

  group('2. Add item to cart', () => {
    const res = http.post(
      `${BASE_URL}/api/cart`,
      JSON.stringify({ productId: randomProduct(), qty: 1, sessionId: sessionToken }),
      { headers: HEADERS }
    );

    const ok = check(res, {
      'item added to cart (200)': (r) => r.status === 200,
    });

    checkoutErrors.add(!ok);
  });

  sleep(0.5);

  group('3. Submit shipping address', () => {
    const res = http.post(
      `${BASE_URL}/api/checkout/address`,
      JSON.stringify({
        sessionId: sessionToken,
        address: {
          firstName: 'Load',
          lastName: 'Test',
          line1: '123 Test Street',
          city: 'Austin',
          state: 'TX',
          zip: '78701',
          country: 'US',
        },
      }),
      { headers: HEADERS }
    );

    const ok = check(res, {
      'address accepted (200)': (r) => r.status === 200,
    });

    checkoutErrors.add(!ok);
  });

  sleep(0.5);

  group('4. Fetch shipping options', () => {
    const res = http.get(
      `${BASE_URL}/api/shipping/options?sessionId=${sessionToken}`,
      { headers: HEADERS }
    );

    const ok = check(res, {
      'shipping options returned (200)': (r) => r.status === 200,
      'at least one option available': (r) => {
        try {
          return JSON.parse(r.body).options.length > 0;
        } catch {
          return false;
        }
      },
    });

    checkoutErrors.add(!ok);
  });

  sleep(0.5);

  group('5. Select shipping', () => {
    const res = http.post(
      `${BASE_URL}/api/checkout/shipping`,
      JSON.stringify({ sessionId: sessionToken, shippingOptionId: 'standard' }),
      { headers: HEADERS }
    );

    const ok = check(res, {
      'shipping selected (200)': (r) => r.status === 200,
    });

    checkoutErrors.add(!ok);
  });

  sleep(1);

  group('6. Process payment', () => {
    const start = Date.now();

    const res = http.post(
      `${BASE_URL}/api/payments`,
      JSON.stringify({
        paymentMethodId: 'pm_test_success',
        sessionId: sessionToken,
        idempotencyKey: randomIdempotencyKey(),
      }),
      { headers: HEADERS }
    );

    paymentDuration.add(Date.now() - start);

    const ok = check(res, {
      'payment succeeded (200)': (r) => r.status === 200,
      'payment ID returned': (r) => {
        try {
          return JSON.parse(r.body).paymentId !== undefined;
        } catch {
          return false;
        }
      },
      'status is succeeded': (r) => {
        try {
          return JSON.parse(r.body).status === 'succeeded';
        } catch {
          return false;
        }
      },
    });

    checkoutErrors.add(!ok);

    if (ok) {
      orderId = JSON.parse(res.body).orderId || '';
      ordersCompleted.add(1);
    }
  });

  sleep(0.5);

  group('7. Fetch order confirmation', () => {
    if (!orderId) return;

    const res = http.get(
      `${BASE_URL}/api/orders/${orderId}`,
      { headers: HEADERS }
    );

    check(res, {
      'order confirmation returned (200)': (r) => r.status === 200,
      'order status is confirmed': (r) => {
        try {
          return JSON.parse(r.body).status === 'confirmed';
        } catch {
          return false;
        }
      },
    });
  });

  sleep(Math.random() * 2 + 1); // Think time: 1–3 seconds between iterations
}

export function handleSummary(data) {
  return {
    'k6-results/checkout-load-summary.json': JSON.stringify(data, null, 2),
    stdout: `
=== Checkout Load Test Summary ===
VUs: ${data.metrics.vus_max?.values?.max || 'N/A'}
Requests: ${data.metrics.http_reqs?.values?.count || 'N/A'}
Error rate: ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%
p95 response time: ${data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(0) || 'N/A'}ms
Orders completed: ${data.metrics.orders_completed?.values?.count || 0}
Payment p95: ${data.metrics.payment_duration?.values?.['p(95)']?.toFixed(0) || 'N/A'}ms
`,
  };
}
