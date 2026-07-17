# Phase 9 — Offline, Polish & Launch

> Goal: Reliable **in the field** and **production-ready** for launch.
> Est: ~2–3 weeks · Depends on: Phases 0–8
> (Offline capture foundations begin in Phase 4; this phase **hardens** them across the app.)

## Objectives
- Make the full plan + **capture** flow work offline with robust background sync (incl. media).
- Hit performance, accessibility, privacy, and store-readiness bars.

## Scope / tasks
- [ ] **Offline data layer:** local SQLite as UI source of truth; query persistence; local media cache.
- [x] **Outbox + background sync (media):** queue voice/photo captures offline, flush on reconnect.
      *(Phase 4 shipped the text/prompt outbox — `app/src/sync/outbox.ts`; now extended to **media**
      — a new `note.media` op kind whose bytes are copied into durable local storage by
      `app/src/sync/mediaCache.ts` (native: document directory via the new `expo-file-system`
      `File`/`Directory`/`Paths` API) / `mediaCache.web.ts` (web: IndexedDB, since a recorded/picked
      Blob only lives in memory otherwise) — the queued op itself just carries a lookup key, keeping
      the small KV-backed outbox store free of large blobs. `useOutboxSync`'s `runOp` uploads the
      cached file on flush and frees it after. `useCreateVoiceNoteMutation`/
      `useCreatePhotoNoteMutation` catch an offline failure, queue via `enqueueMediaNote`, and hand
      back an optimistic note (`pendingMediaKind`) so `NoteCard` shows "🎤/📷 ... ⏳ Saved offline —
      will sync" immediately. Editing a still-queued photo's caption folds into the queued op;
      deleting one frees its cached bytes instead of leaking them.)*
      Resuming interrupted **transcription** on reconnect wasn't touched — voice notes upload the
      full audio in one shot once back online, and transcription then runs exactly like an online
      upload; there's no separate resume path to add. The reload-persistence gap this surfaced
      (a still-queued note disappearing from the list across a page reload, even though the op and
      its cached bytes both survive and still sync correctly) is now fixed — see **Sync status UI**
      below.
- [ ] **Conflict handling:** harden for single + multi-user (builds on Phase 7 merge strategy);
      soft-delete via `deleted_at`.
- [x] **Sync status UI:** offline indicator, "pending changes", media upload progress, retry.
      [x] **Pending-changes persistence:** `useTripNotesQuery` (`app/src/queries/notes.ts`) now
      derives its result by overlaying the outbox's queued ops onto the fetched list on every
      render (reactive via `useOutbox`), instead of the four write mutations manually patching the
      React Query cache in their `onSuccess`. A pending create/media note is added, a pending edit
      shows on the real note it targets, and a pending delete removes its target — all recomputed
      whenever the outbox changes, so a still-queued note (text, voice, or photo) now survives a
      page reload and even a fully-offline cold start (no cached server list at all), not just the
      brief window between capture and reload. This also deleted the four `patchNotesCache` calls,
      since the overlay replaces what they were doing less generally.
      [x] **Offline indicator + pending count + manual retry:** the outbox (`outbox.ts`) now tracks
      a `blocked` flag — true once a flush attempt actually stops on a network failure with work
      still queued, cleared on the next flush that either drains fully or finds nothing queued —
      bundled with `ops` into one reactive snapshot so a `blocked`-only change still re-renders
      subscribers (a `blocked`-only mutation doesn't change the `ops` array reference, which
      `useSyncExternalStore` needs to know to update). `useSyncStatus`
      (`app/src/sync/useOutboxSync.ts`) exposes `{ pendingCount, blocked, retryNow }` — `retryNow`
      shares the exact flush logic `useOutboxSync`'s automatic triggers use (same query
      invalidation), just callable on demand instead of waiting for app start/foreground/the web
      `online` event/the 20s safety net. `SyncStatusBar.tsx` renders nothing when nothing's queued,
      a soft "⏳ N pending" once something is, and "🔌 Offline — N pending [Retry]" once a flush has
      actually hit a network failure; mounted in the trip planner's Journal panel.
      [x] **Media upload progress:** `postMultipart` (`api.ts`) moved from `fetch` to
      `XMLHttpRequest` — `fetch` has no upload-progress event in any target environment (web or
      React Native), while XHR's `upload.onprogress` works in both. `createVoiceNote`/
      `createPhotoNote` gained an optional `onProgress(fraction)` param, threaded through
      `useCreateVoiceNoteMutation`/`useCreatePhotoNoteMutation`'s mutate variables into local
      component state in `VoiceControls`/`VoiceControls.web`/`PhotoControls`, rendered as "Uploading
      voice note… 42%".
- [ ] **Performance pass:** list virtualization, image/audio optimization, cold-start, bundle size.
- [ ] **Accessibility pass:** labels, focus order, dynamic type, contrast (axe / manual SR test).
- [ ] **UX polish:** onboarding, empty/error/loading states, micro-interactions; **in-trip AI dock**
      composer (wire mockup `option-4-map-ai-planner.html` — tap/type → chat for open trip; Phase 5
      shipped chat on Assistant tab only).
