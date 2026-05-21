# Test Coverage Matrix — Checkout Flow

Legend: ✅ Covered | ⚠️ Partial | ❌ Not covered | N/A Not applicable

---

## Checkout Features × Test Types

| Feature | E2E (Cypress) | Contract (Pact) | Visual (Percy) | Performance (k6) | Notes |
|---|---|---|---|---|---|
| **Cart → Checkout entry** | ✅ | N/A | ✅ | ✅ | Happy path entry point |
| **Guest checkout flow** | ✅ | N/A | ✅ | ✅ | No auth required |
| **Authenticated checkout flow** | ✅ | N/A | ⚠️ | ✅ | Visual: logged-in state only |
| **Address form — valid entry** | ✅ | N/A | ✅ | N/A | |
| **Address form — validation errors** | ✅ | N/A | ✅ | N/A | Required fields, format |
| **Address autocomplete** | ⚠️ | N/A | ⚠️ | N/A | Partial: mocked in E2E |
| **Shipping option selection** | ✅ | ✅ | ✅ | ✅ | Contract: shipping API |
| **Shipping options not loading** | ✅ | ✅ | ⚠️ | N/A | Error state visual partial |
| **Order summary display** | ✅ | N/A | ✅ | N/A | |
| **Promo code / coupon** | ⚠️ | N/A | ⚠️ | N/A | Basic coverage only |
| **Payment form — card entry** | ✅ | N/A | ✅ | N/A | Via Stripe Elements mock |
| **Payment form — validation** | ✅ | N/A | ✅ | N/A | Invalid card, CVV, expiry |
| **Payment tokenization** | ✅ | ✅ | N/A | N/A | Core PCI-DSS control |
| **Successful payment** | ✅ | ✅ | ✅ | ✅ | |
| **Card declined** | ✅ | ✅ | ✅ | N/A | |
| **Insufficient funds** | ✅ | ✅ | ✅ | N/A | |
| **Expired card** | ✅ | ✅ | ✅ | N/A | |
| **Network timeout on payment** | ✅ | ✅ | ⚠️ | ✅ | Perf: timeout under load |
| **Payment retry flow** | ✅ | ✅ | ⚠️ | N/A | |
| **3DS challenge flow** | ⚠️ | ⚠️ | ❌ | N/A | Complex to automate |
| **Order confirmation page** | ✅ | N/A | ✅ | ✅ | |
| **Confirmation email trigger** | ❌ | ✅ | N/A | N/A | Contract: email service API |
| **Inventory check at checkout** | ⚠️ | ✅ | N/A | ✅ | Contract: inventory API |
| **Out-of-stock handling** | ✅ | ✅ | ✅ | N/A | |
| **Tax calculation** | ⚠️ | ✅ | N/A | N/A | Contract: tax service |
| **Multi-item cart** | ✅ | N/A | ✅ | ✅ | |
| **Mobile viewport (375px)** | ✅ | N/A | ✅ | N/A | |
| **Mobile viewport (768px)** | ✅ | N/A | ✅ | N/A | |
| **Dark mode** | N/A | N/A | ✅ | N/A | Visual only |
| **Cross-browser: Chrome** | ✅ | N/A | N/A | N/A | |
| **Cross-browser: Firefox** | ✅ | N/A | N/A | N/A | |
| **Cross-browser: Edge** | ✅ | N/A | N/A | N/A | |
| **Accessibility (WCAG 2.1 AA)** | ⚠️ | N/A | N/A | N/A | cy-axe partial coverage |
| **Session expiry during checkout** | ✅ | N/A | N/A | N/A | |
| **Back button / browser navigation** | ⚠️ | N/A | N/A | N/A | |
| **Concurrent checkout (same item)** | N/A | N/A | N/A | ✅ | Race condition under load |
| **Black Friday spike (500 VUs)** | N/A | N/A | N/A | ✅ | |
| **Stress test (find breaking point)** | N/A | N/A | N/A | ✅ | |

---

## Coverage Summary

| Test Type | Tests / Scenarios | Coverage |
|---|---|---|
| E2E (Cypress) | 40 test cases across 4 spec files | ~85% of checkout features |
| Contract (Pact) | 12 interactions (payments, shipping, inventory, email) | 100% of API boundaries |
| Visual (Percy) | 15 snapshots (desktop + mobile + dark mode) | ~70% of UI states |
| Performance (k6) | 3 scenarios (load, stress, Black Friday) | All peak traffic patterns |

---

## Known Gaps and Mitigations

| Gap | Risk | Mitigation |
|---|---|---|
| 3DS challenge flow not fully automated | Medium — 3DS failures could go undetected | Manual test checklist in release process |
| Address autocomplete mocked | Low — real API tested in integration environment | Separate integration test suite |
| Confirmation email not E2E tested | Low — contract test covers API boundary | Email delivery monitored via Mailgun webhooks |
| Accessibility coverage partial | Medium — WCAG violations possible | Quarterly manual accessibility audit |
| Back button behavior partial | Low — edge case | Documented as known gap, tracked in backlog |

---

## API Contracts Covered by Pact

| Consumer | Provider | Interactions |
|---|---|---|
| Checkout UI | Payments API | POST /payments, GET /payments/:id, POST /payments/:id/refund |
| Checkout UI | Shipping API | GET /shipping/options, POST /shipping/estimate |
| Checkout UI | Inventory API | GET /inventory/:productId |
| Checkout UI | Tax API | POST /tax/calculate |
