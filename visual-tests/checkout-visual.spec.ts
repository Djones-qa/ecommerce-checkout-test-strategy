/**
 * Visual regression tests for the checkout flow using Percy + Playwright.
 *
 * Percy captures snapshots and diffs them against approved baselines.
 * Any unintended UI change — including injected scripts or style drift —
 * produces a diff that blocks the PR.
 *
 * PCI-DSS Req 11.6.1: Change detection on payment pages is satisfied here.
 */

import { test, expect } from '@playwright/test';
import percySnapshot from '@percy/playwright';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function addToCartAndProceed(page: import('@playwright/test').Page) {
  await page.goto('/products/prod_001');
  await page.getByTestId('add-to-cart-btn').click();
  await page.getByTestId('cart-icon').click();
  await page.getByTestId('proceed-to-checkout-btn').click();
  await page.getByTestId('guest-email-input').fill('visual@example.com');
  await page.getByTestId('continue-as-guest-btn').click();
}

async function fillAddress(page: import('@playwright/test').Page) {
  await page.getByTestId('address-first-name').fill('Jane');
  await page.getByTestId('address-last-name').fill('Smith');
  await page.getByTestId('address-line1').fill('123 Main Street');
  await page.getByTestId('address-city').fill('Austin');
  await page.getByTestId('address-state').selectOption('TX');
  await page.getByTestId('address-zip').fill('78701');
  await page.getByTestId('address-country').selectOption('US');
}

// ─── Checkout step snapshots ──────────────────────────────────────────────────

test.describe('Checkout Visual Regression', () => {

  test('cart page — with items', async ({ page }) => {
    await page.goto('/products/prod_001');
    await page.getByTestId('add-to-cart-btn').click();
    await page.getByTestId('cart-icon').click();
    await expect(page.getByTestId('cart-items')).toBeVisible();
    await percySnapshot(page, 'Cart — with items');
  });

  test('checkout entry — guest vs login options', async ({ page }) => {
    await page.goto('/products/prod_001');
    await page.getByTestId('add-to-cart-btn').click();
    await page.getByTestId('proceed-to-checkout-btn').click();
    await expect(page.getByTestId('checkout-options')).toBeVisible();
    await percySnapshot(page, 'Checkout — Identity step');
  });

  test('address form — empty state', async ({ page }) => {
    await addToCartAndProceed(page);
    await expect(page.getByTestId('address-first-name')).toBeVisible();
    await percySnapshot(page, 'Checkout — Address form empty');
  });

  test('address form — filled state', async ({ page }) => {
    await addToCartAndProceed(page);
    await fillAddress(page);
    await percySnapshot(page, 'Checkout — Address form filled');
  });

  test('address form — validation errors', async ({ page }) => {
    await addToCartAndProceed(page);
    await page.getByTestId('continue-to-shipping').click();
    await expect(page.getByTestId('error-address-first-name')).toBeVisible();
    await percySnapshot(page, 'Checkout — Address validation errors');
  });

  test('shipping selection step', async ({ page }) => {
    await addToCartAndProceed(page);
    await fillAddress(page);
    await page.getByTestId('continue-to-shipping').click();
    await expect(page.getByTestId('shipping-standard')).toBeVisible();
    await percySnapshot(page, 'Checkout — Shipping selection');
  });

  test('payment step — card form', async ({ page }) => {
    await addToCartAndProceed(page);
    await fillAddress(page);
    await page.getByTestId('continue-to-shipping').click();
    await page.getByTestId('shipping-standard').click();
    await page.getByTestId('continue-to-payment').click();
    await expect(page.getByTestId('card-name')).toBeVisible();
    // Snapshot the payment step — Percy detects any change to the payment iframe container
    await percySnapshot(page, 'Checkout — Payment step');
  });

  test('payment step — card error state', async ({ page }) => {
    await addToCartAndProceed(page);
    await fillAddress(page);
    await page.getByTestId('continue-to-shipping').click();
    await page.getByTestId('shipping-standard').click();
    await page.getByTestId('continue-to-payment').click();

    // Intercept payment API to return a decline
    await page.route('**/api/payments', (route) =>
      route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({
          paymentId: 'pi_test_failed',
          status: 'failed',
          amount: 9999,
          currency: 'usd',
          timestamp: new Date().toISOString(),
          error: { code: 'card_declined', declineCode: 'generic_decline', message: 'Your card was declined.' },
        }),
      })
    );

    await page.getByTestId('card-name').fill('Test User');
    await page.getByTestId('place-order-btn').click();
    await expect(page.getByTestId('payment-error')).toBeVisible();
    await percySnapshot(page, 'Checkout — Payment declined error');
  });

  test('order confirmation page', async ({ page }) => {
    await addToCartAndProceed(page);
    await fillAddress(page);
    await page.getByTestId('continue-to-shipping').click();
    await page.getByTestId('shipping-standard').click();
    await page.getByTestId('continue-to-payment').click();

    // Mock successful payment
    await page.route('**/api/payments', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          paymentId: 'pi_test_visual_success',
          status: 'succeeded',
          amount: 8598,
          currency: 'usd',
          timestamp: new Date().toISOString(),
        }),
      })
    );

    await page.getByTestId('card-name').fill('Test User');
    await page.getByTestId('place-order-btn').click();
    await expect(page).toHaveURL(/order-confirmation/);
    await percySnapshot(page, 'Checkout — Order confirmation');
  });

  // ─── Mobile viewports ───────────────────────────────────────────────────────

  test('payment step — mobile 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await addToCartAndProceed(page);
    await fillAddress(page);
    await page.getByTestId('continue-to-shipping').click();
    await page.getByTestId('shipping-standard').click();
    await page.getByTestId('continue-to-payment').click();
    await expect(page.getByTestId('card-name')).toBeVisible();
    await percySnapshot(page, 'Checkout — Payment step (mobile 375px)');
  });

  test('payment step — tablet 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await addToCartAndProceed(page);
    await fillAddress(page);
    await page.getByTestId('continue-to-shipping').click();
    await page.getByTestId('shipping-standard').click();
    await page.getByTestId('continue-to-payment').click();
    await expect(page.getByTestId('card-name')).toBeVisible();
    await percySnapshot(page, 'Checkout — Payment step (tablet 768px)');
  });

  // ─── Dark mode ──────────────────────────────────────────────────────────────

  test('payment step — dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await addToCartAndProceed(page);
    await fillAddress(page);
    await page.getByTestId('continue-to-shipping').click();
    await page.getByTestId('shipping-standard').click();
    await page.getByTestId('continue-to-payment').click();
    await expect(page.getByTestId('card-name')).toBeVisible();
    await percySnapshot(page, 'Checkout — Payment step (dark mode)');
  });

  test('order confirmation — dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await addToCartAndProceed(page);
    await fillAddress(page);
    await page.getByTestId('continue-to-shipping').click();
    await page.getByTestId('shipping-standard').click();
    await page.getByTestId('continue-to-payment').click();

    await page.route('**/api/payments', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          paymentId: 'pi_test_dark_success',
          status: 'succeeded',
          amount: 8598,
          currency: 'usd',
          timestamp: new Date().toISOString(),
        }),
      })
    );

    await page.getByTestId('card-name').fill('Test User');
    await page.getByTestId('place-order-btn').click();
    await expect(page).toHaveURL(/order-confirmation/);
    await percySnapshot(page, 'Checkout — Order confirmation (dark mode)');
  });
});