- [ ] **Privacy review:** consent gates, deletion/export, moderation paths verified end-to-end.
- [ ] **Launch prep:** app icons, splash, store screenshots (all required sizes), privacy policy, listings.
- [ ] **App store submission** (see [`deployment-and-app-stores.md`](../../docs/deployment-and-app-stores.md)):
  - [ ] **Apple App Privacy** labels + **Google Data Safety** form completed and accurate.
  - [ ] All **permission usage strings/rationales** present (microphone, photos, location, notifications).
  - [ ] **In-app account deletion** implemented (required by both stores).
  - [ ] **UGC moderation + reporting + blocking** live **before** public recaps (Apple Guideline 1.2 / Play).
  - [ ] Content/age ratings; production binaries submitted via **`eas submit`**; staged rollout planned.
- [ ] **Web deploy:** Expo web export live on **Azure Static Web Apps** (custom domain + HTTPS).
- [ ] **Hardening:** crash-free rate monitoring, error budgets, final security review.

## Out of scope
- Monetization, booking, fine-tuning (v2 / later).

## Testing plan
- [x] **Unit (media outbox):** `outbox.test.ts` — queuing a voice/photo note caches its bytes and
      persists a `note.media` op; editing a still-pending photo's caption folds into that op;
      deleting one drops the op and frees its cached bytes; a flush finds the cached file by key.
      `useOutboxSync.test.ts` — `runOp` uploads via `createVoiceNote`/`createPhotoNote` and cleans
      up the cache on success, retries (keeping the cache) on a transient failure, and drops +
      cleans up on a 4xx. Conflict resolver / broader retry-backoff logic: not yet (later Phase 9
      slice).
- [x] **Unit (pending-changes overlay):** `queries/notes.test.ts` (`useTripNotesQuery`, via
      `renderHook`) — a queued create/media op overlays onto the fetched list, newest first; a
      queued op for a *different* trip is excluded; queued captures still surface even when the
      fetch itself fails outright (cold-started offline, no cached server list at all).
- [x] **Unit (blocked status + manual retry):** `outbox.test.ts` — `useOutbox().blocked` stays
      false with an empty queue, flips true reactively when a flush stops on `retry`, clears once a
      later flush drains fully. `useOutboxSync.test.ts` — `useSyncStatus().retryNow` drains the
      queue and updates `pendingCount`/`blocked` reactively; reports `blocked` after a transient
      failure. `SyncStatusBar.test.tsx` — renders nothing when nothing's queued, the soft pending
      vs. blocked/offline copy, singular/plural wording, and that pressing Retry calls `retryNow`.
- [x] **Unit (upload progress):** `api.multipart.test.ts` (fake `XMLHttpRequest`) — fractional
      progress reported as `upload.onprogress` fires, a non-length-computable event is ignored, a
      4xx response rejects with the server's `title` message, and a network-level failure rejects
      with `status: undefined` (so `isOfflineError` still treats it as "queue for later").
- [ ] **Integration:** mutate offline (incl. voice note) → reconnect → server reflects changes + media.
- [x] **E2E (offline, web, manual/Playwright):** hand-verified against a running dev API + local
      Postgres — blocked the photo-upload endpoint to simulate a real offline fetch rejection
      (`context.setOffline` hangs requests rather than rejecting them, so it doesn't exercise the
      catch path — request interception does), picked a photo → optimistic "📷 Photo added ⏳ Saved
      offline — will sync" entry appeared immediately → unblocked + fired `online` → outbox flushed,
      uploaded, and the entry became permanent with no duplicate. Reload-while-still-blocked
      (re-verified after the overlay fix): the pending entry **now reappears immediately after the
      reload** (previously it vanished until the flush completed) and still flushes to a permanent
      entry with no duplicate once reconnected. **Sync status UI** (re-verified again after adding
      it): a normal online photo upload still completes via the new XHR-based `postMultipart`; an
      offline capture shows the soft "⏳ 1 change waiting to sync" bar; pressing **Retry** while
      still blocked flips it to "🔌 Offline — 1 change waiting to sync"; pressing **Retry** again
      once unblocked syncs it and the bar disappears entirely, with no duplicate entry. Native
      (iOS/Android) and voice-note capture verified by code review + unit tests only, not live (no
      device/simulator or mic access in this pass).
- [ ] **Non-functional:** Lighthouse (web) targets; cold start < target; a11y (axe) clean; bundle budget.
- [ ] **Privacy/security:** consent + deletion/export regression; no data leaks across users.
- [ ] **Soak / device matrix:** real iOS + Android devices; low-end device check.
- [ ] **Full regression:** Phases 0–8 suites green.

## Exit criteria
- Full plan + **capture** flow works in **airplane mode** and syncs correctly on reconnect.
- Performance, accessibility, and privacy targets met; crash-free rate above threshold.
- Passes the app store submission + privacy review; staging soak shows no critical errors.

