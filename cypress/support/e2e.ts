// Import custom commands
import './commands';

// Global before each: clear cookies and local storage between tests
beforeEach(() => {
  cy.clearCookies();
  cy.clearLocalStorage();
});

// Suppress known third-party errors that don't affect test validity
Cypress.on('uncaught:exception', (err) => {
  // Stripe.js occasionally throws ResizeObserver errors in test environments
  if (err.message.includes('ResizeObserver loop')) {
    return false;
  }
  // Don't suppress other errors
  return true;
});
