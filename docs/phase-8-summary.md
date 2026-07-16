# Phase 8 Summary — Public Recaps & Discovery

Date: 2026-07-14 (backend), closed 2026-07-16 (Slice 4 + client UI)
Status: **✅ Complete on dev (web).** All 5 slices shipped: the safety-critical post-trip publish
gate, a consent gate, real Azure AI Content Safety moderation (behind a fake-by-default seam), user
reporting through to an admin review queue, a PII detection gate (emails/phone numbers), search
(facet filters + semantic ranking), a grounded RAG discovery assistant with citations, the
recap-delete → unpublish cascade, and full client UI (publish sheet, a Discover tab for search + RAG
Q&A, and an admin moderation queue screen).

---

## Outcome

Phase 8 turns a private recap (Phase 6) into public, discoverable content — but only on the owner's
explicit terms. The **post-trip rule** is the phase's one hard safety constraint: a recap cannot be
published while `today < trip.EndDate`, enforced server-side in `IPublicRecapService.PublishAsync`
before anything else runs, so the app never broadcasts "I'm away from home / here right now." Layered
on top of that is the same **explicit opt-in** consent model Phase 7 established for sharing:
`ConsentSetting.PublishEnabled` (unused until now) gates every publish call, and disabling it
**unpublishes every public recap the owner holds immediately** — the same cascade pattern used for
`ShareEnabled` revocation.

Content moderation sits behind `IContentModerationService`, following the codebase's established
provider-seam convention (`IWeatherProvider`, `IPlaceProvider`, `IAiProvider`): `AzureContentModerationService`
calls the real Azure AI Content Safety API when `Moderation:Endpoint`/`Moderation:ApiKey` are
configured; `FakeContentModerationService` (approves everything except a deterministic test marker)
is the dev/CI default, same config-presence pattern used to select every other real cloud provider
in this app. Publish metadata — moderation status/reason and discovery facets (places, tags, season,
budget band) — lives in a new `PublicRecap` table rather than on `Recap` itself, so the private
editable draft and its public listing stay decoupled.

Moderation doesn't stop at publish time: any authenticated user can **report** a published recap
(`POST /api/moderation/reports`), which pulls it back to `Pending` — out of discovery — immediately,
without waiting for a human to notice. A minimal, config-gated **review queue**
(`Moderation:AdminOwnerIds`, since there's no broader RBAC system yet) lists pending-or-reported
recaps and lets an admin approve or reject, which resolves every open report on that recap in the
same action.

Between the consent gate and moderation sits a **PII gate**: `RegexPiiDetectionService` scans the
title+body for emails and phone numbers — the two categories reliably pattern-matchable without an
NLP model — and blocks the publish with a `422` + the findings list until the caller either edits the
recap or explicitly acknowledges (`AcknowledgePii: true`). This is the "present a redaction review to
the user" requirement from the privacy doc; names/addresses/faces need a real entity-recognition
provider and stay out of scope.

Once a recap clears every gate and is `Approved`, it gets **indexed** for search: `ISearchIndexService`
embeds the title+body (`IEmbeddingProvider` — real Azure OpenAI embeddings when configured, a
deterministic fake otherwise) into an `EmbeddingChunk` row, kept in sync on every publish/unpublish/
approve/reject/report. `GET /api/discovery/search` (anonymous) applies facet filters
(place/tag/season/budget) and, when given free text, ranks by cosine similarity against the indexed
chunks — computed **client-side in C#** rather than via a native pgvector column and SQL translation.
That's a deliberate simplification of the architecture doc's "pgvector" note: no Postgres extension
dependency, and the identical retrieval code runs against both the EF Core in-memory provider (tests)
and real Postgres (prod). See `docs/architecture.md` §3 for the full reasoning.

The **RAG discovery assistant** (`POST /api/discovery/ask`, authed) sits on top of the same search:
it retrieves candidate recaps via `ISearchService`, applies a relevance floor so weakly-related
matches aren't fed to the model as if they were real sources, then asks for a grounded answer —
reusing Phase 6's exact grounding discipline (label sources, drop invented citations, refuse rather
than hallucinate). A `hasAnswer:false` response is a normal `200`, not an error: the corpus genuinely
might not have an answer, and the assistant says so instead of guessing.

## Where to use it (UX)

