# Design Option 1 - Calm Planner

## Direction
Prioritize clarity and reduced cognitive load for solo travelers who want to check their plan quickly.

## Visual style
- Softer surfaces (`bg` and `white`) with lower contrast dividers.
- Larger type hierarchy on screen titles and day headers.
- Less decorative color usage; reserve brand teal for actions and active states.
- More whitespace between itinerary cards to improve scanability.

## Key screen changes
- **My Trips**
  - Replace dense trip metadata with a two-line summary and one primary status chip.
  - Keep FAB, but add a subtle "Quick add" label on first load.
- **Trip Itinerary**
  - Convert each day into a collapsible section (default expanded for current day).
  - Promote weather and budget summary into a compact day banner.
  - Keep timeline dots, but reduce visual noise by removing repeated pills on low-priority items.
- **Add Activity**
  - Move segmented type control to a horizontal chip row with clearer active contrast.
  - Group fields into "Required" and "Optional" blocks.

## Why this design
This option aligns with your existing token system (`theme.ts`) and card/timeline components while making the experience feel lighter and easier to parse. It is the lowest-risk path because it mainly changes hierarchy and spacing rather than introducing new interaction patterns.

## Implementation notes
- Reuse existing `Card`, `Pill`, and `TripCover` primitives.
- Add spacing and typography tokens (for example `space(5)` and `titleLg` style variants).
- Add `collapsed` state per day section in `TripDetailScreen`.
