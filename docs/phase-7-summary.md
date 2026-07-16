# Phase 7 Summary — Sharing & Collaboration

Date: 2026-07-14
Status: **✅ Complete on dev (web).** All 6 slices built and tested: access-control foundation,
share-by-link, share-by-account, real-time co-edit (SignalR), reactions + shared notes as comments
(incl. client reactions UI), and consent enforcement — closed out with a real two-client realtime
integration test and a full Phases 0–6 regression pass. Operational-merge/CRDT conflict handling is
a documented backlog item, not required by the exit criteria (last-write-wins + presence ships today).

---

## Outcome

Phase 7 makes a trip a shared, live surface instead of a single-owner document. Every trip query
was owner-scoped (`WHERE OwnerId = @ownerId`); rather than rewrite every query, `ITripAccessService`
resolves *who is asking* → *the trip's real owner + the caller's role* (owner/editor/viewer), so
controllers keep calling the existing owner-scoped repository with the resolved owner id, gated by
the resolved role. All trip data stays under the owner's partition; only the authorization gate
changed. `IUserService` bridges the auth `sub` string to the internal `Users.Id` so invites/redeems
can attach a real `TripMember` row.

Sharing ships two ways — **link** (capability token, no account needed to view) and **account**
(invite a registered user by email into `owner/editor/viewer` membership) — both surfaced through an
owner-only `ShareTripSheet` on the client, with a **"View only" read-only mode** for viewers driven
by `Trip.accessRole`. **Real-time co-edit** runs on a self-hosted SignalR hub (`/hubs/trips`) behind
an `ITripRealtimeNotifier` seam so Azure Web PubSub can swap in later without touching callers; peers
see live presence and their itinerary refetches on any member's write. **Reactions** (emoji on
trips/events/recaps) and **notes-as-comments** (the whole trip's note stream, member-authored,
author-scoped edit/delete) round out the social layer. **Consent** closes the loop: sharing is
explicit opt-in (`ConsentSetting.ShareEnabled` defaults `false`), and turning it off unshares
immediately — every active link and membership the owner holds is revoked in the same update, not
just gated for future shares.

## Where to use it (UX)

| Surface | What works |
|---|---|
| **Trip planner 🔗 header button** | `ShareTripSheet` — mint/list/revoke links (viewer/editor role picker + copy), invite/role/remove account members, "Enable sharing" opt-in banner when consent is off |
| **Trip planner header** | Presence badge (who else is viewing) from `useTripRealtime` |
| **Trip planner (viewer role)** | "View only" badge; FAB, AI dock, composers, reorder, and edit/share affordances hidden |
| **`GET /api/shared/trips/{token}`** | Anonymous, read-only trip view for link viewers (no account) |

## What was completed

### Slice 0 — Access-control foundation
- `TripAccess` record (`TripId`, `TripOwnerId`, `Role`, `CanView`/`CanEdit`/`CanManage`) +
  `ITripAccessService.Resolve` (owner → member → `null`); `IUserService.GetOrCreate`/`FindUserId`
  identity bridge. `TripsController` authorizes every per-trip action by capability.

### Slice 1 — Share by link
- Owner endpoints issue/list/revoke capability links (`TripSharesController`); anonymous
  `GET /api/shared/trips/{token}` reads a trip with no account; authed `POST …/redeem` creates/revives
  a `TripMember`. 40-char hex tokens, optional expiry, soft-delete revoke.

### Slice 2 — Share by account
- Shared trips surface in `GET /api/trips` (owned + member trips merged; caller's `AccessRole` on
  every `Trip`). `TripMembersController` (owner-only): list/invite-by-email/change-role/remove via
  `ITripMemberService`. Pending invites for unregistered emails deferred.

### Slice 3 — Real-time co-edit
- **Decision: self-hosted SignalR** on the existing App Service. `TripHub` (`/hubs/trips`):
  access-checked join/leave, in-memory presence (`ITripPresenceTracker`), `TripChanged` broadcasts
  fired from every `TripsController` write. WebSocket auth via `access_token` query (JWT) / dev
  bypass. Client `useTripRealtime` hook joins, invalidates `['trips']` on peer changes, shows presence.
  Conflict handling: last-write-wins + presence (operational merge/CRDT deferred).

### Slice 4 — Reactions + shared notes as comments
- `Reaction` entity (Trip/Item/Recap targets, soft-deleted) + `AddReactions` migration;
  `IReactionService.Toggle` idempotent per `(target, user, emoji)` with revive-on-toggle.
  `NotesController` authorizes via `ITripAccessService` — members read the whole trip's notes,
  comment attributed to themselves, view each other's media; edit/delete stay author-scoped.
  Client: `ShareTripSheet` + viewer read-only mode.
