# Phase 8 — Offline, Polish & Launch

> Goal: Reliable **in the field** and **production-ready** for launch.
> Est: ~2–3 weeks · Depends on: Phases 0–7
> (Offline capture foundations begin in Phase 4; this phase **hardens** them across the app.)

## Objectives
- Make the full plan + **capture** flow work offline with robust background sync (incl. media).
- Hit performance, accessibility, privacy, and store-readiness bars.

## Scope / tasks
- [ ] **Offline data layer:** local SQLite as UI source of truth; query persistence; local media cache.
- [ ] **Outbox + background sync:** queue mutations & media uploads offline, flush on reconnect.
- [ ] **Conflict handling:** harden for single + multi-user (builds on Phase 6 merge strategy);
      soft-delete via `deleted_at`.
- [ ] **Sync status UI:** offline indicator, "pending changes", media upload progress, retry.
- [ ] **Performance pass:** list virtualization, image/audio optimization, cold-start, bundle size.
- [ ] **Accessibility pass:** labels, focus order, dynamic type, contrast (axe / manual SR test).
- [ ] **UX polish:** onboarding, empty/error/loading states, micro-interactions.
- [ ] **Privacy review:** consent gates, deletion/export, moderation paths verified end-to-end.
- [ ] **Launch prep:** app icons, splash, store screenshots (all required sizes), privacy policy, listings.
- [ ] **App store submission** (see [`deployment-and-app-stores.md`](../../docs/deployment-and-app-stores.md)):
  - [ ] **Apple App Privacy** labels + **Google Data Safety** form completed and accurate.
  - [ ] All **permission usage strings/rationales** present (microphone, photos, location, notifications).
  - [ ] **In-app account deletion** implemented (required by both stores).
  - [ ] **UGC moderation + reporting + blocking** live **before** public recaps (Apple Guideline 1.2 / Play).
  - [ ] Content/age ratings; production binaries submitted via **`eas submit`**; staged rollout planned.
- [ ] **Web deploy:** Expo web export live on **Azure Static Web Apps** (custom domain + HTTPS).
- [ ] **Hardening:** crash-free rate monitoring, error budgets, final security review.

## Out of scope
- Monetization, booking, fine-tuning (v2 / later).

## Testing plan
- [ ] **Unit:** sync queue, conflict resolver, retry/backoff logic.
- [ ] **Integration:** mutate offline (incl. voice note) → reconnect → server reflects changes + media.
- [ ] **E2E (offline):** airplane mode → create/edit trip + capture note → reconnect → verify sync.
- [ ] **Non-functional:** Lighthouse (web) targets; cold start < target; a11y (axe) clean; bundle budget.
- [ ] **Privacy/security:** consent + deletion/export regression; no data leaks across users.
- [ ] **Soak / device matrix:** real iOS + Android devices; low-end device check.
- [ ] **Full regression:** Phases 0–7 suites green.

## Exit criteria
- Full plan + **capture** flow works in **airplane mode** and syncs correctly on reconnect.
- Performance, accessibility, and privacy targets met; crash-free rate above threshold.
- Passes the app store submission + privacy review; staging soak shows no critical errors.

## Artifacts
- Mockups: `../../mockups` (offline indicator, onboarding)
