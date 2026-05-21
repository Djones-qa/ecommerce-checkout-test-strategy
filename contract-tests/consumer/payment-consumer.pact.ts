/**
 * Pact consumer contract tests — Checkout UI → Payments API
 *
 * Defines the interactions the checkout UI expects from the payments service.
 * These contracts are published to the Pact Broker and verified by the provider.
 *
 * Run with: npm run pact:consumer
 * Uses PactV3 executeTest — no external test runner needed.
 */

import path from 'path';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const { like, regex, integer, string } = MatchersV3;

const provider = new PactV3({
  consumer: 'CheckoutUI',
  provider: 'PaymentsAPI',
  dir: path.resolve(__dirname, '../pacts'),
  logLevel: 'warn',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function postPayment(baseUrl: string, body: object): Promise<Response> {
  return fetch(`${baseUrl}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

// ─── Interaction 1: Successful payment ───────────────────────────────────────

async function testSuccessfulPayment(): Promise<void> {
  await provider
    .given('a valid payment method token exists')
    .uponReceiving('a request to create a payment intent')
    .withRequest({
      method: 'POST',
      path: '/payments',
      headers: {
        'Content-Type': 'application/json',
        Authorization: regex('Bearer [A-Za-z0-9\\-._~+/]+=*', 'Bearer test-token'),
      },
      body: {
        paymentMethodId: string('pm_test_success'),
        amount: integer(9999),
        currency: string('usd'),
        orderId: string('order_abc123'),
        idempotencyKey: string('idem_key_001'),
      },
    })
    .willRespondWith({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        paymentId: regex('pi_[a-zA-Z0-9_]+', 'pi_test_12345'),
        status: string('succeeded'),
        amount: integer(9999),
        currency: string('usd'),
        timestamp: regex('\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}', '2026-05-20T10:00:00'),
      },
    })
    .executeTest(async (mockServer) => {
      const res = await postPayment(mockServer.url, {
        paymentMethodId: 'pm_test_success',
        amount: 9999,
        currency: 'usd',
        orderId: 'order_abc123',
        idempotencyKey: 'idem_key_001',
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.status === 'succeeded', `Expected succeeded, got ${body.status}`);
      assert(/^pi_/.test(body.paymentId), `paymentId should start with pi_`);

      // PCI-DSS: raw card data must never appear in the response
      const bodyStr = JSON.stringify(body);
      assert(!bodyStr.includes('cardNumber'), 'Raw card number must not appear in response');
      assert(!bodyStr.includes('cvv'), 'CVV must not appear in response');

      console.log('✅ Interaction 1 passed: successful payment');
    });
}

// ─── Interaction 2: Declined card ────────────────────────────────────────────

async function testDeclinedCard(): Promise<void> {
  await provider
    .given('the payment method token maps to a declined card')
    .uponReceiving('a request to create a payment intent with a declined card')
    .withRequest({
      method: 'POST',
      path: '/payments',
      headers: { 'Content-Type': 'application/json' },
      body: {
        paymentMethodId: string('pm_test_declined'),
        amount: integer(9999),
        currency: string('usd'),
        orderId: string('order_abc124'),
        idempotencyKey: string('idem_key_002'),
      },
    })
    .willRespondWith({
      status: 402,
      headers: { 'Content-Type': 'application/json' },
      body: {
        paymentId: like('pi_test_failed'),
        status: string('failed'),
        amount: integer(9999),
        currency: string('usd'),
        timestamp: like('2026-05-20T10:00:00Z'),
        error: {
          code: string('card_declined'),
          declineCode: string('generic_decline'),
          message: string('Your card was declined.'),
        },
      },
    })
    .executeTest(async (mockServer) => {
      const res = await postPayment(mockServer.url, {
        paymentMethodId: 'pm_test_declined',
        amount: 9999,
        currency: 'usd',
        orderId: 'order_abc124',
        idempotencyKey: 'idem_key_002',
      });

      assert(res.status === 402, `Expected 402, got ${res.status}`);
      const body = await res.json();
      assert(body.status === 'failed', `Expected failed, got ${body.status}`);
      assert(body.error.code === 'card_declined', `Expected card_declined, got ${body.error.code}`);

      console.log('✅ Interaction 2 passed: declined card');
    });
}

// ─── Interaction 3: Get payment by ID ────────────────────────────────────────

async function testGetPayment(): Promise<void> {
  await provider
    .given('a payment with ID pi_test_12345 exists')
    .uponReceiving('a request to retrieve payment pi_test_12345')
    .withRequest({
      method: 'GET',
      path: '/payments/pi_test_12345',
      headers: {
        Authorization: regex('Bearer [A-Za-z0-9\\-._~+/]+=*', 'Bearer test-token'),
      },
    })
    .willRespondWith({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        paymentId: string('pi_test_12345'),
        status: string('succeeded'),
        amount: integer(9999),
        currency: string('usd'),
        timestamp: like('2026-05-20T10:00:00Z'),
      },
    })
    .executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/payments/pi_test_12345`, {
        headers: { Authorization: 'Bearer test-token' },
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.paymentId === 'pi_test_12345', 'paymentId mismatch');
      assert(body.status === 'succeeded', 'status mismatch');

      console.log('✅ Interaction 3 passed: get payment by ID');
    });
}

// ─── Interaction 4: Payment not found ────────────────────────────────────────

async function testPaymentNotFound(): Promise<void> {
  await provider
    .given('no payment with ID pi_unknown exists')
    .uponReceiving('a request to retrieve a non-existent payment')
    .withRequest({
      method: 'GET',
      path: '/payments/pi_unknown',
      headers: {
        Authorization: regex('Bearer [A-Za-z0-9\\-._~+/]+=*', 'Bearer test-token'),
      },
    })
    .willRespondWith({
      status: 404,
      headers: { 'Content-Type': 'application/json' },
      body: {
        statusCode: integer(404),
        error: string('Not Found'),
        message: string('Payment not found'),
      },
    })
    .executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/payments/pi_unknown`, {
        headers: { Authorization: 'Bearer test-token' },
      });

      assert(res.status === 404, `Expected 404, got ${res.status}`);

      console.log('✅ Interaction 4 passed: payment not found');
    });
}

// ─── Interaction 5: Refund ────────────────────────────────────────────────────

async function testRefund(): Promise<void> {
  await provider
    .given('a succeeded payment with ID pi_test_12345 exists')
    .uponReceiving('a request to refund payment pi_test_12345')
    .withRequest({
      method: 'POST',
      path: '/payments/pi_test_12345/refund',
      headers: {
        'Content-Type': 'application/json',
        Authorization: regex('Bearer [A-Za-z0-9\\-._~+/]+=*', 'Bearer test-token'),
      },
      body: {
        amount: integer(9999),
        reason: string('customer_request'),
      },
    })
    .willRespondWith({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        refundId: regex('re_[a-zA-Z0-9_]+', 're_test_refund_001'),
        paymentId: string('pi_test_12345'),
        amount: integer(9999),
        status: string('refunded'),
        timestamp: like('2026-05-20T11:00:00Z'),
      },
    })
    .executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/payments/pi_test_12345/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: JSON.stringify({ amount: 9999, reason: 'customer_request' }),
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.status === 'refunded', `Expected refunded, got ${body.status}`);
      assert(/^re_/.test(body.refundId), 'refundId should start with re_');

      console.log('✅ Interaction 5 passed: refund');
    });
}

// ─── Run all interactions ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n=== Pact Consumer Contract Tests — CheckoutUI → PaymentsAPI ===\n');

  try {
    await testSuccessfulPayment();
    await testDeclinedCard();
    await testGetPayment();
    await testPaymentNotFound();
    await testRefund();

    console.log('\n✅ All consumer contract interactions passed');
    console.log(`📄 Pact file written to: ${path.resolve(__dirname, '../pacts')}\n`);
  } catch (err) {
    console.error('\n❌ Consumer contract tests failed:', err);
    process.exit(1);
  }
}

main();
