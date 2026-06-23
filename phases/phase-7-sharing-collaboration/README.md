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
- [ ] **Shared notes as comments** (reuse Phase 4 notes within shared trips).
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

---

## Implementation plan (slices)

Sequenced to ship the fastest visible win first (link sharing) and defer realtime until the
transport decision is made. Built on Phase 0's already-migrated `trip_members` / `trip_shares` /
`consent_settings` tables (schema exists; **no logic used them before Phase 7**).

**Foundational design decision — access resolution over re-scoping.** Every trip query today is
owner-scoped (`WHERE OwnerId = @ownerId`). Rather than rewrite every query, an `ITripAccessService`
resolves *who is asking* → *whose data + what role*: it returns the **trip's real `OwnerId`** (the
data-partition key) plus the caller's `TripMemberRole`. Controllers then call the existing
owner-scoped repository using the **trip owner's** id, gated by the resolved role. All trip data
stays under the owner's partition; only the authorization gate changes.

**Identity bridge.** Runtime auth identifies the caller by the `sub` string (`OwnerId`).
`TripMember.UserId` is the internal `Users.Id` (Guid). `IUserService.GetOrCreate(ownerId)` maps
between them (same lazy-create pattern `PreferenceService` already uses), so invites/redemptions can
attach a `TripMember` to a real user row.

### Slice 0 — Access-control foundation  ✅
- [x] `TripAccess` record (`TripId`, `TripOwnerId`, `Role`, `CanView/CanEdit/CanManage`) — `Data/ITripAccessService.cs`.
- [x] `ITripAccessService.Resolve(tripId, callerOwnerId)` → owner → member → `null`.
- [x] `IUserService.GetOrCreate(ownerId)` / `FindUserId(ownerId)` (shared identity bridge) — `Data/IUserService.cs`.
- [x] Refactored `TripsController` per-trip actions (read/write/manage) to authorize by role via the
      access service, calling the repository with the **trip owner's** id. `GetAll` + `Create` stay
      owner-based. (Deletes are owner-only; edits require editor; reads allow viewers.)
- [x] DI registration (`Program.cs`); unit tests for owner/editor/non-member/deleted resolution.

### Slice 1 — Share by link  ✅
- [x] `POST /api/trips/{id}/shares` (owner-only): create `TripShare` (`Mode=Link`, `Role`, hex
      `Token`, optional `ExpiresAt`); returns token + relative URL — `Controllers/TripSharesController.cs`.
- [x] `GET /api/trips/{id}/shares` (list non-revoked) · `DELETE …/shares/{shareId}` (revoke).
- [x] **Viewer link (no account):** `GET /api/shared/trips/{token}` `[AllowAnonymous]` → read-only
      trip if token valid + unexpired + not soft-deleted — `Controllers/SharedTripsController.cs`.
- [x] **Editor link (redeem):** `POST /api/shared/trips/{token}/redeem` (auth) → lazy-create user →
      upsert `TripMember` with the link role → normal access applies thereafter.
- [x] Tests: token gen/expiry/revoke, anonymous read, redeem→membership, role enforcement
      (`Wander.Api.Tests/TripSharingTests.cs`).
- [ ] Client UI (share sheet / link entry) — deferred to a client slice; backend is complete + tested.

### Slice 2 — Share by account  ⬜
- [ ] Invite by email/handle → resolve/lazy-create `User` → upsert `TripMember(role)`.
- [ ] List members · change role · remove member (owner-only). Shared trips appear in `GET /api/trips`.

### Slice 3 — Real-time co-edit  ⬜  *(needs transport decision)*
- [ ] **Decision:** self-hosted **SignalR** on the existing App Service (no new Azure resource —
      recommended first step, fits dev-only posture) vs **Azure Web PubSub** (architecture doc's
      plan; better scale; new infra/cost). Build behind an interface seam so PubSub can swap in.
- [ ] Trip-scoped hub: presence + broadcast itinerary changes; client applies via `setQueryData`
      (mirror `patchNotesCache`) or minimal `invalidateQueries(['trips'])`.
- [ ] Conflict handling: last-write-wins + presence now; operational merge / CRDT deferred.

### Slice 4 — Reactions + shared notes as comments  ⬜
- [ ] Reactions on trips/events/recaps. Extend Phase 4 notes visibility to trip members (comments).

### Slice 5 — Consent enforcement + tests  ⬜
- [ ] Enforce `ConsentSetting.ShareEnabled` opt-in; revocation unshares immediately.
- [ ] Integration (invite→enforce→revoke), realtime E2E (two clients), regression Phases 0–6.

## Progress log
- **2026-06-23** — Plan authored; slice breakdown added. Realtime transport (Slice 3) deferred
  pending decision; SignalR-first recommended.
- **2026-06-23** — **Slices 0 + 1 complete (backend, dev).**
  - **Slice 0:** `ITripAccessService`/`TripAccessService` resolves owner → member → none and returns
    the trip's real `OwnerId` + the caller's role, so the owner-scoped repository is reused unchanged.
    `IUserService`/`UserService` bridges the auth `sub` string ↔ internal `Users.Id`. `TripsController`
    now authorizes every per-trip action by capability (`CanView`/`CanEdit`/`CanManage`); reads allow
    viewers, edits require editor, trip delete is owner-only. Returns `NotFound` (not `Forbid`) when
    there's no access at all, so trip existence isn't leaked.
  - **Slice 1:** Link sharing generalizes the recap share-token pattern. Owner endpoints issue/list/
    revoke links (`TripSharesController`); anonymous `GET /api/shared/trips/{token}` reads a trip with
    no account; authed `POST …/redeem` creates/revives a `TripMember`. 40-char hex tokens, optional
    expiry, soft-delete revoke. Owner redeem is a no-op; bad/expired/revoked tokens → not found.
  - **Tests:** backend **159/159** (7 new in `TripSharingTests.cs`).
  - **Deferred:** client share UI; applying the same access layer to Notes/Recaps controllers;
    "shared trips appear in `GET /api/trips`" (Slice 2). No new EF migration needed — Phase 0 already
    created `trip_members` / `trip_shares`.
- **Next:** Slice 2 (share by account / invites + shared trips in the list) or the client share UI;
  Slice 3 (realtime) once the SignalR-vs-Web-PubSub decision is made.
