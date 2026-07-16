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
      upload; there's no separate resume path to add. Known gap (shared with the Phase 4 text
      outbox, not new here): a still-queued note disappears from the list across a page reload,
      since the optimistic entry lives only in the React Query cache, not the notes list itself —
      the op and cached bytes both survive and still sync correctly once reconnected, but the UI
      doesn't show it as pending in the meantime. That's the **Sync status UI** item below, not this
      one — pending ops aren't merged into the notes list on load yet.
- [ ] **Conflict handling:** harden for single + multi-user (builds on Phase 7 merge strategy);
      soft-delete via `deleted_at`.
- [ ] **Sync status UI:** offline indicator, "pending changes", media upload progress, retry.
      *(Includes merging the outbox queue into the notes list on load, so a pending note — text,
      voice, or photo — still shows as pending after a page reload instead of only reappearing once
      the flush completes; see the media outbox note above.)*
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
- [ ] **Integration:** mutate offline (incl. voice note) → reconnect → server reflects changes + media.
- [x] **E2E (offline, web, manual/Playwright):** hand-verified against a running dev API + local
      Postgres — blocked the photo-upload endpoint to simulate a real offline fetch rejection
      (`context.setOffline` hangs requests rather than rejecting them, so it doesn't exercise the
      catch path — request interception does), picked a photo → optimistic "📷 Photo added ⏳ Saved
      offline — will sync" entry appeared immediately → unblocked + fired `online` → outbox flushed,
      uploaded, and the entry became permanent with no duplicate. Reload-while-still-blocked: the
      queued op and cached bytes survived (localStorage + IndexedDB) and still flushed successfully
      once unblocked, confirming no data loss — though the pending entry itself doesn't reappear in
      the list after a reload until the flush completes (see the Sync status UI gap above). Native
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
- **Next:** Sync status UI (offline indicator, pending-changes list including reload-persistence,
  upload progress, retry), then conflict handling hardening and the offline data layer (local SQLite
  source of truth) — see the Scope/tasks checklist above.
