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
- [x] **Event-anchored journaling (primary surface):** every itinerary item is a journal anchor —
      add text/voice/photo before, during, or after it. The itinerary timeline doubles as the journal;
      events show a "has notes" indicator.
- [x] **Text notes** scoped to an **event**, a **day**, or the **trip** (`scope` + `target_id`).
- [x] **Voice notes:** record audio → upload to Azure Blob → transcribe via **Azure Speech-to-Text**
      (async job) → store **both audio and transcript**; playback + show transcript.
      *(capture/upload/playback done web + native; transcript pending the deployed Function stack.)*
- [x] **Hourly weather on item detail:** when viewing or adding a note to an itinerary event,
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
- [x] **Photos** attached to notes (Blob). *(SAS signed-URL serving deferred; media is streamed
      through the ownership-checked API endpoint for now.)*
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
- **2026-06-04 — Voice notes (slice 3, web-first):**
  - **API:** `IBlobStore.OpenReadAsync` (Local + Azure) and a `GET /api/trips/{tripId}/notes/media/{id}`
    streaming endpoint (ownership-checked, range-enabled for audio scrubbing). Voice upload + enqueue
    already existed from the backend foundation. 63 API tests (+2 media) green.
  - **API client:** `createVoiceNote` (multipart) + `fetchMediaObjectUrl` (auth fetch → object URL).
  - **Recording:** `audioRecording.ts` — browser `MediaRecorder` capture (no new deps), picks a
    supported mime (webm/opus, mp4…). Recorder UI in the event journal: **🎤 Record → ■ Stop** with a
    live timer, then uploads. Native shows a "record on web for now" hint (expo-audio is a follow-up).
  - **Playback + transcript:** voice notes render a ▶/⏸ player (authenticated object URL) plus the
    transcript when present, or **⏳ Transcribing…** / "unavailable" based on `transcriptionStatus`.
  - Locally the audio records, uploads (filesystem blob store), and plays back; transcription stays
    pending until the Function stack is deployed (`deployTranscription=true`). tsc + lint clean, 48/48 app tests.
  - **Codec note:** browser recordings are typically webm/opus; confirm Azure fast-transcription
    accepts the chosen container once deployed, or transcode/force `audio/mp4` if needed.
- **2026-06-04 — Native audio, photos (slice 2), and the trip Journal surface:**
  - **Deps:** `expo-audio` (~56) and `expo-image-picker` (~56) via `expo install`.
  - **Native voice (no more "web-only" hint):** voice capture/playback split into platform files —
    `voice/VoiceControls.web.tsx` + `voice/VoicePlayer.web.tsx` keep the browser `MediaRecorder` path;
    `voice/VoiceControls.tsx` + `voice/VoicePlayer.tsx` use `expo-audio` (`useAudioRecorder` /
    `useAudioPlayer` with auth headers) on iOS/Android. Metro picks the right one per platform; the
    upload helper now accepts either a web `Blob` or a native `{ uri, name, type }`.
  - **Photos (slice 2):** `POST /api/trips/{tripId}/notes/photo` (multipart image → blob →
    `MediaAsset` kind `Photo`, **no** transcription) reusing the existing media-streaming endpoint;
    `PhotoControls` (expo-image-picker, web file dialog + native picker) and `PhotoView` (web object
    URL / native `Image` with auth headers). 66 API tests (+3 photo) green.
  - **Trip recap / Journal panel:** `TripPlannerScreen` gains a **📓 Journal** toggle — every note
    across the trip in one place with its anchor (Whole trip / Day N / event title), plus a composer
    that attaches a **trip- or day-level** entry (text, voice, or photo). Event notes are still added
    from the item editor. Shared `notes/NoteCard` renders audio + body + photos + transcript.
  - **Tests/setup:** mocked `expo-audio`/`expo-image-picker` in `jest.setup.ts` (native modules don't
    init under Jest). tsc + lint clean; 48/48 app tests, 66/66 API tests.
  - **Native caveat:** the `expo-audio`/picker paths compile and are type-checked but need a **dev
    build** to verify on a device (web — the current target — is fully exercised). Confirm recording
    container/upload on iOS/Android when a dev build is cut.
  - **Not yet done (next):** reflection prompts + notifications (slice 4), offline outbox (slice 5),
    hourly weather on item detail (slice 6), end-to-end deploy of the transcription stack.
