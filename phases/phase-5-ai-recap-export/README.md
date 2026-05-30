# Phase 5 — AI Recap & Export

> Goal: Turn captured notes into an editable, shareable **recap** — and export it.
> Est: ~2–3 weeks · Depends on: Phase 4 (notes & transcripts), Phase 3 (AI plumbing)

## Objectives
- Summarize a trip's notes (text + voice transcripts) into a recap at event/day/trip level.
- Keep the user in control: editable, grounded in their own notes, no invented facts.
- Export to a polished PDF and a shareable web page.

## Scope / tasks
- [ ] **Recap generation** via Azure OpenAI at **event / day / whole-trip** granularity.
- [ ] **Tone/format options** (e.g., narrative, highlights, bullet) chosen by the user.
- [ ] **Grounding:** recap draws only from the user's notes/transcripts + itinerary context;
      cite/attach which notes informed each section.
- [ ] **Editable draft → final:** user edits before saving; recap is versioned.
- [ ] **Export:** generate **PDF** and a **shareable web page**; optional photo inclusion.
- [ ] **Cost controls:** per-user quotas, caching, cheaper model for drafts.

## Out of scope
- Public publishing/searchability and discovery (Phase 7); real-time sharing (Phase 6).

## Testing plan
- [ ] **AI evals:** recap **faithfulness** (no facts beyond notes), coverage of key events, tone.
- [ ] **Unit:** recap assembly, note→section linkage, versioning.
- [ ] **Integration:** generate → edit → export PDF/web; photo inclusion.
- [ ] **Cost:** quota enforcement; caching avoids duplicate generation.
- [ ] **Regression:** Phases 0–4 suites green.

## Exit criteria
- Generate an **editable** trip recap from notes; export a polished PDF/web page.
- Recap quality passes eval thresholds; **no fabricated facts** beyond the user's notes.

## Artifacts
- Mockups: to be added (recap view, tone picker, export sheet).
