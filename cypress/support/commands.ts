/// <reference types="cypress" />

/**
 * Custom Cypress commands for checkout flow testing.
 * Import this file in cypress/support/e2e.ts
 */

// ─── Type declarations ────────────────────────────────────────────────────────

interface AddressFields {
  firstName: string;
  lastName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
}

interface CardFields {
  number: string;
  expiry: string;
  cvv: string;
  name: string;
}

declare global {
  namespace Cypress {
    interface Chainable {
      fillAddressForm(address: AddressFields): Chainable<void>;
      fillCheckoutForm(address: AddressFields, card: CardFields): Chainable<void>;
      selectShipping(optionId: string): Chainable<void>;
      submitOrder(): Chainable<void>;
      mockPaymentGateway(scenario: 'success' | 'declined' | 'insufficient_funds' | 'expired' | 'network_error'): Chainable<void>;
      addProductToCart(productId: string): Chainable<void>;
      proceedToCheckout(): Chainable<void>;
      loginAs(email: string, password: string): Chainable<void>;
      continueAsGuest(email: string): Chainable<void>;
    }
  }
}

// ─── Command implementations ──────────────────────────────────────────────────

Cypress.Commands.add('fillAddressForm', (address: AddressFields) => {
  cy.get('[data-testid="address-first-name"]').clear().type(address.firstName);
  cy.get('[data-testid="address-last-name"]').clear().type(address.lastName);
  cy.get('[data-testid="address-line1"]').clear().type(address.line1);
  if (address.line2) {
    cy.get('[data-testid="address-line2"]').clear().type(address.line2);
  }
  cy.get('[data-testid="address-city"]').clear().type(address.city);
  cy.get('[data-testid="address-state"]').select(address.state);
  cy.get('[data-testid="address-zip"]').clear().type(address.zip);
  cy.get('[data-testid="address-country"]').select(address.country);
  if (address.phone) {
    cy.get('[data-testid="address-phone"]').clear().type(address.phone);
  }
});

Cypress.Commands.add('fillCheckoutForm', (address: AddressFields, card: CardFields) => {
  cy.fillAddressForm(address);
  cy.get('[data-testid="continue-to-shipping"]').click();
  cy.get('[data-testid="shipping-standard"]').click();
  cy.get('[data-testid="continue-to-payment"]').click();

  // Card fields are inside a Stripe Elements iframe
  cy.getStripeIframe('[data-testid="card-number-frame"]')
    .find('input[name="cardnumber"]')
    .type(card.number);
  cy.getStripeIframe('[data-testid="card-expiry-frame"]')
    .find('input[name="exp-date"]')
    .type(card.expiry);
  cy.getStripeIframe('[data-testid="card-cvc-frame"]')
    .find('input[name="cvc"]')
    .type(card.cvv);
  cy.get('[data-testid="card-name"]').clear().type(card.name);
});

Cypress.Commands.add('selectShipping', (optionId: string) => {
  cy.get(`[data-testid="shipping-${optionId}"]`).click();
  cy.get('[data-testid="continue-to-payment"]').click();
});

Cypress.Commands.add('submitOrder', () => {
  cy.get('[data-testid="place-order-btn"]').should('be.enabled').click();
});

Cypress.Commands.add('mockPaymentGateway', (scenario) => {
  const responses: Record<string, object> = {
    success: {
      id: 'pi_test_success',
      status: 'succeeded',
      amount: 9999,
      currency: 'usd',
    },
    declined: {
      error: {
        code: 'card_declined',
        decline_code: 'generic_decline',
        message: 'Your card was declined.',
      },
    },
    insufficient_funds: {
      error: {
        code: 'card_declined',
        decline_code: 'insufficient_funds',
        message: 'Your card has insufficient funds.',
      },
    },
    expired: {
      error: {
        code: 'expired_card',
        message: 'Your card has expired.',
      },
    },
    network_error: {
      error: {
        code: 'api_connection_error',
        message: 'Network error — please try again.',
      },
    },
  };

  cy.intercept('POST', '**/api/payments', (req) => {
    if (scenario === 'network_error') {
      req.destroy();
    } else {
      req.reply({
        statusCode: scenario === 'success' ? 200 : 402,
        body: responses[scenario],
      });
    }
  }).as(`payment_${scenario}`);
});

Cypress.Commands.add('addProductToCart', (productId: string) => {
  cy.visit(`/products/${productId}`);
  cy.get('[data-testid="add-to-cart-btn"]').click();
  cy.get('[data-testid="cart-count"]').should('contain', '1');
});

Cypress.Commands.add('proceedToCheckout', () => {
  cy.get('[data-testid="cart-icon"]').click();
  cy.get('[data-testid="proceed-to-checkout-btn"]').click();
  cy.url().should('include', '/checkout');
});

Cypress.Commands.add('loginAs', (email: string, password: string) => {
  cy.session([email, password], () => {
    cy.visit('/login');
    cy.get('[data-testid="email-input"]').type(email);
    cy.get('[data-testid="password-input"]').type(password);
    cy.get('[data-testid="login-btn"]').click();
    cy.url().should('not.include', '/login');
  });
});

Cypress.Commands.add('continueAsGuest', (email: string) => {
  cy.get('[data-testid="guest-email-input"]').type(email);
  cy.get('[data-testid="continue-as-guest-btn"]').click();
});

// Helper: access content inside a Stripe iframe
// @ts-ignore — custom command not in types
Cypress.Commands.add('getStripeIframe', (selector: string) => {
  return cy.get(selector).its('0.contentDocument.body').should('not.be.empty').then(cy.wrap);
});

export {};