- **2026-06-05 — Transcription stack deployed to `dev`:** voice notes now transcribe in the cloud.
  - **Provisioned** into `rg-wander-dev`: media Storage (`stwanderdevazgnto` — `media` blob container +
    `transcription-jobs` queue), Azure AI Speech S0 (`spch-wander-dev-azgnto`), and the transcription
    Function (`func-wander-dev-azgnto`, `TranscribeAudio` queue trigger) with the published worker code.
  - **Wired** the API (`app-wander-dev-azgnto`) with `Storage__ConnectionString`, `Storage__MediaContainer`,
    and `Functions__CallbackKey` (merged onto existing settings, so `WEBSITES_CONTAINER_START_TIME_LIMIT`
    is preserved) → it now uses `AzureBlobStore` + `AzureStorageTranscriptionQueue`. The Function shares
    the same callback key and posts transcripts to `/internal/media-assets/{id}/transcript`.
  - **IaC deviation (follow-up):** the Function App was created **imperatively** as **Flex Consumption**,
    not via the Bicep module. Azure blocks a Linux **Y1 Consumption** plan (what `modules/functionApp.bicep`
    declares) in a resource group that already holds a regular Linux plan (the API's B1). Update
    `modules/functionApp.bicep` to **Flex Consumption (FC1)** before flipping `deployTranscription=true`
    in `infra/env/dev.bicepparam`; until then a full `main.bicep` deploy with transcription on would fail.
  - **Verify:** record a **new** voice note in the deployed app while signed in — it should flip from
    ⏳ Transcribing… to a transcript within ~10–30s. The previously stuck note predates the queue (it was
    enqueued to the no-op queue and its audio lived only on the API's local disk), so it won't recover.
- **2026-06-05 — Bug fixes (journal load + full transcript):**
  - **Journal loaded empty until a write:** `tryFetch` aborts reads at 2.5s and returns an empty list
    flagged `live:false`, which React Query cached as a *successful* empty result for the 30s staleTime —
    so on an API cold start the journal stayed empty until a mutation forced a refetch. `useTripNotesQuery`
    now throws on `live:false` (retried w/ backoff, never cached as a real empty list).
  - **Only first seconds transcribed:** browser `MediaRecorder` writes streamed WebM with no Duration in
    its EBML header, so Azure fast-transcription stopped after the first cluster. `audioRecording.ts` now
    patches the duration via `@fix-webm-duration/fix` (dynamic import, web-only) before upload.
- **2026-06-05 — Slice 4a: reflection prompts (offline, AI-deferred):**
  - **Decision:** prompts stay **non-AI** for now behind a `PromptProvider` seam (`StaticPromptProvider`
    = presets + on-device custom prompts) so capture stays offline-first; an `AiPromptProvider` (context-
    aware, ideally pre-generated server-side) can slot in during Phase 5/6 with no caller changes.
  - **Client-side by design:** `Note` already carries `kind: PromptResponse` + `promptId` (no prompt FK),
    so prompts need **no backend** — answers save as ordinary notes. New `src/prompts/*` (types, preset
    library w/ stable UUIDs, provider, settings store via `useSyncExternalStore`) + `src/storage.ts`
    (cross-platform KV mirroring the auth seam).
  - **UI:** a **💭 Reflect** composer in the event journal (type-aware prompts) and the trip/day journal
    (shuffle + answer → `PromptResponse` note); `NoteCard` shows the question above the answer. Profile
    gets a Journaling card (global on/off + add/remove custom prompts); the trip journal has a per-trip
    toggle. tsc + lint clean; 55/55 app tests (+7 prompt-provider tests).
  - **Next (slice 4b):** post-event **local notifications** (`expo-notifications` native + Web Notifications
    best-effort) scheduled from event end-times, deep-linking to the composer; per-event-type filter +
    quiet hours. Prompts will surface *through* those notifications then.
- **2026-06-05 — Slice 4b: post-event notifications (local, offline):**
  - **Pure core:** `src/notifications/schedule.ts` computes the nudge set from trips + settings —
    end-time + delay, event-type filter, **quiet-hours** shift (midnight-wrapping aware), future-only,
    and an iOS-safe 60-cap; fully unit-tested (`src/notifications.test.ts`, 14 cases). Types +
    settings store (`useSyncExternalStore`, persisted via `src/storage.ts`) alongside.
  - **Platform seam:** `notifier.ts` (native, `expo-notifications`) + `notifier.web.ts` (best-effort
    `Notification` + `setTimeout` while the tab is open) behind one interface
    (`ensureNotificationPermission` / `syncSchedule` / `registerResponseHandler`). `useNotificationSync`
    (mounted in `App`) re-syncs the OS schedule whenever trips/settings change and routes a tapped
    nudge to that event's composer via `uiStore.openTrip()` + `showEditItem()` (the deep-link).
  - **UI:** Profile **Reminders** card — on/off (requests OS permission), delay (Now/15/30/60), per-type
    filter (Meals/Activities/Transport/Flights/Stays), quiet-hours toggle. Off by default (opt-in).
  - **Native prep:** `app.json` adds the `expo-notifications` plugin and **iOS usage strings** (mic for
    voice notes via `expo-audio`, photos via `expo-image-picker`); Android notif permission/channel
    handled by the plugin + `setNotificationChannelAsync`. Verifies on a **dev build** (not Expo Go).
  - tsc + lint clean; **69/69** app tests.
- **2026-06-05 — Slice 4a UX revisit: guided step-through reflection:**
  - Replaced the per-question **💭 Reflect** composer with **`ReflectFlow`** — one entry point opens a
    modal that **steps through up to 6 applicable prompts** one at a time (progress bar, answer or
    **skip**, save-as-you-go → `PromptResponse` notes, end summary "Saved N reflections"). No more
    tapping Reflect per question. `ReflectComposer` removed.
  - **Past events feel more journal-y:** `isEventPast(trip, item)` (event end/start vs now) promotes a
    **prominent CTA card** ("How was {event}? · Step through N questions") at the top of a past event's
    journal; upcoming events keep the quiet inline pill. Trip/day journals use the same flow.
  - **Prompt question persisted with the answer:** added a `PromptText` column on `notes` (migration
    `AddNotePromptText`) so a reflection saves its **question text**, not just a `PromptId`. Fixes the
    answer-only display and a latent bug (custom prompt ids aren't GUIDs → the API's `Guid? PromptId`
    rejected them); the client now sends `promptText` always and only forwards `promptId` when it's a
    real UUID. `NoteCard` shows `promptText`, falling back to a preset-id lookup for pre-existing notes.
  - **Deferred (noted in `docs/deployment-runbook.md` §11):** consumer **login expansion** (Entra
    External ID + Google) and **Sign in with Apple** (Apple Guideline 4.8) are pre-public-launch gates,
    **not** required for dev/TestFlight testing — decoupled so native feature work isn't blocked.

- **2026-06-05 — Locations fix (place coordinates) + Slice 6 hourly weather:**
  - **Root cause found:** items only got coordinates when a place was picked from the search dropdown,
    and dev's place search was on the **`FakePlaceProvider`** (8 hardcoded landmarks) because the
    Mapbox key was an **empty** Key Vault placeholder — so most stops had no lat/lng and never hit the
    map (or per-item weather/travel-times). Verified via `Program.cs` provider seam + `keyVault.bicep`.
  - **Durable infra:** Mapbox/Azure Maps keys now come from `@secure()` deploy params
    (`main.bicep` → `keyVault.bicep`, read from `WANDER_MAPBOX_TOKEN` / `WANDER_AZURE_MAPS_KEY` in the
    `.bicepparam` + CI) instead of hardcoded `''` — deploys no longer clobber a configured key. Real
    dev Mapbox token written to Key Vault (targeted control-plane deploy) + API restarted.
  - **Capture UX:** a typed place with no coordinates is forward-geocoded on save; the editor shows
    pin status (`📍 Pinned to map · <address>`), and itinerary rows flag coordinate-less stops
    (`· not on map`).
  - **Slice 6 — hourly weather on item detail:** added `GetHourlyAsync(lat, lng, date, ct)` to
    `IWeatherProvider` (`HourlyWeather`/`HourlyPoint` records); Open-Meteo
    `hourly=temperature_2m,weather_code,precipitation_probability` with `timezone=auto` (forecast ≤16d,
    historical archive otherwise → "typical for this date"). `CachingWeatherProvider` caches the full
    day's array under one key (`weatherh:lat:lng:date`); new endpoint
    `GET /api/trips/{tripId}/weather/hourly/{itemId}` resolves the item's coords + day. Frontend
    `HourlyWeatherStrip` renders a horizontal hour-by-hour strip (emoji + temp + 💧%, respecting
    °C/°F + 12h/24h prefs) on the edit/journal screen, highlighting the event's hour. Display-only,
    no schema change.
  - Backend **72/72**, app **69/69**, tsc + lint clean.

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
