# Phase 7 — Sharing & Collaboration

> Goal: Plan and relive trips **together** — share by link or account, co-edit in real time.
> Est: ~3–4 weeks · Depends on: Phase 0 (accounts, sharing/consent schema), Phase 1

## Objectives
- Share a trip with friends via **link** (no account needed to view) and **in-app accounts**.
- Support **real-time co-editing** with presence and roles.
- Add lightweight social signals: **reactions** and shared notes-as-comments.

## Scope / tasks
- [ ] **Share by link:** capability token; `viewer`/`editor` link roles; expiry/revoke.
- [ ] **Share by account:** invite friends; `TripMember` with **owner / editor / viewer** roles.
- [ ] **Real-time co-edit:** Azure Web PubSub / SignalR for presence + live itinerary updates.
- [ ] **Conflict handling:** move beyond last-write-wins toward operational merge; evaluate CRDTs.
- [ ] **Reactions** on trips/events/recaps.
- [ ] **Shared notes as comments** (reuse Phase 5 notes within shared trips).
- [ ] **Consent enforcement:** sharing is explicit opt-in; revocation unshares immediately.

## Out of scope
- **Public** publishing & discovery (Phase 8) — note: public publishing is **post-trip only**;
  the private sharing/co-editing here is available **before, during, and after** the trip.
- Monetization (v2).

## Testing plan
- [ ] **Unit:** role/permission checks; link token validation/expiry.
- [ ] **Integration:** invite → role enforcement; revoke removes access.
- [ ] **Realtime E2E:** two clients co-edit; presence updates; reactions propagate live.
- [ ] **Conflict tests:** concurrent edits converge without data loss.
- [ ] **Privacy:** non-members cannot read; revoked links 404; consent gates respected.
- [ ] **Regression:** Phases 0–6 suites green.

## Exit criteria
- Two users **co-edit a trip in real time** with correct roles.
- Link sharing works for non-users; reactions + shared notes propagate live.

## Artifacts
- Mockups: to be added (share sheet, presence avatars, role picker).
