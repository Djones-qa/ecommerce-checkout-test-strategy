/**
 * Pact provider verification — Payments API
 *
 * Verifies that the Payments API satisfies all consumer contracts
 * published to the Pact Broker by the CheckoutUI consumer.
 *
 * Run this against a live instance of the Payments API in CI.
 */

import { Verifier, VerifierOptions } from '@pact-foundation/pact';
import path from 'path';

const PAYMENTS_API_URL = process.env.PAYMENTS_API_URL || 'http://localhost:3001';
const PACT_BROKER_URL = process.env.PACT_BROKER_URL || 'http://localhost:9292';
const PACT_BROKER_TOKEN = process.env.PACT_BROKER_TOKEN || '';

// ─── Provider state handlers ──────────────────────────────────────────────────
// These set up the database/state the provider needs before each interaction.

const stateHandlers: Record<string, () => Promise<void>> = {
  'a valid payment method token exists': async () => {
    // Seed: ensure pm_test_success is a recognized token in the payments service
    await fetch(`${PAYMENTS_API_URL}/_test/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethodId: 'pm_test_success', scenario: 'success' }),
    });
  },

  'the payment method token maps to a declined card': async () => {
    await fetch(`${PAYMENTS_API_URL}/_test/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethodId: 'pm_test_declined', scenario: 'declined' }),
    });
  },

  'a payment with ID pi_test_12345 exists': async () => {
    await fetch(`${PAYMENTS_API_URL}/_test/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId: 'pi_test_12345',
        status: 'succeeded',
        amount: 9999,
        currency: 'usd',
      }),
    });
  },

  'a succeeded payment with ID pi_test_12345 exists': async () => {
    await fetch(`${PAYMENTS_API_URL}/_test/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId: 'pi_test_12345',
        status: 'succeeded',
        amount: 9999,
        currency: 'usd',
      }),
    });
  },

  'no payment with ID pi_unknown exists': async () => {
    // Ensure pi_unknown does not exist — delete if present
    await fetch(`${PAYMENTS_API_URL}/_test/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: 'pi_unknown' }),
    });
  },
};

// ─── Verifier configuration ───────────────────────────────────────────────────

async function runProviderVerification(): Promise<void> {
  const usePactBroker = Boolean(PACT_BROKER_TOKEN);

  const verifierOptions = {
    provider: 'PaymentsAPI',
    providerBaseUrl: PAYMENTS_API_URL,

    // Use Pact Broker in CI; fall back to local pact files in development
    ...(usePactBroker
      ? {
          pactBrokerUrl: PACT_BROKER_URL,
          pactBrokerToken: PACT_BROKER_TOKEN,
          publishVerificationResult: true,
          providerVersion: process.env.GIT_SHA || '0.0.0-local',
          providerVersionBranch: process.env.GIT_BRANCH || 'local',
        }
      : {
          pactUrls: [path.resolve(__dirname, '../pacts/CheckoutUI-PaymentsAPI.json')],
        }),

    stateHandlers,

    // Request filter: inject auth header for all provider verification requests
    requestFilter: (req: any, _res: any, next: () => void) => {
      req.headers['Authorization'] = `Bearer ${process.env.PROVIDER_API_TOKEN || 'test-token'}`;
      next();
    },

    logLevel: 'warn' as const,
  };

  const verifier = new Verifier(verifierOptions);

  try {
    await verifier.verifyProvider();
    console.log('✅ Provider verification passed — all consumer contracts satisfied');
  } catch (err) {
    console.error('❌ Provider verification failed:', err);
    process.exit(1);
  }
}

runProviderVerification();
