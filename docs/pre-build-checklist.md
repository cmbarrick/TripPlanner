# Pre-Build Checklist — "Definition of Ready" before Phase 0

> Status: **Open** · Last updated: 2026-05-30
> We have a working **prototype** (see [`phases/phase-minus-1-prototype`](../phases/phase-minus-1-prototype)).
> This is what must be in place before we start building the **real** product (Phase 0, local-first).

Treat each box as a gate. We don't need *everything* before writing the first line of Phase 0, but
the **decisions** must be locked and the **dev tooling** working.

---

## 1. Decisions to lock (no code needed — just agree)
- [x] **Database:** PostgreSQL (Azure Database for PostgreSQL, Flexible Server). *(confirmed)*
- [x] **Stack:** Expo client · ASP.NET Core + EF Core API · Azure hosting. *(confirmed)*
- [x] **Vector store:** `pgvector` first. *(locked; Azure AI Search remains the scale-up option for hybrid/enterprise search needs later)*
- [x] **API hosting:** Azure **App Service** to start. *(locked; Container Apps remains a future option if/when runtime needs change)*
- [ ] **Voice transcription provider:** Azure Speech-to-Text *(assumed)*.
- [ ] **Recap export formats:** PDF + shareable web page *(assumed)*.
- [ ] **Post-event notification defaults:** delay + which event types prompt by default.
- [ ] **Repo/branching:** mono-repo (current) layout, branch strategy, PR rules.

## 2. Accounts & access (provisioning)
- [ ] **Azure subscription** + resource groups per env (`dev` / `staging` / `prod`). *(subscription exists; create env resource groups next)*
- [ ] **Microsoft Entra External ID** tenant for user sign-in (email + Google/Apple).
- [ ] **Azure OpenAI access** — *request early; approval can take days.*
- [ ] **Provider keys** as needed: Maps (Mapbox/Azure Maps), Weather (Open-Meteo needs none).
- [ ] **Apple Developer ($99/yr) + Google Play ($25 once)** accounts — enrollment takes days, start now.
- [ ] **Expo / EAS** account for builds + OTA updates.

> Full publishing steps, store requirements, and the launch checklist:
> [`deployment-and-app-stores.md`](./deployment-and-app-stores.md).
> Deployment/store execution is deferred to **Phase 2.5**; keep these tracked so lead-time items don't surprise us.

## 3. Local dev environment (each developer)
- [ ] **.NET 9 SDK**, **Node LTS + npm**, **Git**.
- [x] **PostgreSQL locally** (native install or Docker) — the first real DB target.
- [ ] **Azure CLI** (`az`) signed in.
- [x] Expo tooling working (`npm run web`); mobile sims/devices optional at first.
- [x] `.env` / user-secrets pattern in place; **no secrets committed**.

## 4. Foundational engineering (the actual Phase 0 entry work)
- [x] **EF Core + Npgsql** added; `DbContext` + first **migration** for the base schema
      (incl. `consent_settings`, sharing/`trip_members` fields — see architecture doc).
- [x] Swap **`InMemoryTripRepository` → EF Core repository** behind the existing `ITripRepository`.
- [x] **Auth wired:** API validates Entra JWT; replace the `DemoOwner` constant with the real user id.
- [x] **Lock down CORS** to known origins (no `AllowAnyOrigin` outside dev).
- [x] **CI pipeline:** lint, typecheck, unit tests, `dotnet ef` migration check on every PR.
- [ ] **Secrets in Key Vault**; config wired per environment.
- [x] **Observability:** Application Insights (API) + Sentry (client) baseline.
- [x] **Test scaffolding:** xUnit (API), Jest + RNTL (client), one smoke E2E.

## 5. Cross-cutting (start now, applies to every phase)
- [x] **Privacy/consent model** reflected in the schema from day one (see
      [`privacy-consent-moderation.md`](./privacy-consent-moderation.md)).
- [ ] **Cost guardrails:** start on cheap tiers (PG Burstable, Basic compute); add a cost alert.

---

## Definition of Ready (start Phase 0 when… local-first)
1. Section 1 decisions are agreed.
2. Entra tenant plan is defined; Azure/OpenAI requests can be tracked in parallel.
3. Every dev can run the API + Expo client locally against a **local Postgres**.
4. CI runs on PRs (even if minimal).

Deployment/app-store rollout items land in **Phase 2.5**.
