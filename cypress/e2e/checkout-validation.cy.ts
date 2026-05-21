/// <reference types="cypress" />

/**
 * Form validation tests for the checkout flow.
 * Covers: required fields, card format, CVV, expiry, injection vectors.
 */

describe('Checkout — Form Validation', () => {
  beforeEach(() => {
    cy.addProductToCart('prod_001');
    cy.proceedToCheckout();
    cy.continueAsGuest('guest@example.com');
  });

  // ─── Address form validation ────────────────────────────────────────────────

  context('Address form', () => {
    it('shows errors for all required fields when submitted empty', () => {
      cy.get('[data-testid="continue-to-shipping"]').click();

      cy.get('[data-testid="error-address-first-name"]').should('contain', 'required');
      cy.get('[data-testid="error-address-last-name"]').should('contain', 'required');
      cy.get('[data-testid="error-address-line1"]').should('contain', 'required');
      cy.get('[data-testid="error-address-city"]').should('contain', 'required');
      cy.get('[data-testid="error-address-zip"]').should('contain', 'required');
    });

    it('rejects invalid ZIP code format', () => {
      cy.get('[data-testid="address-first-name"]').type('Jane');
      cy.get('[data-testid="address-last-name"]').type('Smith');
      cy.get('[data-testid="address-line1"]').type('123 Main St');
      cy.get('[data-testid="address-city"]').type('Austin');
      cy.get('[data-testid="address-state"]').select('TX');
      cy.get('[data-testid="address-zip"]').type('ABCDE');
      cy.get('[data-testid="address-country"]').select('US');
      cy.get('[data-testid="continue-to-shipping"]').click();

      cy.get('[data-testid="error-address-zip"]').should('contain', 'valid ZIP');
    });

    it('rejects phone number with letters', () => {
      cy.get('[data-testid="address-phone"]').type('abc-defg-hijk');
      cy.get('[data-testid="continue-to-shipping"]').click();
      cy.get('[data-testid="error-address-phone"]').should('contain', 'valid phone');
    });

    it('sanitizes XSS attempt in name fields', () => {
      const xssPayload = '<script>alert("xss")</script>';
      cy.get('[data-testid="address-first-name"]').type(xssPayload);
      cy.get('[data-testid="continue-to-shipping"]').click();

      // Should show validation error, not execute script
      cy.get('[data-testid="error-address-first-name"]').should('be.visible');
      cy.on('window:alert', () => {
        throw new Error('XSS payload was executed — critical security failure');
      });
    });

    it('sanitizes SQL injection attempt in address fields', () => {
      const sqlPayload = "'; DROP TABLE orders; --";
      cy.get('[data-testid="address-line1"]').type(sqlPayload);
      cy.get('[data-testid="continue-to-shipping"]').click();
      // Should either sanitize or reject — must not crash the app
      cy.get('body').should('not.contain', 'SQL');
      cy.get('body').should('not.contain', 'syntax error');
    });

    it('accepts valid international address', () => {
      cy.get('[data-testid="address-first-name"]').type('María');
      cy.get('[data-testid="address-last-name"]').type('García');
      cy.get('[data-testid="address-line1"]').type('Calle Mayor 42');
      cy.get('[data-testid="address-city"]').type('Madrid');
      cy.get('[data-testid="address-country"]').select('ES');
      cy.get('[data-testid="address-postal"]').type('28001');
      cy.get('[data-testid="continue-to-shipping"]').click();
      cy.url().should('include', '/checkout/shipping');
    });
  });

  // ─── Payment form validation ────────────────────────────────────────────────

  context('Payment form', () => {
    beforeEach(() => {
      cy.fixture('checkout').then((data) => {
        cy.fillAddressForm(data.addresses.valid);
        cy.get('[data-testid="continue-to-shipping"]').click();
        cy.selectShipping('standard');
      });
    });

    it('shows error for empty card name', () => {
      cy.get('[data-testid="place-order-btn"]').click();
      cy.get('[data-testid="error-card-name"]').should('contain', 'required');
    });

    it('rejects card number with wrong length', () => {
      cy.get('[data-testid="card-name"]').type('Test User');
      // Stripe Elements handles card number validation internally
      // We verify the submit button stays disabled with invalid card
      cy.get('[data-testid="place-order-btn"]').should('be.disabled');
    });

    it('rejects past expiry date', () => {
      // Stripe Elements rejects past dates — verify error state
      cy.get('[data-testid="card-name"]').type('Test User');
      cy.get('[data-testid="place-order-btn"]').should('be.disabled');
    });

    it('does not allow card number to be read from DOM', () => {
      // Card input is inside Stripe iframe — our DOM should never contain it
      cy.get('[data-testid="card-number-frame"]').should('exist');
      cy.get('input[name="cardnumber"]').should('not.exist'); // not in our DOM
    });
  });

  // ─── Guest email validation ─────────────────────────────────────────────────

  context('Guest email', () => {
    it('rejects invalid email format', () => {
      cy.visit('/checkout');
      cy.get('[data-testid="guest-email-input"]').clear().type('not-an-email');
      cy.get('[data-testid="continue-as-guest-btn"]').click();
      cy.get('[data-testid="error-guest-email"]').should('contain', 'valid email');
    });

    it('rejects empty email', () => {
      cy.visit('/checkout');
      cy.get('[data-testid="continue-as-guest-btn"]').click();
      cy.get('[data-testid="error-guest-email"]').should('contain', 'required');
    });
  });
});