- **Client reactions UI** (added in the Slice 5 close-out): `reactions/ReactionBar.tsx` — grouped
  emoji chips (count + highlighted when the caller reacted) and a small fixed-palette picker, wired
  onto the trip header, each itinerary item, and each recap card. Backed by `queries/reactions.ts`
  (optimistic toggle + rollback). `useTripRealtime` now branches on the broadcast's `changeKind`,
  so a peer's `reactions`/`notes` change invalidates only that cache instead of the whole trip.

### Slice 5 — Consent enforcement
- `IConsentService`/`ConsentService`: `GetOrCreateAsync` lazy-creates a `ConsentSetting` row (all
  flags default `false` — explicit opt-in); `UpdateAsync` applies a partial update and, on a
  `ShareEnabled: true → false` transition, cascades an immediate soft-delete of every active
  `TripShare` and `TripMember` the owner holds.
- `ConsentController` (`GET`/`PUT /api/consent`). `TripSharesController.Create` and
  `TripMembersController.Invite` return `403` when the trip owner's `ShareEnabled` is off.
- Client: `getConsent`/`updateConsent`; `ShareTripSheet` shows an "Enable sharing" banner and gates
  link/invite creation until the owner opts in with one tap.
- **Close-out — realtime E2E:** `RealtimeE2ETests.cs` hosts the real app in-process
  (`WebApplicationFactory<Program>`, Npgsql swapped for the EF Core in-memory provider) and drives
  two genuine `HubConnection`s against the real `/hubs/trips` pipeline — both join, presence settles
  at 2, a real HTTP reaction-toggle broadcasts `TripChanged{changeKind:"reactions"}` to both peers,
  and leaving drops presence back to 1. Required exposing `public partial class Program` and adding
  `Microsoft.AspNetCore.Mvc.Testing` / `Microsoft.AspNetCore.SignalR.Client` to the test project.

## Key API surface

| Endpoint | Purpose |
|---|---|
| `POST/GET/DELETE /api/trips/{id}/shares` | Owner: issue/list/revoke share links |
| `GET /api/shared/trips/{token}` | Anonymous: view a trip via link (no account) |
| `POST /api/shared/trips/{token}/redeem` | Authed: redeem a link into trip membership |
| `GET/POST/PUT/DELETE /api/trips/{id}/members` | Owner: list/invite/change-role/remove account members |
| `GET/POST /api/trips/{id}/reactions` | Any member: list/toggle emoji reactions |
| `GET/POST/PUT/DELETE /api/trips/{id}/notes` | Members: shared comment stream (author-scoped edit/delete) |
| `/hubs/trips` (SignalR) | `JoinTrip`/`LeaveTrip`, presence, `TripChanged` broadcasts |
| `GET/PUT /api/consent` | Caller's sharing/publishing/AI consent flags |

## Tests at close

- Backend **180/180** (Functions **3/3**) — access resolution (owner/editor/non-member/deleted),
  link gen/expiry/revoke/redeem, membership listing + invite/role/remove, presence tracking, reaction
  toggle/revive/list, member note access, consent default/partial-update/cascade-revoke/
  controller-enforcement (`ConsentTests.cs`), and a live two-client realtime session against the real
  SignalR hub (`RealtimeE2ETests.cs`).
- App **93/93** + `tsc` clean. Also hand-verified the reaction toggle against a running dev API
  (add → list → re-toggle removes it).

## Exit criteria (sign-off)

| Criterion | Met |
|---|---|
| Two users co-edit a trip in real time with correct roles | ✅ E2E-tested: two live `HubConnection`s, presence, broadcast |
| Link sharing works for non-users | ✅ Anonymous `GET /api/shared/trips/{token}` |
| Reactions + shared notes propagate live | ✅ Broadcast + client UI; verified live in the E2E test |
| Sharing is explicit opt-in; revocation unshares immediately | ✅ Slice 5 |

## Deferred items (backlog, not blocking)

| Item | Target | Notes |
|---|---|---|
| Operational-merge / CRDT conflict handling | Post-Phase-7 hardening | Currently last-write-wins + presence; fine for today's low-conflict usage pattern |
| Pending invites for unregistered emails | UX polish | Needs a notification/invite-acceptance flow |
| Hiding edit/delete on other members' notes | UX polish | Server already rejects it; client just doesn't hide the buttons |

## What's next

Phase 7 is closed. **Phase 8 — Public Recaps & Discovery** starts next (publish + moderation,
search, RAG Q&A).
