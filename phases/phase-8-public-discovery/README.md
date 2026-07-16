# Phase 8 — Public Recaps & Discovery ✅ Complete (dev)

> Goal: A searchable, AI-powered travel knowledge layer built from **consented** public recaps.
> Est: ~4–5 weeks · Depends on: Phase 6 (recaps), Phase 7 (sharing), privacy workstream

## Objectives
- Let users **publish** recaps publicly (explicit opt-in), **only after the trip has ended**, safely moderated.
- Make public recaps **searchable** by place/activity/season/budget.
- Provide a **RAG discovery assistant** that answers location questions with citations and surfaces
  clonable itineraries.

## Rule — public sharing is post-trip only
- **A recap cannot be published publicly until after the trip's end date** (the trip is over).
  This protects travelers' safety (no broadcasting "I'm away from home / here right now") and keeps
  public content reflective rather than live.
- Enforced **server-side** (not just hidden in the UI): the publish endpoint rejects publishing when
  `today < trip.end_date`. The publish control is disabled with an explanatory message until then.
- **Private** sharing & co-editing with friends (Phase 7) remain available **before/during** the trip;
  this restriction applies **only to public publishing**.

## Scope / tasks
- [x] **Post-trip gate:** block public publishing until after `trip.end_date` (server-enforced).
      *(UI lock/explanatory message is a client slice, not yet built.)*
- [~] **Publish flow:** per-recap opt-in ✅; discovery facets (places/tags/season/budget) ✅;
      unpublish anytime ✅; **PII detection + redaction review** ✅ (emails/phone numbers block
      publish until reviewed/acknowledged). Location coarsening and PII types needing NLP
      (names/addresses/faces) still open.
- [x] **Moderation:** content-safety review gate is wired (`IContentModerationService`) and blocks a
      rejected recap from publishing; **real Azure AI Content Safety** is used when configured
      (`Moderation:Endpoint`/`Moderation:ApiKey`), the fake reviewer otherwise (dev/CI default).
      **User reporting** (`POST /api/moderation/reports`) pulls a recap back to `Pending`
      immediately; a config-admin-gated **review queue** approves/rejects it.
- [x] **Search:** keyword + **semantic** (embeddings) over approved `PublicRecap`s, with
      place/tag/season/budget filters. `GET /api/discovery/search` (anonymous).
- [x] **RAG assistant:** question → retrieve from `ISearchService`/embedding index → Azure OpenAI
      answers **with citations**; surfaces the cited recaps' trip/places (a "clonable itinerary"
      pointer, not a clone *action* — that's client work); refuses (`hasAnswer: false`) rather than
      hallucinating when nothing actually answers. `POST /api/discovery/ask` (authed).
- [x] **Vector store:** stored as a plain `float[]` column (`embedding_chunks.Vector`) rather than
      the native pgvector `vector` type — similarity is computed client-side, so no Postgres
      extension is required and the same code runs identically against tests and prod. Indexing
      runs synchronously on the publish/approve path (not yet a separate async job).
- [x] **Consent lifecycle:** revoking `ConsentSetting.PublishEnabled` unpublishes every public recap
      the owner holds immediately. Deleting a recap still needs an explicit cascade check (open).

## Out of scope
- **Fine-tuning** a custom model (later; needs separate training consent + scrubbed corpus).
- Monetization (v2).

## Testing plan
- [x] **Post-trip gate:** publishing is **rejected server-side before `trip.end_date`** and allowed
      after (`PublicRecapTests.cs`). UI reflecting the locked/unlocked state is a client slice.
- [x] **Consent gate + moderation:** publish blocked (403) without `PublishEnabled`; a flagged recap
      is recorded as `Rejected` rather than silently dropped; re-publish revives instead of duplicating.
- [x] **Consent lifecycle:** disabling `PublishEnabled` unpublishes every public recap immediately.
- [x] **Reporting → queue → takedown:** a report flips the recap to `Pending` immediately; the
      admin-gated queue lists it (with open-report count); approve/reject resolves the report(s)
      (`ModerationTests.cs`). Exercised against the **fake** reviewer's deterministic marker — no
      corpus test against the real Azure Content Safety call yet (no test double for the SDK client).
- [x] **PII gate:** publish is blocked (422 + findings) when email/phone PII is detected in the
      title+body, and succeeds once acknowledged or the PII is edited out (`PublicRecapTests.cs`,
      `PiiDetectionTests.cs`).
