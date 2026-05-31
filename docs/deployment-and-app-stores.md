# Deployment & App Store Publishing — Wander

> Status: **Reference** · Last updated: 2026-05-30
> Covers: Apple App Store, Google Play, and web deployment. Build/submit via **EAS** (Expo).

This is the playbook for getting Wander into users' hands on **iOS**, **Android**, and **Web**.
Execution is planned for **Phase 3+** (local-first development before that).

---

## 0. TL;DR sequencing
- **Phase 3:** enroll developer accounts, reserve bundle/package IDs, set up signing, ship a first
  **internal/TestFlight** build to prove the pipeline.
- **Throughout:** keep TestFlight (iOS) + Internal Testing (Android) tracks for every phase.
- **Phase 9:** final assets, privacy labels, compliance, and **public store submission**.

---

## 1. Accounts, costs & lead time *(start in Phase 3)*
| Item | Cost | Lead time / notes |
|---|---|---|
| **Apple Developer Program** | **$99 / year** | Enrollment can take **days** (identity/D-U-N-S for orgs). Needed for TestFlight + App Store. |
| **Google Play Developer** | **$25 one-time** | Identity verification can take **days**; new personal accounts may need a closed test before production. |
| **Expo / EAS account** | Free tier works | For `eas build` + `eas submit`. |
| **Apple device** | — | A Mac is **not** required (EAS builds in the cloud), but helps for testing. |

**Reserve identifiers early:** iOS **Bundle ID** (e.g., `com.wander.app`) and Android
**applicationId** (same convention). Keep them stable — changing later is painful.

---

## 2. Build & submit pipeline (EAS)
- **`eas build`** produces signed binaries in the cloud (iOS `.ipa`, Android `.aab`).
- **`eas submit`** uploads to App Store Connect / Play Console.
- **`eas update`** ships **OTA JS updates** between store releases (no review for JS-only changes).
- **Signing:** let **EAS manage** iOS certs/provisioning and Android **Play App Signing** keys
  (back up the keystore!).
- Wire build + submit into **CI** so releases are repeatable.

---

## 3. Apple App Store specifics
**Setup**
- Create the app record in **App Store Connect**; set Bundle ID, name, primary language.
- **TestFlight** for beta (internal testers instantly; external testers need a light review).

**Required for submission**
- **Screenshots** for required device sizes (6.7" + 6.1" iPhone at minimum; iPad if supported).
- App icon (1024px), description, keywords, support URL, **privacy policy URL**.
- **App Privacy ("nutrition labels")** — declare data collected/linked (notes, voice, location, etc.).
- **Permission usage strings** in `Info.plist`: **microphone** (voice notes), **photo library/camera**,
  **location** (maps/weather), **notifications**. Missing/poor strings = rejection.
- **Age rating** questionnaire; **export compliance** (encryption) answer.
- **Account deletion in-app** — Apple **requires** it if users can create an account.
- **Review time:** typically ~24–48h (can be longer for first submission / UGC apps).

**⚠️ UGC rule (Apple Guideline 1.2) — affects our public recaps (Phase 8):** apps with
user-generated content must have a **content filter, a way to report/flag, a way to block users, and
a published contact for reports.** Our moderation pipeline must be live **before** public recaps ship.

---

## 4. Google Play specifics
**Setup**
- Create the app in **Play Console**; enable **Play App Signing**.
- **Testing tracks:** Internal → Closed → Open → Production (use Internal from Phase 0).

**Required for submission**
- **AAB** (Android App Bundle), not APK.
- **Data safety** form — declare data collection/sharing (mirrors Apple's privacy labels).
- **Content rating** via IARC questionnaire.
- Store listing: icon, **feature graphic**, screenshots (phone + optionally tablet), description.
- **Privacy policy URL** (required, especially with sensitive permissions like mic/location).
- **Permissions** declared with rationale; **target API level** must meet Google's current minimum.
- **Account deletion** — Google requires an in-app path **and** a web URL to request deletion.
- **Review time:** can range from hours to several days; new accounts may face extra checks.

**UGC:** Play also requires moderation + reporting for user-generated content — same dependency on our
Phase 8 moderation work.

---

## 5. Web deployment
- **Expo web export** → **Azure Static Web Apps** (global CDN, free SSL, GitHub Actions deploy).
- Custom domain + HTTPS; preview environments per PR if desired.
- Public recap pages (Phase 6/8) are served here and must honor the same consent/visibility rules.

---

## 6. Backend/API deployment (for completeness)
- API container → **Azure Container Apps** (or App Service); **Azure Database for PostgreSQL** per env.
- CI/CD runs migrations (`dotnet ef`) and deploys; secrets from **Key Vault**.
- Environments: `dev` → `staging` → `production`.

---

## 7. Cross-store launch checklist (Phase 9 gate)
- [ ] Developer accounts active; app records created; IDs stable.
- [ ] Signing configured + **keystore backed up**.
- [ ] Privacy policy published; **Apple App Privacy + Google Data Safety** completed and accurate.
- [ ] All **permission strings/rationales** present (mic, photos, location, notifications).
- [ ] **In-app account deletion** implemented (both stores).
- [ ] **UGC moderation + reporting + blocking** live (required before public recaps).
- [ ] Screenshots/assets for all required sizes; listings localized as needed.
- [ ] Content/age ratings completed.
- [ ] TestFlight + Internal Testing validated on real devices.
- [ ] Staged/phased rollout plan for production.
