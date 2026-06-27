# CannaMatch — Audit Report v4.0
**Auditor:** Claude Sonnet 4.6 · **Date:** 2026-06-25 · **Branch:** main · **Tests:** 159/159 PASS

---

## 1. Executive Summary

The codebase is well-structured and the core three-layer scoring engine is scientifically sound.
Tests pass cleanly. The main concerns are concentrated in three areas: **two open security holes
that must be fixed before any real user touches the app**, **incomplete regulatory enforcement**
(quota, per-user license), and **three independent scoring engines** that produce different
percentages for the same strain depending on which code path the user hits.

**Finding counts:**

| Severity | Count |
|----------|-------|
| P0 — fix before launch | 2 |
| P1 — wrong behavior | 13 |
| P2 — tech debt | 12 |
| P3 — cosmetic / backlog | 8 |

**Fix these three first:**

1. **P0 — `/api/chat` has no auth and accepts prompt injection.** Any unauthenticated caller can
   spend your Anthropic budget and override the clinical system prompt. Two lines of middleware fix
   both.

2. **P1 — Three scoring engines return different %s for the same strain.** The browser (engine 2,
   range 0–100) switches mid-session from the legacy engine (engine 1, range 40–98) when the user
   completes their profile. The API `/match` endpoint (engine 3) computes a third, different number.
   A user comparing the in-app % to a pharmacy screen or an API call gets inconsistent answers.

3. **P1 — CORS is wide-open (`*`) on authenticated routes.** Any page on the internet can read
   authenticated API responses if it holds a valid JWT. Restrict to your production domain.

---

## 2. Spec Conformance Table