- [x] **AI evals:** groundedness (citations map only to recaps actually retrieved+shown, invented
      labels dropped), refusal-when-no-source (`hasAnswer:false` → `NoSource`, and a relevance-floor
      pre-filter keeps weakly-related retrieval from being fed to the model at all) — exercised
      against the fake AI provider/embeddings; no golden eval corpus against a real model yet (same
      posture as Phases 5–6).
- [x] **Privacy:** unpublish/reject/report-pending, and now recap-delete, all remove the recap's
      chunk from the search index immediately (`SearchTests.cs`, `PublicRecapTests.cs`).
- [x] **Integration:** publish → index → searchable; facet filters return only matching results;
      semantic query ranks the more topically similar recap first, with a keyword fallback for any
      approved-but-unindexed recap (`SearchTests.cs`; hand-verified live against real Postgres).
- [x] **Regression:** Phases 0–7 suites green (single shared test projects — backend 231/231,
      app 97/97, Functions 3/3 — cover every phase, not just Phase 8's additions).

## Exit criteria
- [x] **Public publishing is impossible until after the trip ends** (enforced by the API, not just UI;
      the client also shows the lock explanation until then).
- [x] Publish/unpublish with consent; moderation blocks unsafe content (real Azure AI Content Safety
      when configured, fake reviewer otherwise) and takes reports through to takedown.
- [x] Search returns relevant public recaps (facets + semantic ranking); discovery Q&A is **grounded
      in and cites** public recaps, refusing rather than hallucinating when nothing matches.

## Artifacts
- Mockups: to be added (publish/consent screen, discovery search, RAG answer with citations).

---

## Implementation plan (slices)

Sequenced the same way Phase 7 was: ship the safety-critical gate first (post-trip + consent), keep
moderation behind a swappable seam like every other external provider in this codebase
(`IWeatherProvider`, `IPlaceProvider`, `IAiProvider`), and defer search/RAG until publishable content
actually exists to index.

### Slice 0 — Publish gate + data model  ✅
- [x] `PublicRecap` entity (`Models/PublicRecap.cs`) — separate table from `Recap` so publish
      metadata (moderation, discovery facets) stays decoupled from the private editable draft.
      `AddPublicRecaps` migration; unique index on `RecapId` (revive-on-republish, not duplicate).
- [x] `IContentModerationService`/`FakeContentModerationService` (`Data/IContentModerationService.cs`)
      — the moderation seam. Deterministic fake approves everything except a fixed test marker, so
      the rejection path is exercisable without a real Azure AI Content Safety call.
- [x] `IPublicRecapService`/`PublicRecapService` (`Data/IPublicRecapService.cs`): `PublishAsync` checks
      **post-trip** (`today >= trip.EndDate`) then **consent** (`ConsentSetting.PublishEnabled`) before
      running moderation; `Unpublish` soft-deletes; `GetStatus` is the owner's view.
- [x] `RecapsController`: `POST/GET/POST {recapId}/publish`, `POST {recapId}/unpublish` — same
      sub-resource pattern as the existing `/share`/`/finalize` actions.
- [x] **Consent lifecycle:** `ConsentService.UpdateAsync` cascades an immediate unpublish (soft-delete
      every `PublicRecap` the owner holds) on a `PublishEnabled: true → false` transition — same
      pattern as Phase 7's share-revocation cascade.
- [x] Tests: gate ordering (trip-not-ended vs. not-consented), moderation reject, republish revives,
      unpublish, consent cascade, controller-level enforcement (`Wander.Api.Tests/PublicRecapTests.cs`).
- [ ] Client UI (publish button + lock state, unpublish) — deferred to a client slice.

### Slice 1 — Real moderation + reporting + PII gate  ✅
- [x] `AzureContentModerationService` (`Data/AzureContentModerationService.cs`) implements
      `IContentModerationService` against the real `Azure.AI.ContentSafety` SDK — analyzes
      title+body across all four harm categories, rejects at severity ≥ 4 ("Medium"+). Selected in
      `Program.cs` when `Moderation:Endpoint`/`Moderation:ApiKey` are configured, same
      config-presence convention as the Weather/Places/AI provider selection; the fake reviewer is
      the dev/CI default. Not unit-tested directly — no real Azure adapter in this codebase is
      (`AzureOpenAiProvider`, `AzureBlobStore`, `MapboxPlaceProvider` aren't either); only the fake
      counterpart and its consumers are exercised.
- [x] `PublicRecapReport` entity + `AddPublicRecapReports` migration; `IModerationQueueService`/
      `ModerationQueueService` (`Data/IModerationQueueService.cs`): `ReportAsync` files a report and
      immediately flips the recap back to `Pending` (out of discovery pending re-review — a report
      has teeth without waiting for a queue sweep); `GetQueueAsync` lists pending-or-reported recaps
      with their open-report count; `ApproveAsync`/`RejectAsync` resolve the recap and every open
      report on it.
- [x] `ModerationController` (`api/moderation`): `POST reports` is open to any authenticated user;
      `GET queue` + `POST queue/{id}/approve|reject` are gated by a config admin allowlist
      (`Moderation:AdminOwnerIds`) — there's no broader RBAC system yet, so this is the minimal gate
      until one exists.
- [x] Tests: report pulls Approved back to Pending, queue includes pending/reported and excludes
      untouched-approved, approve/reject resolve reports, controller admin-gate 403 vs. 204
      (`Wander.Api.Tests/ModerationTests.cs`).
- [x] `IPiiDetectionService`/`RegexPiiDetectionService` (`Data/IPiiDetectionService.cs`): real
      (not fake) regex detection of emails + phone numbers — the two PII categories reliably
      pattern-matchable without an NLP model. `PublicRecapService.PublishAsync` runs this **after**
      consent, **before** moderation: findings block the publish (`PublishStatus.PiiReviewRequired`,
      surfaced as `422` with the findings list) unless `PublishRequest.AcknowledgePii` is set. Names/
      addresses/faces need a real entity-recognition provider (e.g. Azure AI Language) and are
      out of scope until that seam is added.
- [x] Tests: email/phone detection + multi-match + clean-text/empty-input, publish blocked with
      findings, `AcknowledgePii: true` publishes, controller 422 (`PiiDetectionTests.cs`,
      `PublicRecapTests.cs`).

### Slice 2 — Search  ✅
- [x] `EmbeddingChunk` entity (`Models/EmbeddingChunk.cs`) + `AddEmbeddingChunks` migration — one
      chunk per published recap (title+body), `Vector` stored as a plain `float[]` (Postgres
      `real[]`) rather than the native pgvector `vector` type. **Departure from the architecture
      doc's "pgvector" note:** similarity is computed **client-side** (cosine similarity in C#, see
      `SearchService.CosineSimilarity`) instead of pushed into SQL — this avoids a Postgres
      extension dependency (unverified as enabled on the dev server) and, more importantly, makes
      the exact same code path run identically against the EF Core in-memory provider in tests and
      real Postgres in prod. Fine at today's corpus size; swapping in a native `vector` column +
      ANN index (ivfflat/hnsw) is a future optimization once scale justifies it — the interface
      (`ISearchService`) wouldn't need to change.
- [x] `IEmbeddingProvider`/`FakeEmbeddingProvider` (`Data/IEmbeddingProvider.cs`): deterministic
      bag-of-words hashing embedding (dev/CI default) — texts sharing vocabulary land closer
      together under cosine similarity, so ranking logic is fully testable without a model call.
      `AzureOpenAiEmbeddingProvider` calls the real Azure OpenAI embeddings API (same resource as
      chat/recap generation, `Ai:EmbeddingDeployment`), selected via the same config-presence
      convention as every other provider seam in this app.
- [x] `ISearchIndexService`/`SearchIndexService` (`Data/ISearchIndexService.cs`): `IndexAsync`
      (re)embeds and upserts a chunk; `RemoveAsync` deletes it. Wired synchronously into
      `PublicRecapService.PublishAsync` (index on Approved, remove on Rejected/PII-blocked),
      `UnpublishAsync` (remove), and `ModerationQueueService` (index on approve, remove on
      reject/report). A true async indexing job (matching the transcription/recap Function pattern)
      is a future move once embedding latency or corpus size makes the inline call worth it.
- [x] `ISearchService`/`SearchService` (`Data/ISearchService.cs`) + `DiscoveryController`
      (`GET /api/discovery/search`, anonymous): facet filters (place/tag/season/budget, exact
      case-insensitive match) always apply; free-text `q` ranks by cosine similarity, falling back
      to a keyword contains-match for any approved recap that isn't indexed yet (shouldn't normally
      happen).
