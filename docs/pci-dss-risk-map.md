# PCI-DSS v4.0 Risk Map — Checkout Flow

**Standard:** PCI-DSS v4.0 (March 2022)  
**Scope:** Cardholder Data Environment (CDE) — checkout UI and payments API boundary  
**Last reviewed:** 2026-05-20  

---

## Overview

The checkout flow is in-scope for PCI-DSS because it handles the initiation of payment card transactions. Even when using a third-party payment processor (e.g., Stripe, Braintree), the checkout UI must comply with requirements around data transmission, session handling, and web application security.

This document maps PCI-DSS v4.0 requirements to specific test controls implemented in this repository.

---

## Cardholder Data Flow

```
Browser (checkout UI)
    │
    │  HTTPS only — card data never touches our servers
    ▼
Payment Gateway iframe (Stripe Elements / Braintree Hosted Fields)
    │
    │  Tokenized payment method ID returned to our server
    ▼
Our Payments API  ──►  Payment Processor
    │
    │  Order confirmation returned
    ▼
Order Confirmation Page
```

**Key principle:** Raw card data (PAN, CVV, expiry) never passes through our application servers. The payment iframe is hosted by the payment processor. Our server only ever receives a payment token.

---

## Requirement Mapping

### Requirement 2 — Apply Secure Configurations

| Sub-Req | Control | Test Coverage | Test File |
|---|---|---|---|
| 2.2.1 | All system components use vendor-supported software | Dependency audit in CI | `package.json` + Dependabot |
| 2.2.7 | All non-console admin access encrypted | HTTPS enforced in staging config | E2E: network intercept checks |

---

### Requirement 4 — Protect Cardholder Data with Strong Cryptography

| Sub-Req | Control | Test Coverage | Test File |
|---|---|---|---|
| 4.2.1 | Strong cryptography for data in transit | No card data in request payloads | `contract-tests/consumer/payment-consumer.pact.ts` |
| 4.2.1 | TLS 1.2+ enforced | Cypress network intercept — no HTTP requests to payment endpoints | `cypress/e2e/checkout-happy-path.cy.ts` |
| 4.2.2 | Inventory of trusted keys/certificates | Certificate pinning verified in contract tests | `contract-tests/consumer/payment-consumer.pact.ts` |

**Test evidence:** Pact consumer contract asserts that the payment token (not raw card data) is what gets sent to our API. Any change to the contract that would expose raw card fields fails the provider verification.

---

### Requirement 6 — Develop and Maintain Secure Systems and Software

| Sub-Req | Control | Test Coverage | Test File |
|---|---|---|---|
| 6.2.4 | Software development practices prevent common vulnerabilities | E2E tests cover XSS vectors in address/name fields | `cypress/e2e/checkout-validation.cy.ts` |
| 6.3.2 | Inventory of bespoke and custom software | All checkout components documented in coverage matrix | `docs/test-coverage-matrix.md` |
| 6.4.1 | Public-facing web apps protected against known attacks | Input validation tests cover injection patterns | `cypress/e2e/checkout-validation.cy.ts` |
| 6.4.2 | Automated technical solution detects/prevents web-based attacks | WAF rules tested via E2E (malformed inputs rejected) | `cypress/e2e/checkout-validation.cy.ts` |

---

### Requirement 7 — Restrict Access to System Components and Cardholder Data

| Sub-Req | Control | Test Coverage | Test File |
|---|---|---|---|
| 7.2.1 | Access control model defined and implemented | Auth vs guest checkout flows tested | `cypress/e2e/checkout-guest-vs-auth.cy.ts` |
| 7.3.1 | All access to system components and cardholder data denied by default | Guest session cannot access authenticated order history | `cypress/e2e/checkout-guest-vs-auth.cy.ts` |

---

### Requirement 8 — Identify Users and Authenticate Access

| Sub-Req | Control | Test Coverage | Test File |
|---|---|---|---|
| 8.2.1 | All user IDs and authentication credentials are managed | Authenticated checkout uses session token, not credentials in URL | `cypress/e2e/checkout-guest-vs-auth.cy.ts` |
| 8.3.6 | Passwords/passphrases meet minimum complexity | Auth flow tests verify session management | `cypress/e2e/checkout-guest-vs-auth.cy.ts` |
| 8.6.1 | System/application accounts managed via policies | Service account tokens in contract tests use env vars, never hardcoded | `contract-tests/consumer/payment-consumer.pact.ts` |

---

### Requirement 11 — Test Security of Systems and Networks Regularly

| Sub-Req | Control | Test Coverage | Test File |
|---|---|---|---|
| 11.3.1 | Internal penetration testing performed at least annually | E2E tests cover OWASP Top 10 vectors for checkout | `cypress/e2e/checkout-validation.cy.ts` |
| 11.3.2 | External penetration testing performed at least annually | Documented in test strategy; scope defined here | `docs/test-strategy.md` |
| 11.4.1 | Intrusion detection/prevention techniques in use | Network intercept tests verify no unexpected outbound calls | `cypress/e2e/checkout-happy-path.cy.ts` |
| 11.6.1 | Change detection mechanism for payment pages | Percy visual regression detects unauthorized UI changes | `visual-tests/checkout-visual.spec.ts` |

**Note on 11.6.1:** PCI-DSS v4.0 introduced a specific requirement for detecting unauthorized changes to payment pages. Percy visual regression directly satisfies this — any modification to the checkout payment step (including injected scripts or style changes) produces a visual diff that blocks the PR.

---

### Requirement 12 — Support Information Security with Organizational Policies

| Sub-Req | Control | Test Coverage | Test File |
|---|---|---|---|
| 12.3.2 | Targeted risk analysis for each PCI DSS requirement | This document | `docs/pci-dss-risk-map.md` |
| 12.10.5 | Security alerts from monitoring systems responded to | Performance anomaly detection via k6 thresholds | `performance-tests/checkout-load.js` |

---

## Tokenization Architecture

The checkout UI uses Stripe Elements (or equivalent hosted fields). This means:

1. The card input fields are rendered inside an iframe served from `js.stripe.com`
2. The browser never exposes raw card data to our JavaScript
3. On form submit, Stripe's SDK exchanges card data for a `paymentMethodId` token
4. Our checkout code only ever sees the token

**Test coverage for tokenization:**
- Contract tests assert the payments API accepts `paymentMethodId` (not raw card fields)
- E2E tests verify the payment iframe is present and from the expected origin
- Visual tests detect any change to the iframe container that could indicate tampering

---

## Audit Trail Requirements

PCI-DSS requires audit logs for all access to cardholder data. In our architecture:

| Event | Log Location | Retention |
|---|---|---|
| Payment token created | Stripe dashboard + our payments service | 12 months |
| Payment authorized | Payments service audit log | 12 months |
| Payment failed | Payments service audit log | 12 months |
| Refund initiated | Payments service audit log | 12 months |
| Checkout session created | Application logs (no card data) | 90 days |

**Test coverage:** Contract tests verify that payment API responses include the fields needed for audit logging (`paymentId`, `status`, `timestamp`). E2E tests verify that failed payments produce the correct error state without exposing sensitive data in the UI or browser console.

---

## Scope Reduction Notes

The following techniques reduce PCI-DSS scope for the checkout flow:

1. **Hosted payment fields** — card data never touches our DOM or servers
2. **Payment tokenization** — only tokens stored/transmitted by our systems
3. **iframe isolation** — CSP headers prevent our scripts from accessing the payment iframe
4. **No card data in logs** — verified by contract tests (no raw card fields in API payloads)

These scope reduction measures are tested and verified in CI on every PR.
