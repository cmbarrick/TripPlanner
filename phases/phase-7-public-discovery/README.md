# Phase 7 — Public Recaps & Discovery

> Goal: A searchable, AI-powered travel knowledge layer built from **consented** public recaps.
> Est: ~4–5 weeks · Depends on: Phase 5 (recaps), Phase 6 (sharing), privacy workstream

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
- **Private** sharing & co-editing with friends (Phase 6) remain available **before/during** the trip;
  this restriction applies **only to public publishing**.

## Scope / tasks
- [ ] **Post-trip gate:** block public publishing until after `trip.end_date` (server-enforced);
      UI disables/explains the publish action until the trip ends.
- [ ] **Publish flow:** per-recap opt-in; **PII detection + redaction review** before going public;
      coarsen exact locations if chosen; unpublish anytime.
- [ ] **Moderation:** Azure AI Content Safety at publish/edit; user **reporting**; review queue;
      only `approved` content is discoverable.
- [ ] **Search:** keyword + **semantic** (embeddings) over consented public recaps; filters.
- [ ] **RAG assistant:** question → retrieve from **vector index** → Azure OpenAI answers **with
      citations**; surface relevant **itineraries to clone**; "no good source" fallback.
- [ ] **Vector store:** choose **Azure AI Search** vs **pgvector**; async indexing on publish.
- [ ] **Consent lifecycle:** revoking consent / deleting a recap removes it from search + index.

## Out of scope
- **Fine-tuning** a custom model (later; needs separate training consent + scrubbed corpus).
- Monetization (v2).

## Testing plan
- [ ] **Post-trip gate:** publishing is **rejected server-side before `trip.end_date`** and allowed
      after; UI reflects the locked/unlocked state. Private sharing is unaffected before/during the trip.
- [ ] **AI evals:** RAG **groundedness**, citation correctness, refusal when no source.
- [ ] **Moderation:** content-safety corpus blocks unsafe content; report→queue→takedown.
- [ ] **Privacy:** unpublish/delete/revoke removes from search **and** vector index; PII redaction works.
- [ ] **Integration:** publish → index → searchable; filters return relevant results.
- [ ] **Regression:** Phases 0–6 suites green.

## Exit criteria
- **Public publishing is impossible until after the trip ends** (enforced by the API, not just UI).
- Publish/unpublish with consent; moderation blocks unsafe content.
- Search returns relevant public recaps; discovery Q&A is **grounded in and cites** public recaps.

## Artifacts
- Mockups: to be added (publish/consent screen, discovery search, RAG answer with citations).
