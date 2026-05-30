# Design Option 2 - Map-First Navigator

## Direction
Center route confidence and movement planning for travelers who choose activities based on proximity and transit time.

## Visual style
- Stronger geographic cues: map accents, route lines, and location-based chips.
- Slightly bolder contrast for travel-time UI and pinned items.
- Keep current color palette, but assign stable semantic colors to category pins.

## Key screen changes
- **My Trips**
  - Add a mini "route confidence" badge to each trip card (walkability/transit quality).
  - Include a single line preview of the next movement segment.
- **Trip Itinerary**
  - Add a top switch: `Timeline | Map | Split`.
  - In `Split`, show timeline on top and a compact map strip below each day.
  - Replace plain travel text with directional chips (`12 min walk`, `3 stops metro`).
- **Map View**
  - Make map cards swipeable by itinerary order (A -> B -> C).
  - Add a sticky summary for total transit time and total walking distance.
- **Add Activity**
  - Show candidate places as distance-ranked options before save.

## Why this design
Your current mockups already include timeline, travel rows, and a map concept, so this option extends a clear strength in the product. It can increase planning confidence and reduce back-and-forth between itinerary and maps without forcing a major visual redesign.

## Implementation notes
- Extend the existing `TripDetailScreen` with a segmented mode toggle.
- Introduce a reusable `TravelChip` component tied to `item.type` and routing metadata.
- Keep current tab structure; this option is additive, not structural.