| Spec Requirement | Verdict | Sev | File:Line | Note |
|---|---|---|---|---|
| **§02 P1** genetics-first — no commercial name in strain_catalog | ✅ | — | `api/db/migrations/` | `commercial_name` lives only in `commercial_product` table |
| **§02 P2** no chemistry in user-facing strings | ⚠️ PARTIAL | P1 | `OnboardingWizard.jsx:1650` | RadarChart axis labels show Hebrew terpene transliterations (מירצן etc.) |
| **§02 P3** provenance + measured_at at batch level | ✅ | — | `007_batch_ingestion.sql` | Both columns present on `grow_batch` |
| **§02 P4** endpoint returns % only, no score breakdown | ⚠️ PARTIAL | P1 | `catalog.js:55`, `dna.js:201` | Raw 12-dim embedding vector included in responses; `menu.js` correctly strips it |
| **§02 P5** identity = grower, not brand | ✅ | — | `commercial_product` migration | grower/brand/marketer three-way distinction implemented |
| **§04** strain_catalog — no commercial name | ✅ | — | migrations | Correct separation |
| **§04** provenance enum exactly `measured\|declared` | 🔶 DIVERGES | P1 | `types.ts:11`, `007…sql:39` | TS has `'inferred'` as third value; DB has `'derived'` — two different third values |
| **§04** SKU not merged into strain; match_confidence preserved | ✅ | — | `commercial_product` migration | `match_confidence` column present |
| **§05** eligibility gate is first in pipeline | ✅ | — | `scorer.ts:44` | Fixed this session — eligibility before kill-switch |
| **§05** kill-switch threshold consistent | 🔶 DIVERGES | P2 | `scorer.ts:113`, `clinicalCore.js:151`, `scoring.js:33` | 20% in TS engine; 15% in both API engines |
| **§05** `declared` batch capped vs `measured` | 🔶 DIVERGES | P1 | `scorer.ts:59–62` | Both treated identically — no confidence penalty for declared provenance |
| **§05** evidence-level (human/mixed/preclinical) wired to confidence | ✅ | — | `scorer.ts:17–36` | `computeEvidenceFactor` correct |
| **§05** community adjustment Bayesian k=8 | ✅ | — | `scorer.ts:7–9` | `K=8`, `w(n)=n/(n+K)` |
| **§05** endpoint returns % only (no internal stages to client) | ⚠️ PARTIAL | P1 | `catalog.js:101`, `dna.js:230` | Embedding vector leaks alongside matchPct |
| **§06** genetics_node + lineage_edge + hypothesis_id | ✅ | — | `006_genetics_schema.sql` | All tables present with correct FKs |
| **§06** derivePhenoPrior — depth-3, decay 0.7, cap 0.5, early stop | ✅ | — | `genetics.ts:158–231` | All constants correct |
| **§07** three scraper adapters (html-catalog / html-per-product / pdf-batch) | ✅ | — | `parseCOA.js` | Solo, Seach, TikunOlam parsers all wired |
| **§07** daily 09:00 cron (Asia/Jerusalem) | ✅ | — | `server.js:146` | Schedule correct |
| **§07** per-manufacturer failure isolation | ✅ | — | `batchIngestor.js:148–198` | Each failure is caught and logged independently |
| **§07** no aggregator domains in registry | ✅ | — | `phase3ProveIt.test.js:252` | Test explicitly guards; 14 seeded URLs pass |
| **§07** manual COA upload behind admin auth | ✅ | — | `admin.js:11,66` | `requireRole("admin")` before all routes |
| **§09** category rules as CONFIG, not hardcoded | ✅ | — | `src/lib/categoryConfig.js` | Fixed this session — single config file |
| **§09** IMC category / form / monthly quota enforced | ❌ MISSING | P1 | (no file) | `gramsByCategory` typed but `basketPlanner` not wired to any route |
| **§09** per-user license categories at API | 🔶 DIVERGES | P1 | `catalog.js:28` | Global `LICENSED_CATEGORIES` used for all users, ignoring individual license |
| **§10** role enum admin/user/pharmacy | ✅ | — | `005_auth_schema.sql` | CHECK constraint correct |
| **§10** all admin + upload routes behind requireRole | ✅ | — | `admin.js:11` | Router-level guard |
| **§10** no secret/key/token in committed code | ✅ | — | (grep clean) | No hardcoded secret values found |
| **§10** .env git-ignored | ✅ | — | `.gitignore:12` | `.env`, `.env.local` listed |
| **§10** `/api/chat` authenticated | ❌ MISSING | **P0** | `chat.js:48` | No `verifySession` — unauthenticated Anthropic proxy |
| **§10** `/api/chat` system prompt guarded | ❌ MISSING | **P0** | `chat.js:61,80` | `body.system` passed to Anthropic; `validateClaudePayload` not applied to this route |
| **§11** mascot only, no chatbot UI | ✅ | — | (grep clean) | Zero `chatbot` pattern in `src/` |
| **§11** % visible, method/chemistry hidden on match cards | ✅ | — | `scorer.ts:100–101` | `buildReasonHuman()` correct |
| **§11** chemical names hidden in UI | 🔶 DIVERGES | P1 | `OnboardingWizard.jsx:1650` | RadarChart axis labels are Hebrew terpene transliterations |
| **§11** design tokens intact (jade/amber) | ✅ | — | `src/styles/ds.js` | Tokens present and used |

---

## 3. Code Health Findings

### B1 — Bugs / Correctness

| Sev | File:Line | What | Why it matters |
|---|---|---|---|
| **P1** | `CannaMatch.jsx:5724` | `api.sendOtp()` failure swallowed in empty `catch {}` | User clicks "continue to verification" with no OTP dispatched; no error shown |
| P2 | `CannaMatch.jsx:7184` | `pingBackend().then(setBackendLive)` has no `.catch()` | Unhandled rejection on network error; silent failure |
| P2 | `scorer.ts:110` | `batch.terpenes.reduce()` throws `TypeError` if `terpenes` is `undefined` | TypeScript types protect current callers; a future DB-sourced `Batch` cast with `as` could crash |
| P2 | `ocr.js:50` | OCR step failure swallowed | Caller receives empty text and produces a silent zero-batch result — looks like parse failure, not OCR failure |
| P2 | `dna.js:111` | `.catch(() => {})` on checkin_log INSERT | If the table is missing this is a silent no-op |

Zero-norm cosine → returns `0` (not `NaN`) ✅  
Blend denominator → structurally always > 0 (prior weight ≥ 1 when no measured/community) ✅  
`fetchWithRetry` delay → correctly awaited with `new Promise(r => setTimeout(r, ...))` ✅  
OTP expiry → enforced in SQL `WHERE expires_at > now()` ✅  

