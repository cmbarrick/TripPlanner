# Phase 7 — Sharing & Collaboration ✅ Complete (dev)

> Goal: Plan and relive trips **together** — share by link or account, co-edit in real time.
> Est: ~3–4 weeks · Depends on: Phase 0 (accounts, sharing/consent schema), Phase 1

## Objectives
- Share a trip with friends via **link** (no account needed to view) and **in-app accounts**.
- Support **real-time co-editing** with presence and roles.
- Add lightweight social signals: **reactions** and shared notes-as-comments.

## Scope / tasks
- [x] **Share by link:** capability token; `viewer`/`editor` link roles; expiry/revoke.
- [x] **Share by account:** invite friends; `TripMember` with **owner / editor / viewer** roles.
- [x] **Real-time co-edit:** SignalR for presence + live itinerary updates (Web PubSub seam left open).
- [~] **Conflict handling:** last-write-wins + presence shipped; operational merge/CRDTs are a
      post-phase backlog item (not required by the exit criteria below).
- [x] **Reactions** on trips/events/recaps.
- [x] **Shared notes as comments** (reuse Phase 4 notes within shared trips).
- [x] **Consent enforcement:** sharing is explicit opt-in; revocation unshares immediately.

## Out of scope
- **Public** publishing & discovery (Phase 8) — note: public publishing is **post-trip only**;
  the private sharing/co-editing here is available **before, during, and after** the trip.
- Monetization (v2).

## Testing plan
- [x] **Unit:** role/permission checks; link token validation/expiry; reaction toggle; member note access.
- [x] **Integration:** invite → role enforcement; revoke removes access (service-level); consent
      opt-in gates link/invite creation; disabling sharing cascades a revoke (`ConsentTests.cs`).
- [x] **Realtime E2E:** two live SignalR clients (real hub, not a fake) join a trip, presence settles
      at 2, a genuine HTTP reaction toggle broadcasts `TripChanged` to both, and leaving drops
      presence back to 1 (`RealtimeE2ETests.cs`, `WebApplicationFactory<Program>` + in-memory EF).
- [~] **Conflict tests:** not written — no operational-merge/CRDT logic exists yet to test (backlog).
- [x] **Privacy:** non-members cannot read; revoked links 404; consent gates respected.
- [x] **Regression:** Phases 0–6 suites green (backend 180/180, Functions 3/3, app 93/93 + `tsc`).

## Exit criteria
- [x] Two users **co-edit a trip in real time** with correct roles.
- [x] Link sharing works for non-users; reactions + shared notes propagate live.

**Phase 7 is closed.** Remaining backlog (tracked, not blocking): operational-merge/CRDT conflict
handling, pending invites for unregistered emails.

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

### Slice 2 — Share by account  ✅ *(backend)*
- [x] Shared trips appear in `GET /api/trips`: `ITripAccessService.ListMemberships(caller)` merges
      member trips (loaded via their owner partition) with owned trips; each trip carries `AccessRole`.
- [x] Caller's role exposed on `Trip` responses (`[NotMapped] AccessRole`) for `GetAll` + `GetById`.
- [x] `TripMembersController` (owner-only): list members, invite a **registered** user by email,
      change role, remove member — `ITripMemberService`/`TripMemberService`.
- [x] Tests: memberships listing (excludes owned), invite/role-change/remove, unknown-user +
      owner-invite guards.
- [ ] **Pending invites for unregistered emails** — deferred (needs an invite/notification flow).
- [ ] Client UI (members list, invite, role picker) — deferred to a client slice.

### Slice 3 — Real-time co-edit  ✅  *(backend + client; dev)*
- [x] **Decision: self-hosted SignalR** on the existing App Service (no new Azure resource; fits the
      dev-only posture). Built behind the `ITripRealtimeNotifier` seam so **Azure Web PubSub** can be
      swapped in later without touching callers.
- [x] Trip-scoped hub (`/hubs/trips`, `TripHub`): access-checked `JoinTrip`/`LeaveTrip`, presence
      tracking (`ITripPresenceTracker`, collapses multiple connections per user), and `TripChanged`
      broadcasts fired (fire-and-forget) from every `TripsController` write.
- [x] Auth over WebSockets: JWT via `access_token` query (`OnMessageReceived`); dev identity via
      `dev_user_id` query (dev bypass handler). CORS `AllowCredentials` for the negotiate.
- [x] Client `useTripRealtime` hook (`@microsoft/signalr`): joins the trip, invalidates `['trips']`
      on peers' changes, exposes presence; wired into `TripPlannerScreen` with a presence badge.
- [x] Conflict handling: **last-write-wins + presence** (operational merge / CRDT deferred).
- [x] Realtime E2E (two clients) — shipped in Slice 5 close-out (`RealtimeE2ETests.cs`).

