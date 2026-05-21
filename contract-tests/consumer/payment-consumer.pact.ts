/**
 * Pact consumer contract tests — Checkout UI → Payments API
 *
 * Defines the interactions the checkout UI expects from the payments service.
 * These contracts are published to the Pact Broker and verified by the provider.
 */

import path from 'path';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const { like, regex, integer, string, eachLike } = MatchersV3;

const provider = new PactV3({
  consumer: 'CheckoutUI',
  provider: 'PaymentsAPI',
  dir: path.resolve(__dirname, '../pacts'),
  logLevel: 'warn',
});

// ─── POST /payments — create payment intent ───────────────────────────────────

describe('PaymentsAPI — POST /payments', () => {
  it('returns a succeeded payment intent for a valid token', async () => {
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
          timestamp: regex(
            '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}',
            '2026-05-20T10:00:00'
          ),
        },
      })
      .executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          },
          body: JSON.stringify({
            paymentMethodId: 'pm_test_success',
            amount: 9999,
            currency: 'usd',
            orderId: 'order_abc123',
            idempotencyKey: 'idem_key_001',
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.status).toBe('succeeded');
        expect(body.paymentId).toMatch(/^pi_/);
        // PCI-DSS: raw card data must never appear in the response
        expect(JSON.stringify(body)).not.toContain('cardNumber');
        expect(JSON.stringify(body)).not.toContain('cvv');
      });
  });

  it('returns a 402 with error details for a declined card', async () => {
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
        const response = await fetch(`${mockServer.url}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethodId: 'pm_test_declined',
            amount: 9999,
            currency: 'usd',
            orderId: 'order_abc124',
            idempotencyKey: 'idem_key_002',
          }),
        });

        expect(response.status).toBe(402);
        const body = await response.json();
        expect(body.status).toBe('failed');
        expect(body.error.code).toBe('card_declined');
      });
  });
});

// ─── GET /payments/:id — retrieve payment ─────────────────────────────────────

describe('PaymentsAPI — GET /payments/:id', () => {
  it('returns payment details for a known payment ID', async () => {
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
        const response = await fetch(`${mockServer.url}/payments/pi_test_12345`, {
          headers: { Authorization: 'Bearer test-token' },
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.paymentId).toBe('pi_test_12345');
        expect(body.status).toBe('succeeded');
      });
  });

  it('returns 404 for an unknown payment ID', async () => {
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
        const response = await fetch(`${mockServer.url}/payments/pi_unknown`, {
          headers: { Authorization: 'Bearer test-token' },
        });

        expect(response.status).toBe(404);
      });
  });
});

// ─── POST /payments/:id/refund ────────────────────────────────────────────────

describe('PaymentsAPI — POST /payments/:id/refund', () => {
  it('returns a refund confirmation for a succeeded payment', async () => {
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
        const response = await fetch(`${mockServer.url}/payments/pi_test_12345/refund`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          },
          body: JSON.stringify({ amount: 9999, reason: 'customer_request' }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.status).toBe('refunded');
        expect(body.refundId).toMatch(/^re_/);
      });
  });
});
