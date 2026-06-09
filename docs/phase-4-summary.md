# Phase 4 Summary — Notes & Journaling

Date: 2026-06-08
Status: Complete on the **web** target (dev); all exit criteria met. A few non-blocking items are
intentionally deferred (documented below, not blocked) — on-device native verification, offline
**media** resume (→ Phase 9), an IaC tidy-up, and the remaining integration/E2E/privacy tests.

---

## Outcome

Phase 4 turns the **itinerary into the journal**: every trip, day, and itinerary event is an anchor
you can capture against — text, **voice notes** (with automatic transcription), photos, and guided
**reflection prompts** — before, during, or after the moment. The timeline doubles as the journal,
flagging which events already have notes.

Voice capture works on web (`MediaRecorder`) and native (`expo-audio`); audio uploads to Azure Blob
and is transcribed asynchronously by a dedicated **Azure Function** calling **Azure Speech-to-Text**,
then both the audio and transcript are stored and shown. The transcription stack is **deployed and
verified end-to-end in dev** — a new voice note flips from ⏳ to a transcript in ~10–30s, and the
journal now auto-polls while transcription is pending so it appears with no reload.

Capture is **offline-first** for text and prompt responses: a persisted sync outbox queues
create/edit/delete while offline, shows the entry immediately (optimistic, marked "saved offline"),
and replays on reconnect. **Post-event reminders** (local notifications) can be toggled globally, per
trip, and per event type, with quiet hours. Media is served securely via the ownership-checked
streaming endpoint and, in the cloud, **short-lived SAS URLs**.

The local-first guarantee held throughout: with no Azure setup the app still records, stores
(filesystem blob store), and plays back media; transcription degrades to a no-op queue; and journaling
works fully against local data.

---

## What Was Completed

### Data model + text notes (slice 1)
- `Note` (`scope` trip/day/event + `target_id`, `kind` text/voice/prompt_response, `body_text?`,
  `prompt_id?`, soft-delete) and `MediaAsset` (`kind` audio/photo, `blob_name`/`blob_url`, `duration?`,
  `transcript?`, `transcription_status`) entities; EF migration `AddNotesAndMedia`.
- `NotesController` — list/create/update/delete notes with per-user **trip ownership** throughout.
- App: event composer on the item editor + a **"has notes"** indicator on the itinerary timeline.

### Media infra + photos (slice 2)
- `IBlobStore` seam — `LocalBlobStore` (filesystem, dev/CI) and `AzureBlobStore` (cloud), selected by
  presence of `Storage:ConnectionString`. Ownership-checked, range-enabled media **streaming endpoint**.
- `POST …/notes/photo` (multipart image → blob → `MediaAsset` kind Photo, no transcription);
  `PhotoControls` (expo-image-picker + web file dialog) and `PhotoView`.

### Voice notes + transcription (slice 3)
- Recording: web `MediaRecorder` (`VoiceControls.web` / `VoicePlayer.web`) and native `expo-audio`
  (`VoiceControls` / `VoicePlayer`), selected per platform by Metro.
- Pipeline: upload audio → `MediaAsset` pending → enqueue job → **`Wander.Functions`** (.NET 9 isolated,
  queue trigger) downloads the blob → **Azure Speech fast transcription** → POSTs the transcript back to
  `InternalTranscriptionController` (service-to-service, `Functions:CallbackKey` constant-time compare).
- `ITranscriptionQueue` seam — `NullTranscriptionQueue` (dev/CI) / `AzureStorageTranscriptionQueue` (cloud).

### Reflection prompts (slice 4a)
- Non-AI `PromptProvider` seam (presets w/ stable UUIDs + on-device custom prompts) so capture stays
  offline; an `AiPromptProvider` can slot in later with no caller changes.
- **`ReflectFlow`** — a guided modal that steps through up to 6 applicable prompts (answer/skip,
  save-as-you-go → `PromptResponse` notes). Past events surface a prominent "How was {event}?" CTA.
- `PromptText` column (migration `AddNotePromptText`) persists the **question** with the answer.

### Post-event notifications + config (slice 4b + per-trip)
- Pure `schedule.ts` core: end-time + delay, event-type filter, **quiet-hours** shift (midnight-aware),
  future-only, iOS-safe cap — fully unit-tested.
- Platform seam: `notifier.ts` (`expo-notifications`) / `notifier.web.ts` (best-effort), behind one
  interface; `useNotificationSync` re-syncs the OS schedule and deep-links a tapped nudge to the event.
- Config: **global** on/off, **per event type**, **quiet hours** (Profile Reminders card), and a
  **per-trip** toggle (`disabledTripIds`) in the trip Journal panel.

### Offline-first capture — text/prompt (slice 5)
- Persisted FIFO **outbox** (`src/sync/outbox.ts`): `note.create/update/delete`; edits/deletes of an
  unsynced note fold into its queued create; `flushOutbox` replays in order, stops at the first offline
  retry, drops 4xx poison ops. Unit-tested (9 cases).
- Note mutations try the API first and, on a **connectivity** failure, enqueue + optimistically patch
  the React Query cache (temp note marked `pendingSync`; `NoteCard` shows "⏳ Saved offline — will sync").
  `useOutboxSync` flushes on mount, web `online`, app-foreground, and a 20s interval.

