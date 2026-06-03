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
- [x] **Itinerary builder:** day-by-day list with reorder within a day and **move across days**.
      _Reorder/move via up/down + day controls and the `MoveItem` API (persisted, owner-checked).
      Literal touch drag-and-drop is deferred (see remaining gaps); ordering itself is complete._
- [x] **Itinerary items:** type (flight / lodging / food / activity / transport), title, start/end
      time, location (free-text), cost + currency, confirmation #, notes.
      _Create/edit/delete via `AddActivityScreen` with calendar/time pickers and server-side
      validation (title, 3-letter currency, end ≥ start)._
- [x] **Unified Trip Planner shell:** single trip screen with a `List | Split | Map` **view toggle**
      and a `Day | Trip` **scope toggle**. List/Timeline is fully functional; the Map panel renders a
      labeled placeholder (Phase 2) and an **AI dock** placeholder (Phase 5). Drill-down:
      `Trip` scope → tap a day → `Day` scope.
- [x] **Scope-aware data layer:** itinerary selectors work at both **day** and **whole-trip** scope
      (cost rollup, conflict checks, item lists) so map and AI in later phases are purely additive.
      _`app/src/scope.ts` + unit tests (`app/src/scope.test.ts`)._
- [x] **Packing list & to-dos:** checklist tied to a trip's days; add / check / uncheck / delete via API.
      _Reusable templates deferred to a later polish pass._
- [x] **Calendar views:** day / week (multi-day) / agenda; tap an item to edit.
- [x] **Conflict detection:** overlapping items flagged at day and trip scope.
- [x] **Trip cost rollup:** total of item costs per day and per trip.
- [x] Empty, loading, and error states across the new screens.

## Out of scope
- **Map rendering & place autocomplete (Phase 2)** and **AI proposals (Phase 5)** — only the
  forward-compatible **shell** (view/scope toggles + placeholder panels) lands in Phase 1; the
  actual map tiles, routing, and AI proposal/preview/undo flows are built in their phases.
- Offline sync (Phase 9).

## Testing plan
- [x] **Unit:** conflict-detection logic, cost rollup, and scope selectors (`app/src/scope.test.ts`);
      My Trips search/sort/grouping logic (`app/src/trips-view.test.ts`). 16 app tests green.
- [~] **Integration:** trip CRUD; itinerary item CRUD; reorder persists; move-across-days; packing
      list state — all exercised through the production `EfCoreTripRepository` **against the EF Core
      in-memory provider** with per-user ownership deny cases
      (`backend/Wander.Api.Tests/EfCoreTripRepositoryTests.cs`, 17 tests green).
      _Remaining: re-run the same suite against a real **test Postgres** instance._
- [~] **E2E:** web smoke (`app/e2e/smoke.spec.ts`) loads the My Trips shell. _Remaining: the full
      journey — create trip → add items across days → reorder → see on calendar → conflict → resolve._
- [x] **Regression:** Phase 0 auth/web-smoke suite still green.
- [ ] **Manual:** drag-and-drop feel on touch devices; long-trip performance (e.g., 14–17 days).

## Exit criteria
- A user can create a multi-day trip, add/edit/reorder items, view it on a calendar, and be
  warned about overlaps — **entirely without AI or maps**.
- The Trip Planner shell exposes `List | Split | Map` and `Day | Trip` toggles; List/Timeline is
  fully functional at both scopes, and Map/AI panels show clear "coming in Phase 2/4" placeholders.
- All Phase 1 tests pass; CI green; works on iOS, Android, Web.

## Artifacts
- Mockups: `../../mockups` (My Trips, Trip Detail / Itinerary, Add Activity, Calendar)
- Target UX direction: `../../mockups/option-4-map-ai-planner.html` (Map + AI fusion) and
  `../../mockups/option-5-whole-trip.html` (whole-trip scope). Phase 1 builds the **shell** for these;
  Phases 2 & 4 fill the Map and AI panels.