- [x] Tests: index create/update-in-place/remove, fake-embedding similar-text-scores-higher, facet
      filtering (each facet + combined), approved-only visibility, semantic ranking order + keyword
      fallback, take clamping (`Wander.Api.Tests/SearchTests.cs`).

### Slice 3 — RAG discovery assistant  ✅
- [x] `Discovery/` module (new, mirrors `Recaps/`): `DiscoveryPromptBuilder` (system rules +
      r1..rN-labeled excerpts, same citation-by-label convention as `RecapPromptBuilder`),
      `DiscoverySchema` (`hasAnswer`/`answer`/`sourceLabels` strict JSON), `DiscoveryValidator`
      (parses, maps labels back to real retrieved recaps, drops invented labels, `hasAnswer:false`
      → `NoSource` regardless of any `answer` text the model still emitted).
- [x] `IDiscoveryAssistantService`/`DiscoveryAssistantService` (`Discovery/IDiscoveryAssistantService.cs`):
      retrieves via `ISearchService.SearchAsync(Text: question)`, applies a **relevance floor**
      (`MinRelevance = 0.15`) so a semantically-weak match isn't fed to the model as if it were a
      real source (a keyword-fallback match — `Relevance == null` — always counts, since it's a
      literal hit), then asks the model for a grounded answer over the shared daily AI token quota
      (same posture as chat/recap generation). Empty retrieval short-circuits to `NoSource` without
      spending a model call.
