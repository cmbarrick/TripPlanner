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
- [x] **Conflict handling:** harden for single + multi-user (builds on Phase 7 merge strategy);
      soft-delete via `deleted_at`.
      *(Soft-delete was already in place for every core editable entity — `Trip`, `Day`,
      `ItineraryItem`, `PackingItem`, `Note` all had `DeletedAt` since earlier phases; nothing to
      add there. The real gap was concurrency: writes were pure last-write-wins with **zero
      detection** — two concurrent edits to the same trip/item/note silently overwrote each other,
      no error, no merge (confirmed by research: no `RowVersion`/`xmin`/ETag anywhere, no
      `DbUpdateConcurrencyException` handling). Hardening here means detecting and failing loud
      instead of silently losing data — not a CRDT rewrite; `docs/architecture.md` already commits
      to last-write-wins as the deliberate v1 strategy, and a full per-field merge/CRDT system stays
      a documented future item, gated on the current low-conflict usage pattern actually demanding
      it.)*
      `Trip`, `ItineraryItem`, and `Note` each gained a `Version` property mapped onto Postgres's
      `xmin` system column (`WanderDbContext.MapXminConcurrencyToken` — every row already has one,
      auto-incremented by Postgres on every `UPDATE`, so this needs no new column, no backfill, and
      the generated migration (`AddConcurrencyTokens`) is a deliberate no-op — see its header
      comment and https://www.npgsql.org/efcore/modeling/concurrency.html). The client round-trips
      whatever `version` it last read; `EfCoreTripRepository.Update`/`UpdateItem` and
      `EfCoreNoteRepository.UpdateBody` set that value as the tracked entity's concurrency-check
      *original* value before saving, so a stale write throws
      `DbUpdateConcurrencyException` → caught and re-thrown as `ConcurrencyConflictException` →
      mapped to `409 Conflict` with a clear message in `TripsController`/`NotesController`. Client:
      `Trip`/`ItineraryItem`/`Note` gained a `version` field; `TripFormScreen`/`AddActivityScreen`'s
      submit handlers (in `App.tsx`) inject the currently-edited entity's version into the outgoing
      request; a new `isConflictError` helper (`api.ts`) detects the 409; the three update mutations
      (`useUpdateTripMutation`, `useUpdateItemMutation`, `useUpdateNoteMutation`) refetch on conflict
      so the UI reflects the winning write, and the existing `serverError` surfacing already showed
      the server's message with no further wiring needed. `NoteCard`'s inline editor specifically
      now stays open with the user's draft intact on a conflict (previously it closed unconditionally
      right after calling `onEdit`, before any server response) — an observed
      saving-then-not-saving transition (via a ref, not a same-tick flag) decides whether to close,
      so it's robust regardless of how fast the mutation resolves.
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
  - [x] **In-app account deletion** implemented (required by both stores). See 2026-07-19 progress log entry.
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
- [x] **Unit (concurrency conflicts):** `EfCoreTripRepositoryTests.cs` — a stale `ItineraryItem`/
      `Trip` version throws `ConcurrencyConflictException` and the losing write never lands; the
      current version always succeeds. (The in-memory EF Core provider doesn't auto-bump a custom
      `xid`-typed concurrency token the way Postgres's real MVCC does, so these tests bump it
      explicitly to stand in for "someone else's write landed first" — the comparison-and-throw
      logic under test is the same generic `SaveChanges` machinery either way.) `NotesControllerTests.cs`
      — a stale note edit returns `409 Conflict` and the body text is unchanged. `NoteCard.test.tsx`
      — the editor closes on an observed save-then-succeed transition, and stays open with the
      draft intact + the error visible on a conflict.
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
      device/simulator or mic access in this pass). **Conflict handling:** hand-verified with real
      concurrent writes against a running dev API + local Postgres (not simulated) — curl'd a
      second, concurrent update to an item/trip/note the browser had already loaded, bumping its
      real `xmin` server-side, then submitted the browser's edit still holding the old version:
      each of the three endpoints correctly returned `409` with
      `"This was changed by someone else since you last loaded it."`, the losing write never
      persisted (confirmed via a fresh GET), and the item edit form showed the exact message while
      keeping the user's in-progress edit ("Edited from the browser (stale)") visible in the field
      rather than closing or discarding it.
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
- **2026-07-17** — **Conflict handling: optimistic concurrency shipped.** Research first
  (subagent-driven code audit): the backend was pure last-write-wins with **zero** conflict
  detection anywhere — no `RowVersion`/`xmin`/ETag, no `DbUpdateConcurrencyException` handling — so
  two concurrent edits to the same trip/item/note silently overwrote each other. Soft-delete
  (`DeletedAt`) was already in place for every core entity, so that half of the original task
  description was already done. Scoped this to detection + fail-loud (matching
  `docs/architecture.md`'s existing "last-write-wins v1, revisit with CRDTs only if needed"
  decision), not a merge/CRDT rewrite. `Trip`/`ItineraryItem`/`Note` gained a `Version` property
  mapped onto Postgres's `xmin` system column (`WanderDbContext.MapXminConcurrencyToken` — no new
  column, no backfill; the generated `AddConcurrencyTokens` migration is a deliberate no-op, since
  `xmin` already exists on every table and EF Core's migration diff can't know that). A stale write
  now throws `ConcurrencyConflictException` → `409 Conflict` with a clear message, on all three
  repositories/controllers. Client: `version` round-trips through `Trip`/`ItineraryItem`/`Note` and
  the update mutations; a new `isConflictError` helper detects the 409 and refetches; `NoteCard`'s
  inline editor now stays open with the draft intact on a conflict instead of closing
  unconditionally right after calling `onEdit` (the pre-existing behavior, which meant a failed
  note edit — including a plain network failure, not just a conflict — just silently vanished from
  the UI with no way to retry).
  **Tests: backend 236/236** (+5 across `EfCoreTripRepositoryTests.cs`/`NotesControllerTests.cs` —
  written against the in-memory EF Core provider, which doesn't auto-bump a custom `xid`-typed
  token the way Postgres does, so these explicitly simulate a concurrent write rather than relying
  on that), **app 125/125** (+2 `NoteCard.test.tsx`), `tsc` clean.
  **Hand-verified live with genuinely concurrent writes** (not simulated) against a running dev API
  + local Postgres: curl'd a second update to an item/trip/note the browser already had loaded
  (confirmed real non-zero `xmin` values, e.g. 930 → 1057 after one write), bumping it server-side,
  then submitted the browser's stale edit — all three endpoints correctly 409'd with the exact
  message, the losing write never persisted (confirmed via a fresh GET), and the item edit form
  showed the message while keeping "Edited from the browser (stale)" visible in the title field.
  **Deferred:** the `ReorderDayItems` bulk endpoint still blind-overwrites `SortOrder` (a version
  per item would complicate a multi-row reorder significantly — single-record field edits were the
  primary silent-data-loss risk this targeted); a delete-while-someone-else-is-mid-edit race still
  returns a plain 404 rather than a distinguishable "this was deleted" case; broader
  retry/backoff logic and an integration test running against real Postgres (not just EF Core
  in-memory) are still open.
