# Phase 1 Local Checklist

Verifies the Phase 1 slices as they land. **Slice 1 = Trip CRUD + My Trips list (search/sort/grouping).**

## Preconditions
- Local PostgreSQL running on `localhost:5432` with `ConnectionStrings:DefaultConnection` set (user-secrets).
- Start services from repo root: `.\start-wander.cmd` (API on `:5064`, Expo web on `:8081`).
- Optional: set `EXPO_PUBLIC_DEV_USER_ID` to simulate a specific user when the dev bypass is enabled.

## Slice 1 — Trip CRUD
- [ ] Tap **+** on My Trips → **New trip** form opens.
- [ ] Save with an empty title/destination or bad dates → inline validation blocks save.
- [ ] Save a valid trip → it appears in My Trips and opens to the trip detail.
- [ ] Open a trip → **✎ Edit** → change title/destination/dates → save → list + detail reflect changes.
- [ ] Open a trip → **🗑 Delete** → confirm → trip disappears from the list (soft-deleted server-side).
- [ ] Restart the API and confirm created/edited trips persist and deleted trips stay gone.

## Slice 1 — My Trips list (search / sort / grouping)
- [ ] Trips are grouped into **Upcoming** (soonest first) and **Past** (most recent first).
- [ ] **Search** by title or destination filters the list (case-insensitive); clearing restores it.
- [ ] **Sort** toggle switches between **Date** and **Name** ordering within each group.
- [ ] Empty account shows the "No trips yet" state; a non-matching search shows the "No matches" state.
- [ ] With the API stopped, the list shows the demo-data banner (local-first fallback) and still renders.

## Slice 2 — Itinerary, planner shell, calendar, packing
- [ ] Open a trip → **Trip Planner** shows `List | Split | Map` view toggle and `Day | Trip` scope toggle.
- [ ] `Trip` scope lists all days; tap a day header → drills into `Day` scope for that day.
- [ ] **Add item** on a day → pick type/title/time (via time picker)/cost → saves and appears in order.
- [ ] **Edit** an item (from planner or by tapping it in the calendar) → changes persist.
- [ ] **Reorder** items within a day (up/down) and **move** an item to another day → order persists after API restart.
- [ ] Overlapping times surface a **conflict** indicator at both day and trip scope.
- [ ] **Cost rollup** totals item costs for the day and the whole trip.
- [ ] **Packing list:** add / check / uncheck / delete items; state persists.
- [ ] **Calendar:** Day, Week (multi-day), and Agenda views render; tapping an item opens the editor.
- [ ] Map panel shows a "coming in Phase 2" placeholder; AI dock shows a "Phase 3" placeholder.
- [ ] Map/empty/loading/error states behave across the planner and calendar.

## Preferences
- [ ] Profile → **Clock** toggle (12h / 24h) changes all time displays and the time picker wheel.
- [ ] Profile → **Temperature** toggle (°F / °C) changes weather displays.
- [ ] Both preferences **persist across a reload** (web localStorage / native secure-store).

## Ownership (per-user boundaries)
- [ ] As user A, create a trip; switch `EXPO_PUBLIC_DEV_USER_ID` to user B and confirm A's trip is not visible.
- [ ] Editing/deleting another user's trip id is denied by the API (404/NotFound), never cross-user.

## Automated checks (CI-equivalent)
- [ ] Backend tests: `dotnet test backend/Wander.sln -c Release`
      (includes `EfCoreTripRepositoryTests` CRUD + ownership-deny cases and the in-memory ownership tests).
- [ ] App typecheck: `npm --prefix app run typecheck`.
- [ ] App unit tests: `npm --prefix app run test` (includes `trips-view` search/sort/grouping suite).
- [ ] Web smoke E2E: `npm --prefix app run test:e2e:smoke`.

> Note: if the API is running while you build the backend, the Debug output is locked; run tests with
> `-c Release` (separate output folder) or stop the API first.

## Expected result
- A user can create/edit/delete trips and see them correctly grouped, searched, and sorted in My Trips,
  with all loading/empty/error states behaving, and per-user ownership enforced end to end.
