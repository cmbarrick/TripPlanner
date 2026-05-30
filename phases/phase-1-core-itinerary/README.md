# Phase 1 — Core Itinerary & Calendar

> Goal: Plan a trip **manually, end to end** — no AI, no maps required.
> Est: ~3–4 weeks · Depends on: Phase 0

## Objectives
- Deliver the core planning loop: trips → days → items, viewable on a calendar.
- Make it genuinely useful on its own.

## Scope / tasks
- [x] **Trip CRUD:** create/edit/delete trips (title, destination(s), dates, travelers, cover).
      _API-backed via EF Core with owner enforcement + field validation; client create/edit/delete
      wired through TanStack Query mutations with cache invalidation._
- [x] **My Trips list:** upcoming / past, search & sort.
      _Search by title/destination, sort by date or name, upcoming/past grouping, with
      loading/empty/no-result/error states._
- [ ] **Itinerary builder:** day-by-day list with **drag-to-reorder** within and across days.
- [ ] **Itinerary items:** type (flight / lodging / food / activity / transport), title, start/end
      time, location (free-text for now), cost + currency, confirmation #, notes.
- [ ] **Unified Trip Planner shell:** single trip screen with a `List | Split | Map` **view toggle**
      and a `Day | Trip` **scope toggle**. In Phase 1, **List/Timeline is fully functional**; the Map
      panel renders a labeled placeholder (filled in Phase 2) and an **AI dock** placeholder (filled
      in Phase 3). Drill-down: `Trip` scope → tap a day → `Day` scope.
- [ ] **Scope-aware data layer:** itinerary selectors work at both **day** and **whole-trip** scope
      (e.g., cost rollup, conflict checks, and item lists derive correctly for either scope) so map
      and AI in later phases are purely additive.
- [ ] **Packing list & to-dos:** checklist tied to a trip; check/uncheck; reusable templates.
- [ ] **Calendar views:** day / week / agenda; tap an item to edit.
- [ ] **Conflict detection:** warn on overlapping items.
- [ ] **Trip cost rollup:** simple total of item costs per trip/day.
- [ ] Empty, loading, and error states for every screen.

## Out of scope
- **Map rendering & place autocomplete (Phase 2)** and **AI proposals (Phase 3)** — only the
  forward-compatible **shell** (view/scope toggles + placeholder panels) lands in Phase 1; the
  actual map tiles, routing, and AI proposal/preview/undo flows are built in their phases.
- Offline sync (Phase 4).

## Testing plan
- [ ] **Unit:** date/time helpers, conflict-detection logic, cost rollup, reducers.
      _Done so far: My Trips search/sort/grouping logic (`app/src/trips-view.test.ts`)._
- [~] **Integration:** full trip CRUD against the API (test Postgres); itinerary item CRUD; reorder persists;
      packing list state; calendar derives correctly from items.
      _Done so far: trip CRUD + item add/delete + per-user ownership deny cases exercised through the
      production `EfCoreTripRepository` against the EF Core in-memory provider
      (`backend/Wander.Api.Tests/EfCoreTripRepositoryTests.cs`). Remaining: real test-Postgres run,
      itinerary item reorder, packing list, calendar derivation._
- [ ] **E2E:** create trip → add 3 items across 2 days → reorder → see on calendar →
      trigger a conflict warning → edit to resolve (web + mobile).
- [ ] **Regression:** Phase 0 auth/smoke suite still green.
- [ ] **Manual:** drag-and-drop feel on touch devices; long-trip performance (e.g., 14 days).

## Exit criteria
- A user can create a multi-day trip, add/edit/reorder items, view it on a calendar, and be
  warned about overlaps — **entirely without AI or maps**.
- The Trip Planner shell exposes `List | Split | Map` and `Day | Trip` toggles; List/Timeline is
  fully functional at both scopes, and Map/AI panels show clear "coming in Phase 2/3" placeholders.
- All Phase 1 tests pass; CI green; works on iOS, Android, Web.

## Artifacts
- Mockups: `../../mockups` (My Trips, Trip Detail / Itinerary, Add Activity, Calendar)
- Target UX direction: `../../mockups/option-4-map-ai-planner.html` (Map + AI fusion) and
  `../../mockups/option-5-whole-trip.html` (whole-trip scope). Phase 1 builds the **shell** for these;
  Phases 2–3 fill the Map and AI panels.

## Progress log
- **2026-05-30 (slice 1 — Trip CRUD + My Trips list):** Completed the first Phase 1 vertical slice.
  - **Backend:** trip create/update/delete/list/get already persisted via `EfCoreTripRepository`
    behind the unchanged `ITripRepository` seam; added request validation on the `Trip` model
    (required title/destination, valid `Travelers` range, non-negative cost, 3-letter currency, and
    `EndDate >= StartDate`) returning HTTP 400 via the `[ApiController]` model-validation pipeline.
    Validation length caps are enforced in `IValidatableObject` (not `[StringLength]`) so the schema
    and existing migrations are untouched. Owner checks preserved on every operation.
  - **Frontend:** `createTrip`/`updateTrip`/`deleteTrip` API calls + `useCreateTripMutation`/
    `useUpdateTripMutation`/`useDeleteTripMutation` hooks with TanStack Query cache update +
    invalidation. New `TripFormScreen` (create/edit), edit/delete entry points on the trip detail
    screen (with inline delete confirmation), and a reworked **My Trips** screen with search, a
    date/name sort toggle, upcoming/past grouping, and loading/empty/no-result/error states. Created
    trips auto-generate one day per date so they are immediately plannable.
  - **Tests (all green locally):** backend `dotnet test` (12 passing — added 9 EF Core CRUD +
    ownership-deny tests); app `jest` (9 passing — added `trips-view` search/sort suite); `tsc`
    typecheck clean; Playwright web smoke still passes.
  - **Remaining for Phase 1:** itinerary builder (drag-to-reorder), itinerary item edit, planner
    shell (List/Split/Map + Day/Trip toggles), packing list, calendar views, conflict detection,
    cost rollup, and the full E2E journey.
- **2026-05-30 (decision):** Adopted the unified **Map + AI Planner** direction (mockups
  `option-4` + `option-5`). Phase 1 now includes the planner **shell** — `List | Split | Map` view
  toggle and `Day | Trip` scope toggle with placeholder Map/AI panels — and a **scope-aware data
  layer** so Phase 2 (maps) and Phase 3 (AI) are additive rather than a redesign.
- **2026-05-30 (status):** Phase 0 local-first hardening completed in-repo (Router, observability,
  web smoke E2E, and client auth-session scaffolding). Phase 1 implementation can begin while
  remaining Phase 0 manual checks (real-device OAuth round-trip and external account provisioning)
  are tracked in docs.