- [x] `DiscoveryController.Ask` (`POST /api/discovery/ask`, **authed** — unlike the anonymous
      `/search`, asking the assistant spends the caller's quota) returns `hasAnswer:false` as a
      normal `200`, not an error; `503`/`429`/`400` map the same exceptions `RecapsController`
      already handles.
- [x] `FakeAiProvider` gained a `"discovery"` deployment-kind branch (canned `hasAnswer:true`
      response citing `r1`, which always exists when the model is called since empty retrieval never
      reaches it); `AzureOpenAiProvider.ResolveDeployment` routes `"discovery"` to the cheaper draft
      deployment, same reasoning as recaps (structured, high-frequency, first-draft-quality is fine).
- [x] Citations surface the cited recap's `tripId`/`places` — a pointer for a future "clone this
      itinerary" client action, not the clone action itself (out of scope here, per the objective's
      "surfaces relevant itineraries to clone").
- [x] Tests: prompt formatting, `hasAnswer:false` → `NoSource`, invented-label dropping, malformed
      JSON, empty retrieval skips the model call, quota-exhausted throws, AI-disabled throws,
      relevance floor (deterministic via a stub `ISearchService` since the fake embedding's actual
      hash output isn't reliably controllable per-test), controller 200/503
      (`Wander.Api.Tests/DiscoveryTests.cs`).

### Slice 4 — Consent/lifecycle hardening + client UI  ✅
- [x] Deleting a recap cascades to unpublish (`RecapsController.Delete` now calls
      `IPublicRecapService.UnpublishAsync` after a successful delete — same soft-delete +
      de-index path as an explicit unpublish; a no-op if the recap was never published).
- [x] Client: `PublishRecapSheet.tsx` (owner-only, opened from a recap card) shows the post-trip
      lock explanation before the trip ends, a places/tags/season/budget facets form, the PII
      review-and-acknowledge step on a `422`, the live moderation status once published, and
      unpublish. A new **Discover** tab (`DiscoverScreen.tsx`) holds facet + free-text search
      (anonymous) with a per-result **Report** action, and an **Ask AI** panel for the grounded RAG
      Q&A with citations. `ModerationQueueScreen.tsx` (reachable from Profile) lists pending/reported
      recaps with approve/reject — the server's admin allowlist is the real gate; the screen just
      shows "no access" on a `403`. New `queries/discovery.ts` react-query hooks back all of it.

## Progress log
- **2026-07-14** — **Slice 0 complete (backend).** `PublicRecap` + `AddPublicRecaps` migration;
  `IPublicRecapService` enforces the post-trip gate before the consent gate before moderation;
  `IContentModerationService`/`FakeContentModerationService` is the swappable moderation seam;
  `RecapsController` gets publish/unpublish/status sub-actions; `ConsentService` now cascades an
  immediate unpublish on `PublishEnabled` revocation. **Tests: backend 190/190** (+10
  `PublicRecapTests.cs`); hand-verified the full publish → status → unpublish round trip (incl. both
  gate rejections) against a running dev API over real Postgres. Deferred: real Azure AI Content
  Safety, PII redaction, search, RAG, client UI, recap-delete → unpublish cascade.
- **2026-07-14** — **Slice 1 complete (backend; PII redaction still open).** Added
  `AzureContentModerationService` — a real `Azure.AI.ContentSafety` implementation of
  `IContentModerationService`, selected in `Program.cs` when `Moderation:Endpoint`/`ApiKey` are
  configured (fake reviewer remains the dev/CI default). Added `PublicRecapReport` +
  `AddPublicRecapReports` migration and `IModerationQueueService`/`ModerationQueueService`: reporting
  pulls a recap back to `Pending` immediately, and a config-admin-gated queue
  (`Moderation:AdminOwnerIds`) approves/rejects. New `ModerationController`
  (`api/moderation/reports`, `api/moderation/queue`). **Tests: backend 198/198** (+8
  `ModerationTests.cs`); hand-verified report → queue (403 for non-admin, 200 for admin) → approve
  against a running dev API over real Postgres. Deferred: real Azure Content Safety isn't unit-tested
  (no SDK client test double, consistent with every other real cloud adapter in this codebase), PII
  detection/redaction, search, RAG, client UI.
- **2026-07-14** — **Slice 1's PII gate complete (backend).** `RegexPiiDetectionService` detects
  emails/phone numbers in the title+body; `PublicRecapService.PublishAsync` now runs this check after
  consent and before moderation, returning `PiiReviewRequired` (client sees `422` + the findings list)
  unless the caller sets `AcknowledgePii: true`. This closes out Slice 1's last open item — names/
  addresses/faces still need a real NLP provider and stay out of scope. **Tests: backend 206/206**
  (+5 `PiiDetectionTests.cs`, +3 in `PublicRecapTests.cs`); hand-verified against a running dev API:
  publish with an email in the body → `422` with the finding → `AcknowledgePii: true` → `200 Approved`.
- **2026-07-14** — **Slice 2 complete (backend).** `EmbeddingChunk` + `AddEmbeddingChunks` migration;
  `IEmbeddingProvider`/`FakeEmbeddingProvider` (deterministic bag-of-words hashing) and
  `AzureOpenAiEmbeddingProvider` (real embeddings, same Azure OpenAI resource, config-selected).
  `ISearchIndexService` keeps chunks in sync with discoverability, wired into publish/unpublish/
  approve/reject/report. `ISearchService` + `GET /api/discovery/search` (anonymous): facet filters
  always apply, free-text ranks by **client-side cosine similarity** rather than a native pgvector
  column/SQL translation — a deliberate simplification over the architecture doc's "pgvector" note
  (see Slice 2 above for the reasoning); the `ISearchService` interface can absorb a native-column
  swap later without callers changing. `IPublicRecapService.Unpublish` became `UnpublishAsync` so it
  can await index removal. **Tests: backend 215/215**
  (+9 `SearchTests.cs`); hand-verified against a running dev API over real Postgres: publish a recap
  about skiing/alps → no-filter search finds it → place/season facet filters work (incl. empty
  results for a non-matching season) → semantic query ("snow mountains skiing") ranks it with a real
  relevance score → unpublish → search returns empty.
- **2026-07-14** — **Slice 3 complete (backend).** New `Discovery/` module (prompt builder, JSON
  schema, validator — mirrors `Recaps/`); `DiscoveryAssistantService` retrieves via `ISearchService`,
  applies a `MinRelevance = 0.15` floor before ever calling the model, then asks for a grounded,
  cited answer over the shared AI token quota. `POST /api/discovery/ask` (authed, unlike the
  anonymous `/search`) returns `hasAnswer:false` as a normal `200` rather than an error when nothing
  actually answers the question. `FakeAiProvider` gained a `"discovery"` branch;
  `AzureOpenAiProvider` routes discovery Q&A to the cheaper draft deployment. **Tests: backend
  229/229** (+14 `DiscoveryTests.cs`); hand-verified against a running dev API: a relevant question
  ("What is skiing like in the Alps?") returned a cited answer; confirmed the relevance floor via a
  deterministic unit test (the fake embedding's 64-dim hash occasionally collides on real text, so a
  live curl check with only one recap in the corpus isn't a reliable signal either way — same
  caveat as every other fake-provider check in this phase). Phase 8's three core objectives
  (post-trip-gated publish, moderated + PII-reviewed content, searchable + RAG-queryable) are now
  all backend-complete.
- **2026-07-16** — **Slice 4's cascade item complete.** `RecapsController.Delete` now calls
  `IPublicRecapService.UnpublishAsync` after a successful delete, closing the last gap carried over
  from Slices 0/1 (deleting a published recap left it discoverable). **Tests: backend 231/231**
  (+2 `PublicRecapTests.cs`).
- **2026-07-16** — **Slice 4 complete — Phase 8 closed.** Client UI shipped: `PublishRecapSheet.tsx`
  (post-trip lock, facets form, PII review-and-acknowledge, moderation status, unpublish), a new
  **Discover** tab (`DiscoverScreen.tsx`: facet + free-text search with a per-result report action,
  plus an Ask AI panel for the RAG Q&A with citations), and `ModerationQueueScreen.tsx` (reachable
  from Profile; server's admin allowlist is the real gate, screen just shows "no access" on `403`).
  **Tests: backend 231/231, app 97/97** (+4 `DiscoverScreen.test.tsx`), `tsc` clean. All three of
  Phase 8's exit criteria are met.