### Slice 4 — Reactions + shared notes as comments  ✅  *(backend + client share UI)*
- [x] **Reactions** on trips/events/recaps: `Reaction` entity (`ReactionTargetType` Trip/Item/Recap,
      scoped to `TripId`, soft-deleted) + EF mapping + **`AddReactions` migration** (new `reactions`
      table). `IReactionService.Toggle` is idempotent per `(target, user, emoji)` — a second toggle
      removes it, reviving the soft-deleted row instead of duplicating.
- [x] `ReactionsController` (`api/trips/{id}/reactions`): list + toggle, gated by `CanView` (any
      member, viewers included, can react); broadcasts a `reactions` `TripChanged` on every toggle.
- [x] **Shared notes as comments:** `NotesController` now authorizes via `ITripAccessService` instead
      of bare ownership. `GetForTrip` returns the **whole trip's** notes (the shared comment stream);
      members create notes attributed to themselves (`AddAuthored`); media streaming/SAS resolves by
      **trip access** (so members can view each other's voice/photo notes). Edit/delete stay
      author-scoped. Note writes broadcast a `notes` `TripChanged`.
- [x] **Client share UI:** `ShareTripSheet` (owner-only) — mint/list/revoke capability links with a
      Viewer/Editor role picker + copy (web clipboard / native share sheet), and manage members
      (invite by email, change role, remove). Opened from a 🔗 button in the planner header.
- [x] **Viewer read-only mode:** `Trip.accessRole` drives the planner — viewers see a "View only"
      badge and lose the add FAB, AI dock, idea/packing composers, reorder handles, and trip
      edit/delete/share; editors keep editing but not management. (Server still enforces all writes.)
- [x] Tests: reaction toggle/revive/list + member note access (`GetAllForTrip`, asset→trip /
      note→trip lookups) in `Wander.Api.Tests/ReactionAndNoteSharingTests.cs`.
- [x] **Client reactions UI** (`reactions/ReactionBar.tsx`): grouped emoji chips (count + highlighted
      when the caller reacted) + a small fixed-palette picker, wired onto the trip header, each
      itinerary item, and each recap card. `useTripRealtime` now routes `TripChanged` by
      `changeKind` — a `reactions` broadcast invalidates only the reactions cache (not the whole
      trip), so peers' toggles arrive live without a full refetch. Hiding edit/delete on **other
      members'** notes in the journal is still deferred (server rejects; only a UX nicety).

### Slice 5 — Consent enforcement + tests  ✅ *(backend + client; realtime E2E + regression done)*
- [x] `IConsentService`/`ConsentService` (`Data/IConsentService.cs`): `GetOrCreateAsync` lazy-creates
      a `ConsentSetting` row (all flags default `false` — explicit opt-in), `UpdateAsync` applies a
      partial update. Reuses `IUserService.GetOrCreate` for the identity bridge (no duplicated
      lazy-create logic).
- [x] `ConsentController` (`GET`/`PUT /api/consent`) — same partial-update shape as `PreferencesController`.
- [x] Enforcement: `TripSharesController.Create` and `TripMembersController.Invite` check the trip
      owner's `ShareEnabled` after the existing `RequireManage` (owner-only) gate, returning `403`
      with a message when sharing is off. Revoke/list/redeem are unaffected (a link already granted
      keeps working until revoked).
- [x] **Revocation unshares immediately:** `ConsentService.UpdateAsync` detects a `true → false`
      transition on `ShareEnabled` and, in the same update, soft-deletes every active `TripShare` and
      `TripMember` the owner holds — not just future share attempts.
- [x] Client: `getConsent`/`updateConsent` (`api.ts`); `ShareTripSheet` shows an "Enable sharing"
      banner when the caller's consent is off, gating the create-link/invite buttons until they
      opt in explicitly (one tap → `PUT /api/consent { shareEnabled: true }`).
- [x] Tests: default-false, partial update, cascade-revoke-on-disable, no-op-when-already-off, and
      controller-level 403/200 enforcement (`Wander.Api.Tests/ConsentTests.cs`).
- [x] Realtime E2E (two clients) + full Phases 0–6 regression pass — done, see close-out entry below.

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
- **2026-06-23** — **Slice 2 complete (backend, dev).** Shared trips now surface in `GET /api/trips`
  (owned + member trips merged, ordered by start date), and every `Trip` response carries the
  caller's `AccessRole` so clients can render read-only vs. editable. `ITripAccessService.ListMemberships`
  returns member trips (excluding owned) with the trip's real owner id + role. `TripMembersController`
  + `TripMemberService` add owner-only account management: list members (joined to user email/name),
  invite a **registered** user by email (case-insensitive; rejects the owner; 404 for unknown email),
  change role (viewer/editor), and remove. **Tests: backend 162/162** (3 new). Deferred: pending
  invites for unregistered emails (needs a notification/invite-acceptance flow); client UI; applying
  the access layer to Notes/Recaps controllers.
- **2026-06-23** — **Slice 3 complete (backend + client, dev). Transport decision: self-hosted
  SignalR.** Added `TripHub` at `/hubs/trips` with access-checked join/leave and in-memory presence
  (`TripPresenceTracker`, distinct users across connections). `ITripRealtimeNotifier` is the transport
  seam (SignalR impl today, Web PubSub later); `TripsController` fires best-effort `TripChanged`
  broadcasts after every write (trip/items/packing). WebSocket auth: JWT lifts from `access_token`
  query, dev identity from `dev_user_id` query; CORS now `AllowCredentials`. Client `useTripRealtime`
  (`@microsoft/signalr`, lazy-imported) joins the trip, refetches `['trips']` on peer changes, and
  surfaces presence as a header badge in `TripPlannerScreen`. **Tests: backend 166/166** (+4 presence);
  app typecheck clean, **92/93** (the 1 miss is a pre-existing `RecapPanel` timeout flake — passes
  3/3 in isolation; unrelated to realtime). Deferred: realtime E2E (two clients), operational-merge
  conflict handling, read-only enforcement in the planner for `Viewer` role.
- **2026-06-23** — **Slice 4 complete (backend + client share UI).** Added emoji **reactions**
  (`Reaction` entity + `AddReactions` migration; `IReactionService.Toggle` idempotent per
  target/user/emoji with revive-on-toggle; `ReactionsController` list/toggle gated by `CanView` and
  broadcasting `reactions` `TripChanged`). **Notes became a shared comment stream:** `NotesController`
  now authorizes through `ITripAccessService` (members read the whole trip's notes, comment attributed
  to themselves, and view each other's media; edit/delete stay author-scoped), broadcasting `notes`
  changes. **Client:** `ShareTripSheet` for owners (link mint/list/revoke with role picker + copy;
  member invite/role/remove) behind a 🔗 header button, plus **viewer read-only mode** driven by
  `Trip.accessRole` (hides FAB, AI dock, composers, reorder, and manage/edit affordances; "View only"
  badge). Also made `TripMemberRole` serialize as a **string** for client/JSON consistency.
  **Tests: backend 171/171** (+6 reactions/notes); app typecheck clean. Deferred: client reactions UI,
  hiding edit/delete on other members' notes.
- **2026-07-13** — **Slice 5 consent enforcement complete (backend + client).** `ConsentService`
  lazy-creates a `ConsentSetting` per owner (all flags default `false`); `TripSharesController.Create`
  and `TripMembersController.Invite` now 403 when the trip owner's `ShareEnabled` is off, and
  `ConsentService.UpdateAsync` cascades an immediate revoke (soft-delete every active `TripShare` +
  `TripMember` the owner holds) on a `true → false` transition — not just a gate on future shares.
  Added `ConsentController` (`GET`/`PUT /api/consent`). **Client:** `ShareTripSheet` surfaces an
  "Enable sharing" banner and gates link/invite creation until the owner opts in explicitly.
  **Tests: backend 179/179** (+8 `ConsentTests.cs`); app typecheck clean.
- **2026-07-14** — **Phase 7 closed.** Three remaining items shipped:
  - **Client reactions UI:** `reactions/ReactionBar.tsx` (grouped emoji chips + a small palette
    picker) wired onto the trip header, itinerary items, and recap cards, backed by
    `queries/reactions.ts` (optimistic toggle, live-updated via realtime invalidation).
    `useTripRealtime` now branches on the broadcast's `changeKind` — `reactions`/`notes` invalidate
    only their own cache instead of the whole trips tree.
  - **Realtime E2E (two live clients):** `RealtimeE2ETests.cs` hosts the real app in-process
    (`WebApplicationFactory<Program>` + EF Core in-memory provider, Npgsql swapped out via
    `IDbContextOptionsConfiguration<T>` removal) and drives two genuine `HubConnection`s against the
    real `/hubs/trips` pipeline: both join, presence settles at 2, a real HTTP reaction-toggle
    broadcasts `TripChanged{changeKind:"reactions"}` to both, and leaving drops presence to 1.
    Required exposing `public partial class Program` for the test host and adding
    `Microsoft.AspNetCore.Mvc.Testing` / `Microsoft.AspNetCore.SignalR.Client` to the test project.
  - **Regression:** backend **180/180** (+1 realtime E2E), Functions **3/3**, app **93/93** + `tsc`
    clean. Also hand-verified the reaction toggle against a running dev API (add → list → re-toggle
    removes it).
  - Exit criteria met: two users co-edit in real time with correct roles (now E2E-tested, not just
    unit-tested); link sharing works for non-users; reactions + shared notes propagate live.
  - **Deferred (backlog, not blocking):** operational-merge/CRDT conflict handling (currently
    last-write-wins + presence — fine for the current single-region, low-conflict usage pattern);
    pending invites for unregistered emails; hiding edit/delete on other members' notes in the
    journal UI (server already rejects it). Future infra: provision **Azure Web PubSub** and swap
    the `ITripRealtimeNotifier` seam if/when multi-instance scale-out is needed.
- **Next:** **Phase 8 — Public Recaps & Discovery** (publish + moderation, search, RAG Q&A).
