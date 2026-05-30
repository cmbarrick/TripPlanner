# Mockups — Wander

Static, self-contained UI mockups for the trip planning app. No build step required.

## How to view
Open `index.html` in any browser (double-click it, or drag it into a browser window).
Everything is plain HTML + CSS — no dependencies.

## What's included
A design board of phone screens, each labeled with the phase it belongs to:

| Screen | Phase |
|---|---|
| Onboarding | 0 |
| Sign in (email + Google/Apple) | 0 |
| My Trips (trip list) | 1 |
| Trip · Itinerary (day-by-day timeline) | 1 (+ weather from 2) |
| Add Activity (form) | 1 (+ place search from 2) |
| Calendar + conflict detection | 1 |
| Map view (pins + travel time) | 2 |
| AI Assistant (chat that edits the trip) | 3 |
| Offline mode (local-first sync) | 4 |

## Files
- `index.html` — the mockup board (all screens)
- `styles.css` — the shared design-system styling
- `design-option-1-calm-planner.md` — low-risk clarity-first UI direction
- `design-option-2-map-first.md` — route and movement-centric direction
- `design-option-3-ai-concierge.md` — assistant-led planning direction
- `option-1-calm-planner.html` — visual mockups for Option 1
- `option-2-map-first.html` — visual mockups for Option 2
- `option-3-ai-concierge.html` — visual mockups for Option 3
- `option-4-map-ai-planner.html` — **recommended**: fuses Map (2) + AI (3) into one screen
- `option-5-whole-trip.html` — same Map + AI, scoped to the entire trip (Day | Trip toggle)

## Compare design options
Open each file in a browser to compare directions side by side:
- `option-1-calm-planner.html`
- `option-2-map-first.html`
- `option-3-ai-concierge.html`
- `option-4-map-ai-planner.html` (recommended fusion)
- `option-5-whole-trip.html` (whole-trip scope)

## Recommended direction: Map + AI Planner
Rather than asking users to pick between separate "map" and "AI" layouts, `option-4`
combines them into one experience:
- A `Timeline | Split | Map` **view toggle** (a view-mode preference, not a layout fork).
- A persistent **AI layer** that previews proposals on the timeline and map before Apply.
- AI provenance badges + one-tap **Undo** so AI edits are always reversible.

This keeps complexity low (one screen, one component system) while delivering both
capabilities the product cares about most.

These are visual references, not production code. The real app is built in Expo (React Native + Web)
per `../docs/architecture.md`.