## Artifacts
- Mockups: `../../mockups` (offline indicator, onboarding)

## Progress log
- **2026-07-16** — **Offline media outbox shipped.** Extended Phase 4's text/prompt outbox
  (`app/src/sync/outbox.ts`) with a `note.media` op kind for voice/photo notes captured offline.
  New `mediaCache.ts`/`mediaCache.web.ts` copy the recorded/picked bytes into durable local storage
  (native: `expo-file-system`'s new `File`/`Directory`/`Paths` API, document directory; web:
  IndexedDB) so the small KV-backed outbox store never has to hold large blobs — queued ops just
  carry a lookup key. `useOutboxSync`'s flush uploads the cached file via the existing
  `createVoiceNote`/`createPhotoNote` and frees it after; `useCreateVoiceNoteMutation`/
  `useCreatePhotoNoteMutation` now catch an offline failure and queue instead of just failing
  silently (previously the *only* behavior — voice/photo capture had no offline path at all before
  this). Editing a still-queued photo's caption folds into the queued op; deleting one frees its
  cached bytes. **Tests:** app **106/106** (+12 across `outbox.test.ts`/`useOutboxSync.test.ts`),
  `tsc` clean. **Hand-verified live** in a real Chromium browser against a running dev API + local
  Postgres: simulated offline (request interception, since Playwright's `context.setOffline` hangs
  requests rather than rejecting them and so doesn't exercise the offline-catch path) → picked a
  photo → optimistic pending entry appeared instantly → reconnect → flushed and synced with no
  duplicate; separately confirmed a still-queued op and its cached bytes survive a page reload while
  offline and still sync correctly afterward (no data loss), though the pending entry itself
  disappears from the visible list across that reload until the flush completes.
  **Known gap surfaced by this work** (pre-existing, shared with the Phase 4 text outbox, not
  introduced here): a pending note only lives in the React Query cache, not the notes list itself,
  so it vanishes from view across a reload even though nothing is actually lost. Filed under the
  **Sync status UI** task (merge the outbox queue into the notes list on load), not this one.
  **Deferred:** native (iOS/Android) capture verified by code review + unit tests only, not live (no
  device/simulator/mic access in this pass); resuming interrupted transcription wasn't a separate
  concern to add — a queued voice note uploads whole once reconnected and transcribes exactly like
  any other upload.
- **2026-07-17** — **Pending-changes reload-persistence fixed.** `useTripNotesQuery`
  (`app/src/queries/notes.ts`) now derives its result by overlaying the outbox's queued ops (via
  `useOutbox`) onto the fetched notes list on every render, instead of each write mutation
  patching the React Query cache by hand in `onSuccess`. Deleted all four `patchNotesCache` calls
  — the overlay supersedes them and additionally covers the cold-start-fully-offline case (queued
  captures show even when the initial fetch itself fails, not just after a live mutation). **Tests:
  app 110/110** (+4 `queries/notes.test.ts`), `tsc` clean. **Re-verified live**: the exact repro
  from the prior entry (reload the page while a photo upload is still blocked) now shows the
  pending entry immediately after reload instead of it vanishing until the flush completes; still
  syncs to a permanent entry with no duplicate once reconnected. Still open on **Sync status UI**:
  an explicit offline indicator/banner, a "N pending" summary (the count is already available via
  `useOutbox().pendingCount`), per-file media upload progress, and a manual retry action.
- **2026-07-17** — **Sync status UI complete.** The outbox now tracks a `blocked` flag (true once a
  flush attempt actually stops on a network failure with work still queued, cleared on the next
  flush that drains or finds nothing queued), bundled with `ops` into one reactive snapshot so a
  `blocked`-only change still triggers a re-render. `useSyncStatus()` exposes
  `{ pendingCount, blocked, retryNow }` — `retryNow` shares the exact flush logic the automatic
  triggers use. `SyncStatusBar.tsx` (mounted in the Journal panel) shows nothing when the queue is
  empty, a soft "⏳ N pending" once something's queued, and "🔌 Offline — N pending [Retry]" once a
  flush has actually failed. Separately, `postMultipart` moved from `fetch` to `XMLHttpRequest` —
  `fetch` has no upload-progress event in any target environment — so voice/photo uploads now show
  "Uploading… NN%" via a threaded `onProgress` callback. **Tests: app 123/123** (+13 across
  `outbox.test.ts`, `useOutboxSync.test.ts`, `SyncStatusBar.test.tsx`, `api.multipart.test.ts`),
  `tsc` clean. **Re-verified live**: a normal online photo upload still completes via the new
  XHR path; offline capture shows the soft pending bar; pressing Retry while still blocked flips it
  to the red offline state; pressing Retry again once unblocked syncs and clears the bar, no
  duplicate. This closes out the Sync status UI task in full.
- **Next:** conflict handling hardening (Phase 7 shipped last-write-wins + presence;
  operational-merge/CRDT is a documented backlog item), then the offline data layer (local SQLite
  as UI source of truth) — see the Scope/tasks checklist above.