| Surface | What works |
|---|---|
| `POST /api/trips/{id}/recaps/{recapId}/publish` | Publish (post-trip + consent gated, then moderated) |
| `GET /api/trips/{id}/recaps/{recapId}/publish` | Owner's publish status (404 if never published) |
| `POST /api/trips/{id}/recaps/{recapId}/unpublish` | Pull from discovery |
| `GET`/`PUT /api/consent` | `publishEnabled` toggle (Phase 7's endpoint, now load-bearing) |
| `POST /api/moderation/reports` | Any authenticated user: report a published recap |
| `GET /api/moderation/queue` | Admin-only: recaps pending or reported |
| `POST /api/moderation/queue/{id}/approve` \| `/reject` | Admin-only: resolve the recap + its reports |
| `GET /api/discovery/search` | Anonymous: search approved public recaps (facets + free-text) |
| `POST /api/discovery/ask` | Authed: grounded Q&A with citations over public recaps |
| **Discover tab** (`DiscoverScreen.tsx`) | Facet + free-text search over public recaps; per-result **Report** action; **Ask AI** panel for the RAG Q&A with citations |
| **Publish sheet** (`PublishRecapSheet.tsx`, opened from a recap card) | Post-trip lock explanation, facets form, PII review-and-acknowledge, live moderation status, unpublish |
| **Moderation queue** (`ModerationQueueScreen.tsx`, off Profile) | Admin-gated: approve/reject pending or reported recaps (server 403s non-admins) |

## What was completed

### Slice 0 — Publish gate + data model
- `PublicRecap` entity (`Models/PublicRecap.cs`) + `AddPublicRecaps` migration: `ModerationStatus`
  (Pending/Approved/Rejected), discovery facets, unique index on `RecapId` so re-publishing revives
  the existing row instead of duplicating it.
- `IContentModerationService`/`FakeContentModerationService` (`Data/IContentModerationService.cs`) —
  the moderation seam; deterministic reject on a fixed marker string.
- `IPublicRecapService`/`PublicRecapService` (`Data/IPublicRecapService.cs`): `PublishAsync` checks
  **post-trip** (`today >= trip.EndDate`) → **consent** (`PublishEnabled`) → **moderation**, in that
  order, so the cheapest/safety-critical checks fail fast before anything calls out to a moderation
  provider. `Unpublish` soft-deletes; `GetStatus` is the owner's read.
- `RecapsController` gains `publish`/`unpublish` sub-actions (same pattern as the existing
  `share`/`finalize` actions).
- `ConsentService.UpdateAsync` cascades an immediate unpublish (soft-delete every `PublicRecap` the
  owner holds) on a `PublishEnabled: true → false` transition.

### Slice 1 — Real moderation + reporting
- `AzureContentModerationService` (`Data/AzureContentModerationService.cs`): real
  `Azure.AI.ContentSafety` client, analyzes title+body across all four harm categories, rejects at
  severity ≥ 4 ("Medium"+). Selected in `Program.cs` when `Moderation:Endpoint`/`ApiKey` are set;
  the fake reviewer otherwise. Not unit-tested directly (no real Azure adapter in this codebase is).
- `PublicRecapReport` entity + `AddPublicRecapReports` migration; `IModerationQueueService`/
  `ModerationQueueService` (`Data/IModerationQueueService.cs`): `ReportAsync` files a report and
  flips the recap to `Pending` immediately; `GetQueueAsync` lists pending-or-reported recaps with
  their open-report count; `ApproveAsync`/`RejectAsync` resolve the recap and every open report on it.
- `ModerationController` (`api/moderation`): reporting is open to any authenticated user; the queue
  and its actions are gated by a config admin allowlist (`Moderation:AdminOwnerIds`).
- `IPiiDetectionService`/`RegexPiiDetectionService` (`Data/IPiiDetectionService.cs`): a real (not
  fake) regex detector for emails + phone numbers. `PublicRecapService.PublishAsync` runs it after
  the consent gate and before moderation — findings block the publish (`422` + findings) unless
  `AcknowledgePii: true` is set.

### Slice 2 — Search
- `EmbeddingChunk` entity + `AddEmbeddingChunks` migration: one chunk per published recap,
  `Vector` stored as a plain `float[]` (`real[]` under Npgsql) — not the native pgvector type.
- `IEmbeddingProvider`/`FakeEmbeddingProvider` (`Data/IEmbeddingProvider.cs`): deterministic
  bag-of-words hashing embedding (dev/CI default) so ranking is testable without a model call;
  `AzureOpenAiEmbeddingProvider` for real embeddings (same Azure OpenAI resource, config-selected).
- `ISearchIndexService`/`SearchIndexService` (`Data/ISearchIndexService.cs`): keeps chunks in sync,
  wired into publish (index on Approved / remove on Rejected), unpublish (remove), and moderation
  approve/reject/report.
- `ISearchService`/`SearchService` (`Data/ISearchService.cs`) + `DiscoveryController`: facet filters
  always apply (client-side, case-insensitive); free-text ranks by client-side cosine similarity
  against the indexed chunk, with a keyword-match fallback for any un-indexed approved recap.

### Slice 3 — RAG discovery assistant
- New `Discovery/` module mirroring `Recaps/`: `DiscoveryPromptBuilder` (r1..rN-labeled excerpts,
  same citation convention as `RecapPromptBuilder`), `DiscoverySchema`
  (`hasAnswer`/`answer`/`sourceLabels`), `DiscoveryValidator` (maps labels back to real retrieved
  recaps, drops invented ones, `hasAnswer:false` → `NoSource`).
- `IDiscoveryAssistantService`/`DiscoveryAssistantService`: retrieves via
  `ISearchService.SearchAsync(Text: question)`, applies a `MinRelevance = 0.15` floor before ever
  calling the model (empty retrieval short-circuits to `NoSource`, no model call spent), then asks
  over the shared daily AI token quota (same posture as chat/recap generation).
- `DiscoveryController.Ask` (`POST /api/discovery/ask`) — **authed**, unlike the anonymous
  `/search`, since asking spends quota; `hasAnswer:false` returns `200`, not an error.
- `FakeAiProvider` gained a `"discovery"` deployment-kind branch; `AzureOpenAiProvider` routes
  `"discovery"` to the cheaper draft deployment (same reasoning as recaps).

### Slice 4 — Cascade hardening + client UI
- `RecapsController.Delete` now calls `IPublicRecapService.UnpublishAsync` after a successful
  delete, closing the last cascade gap (previously only the consent-revocation path unpublished).
- `PublishRecapSheet.tsx`: owner-only modal opened from a recap card. Shows the post-trip lock
  message with the unlock date before the trip ends; once it's ended, a places/tags/season/budget
  facets form; on a `422` (PII found), a review step listing the findings with a "publish anyway"
  path (`AcknowledgePii: true`); once published, the live moderation status and an unpublish button.
- `DiscoverScreen.tsx`: a new **Discover** tab with two modes. **Search** — facet filters (place/
  season/budget) plus free text against `GET /api/discovery/search` (anonymous), each result
  showing a snippet, places/tags/season/budget pills, and a **Report** action (reason + submit,
  posts to `POST /api/moderation/reports`). **Ask AI** — a question box against `POST
  /api/discovery/ask`, rendering the grounded answer with its cited recap titles/places, or a
  refusal message when `hasAnswer:false`.
- `ModerationQueueScreen.tsx`: reachable from a new "Moderation queue" row on Profile. Lists
  pending/reported recaps with approve/reject (reject requires a reason); the server's admin
  allowlist (`Moderation:AdminOwnerIds`) is the real gate — the screen just renders "you don't have
  access" on a `403` rather than trying to replicate the check client-side.
- `queries/discovery.ts`: the react-query hooks backing all of the above (publish status/mutation,
  unpublish, search, ask, report, queue + approve/reject), following the same pattern as
  `queries/recaps.ts` and `queries/reactions.ts`.

## Key API surface

| Endpoint | Purpose |
|---|---|
| `POST /api/trips/{id}/recaps/{recapId}/publish` | Publish (or re-publish) a recap publicly |
| `GET /api/trips/{id}/recaps/{recapId}/publish` | Owner's current publish status |
| `POST /api/trips/{id}/recaps/{recapId}/unpublish` | Remove from discovery |
| `POST /api/moderation/reports` | Report a published recap |
| `GET /api/moderation/queue` | Admin: recaps pending or reported |
| `POST /api/moderation/queue/{id}/approve` \| `/reject` | Admin: resolve |
| `POST /api/discovery/ask` | Grounded Q&A over public recaps, with citations |

## Tests at close

- Backend **231/231** (+2 `PublicRecapTests.cs` for the delete → unpublish cascade, owner and
  never-published cases), app **97/97** (+4 `DiscoverScreen.test.tsx`: search + results, report
  flow, grounded-answer-with-citations, and the `hasAnswer:false` refusal message), `tsc` clean.
  Hand-verified in a real Chromium browser against a running dev API + local Postgres (Playwright):
  fixed a real layout bug in the process (the third facet input in `DiscoverScreen`'s search row
  overflowed the phone frame on web — flex children need an explicit `minWidth: 0` to shrink below
  content size in RN-web; `RecapPanel`/`ShareTripSheet` don't hit this since they don't pack three
  flex inputs in one row). Walked the full loop live: opened `PublishRecapSheet` on an ended trip's
  recap → publish blocked with "Publishing is disabled" (403, no consent) → enabled
  `publishEnabled` → published → sheet showed "Live — discoverable" → **Discover** tab search found
  it by keyword with the right facet pills → **Report** flagged it (recap flipped `Pending`,
  confirmed server-side) → **Ask AI** surfaced the correct "AI is not configured on this server"
  message (dev has no AI configured) rather than crashing → Profile → **Moderation queue** correctly
  showed "you don't have access" for a non-admin dev user (403). Positive-admin-path (listing +
  approve/reject) is exercised by the backend test suite; local env-var admin-override plumbing
  didn't take effect in the time available, so it wasn't re-confirmed live on top of that.
- Backend **229/229** at the start of this slice (+10 `PublicRecapTests.cs` and 3 more, +8 `ModerationTests.cs`, +5
  `PiiDetectionTests.cs`, +9 `SearchTests.cs`, +14 `DiscoveryTests.cs`): gate ordering
  (trip-not-ended → not-consented → PII → moderation), moderation-flagged content recorded as
  `Rejected` not silently dropped, republish revives rather than duplicates, unpublish clears status,
  consent-off cascade unpublishes everything immediately, reporting pulls an approved recap back to
  `Pending`, the queue includes pending/reported and excludes untouched-approved recaps,
  approve/reject resolve reports, PII findings block publish and `AcknowledgePii` overrides, index
  create/update-in-place/remove, similar fake-embedded text scores higher than dissimilar text, facet
  filtering, approved-only visibility, semantic ranking order + keyword fallback, discovery prompt
  formatting, invented-citation dropping, `hasAnswer:false` → `NoSource`, empty retrieval skips the
  model call, the relevance floor (deterministic, via a stub search service), quota/AI-disabled
  errors — plus controller-level 400/403/422/200/204/404/503 enforcement throughout.
- Hand-verified against a running dev API over real Postgres, five times: (1) publish rejected
  without consent (403) → consent enabled → publish succeeded → status round-tripped → unpublish →
  404; (2) publish → report as a different user → status flips to `Pending` → queue 403s a non-admin,
  200s an admin (with the correct open-report count) → approve clears the queue; (3) publish with an
  email in the body → `422` with the finding → `AcknowledgePii: true` → `200 Approved`; (4) publish a
  recap about skiing/alps → no-filter search finds it → place/season facets filter correctly →
  semantic query ranks it with a real relevance score → unpublish → search returns empty; (5) a
  relevant question against the assistant returned a cited answer (the relevance-floor unit test is
  the trustworthy check for the refusal path — the fake embedding's low-dimensional hash isn't a
  reliable live signal with only one recap in the dev corpus, same caveat as every other fake
  provider in this phase).

## Exit criteria (sign-off)

| Criterion | Met |
|---|---|
| Public publishing is impossible until after the trip ends (API-enforced) | ✅ |
| Publish/unpublish with consent | ✅ |
| Moderation blocks unsafe content | ✅ *(real Azure AI Content Safety when configured, fake otherwise; report→queue→takedown works)* |
| PII is detected and reviewed before publishing | ✅ *(emails/phone numbers; names/addresses/faces need a future NLP provider)* |
| Search returns relevant public recaps | ✅ *(facet filters + semantic ranking)* |
| Discovery Q&A is grounded in and cites public recaps | ✅ *(refuses via `hasAnswer:false` + a pre-model relevance floor rather than hallucinating)* |

## Deferred items (backlog, tracked in the phase README's slice plan)

| Item | Target slice | Notes |
|---|---|---|
| PII detection for names/addresses/faces | Future | Needs a real NLP/entity-recognition provider (e.g. Azure AI Language); regex only covers emails/phones |
| Location coarsening on public recaps | Future | Offer to coarsen exact coordinates (e.g. to neighborhood) |
| Native pgvector column + ANN index | Future | Client-side cosine similarity is fine at today's scale; `ISearchService` absorbs the swap without callers changing |
| Async indexing job | Future | Indexing runs synchronously on the publish/approve path today |
| Golden RAG eval corpus against a real model | Future | Today's groundedness tests use the fake AI provider, same posture as Phases 5–6 |
| "Clone this itinerary" client action | Future | Discovery citations already carry `tripId`/`places`; only the clone action itself is unbuilt |
| Native mobile pass on the new screens | Future | Verified on web only (RNTL + a live Chromium/Playwright pass); iOS/Android layout for Discover/Publish/Queue not yet checked |

## What's next

Phase 8 is closed — all five slices shipped and hand-verified live (see Tests at close). Phase 9
(Offline, Polish & Launch) is next; see `docs/project-plan.md`.