### B2 — Memory Leaks / Resource Issues

| Sev | File:Line | What | Why it matters |
|---|---|---|---|
| P2 | `CannaMatch.jsx:1317` | `getCommunityStats()` fetch in `useEffect` with no `AbortController` | Rapid open/close cycles pile up in-flight XHRs; state update fires on unmounted component |
| P2 | `server.js:146–154` | `cron.schedule()` tasks never `.destroy()`-ed on shutdown | Prevents graceful `SIGTERM`; causes `jest --detectOpenHandles` noise in CI |
| P3 | `CannaMatch.jsx:3928, 3932, 1745` | `setTimeout` fire-and-forget in event handlers, not cleared on unmount | React 18 suppresses the error but timers are leaked |

`pool.connect()` usage → all instances have correct `finally { client?.release() }` ✅  
`WalkingMascot` → pure CSS animation, no framer-motion hooks ✅  
`_ephemeral` in `genetics.ts` → browser-only singleton; bounded by tab lifetime, negligible memory ✅  
PDF download → sequential (one at a time), not concurrent; no stream left open ✅  

### B3 — Duplication / Replication

| Sev | File A:Line | File B:Line | What diverged |
|---|---|---|---|
| P2 | `catalog.js:13–34` | `menu.js:36–58` | `mapRowToScoringEngineStrain` / `mapDnaToScoringAnswers` copy-pasted; `menu.js` copy adds `embedding` field |
| P2 | `CannaMatch.jsx:313` | `scoringEngine.js:68` | `rawScore()` diverged — `notHelped` penalty missing in CannaMatch.jsx local copy; wrong score in no-reasons fallback path |
| P2 | `scorer.ts:113` | `clinicalCore.js:151`, `scoring.js:33` | Kill-switch threshold: 20% in TS engine, 15% in both API engines — inconsistent safety boundary |
| P2 | `requireRole.js:10` | `claudeProxyShield.js:13` | JWT fallback secrets differ (`"…set-JWT_SECRET-env"` vs `"change-me-in-production"`) — tokens cross-incompatible in dev when `JWT_SECRET` is unset |
| P3 | `src/components/*` | `src/copy.he.js` | Hebrew strings inline in every component; only `CannaMatch.jsx` imports the shared copy module |

`Batch` / `UserNeed` types → defined once in `types.ts`, not duplicated ✅  

### B4 — Performance

| Sev | File:Line | What | Why it matters |
|---|---|---|---|
| P2 | `CannaMatch.jsx:7248` | `scored` useMemo recomputes on every `setAns` — `ans` is a new object reference on each state update | Grows proportionally with STRAINS array; no deep-equality memoization |
| P3 | `menuParser.js:27`, `localBot.js:32–34` | `readFileSync` singleton on first request | Blocks event loop once per cold start (~5ms for a few hundred KB); cached after |

No N+1 queries found in `/match/:userId` or pharmacy routes ✅  
`engine = useMemo([], [])` — stable reference, does not re-create ✅  
pgvector IVFFlat index created in migration 004 ✅ (probes/nlists not visible in app code — review DB migration directly)  

### B5 — Security Hygiene

| Sev | File:Line | What | Why it matters |
|---|---|---|---|
| **P1** | `server.js:47` | `cors()` with no options → `Access-Control-Allow-Origin: *` on all routes including authenticated ones | Any page can read authenticated API responses if it has a valid JWT |
| **P1** | `batchIngestor.js:54` | `fetchWithRetry(batches_url)` with no domain allowlist; `batches_url` is admin-writable from DB | SSRF: admin can point scraper at `http://169.254.169.254/latest/meta-data/` |
| **P1** | `menu.js:106` | `scrapePharmacyMenuUrl(url)` fetches a user-supplied URL with no allowlist | Authenticated SSRF via `/api/parse-menu` |
| **P1** | `claudeProxyShield.js:18` | `claudeRateLimit` (100 req/15min/IP) applied to `/api/chat` without auth | Rate limit is insufficient without authentication; rotating proxies bypass it |
| P2 | `otp.js:42–43` | `console.log('[OTP-DEV]...Code: ${code}')` not gated on `NODE_ENV !== 'production'` | OTP visible in logs on staging if SMTP not yet configured |

