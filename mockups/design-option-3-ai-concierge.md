# Design Option 3 - AI Concierge

## Direction
Position the assistant as the primary planning surface while preserving user control and edit transparency.

## Visual style
- Conversational UI with clear "proposed vs applied" states.
- Distinct action styling (apply, undo, edit) using existing success/warn/danger tones.
- Slightly warmer accent usage to make recommendations feel more personal and less mechanical.

## Key screen changes
- **Assistant**
  - Add structured recommendation cards with estimated cost/time impact.
  - Show explicit action buttons: `Apply`, `Edit`, `Save for later`.
  - Add a visible "Trip changed" activity rail for trust and traceability.
- **Trip Itinerary**
  - Highlight AI-added items with a subtle badge and one-tap "why this" explanation.
  - Add an "Undo last AI batch" action at day level.
- **Calendar**
  - AI conflict resolution suggestions appear inline next to overlaps.
- **My Trips**
  - Add a "Needs decisions" section for pending AI suggestions.

## Why this design
This direction supports your phase roadmap where AI is a core differentiator. It makes the assistant useful without hiding decisions, which can improve trust and reduce fear of accidental itinerary changes.

## Implementation notes
- Build on existing `Pill` tones and card patterns for proposal states.
- Add lightweight metadata fields (`source`, `batchId`, `confidence`) on itinerary items.
- Keep assistant edits reversible by design (batched apply/undo model).
