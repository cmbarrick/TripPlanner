# Phase 4 — Notes & Journaling

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

## Delivery plan (slices)
Each slice is independently shippable, testable, and green before the next.

1. **Data model + text notes (backend-first).** `Note` (`scope` trip/day/event + `target_id`,
   `kind` text/voice/prompt_response, `body_text?`, `author_id`) and `MediaAsset`
   (`kind` audio/photo, `blob_url`, `duration?`, `transcript?`) entities + EF migration;
   `NotesController` CRUD with per-user ownership. App: note composer on item-detail + a
   "has notes" indicator on the itinerary timeline (the timeline is the journal).
2. **Media infra + photos.** Add an **Azure Storage account + container to dev infra (Bicep)**;
   `BlobService` + signed-URL (SAS) endpoints in the API; photo attach/upload from the app.
3. **Voice notes + transcription.** Record audio → upload to Blob → **Azure Speech-to-Text** →
   persist **both** audio and transcript; playback + transcript display. Transcription runs in a
   dedicated **Azure Function** (queue-triggered), decided up front (no in-API interim). Web records
   via `MediaRecorder`; native via `expo-audio`.
4. **Reflection prompts + post-event local notifications.** `JournalPrompt` library + global/per-trip
   toggles; `expo-notifications` (native) and the Web Notifications API (web, best-effort) scheduled
   from event end-times (+ delay), deep-linking to that event's composer; per-event-type filter +
   quiet hours.
5. **Offline-first capture.** Lightweight sync outbox so notes/recordings created offline queue and
   resync; media upload + transcription resume on reconnect. (Full hardening is Phase 9.)
6. **Hourly weather on item detail.** `GetHourlyAsync(lat, lng, date, ct)` on `IWeatherProvider`;
   cache the day's hourly array under one key, slice client-side.

### Decisions (locked)
- **Transcription engine:** always **Azure Speech-to-Text**, behind `ITranscriptionService`, hosted
  in a dedicated **Azure Function** (queue-triggered) — built now, not deferred.
- **Web scope:** companion web also gets **voice recording + notifications** (best-effort browser
  APIs), in addition to text/photo/playback.
- **Storage:** add a real **Azure Storage account to the dev environment** (cheap), not just a fake.

## Out of scope
- AI recap generation (Phase 6), sharing/publishing (Phases 7–8).

## Progress log
- **2026-06-03 — Backend foundation (slice 1) + transcription Function (slice 3 backend):**
  - **Models:** `Note` (`scope` trip/day/event + `target_id`, `kind` text/voice/prompt_response,
    `body_text?`, `prompt_id?`, soft-delete) and `MediaAsset` (`kind` audio/photo, `blob_name`/`blob_url`,
    `duration?`, `transcript?`, `transcription_status`); DbContext config + EF migration `AddNotesAndMedia`.
  - **API:** `NotesController` — list/create text notes, create **voice note** (multipart audio →
    blob → `MediaAsset` pending → enqueue transcription job), soft-delete; all with per-user trip
    ownership. `InternalTranscriptionController` — service-to-service transcript callback authorized
    by `Functions:CallbackKey` (constant-time compare).
  - **Abstractions (local-first):** `IBlobStore` (`LocalBlobStore` filesystem for dev/CI,
    `AzureBlobStore` for cloud) and `ITranscriptionQueue` (`NullTranscriptionQueue` no-op for dev/CI,
    `AzureStorageTranscriptionQueue` for cloud). Wired in `Program.cs` by presence of
    `Storage:ConnectionString` — the app still runs with **zero Azure dependency** locally.
  - **`Wander.Functions`** (.NET 9 isolated): `TranscribeAudioFunction` (queue trigger
    `transcription-jobs`) → download blob → `AzureSpeechTranscriptionService` (Speech **fast
    transcription** REST) → POST transcript back to the API callback; retry/poison via host. Added to
    the solution with `Wander.Functions.Tests`.
  - **Infra (Bicep, deploy toggle OFF):** `storage.bicep` (account + `media` container +
    `transcription-jobs` queue), `speech.bicep` (Azure AI Speech), `functionApp.bicep` (Linux
    Consumption, .NET 9 isolated). Gated behind `deployTranscription=false` in `main.bicep`; the API
    gets `Storage__ConnectionString` + `Functions__CallbackKey` app settings only when enabled.
    Nothing is provisioned/charged until the toggle is flipped.
  - **Tests:** 61 API tests (12 new: notes CRUD, ownership, voice→enqueue, callback key paths) +
    3 Function parsing tests — all green. `az bicep build` clean.
  - **Not yet done (next):** app UI (composer, "has notes" indicator, recorder, playback), photos
    (slice 2 SAS endpoints), reflection prompts + notifications (slice 4), offline outbox (slice 5),
    hourly weather on item detail (slice 6), and an end-to-end deploy of the transcription stack.

- **2026-06-04 — Frontend slice 1 (text journaling UI):**
  - **API client + query layer:** `Note`/`MediaAsset` types, `getTripNotes`/`createNote`/`deleteNote`
    in `api.ts` (notes fall back to `[]` when offline), and `queries/notes.ts`
    (`useTripNotesQuery` + create/delete mutations that invalidate the trip's notes).
  - **Itinerary = journal:** `TripPlannerScreen` shows a **📝 count** "has notes" indicator on each
    event row (event-scoped notes counted per item).
  - **Event journal composer:** the item editor (`AddActivityScreen`) gains a **Journal** section
    (only when editing an existing event) — add/list/delete timestamped text entries anchored to that
    event. Voice + photos come in later slices.
  - Type-check + lint clean; 48/48 app tests pass.
  - **Next:** trip/day-scoped journal surface, voice recording + playback (slice 3 frontend), photos
    (slice 2), reflection prompts + notifications (slice 4).

> **Revisit on return (carried from Phase 3 deploy):** confirm live web sign-in end-to-end on the
> dev Static Web App — the `401 /api/trips` seen in the console is just the signed-out state. See
> `docs/deployment-runbook.md` → "Open item to revisit".

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