- **2026-07-19** — **In-app account deletion.** `DELETE /api/users/me` (new `UsersController`,
  new `IAccountDeletionService`) soft-deletes everything the caller owns — Trips (+ Days/Items/
  PackingItems), Notes (+ MediaAssets, which gained a `DeletedAt` column — small migration,
  `AddMediaAssetDeletedAt`), Recaps, PublicRecaps, Reactions, TripShares — plus every
  `TripMember` row referencing the caller (both trips they created and their membership on
  others' trips), `Preference`, and `ConsentSetting`. The `User` row itself is anonymized
  (`OwnerId`/`SubjectId`/`Email` replaced with random values) rather than hard-deleted, since
  those three columns are unique-indexed — leaving the original values would permanently block
  the same real-world identity (Apple/Entra subject) from signing up again later.
  **Deliberately out of scope**, documented in the service's class remarks: `AiTokenUsage`
  (aggregate quota counters, no content) and `PublicRecapReport` (moderation reports the user
  filed against *others'* content — deleting them would erase the moderation trail). Media bytes
  in blob storage aren't deleted, only the DB row tracking them — `IBlobStore` has no delete
  method yet; a follow-up can wire that once it's worth the storage cost.
  **Bug caught by hand-testing, not unit tests**: the first version required a `Users` row to
  exist before deleting anything, and returned `404`/no-op otherwise. But `Users` rows are
  created lazily (first touch of preferences/consent/sharing) — an account that has only ever
  created a trip owns real data with no `Users` row at all. Live curl testing (create a trip
  under a fresh dev identity → delete → list trips) caught this immediately: the trip was still
  there after a "successful" 404. Fixed to sweep every owned table regardless of whether a
  `Users` row exists, and to report success if *either* a `Users` row or any owned data was
  found. Added a regression test for exactly this shape. Client: `ProfileScreen` gained a
  "Danger zone" section (only shown when signed in via a real Entra session, not dev-bypass/
  guest) with the same two-step inline confirm pattern as trip deletion; confirming calls the
  new `deleteAccount()` API function, clears the entire React Query cache, then signs out.
  **Tests: backend 255/255** (+8 `AccountDeletionTests`, +2 `ViatorActivityProviderTests` from
  the prior entry), **app 129/129** (+4 `ProfileScreen.test.tsx`), `tsc` clean.
  **Hand-verified live** against a running dev API: created a trip under a fresh identity →
  deleted → trip list empty → repeat delete correctly 404s → same identity string can sign up
  fresh again (new `Users`/`Preference` row, not blocked by the anonymized old one); also
  verified against the identity from the bug repro itself (which had accumulated two trips
  across both test runs) — both cleaned up correctly by the fixed version.
- **Next:** the offline data layer (local SQLite as UI source of truth), performance & accessibility
  passes, onboarding, store assets, and final security/privacy review — see the Scope/tasks
  checklist above.
