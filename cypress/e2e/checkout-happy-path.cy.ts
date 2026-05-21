/// <reference types="cypress" />

/**
 * Happy path E2E tests for the checkout flow.
 * Covers: cart → address → shipping → payment → confirmation
 */

import type { AddressFields, CardFields } from '../../src/types/checkout';

describe('Checkout — Happy Path', () => {
  beforeEach(() => {
    cy.fixture('checkout').as('data');
  });

  context('Guest checkout — single item', () => {
    it('completes checkout from cart to confirmation', function () {
      // 1. Add product to cart
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();

      // 2. Continue as guest
      cy.continueAsGuest(this.data.guestUser.email);

      // 3. Mock payment gateway for success
      cy.mockPaymentGateway('success');

      // 4. Fill address
      cy.fillAddressForm(this.data.addresses.valid);
      cy.get('[data-testid="continue-to-shipping"]').click();

      // 5. Select shipping
      cy.get('[data-testid="shipping-standard"]').should('be.visible');
      cy.selectShipping('standard');

      // 6. Verify order summary before payment
      cy.get('[data-testid="order-summary"]').within(() => {
        cy.contains('Wireless Headphones').should('be.visible');
        cy.contains('$79.99').should('be.visible');
        cy.contains('Standard Shipping').should('be.visible');
        cy.contains('$5.99').should('be.visible');
      });

      // 7. Fill payment details
      cy.get('[data-testid="card-name"]').type(this.data.validCard.name);

      // 8. Place order
      cy.submitOrder();

      // 9. Verify confirmation page
      cy.url().should('include', '/order-confirmation');
      cy.get('[data-testid="confirmation-heading"]').should('contain', 'Order Confirmed');
      cy.get('[data-testid="order-number"]').should('match', /^ORD-\d{8}$/);
      cy.get('[data-testid="confirmation-email"]').should('contain', this.data.guestUser.email);

      // 10. Verify no sensitive data in DOM
      cy.get('body').should('not.contain', this.data.validCard.number);
      cy.get('body').should('not.contain', this.data.validCard.cvv);
    });

    it('shows correct total with tax and shipping', function () {
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();
      cy.continueAsGuest(this.data.guestUser.email);
      cy.fillAddressForm(this.data.addresses.valid);
      cy.get('[data-testid="continue-to-shipping"]').click();
      cy.selectShipping('express');

      cy.get('[data-testid="subtotal"]').should('contain', '$79.99');
      cy.get('[data-testid="shipping-cost"]').should('contain', '$14.99');
      cy.get('[data-testid="tax-amount"]').should('not.be.empty');
      cy.get('[data-testid="order-total"]').invoke('text').then((total) => {
        const totalNum = parseFloat(total.replace(/[^0-9.]/g, ''));
        expect(totalNum).to.be.greaterThan(94.98); // subtotal + express shipping
      });
    });
  });

  context('Guest checkout — multi-item cart', () => {
    it('completes checkout with multiple items', function () {
      cy.visit('/cart');
      cy.get('[data-testid="add-item-prod_001"]').click();
      cy.get('[data-testid="add-item-prod_002"]').click();
      cy.get('[data-testid="cart-count"]').should('contain', '2');
      cy.proceedToCheckout();
      cy.continueAsGuest(this.data.guestUser.email);
      cy.mockPaymentGateway('success');
      cy.fillAddressForm(this.data.addresses.valid);
      cy.get('[data-testid="continue-to-shipping"]').click();
      cy.selectShipping('standard');
      cy.submitOrder();
      cy.url().should('include', '/order-confirmation');
      cy.get('[data-testid="confirmation-heading"]').should('contain', 'Order Confirmed');
    });
  });

  context('Authenticated user checkout', () => {
    it('pre-fills saved address for logged-in user', function () {
      cy.loginAs(this.data.authUser.email, this.data.authUser.password);
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();

      // Saved address should be pre-selected
      cy.get('[data-testid="saved-address-card"]').should('be.visible');
      cy.get('[data-testid="use-saved-address-btn"]').click();
      cy.get('[data-testid="continue-to-shipping"]').click();

      cy.mockPaymentGateway('success');
      cy.selectShipping('standard');
      cy.submitOrder();

      cy.url().should('include', '/order-confirmation');
      cy.get('[data-testid="confirmation-heading"]').should('contain', 'Order Confirmed');
    });

    it('saves new address to account when checkbox selected', function () {
      cy.loginAs(this.data.authUser.email, this.data.authUser.password);
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();

      cy.get('[data-testid="use-new-address-btn"]').click();
      cy.fillAddressForm(this.data.addresses.valid);
      cy.get('[data-testid="save-address-checkbox"]').check();
      cy.get('[data-testid="continue-to-shipping"]').click();

      cy.mockPaymentGateway('success');
      cy.selectShipping('standard');
      cy.submitOrder();

      cy.url().should('include', '/order-confirmation');

      // Verify address was saved — navigate to account
      cy.visit('/account/addresses');
      cy.contains(this.data.addresses.valid.line1).should('be.visible');
    });
  });

  context('Network request verification', () => {
    it('does not send raw card data to our API', function () {
      cy.intercept('POST', '**/api/payments').as('paymentRequest');
      cy.addProductToCart('prod_001');
      cy.proceedToCheckout();
      cy.continueAsGuest(this.data.guestUser.email);
      cy.mockPaymentGateway('success');
      cy.fillAddressForm(this.data.addresses.valid);
      cy.get('[data-testid="continue-to-shipping"]').click();
      cy.selectShipping('standard');
      cy.submitOrder();

      cy.wait('@paymentRequest').then((interception) => {
        const body = interception.request.body;
        // PCI-DSS: raw card number must never appear in our API request
        expect(JSON.stringify(body)).not.to.include('4242424242424242');
        expect(JSON.stringify(body)).not.to.include('cvv');
        expect(JSON.stringify(body)).not.to.include('cvc');
        // Should contain a payment token instead
        expect(body).to.have.property('paymentMethodId');
      });
    });
  });
});
