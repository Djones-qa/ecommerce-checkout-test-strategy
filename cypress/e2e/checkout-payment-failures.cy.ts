/// <reference types="cypress" />

/**
 * Payment failure scenario tests.
 * Covers: declined, insufficient funds, expired card, network timeout, retry flow.
 */

describe('Checkout — Payment Failures', () => {
  beforeEach(function () {
    cy.fixture('checkout').as('data');
    cy.addProductToCart('prod_001');
    cy.proceedToCheckout();
    cy.continueAsGuest('guest@example.com');
    cy.fillAddressForm({
      firstName: 'Jane',
      lastName: 'Smith',
      line1: '123 Main Street',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      country: 'US',
    });
    cy.get('[data-testid="continue-to-shipping"]').click();
    cy.selectShipping('standard');
  });

  it('shows a clear error message when card is declined', function () {
    cy.mockPaymentGateway('declined');
    cy.get('[data-testid="card-name"]').type(this.data.declinedCard.name);
    cy.submitOrder();

    cy.get('[data-testid="payment-error"]')
      .should('be.visible')
      .and('contain', 'Your card was declined');

    // User should remain on payment step, not redirected
    cy.url().should('include', '/checkout/payment');

    // Place order button should be re-enabled for retry
    cy.get('[data-testid="place-order-btn"]').should('be.enabled');
  });

  it('shows insufficient funds error with helpful messaging', function () {
    cy.mockPaymentGateway('insufficient_funds');
    cy.get('[data-testid="card-name"]').type(this.data.insufficientFundsCard.name);
    cy.submitOrder();

    cy.get('[data-testid="payment-error"]')
      .should('be.visible')
      .and('contain', 'insufficient funds');

    // Should suggest alternative payment method
    cy.get('[data-testid="try-different-card-link"]').should('be.visible');
  });

  it('shows expired card error', function () {
    cy.mockPaymentGateway('expired');
    cy.get('[data-testid="card-name"]').type(this.data.expiredCard.name);
    cy.submitOrder();

    cy.get('[data-testid="payment-error"]')
      .should('be.visible')
      .and('contain', 'expired');
  });

  it('shows network error and retry prompt on timeout', function () {
    cy.mockPaymentGateway('network_error');
    cy.get('[data-testid="card-name"]').type(this.data.validCard.name);
    cy.submitOrder();

    cy.get('[data-testid="payment-error"]')
      .should('be.visible')
      .and('contain', 'Network error');

    cy.get('[data-testid="retry-payment-btn"]').should('be.visible');
  });

  it('allows successful retry after initial failure', function () {
    // First attempt fails
    cy.mockPaymentGateway('declined');
    cy.get('[data-testid="card-name"]').type(this.data.declinedCard.name);
    cy.submitOrder();
    cy.get('[data-testid="payment-error"]').should('be.visible');

    // User retries with a different card — mock success
    cy.mockPaymentGateway('success');
    cy.get('[data-testid="try-different-card-link"]').click();

    // Re-enter card details
    cy.get('[data-testid="card-name"]').clear().type(this.data.validCard.name);
    cy.submitOrder();

    cy.url().should('include', '/order-confirmation');
    cy.get('[data-testid="confirmation-heading"]').should('contain', 'Order Confirmed');
  });

  it('does not double-charge on retry after network error', function () {
    let paymentCallCount = 0;

    cy.intercept('POST', '**/api/payments', (req) => {
      paymentCallCount++;
      if (paymentCallCount === 1) {
        req.destroy(); // Simulate network error on first attempt
      } else {
        req.reply({ statusCode: 200, body: { id: 'pi_test_retry', status: 'succeeded' } });
      }
    }).as('paymentAttempts');

    cy.get('[data-testid="card-name"]').type(this.data.validCard.name);
    cy.submitOrder();

    cy.get('[data-testid="retry-payment-btn"]').click();
    cy.url().should('include', '/order-confirmation');

    // Verify idempotency — only 2 API calls total (not 3+)
    cy.get('@paymentAttempts.all').should('have.length', 2);
  });

  it('disables place order button while payment is processing', function () {
    // Slow down the payment response to test loading state
    cy.intercept('POST', '**/api/payments', (req) => {
      req.reply({
        delay: 2000,
        statusCode: 200,
        body: { id: 'pi_test_slow', status: 'succeeded' },
      });
    });

    cy.get('[data-testid="card-name"]').type(this.data.validCard.name);
    cy.get('[data-testid="place-order-btn"]').click();

    // Button should be disabled during processing
    cy.get('[data-testid="place-order-btn"]').should('be.disabled');
    cy.get('[data-testid="payment-loading-spinner"]').should('be.visible');

    // After success, redirected to confirmation
    cy.url().should('include', '/order-confirmation');
  });
});