## Progress log
- **2026-05-30 (slice 2 — full itinerary loop + planner shell):** Completed the remaining Phase 1 scope.
  - **Backend:** extended `ITripRepository` (both `EfCoreTripRepository` and `InMemoryTripRepository`)
    with item update, **reorder within a day**, **move across days**, and packing-list CRUD; added
    `ItineraryItem` validation (`IValidatableObject`) and new controller endpoints with request
    validation. Added a `TimeZoneId` to `Trip` (IANA, for future notifications) with a migration.
    Owner checks preserved on every new operation. `dotnet test` = **17 passing** (added item CRUD,
    reorder persistence, move, packing, and ownership-deny cases). `AsSplitQuery` on the trip read path.
  - **Frontend:** new **Trip Planner** shell (`List | Split | Map` view + `Day | Trip` scope with
    drill-down and placeholder Map/AI panels); **scope-aware data layer** (`scope.ts`: scoped item
    lists, cost rollup, conflict detection) with unit tests; itinerary **item create/edit/delete**,
    **reorder/move**, and **packing list** wired through new TanStack Query mutations with cache
    invalidation; **Calendar** gained agenda + multi-day (week) views with tap-to-edit; reusable
    `DateField` / `TimeField` / `SelectField` pickers replaced free-text date/time inputs.
    `tsc` clean; `jest` = **16 passing** (added `scope` suite); web smoke green.
  - **Preferences:** Profile now has a **12h/24h clock** toggle alongside °F/°C; both persist
    on-device (zustand `persist` → localStorage on web / secure-store on native) and flow through all
    time displays and the time picker.
- **2026-05-30 (item lifecycle — wishlist/tentative/confirmed):** Reshaped the core item model now
  while local-only, so it's not a migration headache later.
  - **Model:** `ItineraryItem` gains a `Status` enum (`Confirmed | Tentative | Wishlist`,
    independent of date) and a durable required `TripId`; `DayId` is now **nullable** (`null` = the
    trip "Ideas" backlog). Day→items FK is `SetNull`; added a `(TripId, DayId, SortOrder)` index.
    EF migration `AddItemStatusAndBacklog` backfills `TripId` from each item's day.
  - **Repository/API:** `ITripRepository` (+ both impls) adds create-unscheduled, set-status, and
    backlog reorder; `MoveItem` now takes a nullable target day (null = unschedule to backlog). New
    endpoints: `POST /items` (wishlist), `PUT /items/{id}/status`, `PUT /items/order` (backlog).
    Trips carry the backlog via a `[NotMapped] UnscheduledItems` list the repo populates.
  - **Ordering (the key fix):** within a day, **timed items auto-sort by start time with no reorder
    controls** (time decides), and untimed items drop into an **"Anytime"** group that keeps manual
    ordering — so the reorder arrows now only appear where they make sense.
  - **UI:** planner has an **Ideas** backlog panel (add/reorder, status pills, tap-to-schedule),
    tentative items render muted/dashed, conflicts and the cost rollup are **confirmed-only** (a
    separate "+ … maybe" pill shows potential spend). The add/edit screen gains a status selector and
    an "Ideas (no date)" option that schedules/unschedules via move.
  - **Tests (all green):** backend `dotnet test` **21** (added backlog/status/move lifecycle);
    app `jest` **20** (added `daySchedule`/`tripBacklog`/`splitCost`/tentative-conflict cases);
    `tsc` clean; Playwright smoke passes. Verified end-to-end in the browser (scheduling an idea onto
    a day updates stops, confirmed cost, and the ideas count live).
  - **Drag-and-drop:** added `react-native-draggable-flatlist` (+ `gesture-handler`/`reanimated`) for
    the Ideas backlog. The pointer-based gesture doesn't fire reliably on **react-native-web**, so the
    Ideas panel now switches to tap **up/down arrows** on web (`Platform.OS === 'web'`) and uses real
    drag on native. Both paths call the same `reorderBacklog` mutation; verified the arrow reorder
    persists through the API roundtrip in the browser.
  - **Seed:** added a 16-day **Sicily Adventure** trip (days, items, booking links, coordinates,
    `Europe/Rome`) to backend seed + app mock data so the full loop is demoable end to end.
  - **Remaining for Phase 1 (true gaps):** (1) re-run the integration suite against a real **test
    Postgres** (currently EF in-memory); (2) the **full E2E journey** test (only the shell smoke
    exists); (3) manual touch-device drag feel on a real device + long-trip performance pass.
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
  layer** so Phase 2 (maps) and Phase 5 (AI) are additive rather than a redesign.
- **2026-05-30 (status):** Phase 0 local-first hardening completed in-repo (Router, observability,
  web smoke E2E, and client auth-session scaffolding). Phase 1 implementation can begin while
  remaining Phase 0 manual checks (real-device OAuth round-trip and external account provisioning)
  are tracked in docs.
