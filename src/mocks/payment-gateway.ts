/**
 * Mock payment gateway for local development and E2E testing.
 * Simulates Stripe-like responses without hitting a real payment processor.
 *
 * Usage: imported by MSW handlers or used directly in Cypress intercepts.
 */

import type { PaymentRequest, PaymentResponse, PaymentStatus } from '../types/checkout';

// ─── Scenario card numbers (mirrors Stripe test cards) ────────────────────────

export const TEST_CARDS: Record<string, string> = {
  SUCCESS: '4242424242424242',
  DECLINED: '4000000000000002',
  INSUFFICIENT_FUNDS: '4000000000009995',
  EXPIRED: '4000000000000069',
  NETWORK_ERROR: '4000000000000119',
  THREE_DS_REQUIRED: '4000002500003155',
  FRAUD_BLOCKED: '4100000000000019',
};

// ─── Token → scenario mapping ─────────────────────────────────────────────────

type PaymentScenario =
  | 'success'
  | 'declined'
  | 'insufficient_funds'
  | 'expired'
  | 'network_error'
  | 'three_ds_required'
  | 'fraud_blocked';

const TOKEN_SCENARIO_MAP: Record<string, PaymentScenario> = {
  pm_test_success: 'success',
  pm_test_declined: 'declined',
  pm_test_insufficient: 'insufficient_funds',
  pm_test_expired: 'expired',
  pm_test_network: 'network_error',
  pm_test_3ds: 'three_ds_required',
  pm_test_fraud: 'fraud_blocked',
};

// ─── Response builders ────────────────────────────────────────────────────────

function buildSuccessResponse(req: PaymentRequest): PaymentResponse {
  return {
    paymentId: `pi_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    status: 'succeeded' as PaymentStatus,
    amount: req.amount,
    currency: req.currency,
    timestamp: new Date().toISOString(),
  };
}

function buildErrorResponse(
  req: PaymentRequest,
  code: string,
  message: string,
  declineCode?: string
): PaymentResponse {
  return {
    paymentId: `pi_${Date.now()}_failed`,
    status: 'failed' as PaymentStatus,
    amount: req.amount,
    currency: req.currency,
    timestamp: new Date().toISOString(),
    error: {
      code,
      message,
      ...(declineCode ? { declineCode } : {}),
    },
  };
}

// ─── Main mock handler ────────────────────────────────────────────────────────

export interface MockPaymentResult {
  statusCode: number;
  body: PaymentResponse;
  delay?: number;
}

export function mockPaymentGateway(req: PaymentRequest): MockPaymentResult {
  const scenario = TOKEN_SCENARIO_MAP[req.paymentMethodId] ?? 'success';

  switch (scenario) {
    case 'success':
      return {
        statusCode: 200,
        body: buildSuccessResponse(req),
      };

    case 'declined':
      return {
        statusCode: 402,
        body: buildErrorResponse(req, 'card_declined', 'Your card was declined.', 'generic_decline'),
      };

    case 'insufficient_funds':
      return {
        statusCode: 402,
        body: buildErrorResponse(
          req,
          'card_declined',
          'Your card has insufficient funds.',
          'insufficient_funds'
        ),
      };

    case 'expired':
      return {
        statusCode: 402,
        body: buildErrorResponse(req, 'expired_card', 'Your card has expired.'),
      };

    case 'network_error':
      return {
        statusCode: 503,
        body: buildErrorResponse(
          req,
          'api_connection_error',
          'A network error occurred. Please try again.'
        ),
        delay: 5000,
      };

    case 'three_ds_required':
      return {
        statusCode: 402,
        body: buildErrorResponse(
          req,
          'authentication_required',
          'This card requires additional authentication.'
        ),
      };

    case 'fraud_blocked':
      return {
        statusCode: 402,
        body: buildErrorResponse(
          req,
          'card_declined',
          'Your card was declined.',
          'fraudulent'
        ),
      };

    default:
      return {
        statusCode: 200,
        body: buildSuccessResponse(req),
      };
  }
}

// ─── Tokenizer mock ───────────────────────────────────────────────────────────

/**
 * Maps test card numbers to payment method tokens.
 * In production, Stripe.js does this in the browser.
 * This mock is used in unit/contract tests only — never in E2E (Stripe iframe handles it).
 */
export function tokenizeCard(cardNumber: string): string {
  const tokenMap: Record<string, string> = {
    [TEST_CARDS.SUCCESS]: 'pm_test_success',
    [TEST_CARDS.DECLINED]: 'pm_test_declined',
    [TEST_CARDS.INSUFFICIENT_FUNDS]: 'pm_test_insufficient',
    [TEST_CARDS.EXPIRED]: 'pm_test_expired',
    [TEST_CARDS.NETWORK_ERROR]: 'pm_test_network',
    [TEST_CARDS.THREE_DS_REQUIRED]: 'pm_test_3ds',
    [TEST_CARDS.FRAUD_BLOCKED]: 'pm_test_fraud',
  };

  const token = tokenMap[cardNumber.replace(/\s/g, '')];
  if (!token) {
    throw new Error(`No test token mapped for card number. Use a TEST_CARDS constant.`);
  }
  return token;
}