No SQL injection found — all queries use `$1`/`$2` positional parameters ✅  
Path traversal in admin upload impossible — `multer.memoryStorage()`, `originalname` never in filesystem path ✅  

### B6 — Dead Code / Drift

| Sev | File:Line | What |
|---|---|---|
| P2 | `terpeneScience.ts:29–52` | `CLUSTERS` export (entourage-effect synergy groups) — zero imports anywhere in codebase |
| P2 | `src/engine/basketPlanner.ts` | Entire basket planner (quota enforcement) — test-only import, zero live consumers |
| P3 | `scorer.ts:188`, `scorer.ts:200` | `scoreAll` and `scoreAllWithMap` exports — test-only, no live route or component imports them |
| P3 | `dailySync.js:57–66` | One `// TODO` + commented block for per-pharmacy menu sync (only TODO in the codebase) |

`menuDecoder.js` → imported in `CannaMatch.jsx:25` ✅ (not orphaned)  
`menuOcr.js` → imported in `CannaMatch.jsx:26` ✅ (not orphaned)  
`DEFAULT_DNA` → single definition in `constants.js`, imported by 5 routes ✅  

---

## 4. Two Scoring Systems Check

**There are three scoring engines active simultaneously — not two.**

| Engine | File | Range | Used by |
|---|---|---|---|
| 1 — Legacy JS | `src/lib/scoringEngine.js` | 40–98 | `catalog.js`, `menu.js`, `dna.js` (checkin path) |
| 2 — New TS (three-layer) | `src/engine/scorer.ts` via `legacyBridge.ts` | 0–100 | `CannaMatch.jsx` when `ans.reasons.length > 0` |
| 3 — Adaptive weights | `api/lib/scoring.js:calculateMatchScoreWithExplanation` | 0–100 | `dna.js` `/match/:userId` endpoint |

**Does the % jump on profile completion? YES.**

`CannaMatch.jsx:344–373` — when `hasProfile` (i.e. `ans.reasons.length > 0`) is `false`, `scoreAll`
uses the legacy `rawScore` path which returns integers in the 40–98 range. When the user completes
onboarding and `ans.reasons` becomes non-empty, the same function switches to `bridgeScore` (engine
2) which returns 0–100. A strain sitting at 72% in the pre-profile state can appear at 45% the
moment the user sets their first indication — because the scoring formula completely changed.

**Engine consistency:**
- Browser result ≠ `/api/match/:userId` result (engines 2 and 3 are different algorithms)
- In-browser kill-switch threshold 20% ≠ API kill-switch threshold 15% (engines 2 and 3)
- `dna.js:161` (checkin safe-targets) ranks using engine 1 immediately after updating the DNA
  profile that engine 3 reads — the returned `safe_targets` are computed by the wrong engine

---

## 5. Open Questions

Each question requires a founder decision. Nothing here has been changed.

| # | Symbol | Question |
|---|---|---|
| Q1 | 🔶 | **Provenance third value:** The DB says `'derived'`; the TypeScript type says `'inferred'`. Which is canonical? Or should there be exactly two values (`measured\|declared`) as the spec states? |
| Q2 | 🔶 | **Declared batch penalty:** Should a `declared` terpene profile receive a lower scoring weight than a lab-signed `measured` COA? Currently both get `wMeasured = 1`. |
| Q3 | 🔶 | **RadarChart chemistry:** Does §1 Rule 5 ("no chemistry visible") apply to the DNA radar in onboarding Stage 6? If yes, axis labels must change from Hebrew terpene transliterations to plain feelings (מרגיע / מרענן etc.). |
| Q4 | ❓ | **`/api/chat` auth:** Is the absence of `verifySession` on `/api/chat` intentional (demo mode), or an oversight? If intentional, document it; if oversight, add `verifySession` immediately. |
| Q5 | ❓ | **Monthly quota enforcement:** `gramsByCategory` is typed and `basketPlanner.ts` is implemented — is quota enforcement in scope for v4.0 or deferred to v5.0? |
| Q6 | ❓ | **Entourage clusters:** Is `CLUSTERS` (synergistic terpene groups in `terpeneScience.ts:29`) deferred intentionally, or was it forgotten? If deferred, delete or mark with a comment. |
| Q7 | ❓ | **Kill-switch threshold:** Which is correct — 20% (TS engine) or 15% (API engines)? A 17% dominant terpene produces inconsistent safety outcomes depending on which engine evaluates the batch. |
| Q8 | ❓ | **Authoritative scoring engine:** Which engine should power the API `/match` endpoint and the in-browser results? Currently three different engines run simultaneously. Is the plan to migrate routes to engine 2, or keep engine 3 as the API layer? |
| Q9 | ❓ | **Per-user license at API:** `licenseCategories` exists in `UserNeed` type but the API passes the global 9-category list for all users. Should the API gate recommendations by the individual user's MOH-issued category? |
| Q10 | ❓ | **CORS in production:** Should `cors()` be restricted to `cannamatch.co.il` in production, or is the open-origin policy intentional (e.g. for a public API)? |