### Hourly weather on item detail (slice 6)
- `GetHourlyAsync(lat, lng, date, ct)` on `IWeatherProvider`; Open-Meteo
  `hourly=temperature_2m,weather_code,precipitation_probability`; caches the day's array under one key.
- `GET …/weather/hourly/{itemId}` + `HourlyWeatherStrip` (emoji + temp + 💧%, °C/°F + 12h/24h aware),
  highlighting the event's hour. Display-only, no schema change.

### Place coordinates + media SAS + live transcript refresh
- **Locations fix:** itinerary items reliably get coordinates (forward-geocode on save; pin-status UI;
  "not on map" hint). Mapbox upgraded to the **Search Box API** (`suggest` + `retrieve`, session tokens,
  proximity bias). Provider keys come from durable `@secure()` deploy params (no more hardcoded `''`).
- **Media SAS:** `IBlobStore.TryGetReadSasUriAsync` — `AzureBlobStore` mints a 30-min read SAS,
  `LocalBlobStore` returns null. `GET …/notes/media/{id}/sas` returns the URL (200) or **204** to signal
  fall-back; frontend prefers SAS (`getMediaSasUrl`, `useMediaSource`) and falls back to authed streaming.
- **Transcript live-refresh:** `useTripNotesQuery` polls every 5s while any note is `Pending` and stops
  when none remain — the transcript appears without a manual reload.

### Cloud deployment (transcription stack, dev)
- Provisioned into `rg-wander-dev`: media **Storage** (`stwanderdevazgnto` — `media` container +
  `transcription-jobs` queue), **Azure AI Speech** S0 (`spch-wander-dev-azgnto`), and the **Function**
  (`func-wander-dev-azgnto`, `TranscribeAudio` queue trigger) with the published worker.
- API wired with `Storage__ConnectionString`, `Storage__MediaContainer`, `Functions__CallbackKey` → it
  uses `AzureBlobStore` + `AzureStorageTranscriptionQueue`; verified end-to-end.

### Native build prep (EAS)
- Baked the dev Entra vars (`EXPO_PUBLIC_AUTH_ISSUER` / `_CLIENT_ID` / `_SCOPES`) into all `app/eas.json`
  profiles so a native dev build authenticates (previously only `EXPO_PUBLIC_API_URL` was passed).
- `app.json` carries the `expo-audio` / `expo-image-picker` / `expo-notifications` plugins + iOS usage
  strings. Remaining manual step (documented): register the `wander://auth` mobile redirect in Entra.

### Bug fixes worth noting
- **Journal loaded empty until a write:** `useTripNotesQuery` now throws on a `live:false` read instead
  of caching the empty fallback (a slow/cold read no longer pins an empty journal for the staleTime).
- **Only first seconds transcribed:** browser WebM lacks a duration header; `audioRecording.ts` patches
  it via `@fix-webm-duration/fix` (web-only) before upload so Azure transcribes the full clip.
- **AddActivityScreen full-screen on web** and **place dropdown behind sibling fields** (z-index) fixed.

---

## Live `dev` resources (added this phase)

| Resource | Name |
|---|---|
| Media Storage | `stwanderdevazgnto` (`media` blob container + `transcription-jobs` queue) |
| Azure AI Speech (S0) | `spch-wander-dev-azgnto` |
| Function App (transcription) | `func-wander-dev-azgnto` (`TranscribeAudio` queue trigger, .NET 9 isolated, Flex Consumption) |

---

## New packages

| Package | Side | Purpose |
|---|---|---|
| `expo-audio` | app | Native voice recording + playback |
| `expo-image-picker` | app | Native photo capture/selection |
| `expo-notifications` | app | Local post-event reminder scheduling (native) |
| `@fix-webm-duration/fix` | app (web) | Patch WebM duration header so full clips transcribe |
| `Azure.Storage.Blobs` / `Azure.Storage.Queues` | api/functions | Cloud blob storage + transcription job queue + SAS |

---

## Tests at close

- Backend **81/81** (notes CRUD/ownership, voice→enqueue, callback-key paths, media streaming + **SAS**)
  and **3** Function parsing tests.
- App **79/79**, incl. notification scheduling (per-type/quiet-hours/delay/**per-trip opt-out**),
  **outbox** queue/flush, and prompt-provider logic. `tsc` + lint clean.

---

## Deferred items (documented, not blocked)

| Item | Deferred to | Notes |
|---|---|---|
| Native (iOS/Android) on-device verification | When a dev build is cut | Project + EAS auth wired; needs `eas login` + the `wander://auth` Entra mobile redirect (account-gated) |
| Offline **media** capture/resume | Phase 9 (sync hardening) | Outbox covers text/prompt today; large audio/photo blobs + resume upload/transcription land in Phase 9 |
| `functionApp.bicep` Y1 → Flex Consumption | Infra backlog | Module declares Y1; live Function is Flex. Convert to FC1 before any full `main.bicep` deploy with `deployTranscription=true` |
| Integration / offline-E2E / privacy tests | Phase 4 testing plan | Audio→transcript persisted, airplane→reconnect→sync, negative-access pass |
| Formal mockups | — | Shipped UI in `app/` is the source of truth for this phase |

---

## What's next

**Phase 5 — AI Planning Assistant:** generate/refine itineraries via chat with tool-calling (search
places, add/move items, gap-fill), preference-aware, with per-user token quotas and AI quality evals.
