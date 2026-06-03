# Phase 5 — Notes & Journaling

> Goal: Capture the trip **as it happens** — text and **voice notes** — low-friction and offline.
> Est: ~3–4 weeks · Depends on: Phase 3 (cloud + media infra for voice/photos), Phase 1 itinerary

## Objectives
- **Journal-as-you-go:** make the **itinerary itself the journal** — capture against the specific
  event you're experiencing, with minimal friction.
- **Nudge summaries with notifications:** after an event ends, optionally prompt the user to add a
  quick note/voice memo for *that* event.
- Let travelers also note a day or the whole trip; provide optional, toggleable reflection prompts.
- Make capture reliable offline — never lose a note or recording.

## Scope / tasks
- [ ] **Event-anchored journaling (primary surface):** every itinerary item is a journal anchor —
      add text/voice/photo before, during, or after it. The itinerary timeline doubles as the journal;
      events show a "has notes" indicator.
- [ ] **Text notes** scoped to an **event**, a **day**, or the **trip** (`scope` + `target_id`).
- [ ] **Voice notes:** record audio → upload to Azure Blob → transcribe via **Azure Speech-to-Text**
      (async job) → store **both audio and transcript**; playback + show transcript.
- [ ] **Hourly weather on item detail:** when viewing or adding a note to an itinerary event,
      show an hourly forecast for that stop's location and day (e.g. "🌦️ 14°C at 2 PM").
      Open-Meteo `hourly=temperature_2m,weather_code,precipitation_probability` on the existing
      `api.open-meteo.com/v1/forecast` endpoint; cache the full day's hourly array under one key
      and slice client-side. Add `GetHourlyAsync(lat, lng, date, ct)` to `IWeatherProvider`.
      See architecture §7 "Hourly weather" and Phase 2 weather notes.
- [ ] **Post-event notifications:** schedule a **local** notification at an event's end time (+ small
      delay) prompting a summary; tapping **deep-links to that event's** note composer / reflection prompt.
- [ ] **Notification config:** on/off **globally, per trip, and per event type** (e.g., meals &
      activities only; skip transport/lodging); **quiet hours**; respects "prompts can be turned off".
- [ ] **Reflection prompts:** preset library + custom; **toggle on/off globally and per trip**;
      fire at end of **event/day/trip**; responses saved as notes linked to the prompt.
- [ ] **Photos** attached to notes (Blob).
- [ ] **Offline-first capture:** create notes/recordings offline; **schedule notifications locally**
      (no server needed); queue mutations in the sync outbox; resume media upload + transcription on reconnect.
- [ ] Ownership checks; signed URLs for media.

## Out of scope
- AI recap generation (Phase 6), sharing/publishing (Phases 7–8).

## Testing plan
- [ ] **Unit:** note scoping, prompt enable/disable logic, notification scheduling rules
      (per-type filter, quiet hours, delay), outbox queueing.
- [ ] **Integration:** audio upload → transcription → transcript persisted; photo upload; ownership.
- [ ] **Media/voice:** transcription accuracy on sample clips; audio round-trip (record→store→play).
- [ ] **Notifications:** event-end notification fires at the right time; **deep-link opens the correct
      event's** composer; disabling globally/per-trip/per-type suppresses it.
- [ ] **Offline E2E:** airplane mode → create text + voice note on an event → notification still
      scheduled locally → reconnect → media + transcript sync.
- [ ] **Privacy:** notes default private; media access requires ownership/signed URL.
- [ ] **Regression:** Phases 0–4 suites green.

## Exit criteria
- From the itinerary, add text/voice/photo to a **specific event** (journal-as-you-go), **offline**, and it syncs.
- A **post-event notification** prompts a summary and deep-links to that event; it can be turned off
  globally, per trip, and per event type.
- Reflection prompts can be turned off globally and per trip.
- Media stored securely; nothing is shared or public yet.

## Artifacts
- Mockups: to be added (event note composer, voice recorder, post-event notification, prompt card).
