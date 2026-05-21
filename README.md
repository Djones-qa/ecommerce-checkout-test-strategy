# ecommerce-checkout-test-strategy

[![E2E Tests](https://github.com/Djones-qa/ecommerce-checkout-test-strategy/actions/workflows/e2e.yml/badge.svg?branch=master)](https://github.com/Djones-qa/ecommerce-checkout-test-strategy/actions/workflows/e2e.yml)
[![Contract Tests](https://github.com/Djones-qa/ecommerce-checkout-test-strategy/actions/workflows/contract-tests.yml/badge.svg?branch=master)](https://github.com/Djones-qa/ecommerce-checkout-test-strategy/actions/workflows/contract-tests.yml)
[![Visual Regression](https://github.com/Djones-qa/ecommerce-checkout-test-strategy/actions/workflows/visual-regression.yml/badge.svg?branch=master)](https://github.com/Djones-qa/ecommerce-checkout-test-strategy/actions/workflows/visual-regression.yml)
[![Performance Gate](https://github.com/Djones-qa/ecommerce-checkout-test-strategy/actions/workflows/performance.yml/badge.svg?branch=master)](https://github.com/Djones-qa/ecommerce-checkout-test-strategy/actions/workflows/performance.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 20](https://img.shields.io/badge/node-20-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Cypress](https://img.shields.io/badge/tested%20with-Cypress-04C38E.svg)](https://www.cypress.io/)

A production-grade test strategy for ecommerce checkout flows, covering every layer of the testing pyramid with PCI-DSS v4.0 compliance mapping.

---

## Why Checkout Testing Is Different

Checkout is the highest-risk surface in any ecommerce system:

- **Revenue impact** — a broken checkout is a direct revenue loss, not just a UX bug
- **PCI-DSS scope** — card data handling, tokenization, and iframe isolation are compliance requirements, not nice-to-haves
- **Integration density** — checkout touches payment gateways, inventory, shipping APIs, fraud detection, and tax services simultaneously
- **Peak load** — Black Friday traffic can spike 10–20× baseline; performance gates must be enforced in CI

This repo demonstrates how to test all of that systematically.

---

## Stack

| Layer | Tool | Purpose |
|---|---|---|
| E2E | Cypress + TypeScript | Full checkout flow automation |
| Contract | Pact | Consumer-driven contracts for the payments API |
| Visual | Playwright + Percy | Pixel-level regression on checkout UI |
| Performance | k6 | Load, stress, and Black Friday spike scenarios |
| CI | GitHub Actions | Full matrix across browsers and environments |

---

## Test Layers

```
         ┌─────────────────────────────┐
         │   Visual Regression (Percy) │  ← UI pixel diff on every PR
         ├─────────────────────────────┤
         │   E2E (Cypress)             │  ← Full checkout flows, cross-browser
         ├─────────────────────────────┤
         │   Contract (Pact)           │  ← Payment API consumer/provider
         ├─────────────────────────────┤
         │   Performance (k6)          │  ← Load gates before merge to main
         └─────────────────────────────┘
```

---

## Project Structure

```
ecommerce-checkout-test-strategy/
├── docs/
│   ├── test-strategy.md          # Full strategy: risk map, pyramid, coverage goals
│   ├── pci-dss-risk-map.md       # PCI-DSS v4.0 controls mapped to test types
│   └── test-coverage-matrix.md   # Feature × test type coverage matrix
├── cypress/
│   ├── e2e/
│   │   ├── checkout-happy-path.cy.ts
│   │   ├── checkout-payment-failures.cy.ts
│   │   ├── checkout-validation.cy.ts
│   │   └── checkout-guest-vs-auth.cy.ts
│   ├── fixtures/checkout.json
│   ├── support/
│   │   ├── commands.ts
│   │   └── e2e.ts
│   └── tsconfig.json
├── contract-tests/
│   ├── consumer/payment-consumer.pact.ts
│   ├── provider/payment-provider.pact.ts
│   └── pacts/
├── visual-tests/
│   ├── playwright.config.ts
│   └── checkout-visual.spec.ts
├── performance-tests/
│   ├── checkout-load.js
│   ├── checkout-stress.js
│   └── scenarios/black-friday-spike.js
├── src/
│   ├── types/checkout.ts
│   ├── mocks/payment-gateway.ts
│   └── utils/card-validator.ts
└── .github/workflows/
    ├── e2e.yml
    ├── contract-tests.yml
    ├── visual-regression.yml
    ├── performance.yml
    └── full-ci.yml
```

---

## Getting Started

### Prerequisites

- Node.js 20+ (use `nvm use` with the included `.nvmrc`)
- k6 installed globally: https://k6.io/docs/get-started/installation/
- Percy CLI token set as `PERCY_TOKEN` env var for visual tests

### Install

```bash
npm install
npx playwright install --with-deps
```

### Run E2E Tests

```bash
# Interactive mode
npm run cy:open

# Headless (all browsers)
npm run cy:run:chrome
npm run cy:run:firefox
npm run cy:run:edge
```

### Run Contract Tests

```bash
# Generate consumer pact
npm run pact:consumer

# Verify against provider
npm run pact:provider
```

### Run Visual Regression

```bash
PERCY_TOKEN=your_token npm run visual:test
```

### Run Performance Tests

```bash
# Standard load test
npm run perf:load

# Black Friday spike simulation
npm run perf:blackfriday

# Stress test (find breaking point)
npm run perf:stress
```

---

## PCI-DSS Compliance

This strategy maps directly to PCI-DSS v4.0 requirements for checkout flows. Key areas covered:

- **Req 4.2** — No card data transmitted in clear text (verified via contract tests)
- **Req 6.4** — Public-facing web app protection (E2E tests cover injection and XSS vectors)
- **Req 8.3** — Strong authentication for checkout sessions (auth flow tests)
- **Req 11.3** — Penetration testing scope (risk map documents test surface)
- **Req 11.6.1** — Change detection on payment pages (Percy visual regression)

See [`docs/pci-dss-risk-map.md`](docs/pci-dss-risk-map.md) for the full control mapping.

---

## CI Gates

Every PR must pass:
1. Cypress E2E (Chrome + Firefox + Edge in parallel)
2. Pact consumer contract generation
3. Percy visual diff approval
4. k6 performance thresholds: p95 < 2s, error rate < 1%

See [`.github/workflows/full-ci.yml`](.github/workflows/full-ci.yml) for the orchestration.

---

## Related Repos

- `fintech-api-test-strategy` — API-layer testing with contract and security focus
- `mobile-checkout-test-strategy` — React Native checkout testing with Detox

---

## Author

**Darrius Jones**  
QA Engineer — specializing in test strategy, automation architecture, and compliance-driven testing.

[![GitHub](https://img.shields.io/badge/GitHub-Djones--qa-181717?logo=github)](https://github.com/Djones-qa)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Darrius%20Jones-0A66C2?logo=linkedin)](https://www.linkedin.com/in/darrius-jones-28226b350/)

---

## License

MIT License

Copyright (c) 2026 Darrius Jones

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