---

## 6. Appendix

### A. TODO / FIXME Inventory

One TODO found in the entire codebase:

| File | Line | Text |
|------|------|------|
| `api/jobs/dailySync.js` | 57 | `// TODO: for each pharmacy with a parseable menuUrl (text/JSON endpoint):` |

The commented-out implementation block immediately follows at lines 60–66.

---

### B. Orphaned / Dead Modules

| File | Status | Evidence |
|------|--------|---------|
| `src/data/terpeneScience.ts` → `CLUSTERS` export | Dead export | Zero imports across entire codebase |
| `src/engine/basketPlanner.ts` | Dead module | Imported only in its own test file |
| `src/engine/scorer.ts` → `scoreAll` export | Dead export | Imported only in `basketPlanner.test.ts` |
| `src/engine/scorer.ts` → `scoreAllWithMap` export | Dead export | Imported only in `step41_proof.test.ts` |
| `api/jobs/dailySync.js` lines 60–66 | Commented out | Dead implementation pending TODO |

Not orphaned (confirmed live): `menuDecoder.js` (`CannaMatch.jsx:25`), `menuOcr.js` (`CannaMatch.jsx:26`), all route files, all migration files.

---

### C. Chemical Name Leak Grep

Pattern: `myrcene|limonene|linalool|caryophyllene|terpinolene|pinene|humulene|ocimene`

**In `src/components/` (user-visible risk):**

| File | Line | Context |
|------|------|---------|
| `OnboardingWizard.jsx` | 1650–1657 | `TERP_ORDER` array — used as RadarChart axis labels rendered to the user |
| `OnboardingWizard.jsx` | 1745–1746 | Same constant referenced in chart render path |
| `OnboardingWizard.jsx` | 1857–1858 | Same constant referenced again |

All other occurrences in `src/components/` are JS object keys used as data identifiers (not rendered as text). Only `OnboardingWizard.jsx:1650` is a confirmed user-visible violation.

`src/engine/scorer.ts:buildReasonHuman()` — zero chemical names in returned strings ✅  
`src/copy.he.js` — zero chemical names in exported copy ✅  
`src/lib/terpeneToHuman.js` — translates chemical keys to Hebrew feelings correctly ✅  

---

### D. Secrets Grep Summary

Pattern: `password|secret|token|api_key|apikey|sk-|Bearer `

No hardcoded secret **values** found in committed code. Locations where secret **names** appear (all safe — reading from `process.env`, not hardcoding):

| File | Line | What |
|------|------|------|
| `api/lib/adminBootstrap.js` | 48–52 | Reads `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD` from env; never logs them |
| `api/routes/auth.js` | 15 | `JWT_SECRET = process.env.JWT_SECRET \|\| fallback` |
| `api/middleware/requireRole.js` | 10 | Same pattern |
| `api/security/claudeProxyShield.js` | 13 | Same pattern — **different fallback string** (see P2 finding B3.4) |
| `api/routes/chat.js` | 51 | `ANTHROPIC_API_KEY` read from env; guarded with early return if missing |
| `api/lib/otp.js` | 42–43 | OTP code logged to console in dev when SMTP not configured — not a secret value leak but a code value leak; not gated on `NODE_ENV` |

`.env` is listed in `.gitignore` ✅. No `.env` file is present in the repository.
