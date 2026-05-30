# Privacy, Consent & Moderation — Wander

> Status: **Draft v1** · Owner: Product + Engineering · Last updated: 2026-05-30

Wander captures personal trip content (notes, **voice recordings**, photos) and can **share** it with
friends and **publish** it publicly to power **AI discovery**. That makes privacy, consent, and
moderation core requirements — not afterthoughts. This document is the source of truth for how we
handle them. It runs as a **cross-cutting workstream** across all phases.

---

## 1. Principles
1. **Private by default.** Nothing is shared, published, or used by AI discovery unless the user
   explicitly opts in.
2. **Granular & revocable consent.** Sharing, public publishing, and AI/training use are **separate**
   choices the user can turn on or off at any time.
3. **Consent travels with the data.** Every read/query path filters by current consent + visibility.
   Revoking consent removes content from shared/public/discovery surfaces promptly.
4. **Minimize & protect PII.** Detect and offer to redact personal data before anything goes public.
5. **User owns their data.** Full export and deletion; deletion truly removes content (incl. media and
   discovery-index entries).

---

## 2. Consent model

Three independent, opt-in, revocable scopes:

| Scope | Controls | Default |
|---|---|---|
| **Share** | Trip/recap visible to specific friends or via link | Off |
| **Publish** | Recap is publicly visible & searchable | Off |
| **AI use** | Public recap may be **indexed for RAG discovery** | Off (separate from Publish) |
| **AI training** | Content may be used to **fine-tune** a model (future) | Off (separate, explicit) |

- `ConsentSettings` lives on the user; per-recap flags override/scope it.
- **Publish ≠ AI use ≠ training.** A user can publish a recap but decline indexing, or allow indexing
  but decline training. Each is a distinct checkbox with plain-language explanation.
- **Public publishing is post-trip only:** a recap can be made public **only after the trip's end
  date**, enforced server-side. This is a safety measure (don't broadcast that you're currently away
  from home / at a location). Private sharing with friends is allowed before/during/after.
- Revocation is honored end-to-end: unshare links, unpublish, and **delete from the vector index**.

---

## 3. PII handling
- **Before publishing:** run PII detection (names, phone numbers, emails, addresses, license plates,
  faces in photos) and present a **redaction review** to the user.
- **Voice notes:** transcripts are PII-scanned just like text; raw audio is **never** published — only
  the user-approved recap text becomes public.
- **Location precision:** offer to coarsen exact coordinates (e.g., to neighborhood) on public recaps.

---

## 4. Moderation (public UGC — Phase 7)
- **Automated screening:** Azure AI Content Safety on text (and image moderation for photos) at publish
  time and on edits; block/flag categories (hate, harassment, sexual, self-harm, violence, etc.).
- **Reporting & takedown:** any user can report public content; reported items enter a **review queue**.
- **Human review:** a moderation queue for flagged/reported content with audit trail.
- **Enforcement:** unpublish, shadow-review, or account action per policy; appeals path.
- **Discovery hygiene:** only `moderation_status = approved` content is eligible for search/RAG.

---

## 5. AI use & RAG specifics
- The discovery assistant retrieves only from **consented, moderated, public** recaps.
- Answers are **grounded with citations**; when no good source exists, it says so (no hallucination).
- Embeddings/index entries are tied to source consent; revoking consent or deleting the source
  **removes its chunks** from the index.
- **Fine-tuning (future):** requires the separate **AI-training** consent, a **PII-scrubbed** corpus,
  documented data lineage, and the ability to retrain/rebuild if consent is withdrawn going forward.

---

## 6. Data rights & retention
- **Export:** user can export their trips, notes, transcripts, and recaps.
- **Deletion:** deleting a note/trip/account removes DB rows, **Blob media (audio/photos)**, and any
  **discovery-index** entries derived from it.
- **Retention:** define retention for audio vs. transcripts (e.g., keep audio until user deletes;
  transcripts as long as the note exists) — to be finalized with legal review.
- **Regulatory:** design toward GDPR/CCPA-style rights (access, deletion, portability, consent records).

---

## 7. Engineering checklist (applied per phase)
- [ ] New content types default to **private**; sharing/publish/AI require explicit opt-in.
- [ ] Every query that returns shared/public content **filters by consent + visibility + moderation**.
- [ ] Consent changes propagate to shares, public feed, and the vector index.
- [ ] PII redaction runs before publish/index.
- [ ] Deletion cascades to media + index; verified by tests.
- [ ] Consent state and moderation decisions are **audited**.
- [ ] Tests: consent-gate tests, PII-redaction tests, moderation corpus, deletion/export tests.
