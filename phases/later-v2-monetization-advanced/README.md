# Later / v2 — Monetization & Advanced

> Goal: Introduce revenue and advanced capabilities once the core platform has shipped.
> Est: post-launch · Depends on: Phase 8 (public launch)

> Note: **Collaboration moved into core** (now Phase 6). This bucket holds post-launch revenue and
> advanced AI work.

## Objectives
- Introduce a premium tier and (optionally) booking/affiliate revenue.
- Explore advanced AI (fine-tuning) for discovery, gated on explicit consent.

## Scope / tasks
- [ ] **Monetization:** premium tier via **Stripe** (higher AI/recap limits, unlimited trips,
      advanced export); free-tier gating; webhooks → entitlements.
- [ ] **Booking integrations:** flights/hotels/cars (Amadeus/Skyscanner/Booking) — affiliate first.
- [ ] **Notifications:** reminders for check-ins, departures, reservations.
- [ ] **Fine-tuning exploration (optional):** only with **AI-training consent** + PII-scrubbed corpus;
      compare against the RAG baseline before committing (see privacy doc).
- [ ] **Advanced analytics & personalization** on discovery.

## Testing plan
- [ ] **Payments:** Stripe test-mode subscribe / cancel / renew / failed-payment paths.
- [ ] **Integration:** entitlement gating; affiliate link tracking.
- [ ] **AI evals (if fine-tuning):** quality vs. RAG baseline; consent/lineage checks.
- [ ] **Full regression:** Phases 0–8 suites green; feature flags isolate v2 from core users.

## Exit criteria
- Premium gating + Stripe billing function in test and production.
- Any fine-tuning is consent-backed and demonstrably beats the RAG baseline.
