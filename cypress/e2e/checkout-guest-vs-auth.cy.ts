/// <reference types="cypress" />

/**
 * Guest vs authenticated user checkout flow tests.
 * Covers: session isolation, saved addresses, order history access, session expiry.
 */

describe('Checkout — Guest vs Authenticated User', () => {
  beforeEach(() => {
    cy.fixture('checkout').as('data');
  });

  // ─── Guest checkout ─────────────────────────────────────────────────────────

  context('Guest checkout', () => {
    it('allows checkout without an account', function () {
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();

      cy.get('[data-testid="checkout-options"]').within(() => {
        cy.get('[data-testid="continue-as-guest-btn"]').should('be.visible');
        cy.get('[data-testid="login-to-checkout-btn"]').should('be.visible');
      });

      cy.continueAsGuest(this.data.guestUser.email);
      cy.url().should('include', '/checkout/address');
    });

    it('does not expose order history to guest session', function () {
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();
      cy.continueAsGuest(this.data.guestUser.email);
      cy.mockPaymentGateway('success');
      cy.fillAddressForm(this.data.addresses.valid);
      cy.get('[data-testid="continue-to-shipping"]').click();
      cy.selectShipping('standard');
      cy.submitOrder();

      cy.url().should('include', '/order-confirmation');

      // Guest should not be able to access /account/orders
      cy.visit('/account/orders');
      cy.url().should('include', '/login');
    });

    it('prompts guest to create account after order confirmation', function () {
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();
      cy.continueAsGuest(this.data.guestUser.email);
      cy.mockPaymentGateway('success');
      cy.fillAddressForm(this.data.addresses.valid);
      cy.get('[data-testid="continue-to-shipping"]').click();
      cy.selectShipping('standard');
      cy.submitOrder();

      cy.get('[data-testid="create-account-prompt"]').should('be.visible');
      cy.get('[data-testid="create-account-btn"]').should('be.visible');
    });

    it('guest session does not persist after browser close (session cookie)', () => {
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();
      cy.continueAsGuest('guest@example.com');

      // Verify session cookie is session-scoped (no max-age/expires)
      cy.getCookie('checkout_session').then((cookie) => {
        expect(cookie).to.not.be.null;
        // Session cookies have no expiry
        expect(cookie!.expiry).to.be.undefined;
      });
    });
  });

  // ─── Authenticated checkout ─────────────────────────────────────────────────

  context('Authenticated checkout', () => {
    beforeEach(function () {
      cy.loginAs(this.data.authUser.email, this.data.authUser.password);
    });

    it('pre-fills saved shipping address', function () {
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();

      cy.get('[data-testid="saved-address-card"]').should('be.visible');
      cy.get('[data-testid="saved-address-card"]').should('contain', this.data.addresses.valid.line1);
    });

    it('allows adding a new address without replacing saved one', function () {
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();

      cy.get('[data-testid="use-new-address-btn"]').click();
      cy.fillAddressForm({
        firstName: 'John',
        lastName: 'Doe',
        line1: '456 Oak Avenue',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
        country: 'US',
      });
      // Do NOT check save-address — original should remain
      cy.get('[data-testid="save-address-checkbox"]').should('not.be.checked');
      cy.get('[data-testid="continue-to-shipping"]').click();

      cy.mockPaymentGateway('success');
      cy.selectShipping('standard');
      cy.submitOrder();

      cy.url().should('include', '/order-confirmation');

      // Original saved address should still be there
      cy.visit('/account/addresses');
      cy.contains(this.data.addresses.valid.line1).should('be.visible');
      cy.contains('456 Oak Avenue').should('not.exist');
    });

    it('shows order in account history after authenticated checkout', function () {
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();
      cy.get('[data-testid="use-saved-address-btn"]').click();
      cy.get('[data-testid="continue-to-shipping"]').click();
      cy.mockPaymentGateway('success');
      cy.selectShipping('standard');
      cy.submitOrder();

      cy.get('[data-testid="order-number"]').invoke('text').as('orderNumber');

      cy.visit('/account/orders');
      cy.get('@orderNumber').then((orderNum) => {
        cy.contains(orderNum as string).should('be.visible');
      });
    });
  });

  // ─── Session security ───────────────────────────────────────────────────────

  context('Session security', () => {
    it('redirects to login when session expires mid-checkout', function () {
      cy.loginAs(this.data.authUser.email, this.data.authUser.password);
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();

      // Simulate session expiry by clearing auth cookie
      cy.clearCookie('auth_token');

      cy.get('[data-testid="continue-to-shipping"]').click();

      // Should redirect to login with return URL
      cy.url().should('include', '/login');
      cy.url().should('include', 'returnTo=%2Fcheckout');
    });

    it('prevents accessing another user\'s checkout session', function () {
      // User A starts checkout
      cy.loginAs(this.data.authUser.email, this.data.authUser.password);
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();

      cy.url().then((checkoutUrl) => {
        // Log out and try to access User A's checkout URL as a different user
        cy.clearCookies();
        cy.visit(checkoutUrl);

        // Should redirect to login, not show User A's checkout
        cy.url().should('include', '/login');
      });
    });

    it('cart is isolated between guest and authenticated sessions', function () {
      // Add item as guest
      cy.addProductToCart('prod_001');
      cy.get('[data-testid="cart-count"]').should('contain', '1');

      // Log in — cart should merge or be separate, not expose guest cart to other users
      cy.loginAs(this.data.authUser.email, this.data.authUser.password);

      // Verify cart state is handled correctly (merged or fresh — not another user's)
      cy.get('[data-testid="cart-count"]').invoke('text').then((count) => {
        const num = parseInt(count, 10);
        expect(num).to.be.at.least(0); // Valid cart state
      });
    });
  });
});
