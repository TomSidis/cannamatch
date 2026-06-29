<div dir="rtl">

# CannaMatch — מלווה אישי לקנאביס רפואי

CannaMatch הוא כלי טכנולוגי להתאמה וניווט עבור מטופלי קנאביס רפואי בעלי רישיון תקף בישראל. הכלי מתאים מוצרים לפי פרופיל גנטי, נתוני טרפנים מדודים, וחוויות של מטופלים אחרים — לא לפי שם מסחרי ולא לפי הבחנת אינדיקה/סאטיבה שהמחקר אינו תומך בה. קהילת המטופלים היא שכבת תמיכה, לא הליבה.

**CannaMatch אינו גורם רפואי, אינו מספק ייעוץ רפואי, ואינו תחליף לייעוץ של רופא או רוקח מוסמך.** כל החלטה הנוגעת לטיפול היא באחריות המטופל ובהתייעצות עם הרופא המטפל בלבד.

---

## פילוסופיה

### גנטיקה היא הכל (וגם יש לה גבולות)

אותו "ג'ורג' OG" שגדל אצל יצרן א' ואצל יצרן ב' הוא מוצר שונה. CannaMatch מתחיל מה**גנטיקה** כפריאור, מרחיב לנתוני **טרפנים מדודים** כשיש COA, ומשלב **נתוני קהילה** כשכבה שלישית — לא הפוך.

### שלוש שכבות הניקוד (`src/engine/scorer.ts`)

| שכבה | מקור | משקל |
|------|------|------|
| 1 — גנטיקה (prior) | מפת גנטיקה + גנוטיפ הגידול | `wPrior = max(0, 1 - max(wMeasured×0.6, wCommunity))` |
| 2 — טרפנים מדודים | COA / נתוני יצרן (הנחה 0.85× לנתונים מוצהרים) | `wMeasured × 0.6` |
| 3 — קהילה | Bayesian shrinkage | `wCommunity = n / (n + 8)` |

**גורם עדות:** כל טרפן נושא דרגת עדות (`human` = 1.0, `mixed` = 0.75, `preclinical` = 0.5) שמשפיעה על רכיב הביטחון (confidence) — לא על הציון עצמו. קהילה אינה מושפעת מגורם העדות: דיווח אמיתי עוקף את מגבלות הספרות.

**kill-switch:** מטופל יכול להגדיר טרפן-טריגר אישי. כל מוצר שמכיל אותו נחסם לפני חישוב הקוסינוס — לא מסונן אחרי.

**ציון אמון דיווח** (`src/engine/reportTrust.ts`):

```
0.10 (בסיס אנונימי)
+ 0.50 (רישיון IMC מאומת)
+ 0.20 (תמונת מוצר)
+ 0.20 (התאמת מספר אצווה COA)
= עד 1.00
```

סף "דיווח מאומת" (`TRUST_THRESHOLDS.HIGH`): ≥ 0.70. סף "דיווח חלקי" (`TRUST_THRESHOLDS.MEDIUM`): ≥ 0.40.

פופולריות ≠ אמת קלינית. "עזר לי" לא נכנס ל-`ORDER BY` של הפיד.

---

## ארכיטקטורה

### Stack

| רכיב | טכנולוגיה |
|------|-----------|
| Frontend | React 18, TypeScript, Vite 5, Framer Motion 12, Recharts |
| Backend | Node.js (ES modules), Express 4 |
| DB | PostgreSQL 16 + pgvector (Docker: `pgvector/pgvector:pg16`) |
| OCR | Tesseract.js 7 + Anthropic API (אימות רישיון IMC) |
| Auth | JWT + OTP (email / SMS) |
| Tests | Vitest 1 |
| Fuzzy search | Fuse.js 7 (client-side) |

### מבנה תיקיות

```
cannamatch/
├── api/
│   ├── db/
│   │   ├── schema.sql          # סכמה ראשית: users, strains, batches, pharmacies, user_reviews, ...
│   │   ├── migration_v2.sql    # 3-entity model: genetic_identity, commercial_product, bio_journal
│   │   ├── migrations/         # מיגרציות ממוספרות 004–014
│   │   ├── initDb.js           # npm run db:init — schema + migration_v2 + seed זנים
│   │   ├── migrate.js          # npm run db:migrate — מריץ 004–014 לפי סדר, מדלג על מה שרץ
│   │   └── seedStrains.js
│   ├── jobs/
│   │   ├── dailySync.js        # סנכרון תפריטי בתי מרקחת (10:00, Asia/Jerusalem)
│   │   └── batchIngestJob.js   # קליטת COA אצוות (09:00, Asia/Jerusalem)
│   ├── lib/                    # לוגיקה עסקית (commentFilter, termsConfig, licenseHash, ...)
│   ├── middleware/             # requireRole (admin), cache (Redis אופציונלי)
│   ├── routes/                 # 14 קבצי route
│   └── security/
│       └── claudeProxyShield.js  # verifySession — req.userId מ-JWT
├── src/
│   ├── components/             # 24 רכיבי React
│   ├── engine/                 # מנוע ציון TypeScript
│   │   ├── scorer.ts           # scoreSingle — 3-layer blend
│   │   ├── reportTrust.ts      # computeReportWeight, TRUST_THRESHOLDS
│   │   ├── vectorMath.ts       # cosine similarity, buildPriorVector, buildProductVector
│   │   ├── batchSignal.ts      # aggregateByBatch — Bayesian community aggregation
│   │   ├── genetics.ts         # derivePhenoPrior — הורשת prior מעץ שושלת
│   │   ├── basketPlanner.ts    # תכנון קנייה לפי קוטה T/C
│   │   └── types.ts            # EffectVector, Batch, UserNeed, ScoredProduct, ...
│   ├── data/
│   │   ├── terpeneScience.ts   # TERPENE_EFFECTS — 8 טרפנים + evidence labels
│   │   ├── killSwitchConfig.ts # הגדרות kill-switch אישיות
│   │   └── pharmacies.js       # נתוני בתי מרקחת בסיס
│   ├── hooks/
│   │   └── useOnboardingStore.js
│   └── services/
│       └── api.js              # שכבת API — כל הקריאות ל-backend
├── docker-compose.yml          # PostgreSQL 16 + pgvector
└── package.json
```

### טבלאות DB לפי מיגרציה

| קובץ | טבלאות / שינויים עיקריים |
|------|--------------------------|
| schema.sql | `users`, `otp_codes`, `strains`, `batches`, `pharmacies`, `user_reviews`, `user_dna_profiles` |
| migration_v2.sql | `genetic_identity`, `commercial_product`, `bio_journal` |
| 006 | `genetics_node`, `lineage_edge`, `cultivation_modifier` |
| 007 | `grow_batch`, `production_batch`, `manufacturer_registry`, `scrape_run_log` |
| 009 | extends `user_reviews`: trust_weight, photo_url, batch_id, batch_verified, is_verified_patient |
| 010 | מחליף `imc_license` raw ב-: `license_verified`, `license_uniqueness_key` (HMAC), `license_expiry`, `license_categories`, `monthly_grams_by_category` |
| 011 | `treatment_journal` (יומן פרטי) |
| 012 | extends `user_reviews`: journal_entry_id (FK), is_seed |
| 013 | `review_interactions` ("עזר לי"), `review_comments` (תגובות חד-רמתיות) |
| 014 | `terms_acceptances` (היסטוריית אישורי תנאי שימוש לפי גרסה) |

---

## מערכת הקהילה (C1–C6)

### C1 — אימות רישיון
OCR של רישיון IMC דרך Tesseract.js ו/או Anthropic Vision API. מספר הרישיון המקורי **לא נכתב לעולם ל-DB** — נשמר רק `HMAC-SHA256(license_number, SERVER_HMAC_SECRET)` לבדיקת ייחודיות, תאריך תפוגה, וקטגוריות T/C.

### C2 — יומן טיפול פרטי
`treatment_journal` — רשומות אישיות לפי בחירת המשתמש. `notes` ו-`side_effects_other` נשארים פרטיים לחלוטין: אינם מועתקים לשום דיווח ציבורי בשום תנאי — הפרדה מבנית ב-`api/lib/journalToReview.js`.

### C3 — שיתוף לקהילה
הפקת עותק אנונימי מרשומת יומן לטבלת `user_reviews`. הרשומה המקורית נשארת פרטית. הדיווח הציבורי אינו מכיל שם, user_id, או כל פרט מזהה.

### C4 — פיד + תגובות
פיד מדורג לפי `trust_weight` — לא לפי engagement. תגובות חד-רמתיות, ניקוי XSS בכתיבה, דחיית תגובות מעל 1,000 תווים עם הודעה ברורה (לא חיתוך שקט). "עזר לי" — toggle עם optimistic update + rollback.

### C5 — השפעה
`GET /api/impact`: aggregate של כמה מטופלים סימנו "עזר לי" על הדיווחים שלך. ניטרלי לכיוון — אין streak, אין badge, אין לחץ. endpoint נפרד מ-`GET /journal/treatment` (גבול פרטי/ציבורי).

### C6 — שער תנאי שימוש
חסימה מלאה בכניסה לאחר login. Scroll-to-enable: checkbox נעול עד גלילה לתחתית הטקסט. `TERMS_VERSION` וגוף התנאים מגיעים מהשרת בלבד (`api/lib/termsConfig.js`) — הלקוח אינו יכול לזייף "אישרתי גרסה X". Fail-closed: שגיאת רשת → ה-gate נשאר סגור.

---

## התקנה

### דרישות מקדימות

- Node.js ≥ 18
- Docker (להרצת PostgreSQL 16 + pgvector)

### שלבים

```bash
# 1. Clone + install
git clone <repo-url>
cd cannamatch
npm install

# 2. הכן .env (ראה טבלת משתני סביבה)
cp .env.example .env
# ערוך .env — JWT_SECRET ו-SERVER_HMAC_SECRET הם חובה

# 3. הפעל PostgreSQL
npm run db:up           # docker compose up -d

# 4. סכמה + מיגרציות + seed — פקודה אחת
npm run db:setup
# = db:init (schema.sql + migration_v2.sql + זריעת זנים) && db:migrate (004–014, מדלג על מה שרץ)

# 5. הרץ פיתוח
npm run dev:full        # Express (8787) + Vite (5173) במקביל
```

### משתני סביבה

#### חובה (השרת לא יקום ב-production ללא אלה)

| משתנה | תיאור |
|-------|-------|
| `JWT_SECRET` | מפתח חתימת JWT. גנרציה: `node -e "require('crypto').randomBytes(64).toString('hex')"` |
| `SERVER_HMAC_SECRET` | מפתח HMAC לייחודיות רישיונות. **אסור לאפס בפרודקשן** — ישבור את כל בדיקות הייחודיות הקיימות. גנרציה: `node -e "require('crypto').randomBytes(32).toString('hex')"` |
| `PRODUCTION_ORIGIN` | דומיין הפרודקשן (למשל `https://cannamatch.co.il`) — חובה כשמשתנה `NODE_ENV=production` |

#### אופציונלי עם ברירת מחדל

| משתנה | ברירת מחדל | תיאור |
|-------|-----------|-------|
| `DATABASE_URL` | `postgresql://cannamatch:cannamatch@localhost:5432/cannamatch` | חיבור PostgreSQL |
| `PORT` | `8787` | פורט שרת Express |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `REDIS_URL` | `redis://localhost:6379` | cache (Redis אופציונלי — אם לא זמין, cache מושבת) |

#### אופציונלי לפיצ'רים ספציפיים

| משתנה | פיצ'ר |
|-------|-------|
| `ANTHROPIC_API_KEY` | OCR רישיון IMC דרך Anthropic Vision |
| `GROQ_API_KEY` | מודל שפה חלופי (Groq) |
| `GOOGLE_PLACES_KEY` | סנכרון שעות פתיחה של בתי מרקחת (job יומי) |
| `BRAVE_SEARCH_KEY` | חיפוש רשת דרך Brave |
| `GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX` | Google Custom Search |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | OTP במייל |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | OTP ב-SMS |

---

## בדיקות

```bash
npm test              # vitest run — כל ה-test suites
npm run test:watch    # vitest במצב watch
```

Test files: `api/lib/__tests__/`

כל שלב פיתוח מלווה בבדיקות. הבדיקות מריצות שרת Express אמיתי עם `pool.query` ממוק — ה-SQL האמיתי נבחן. גישת `assertFitsSchema` מוודאת שנתונים עוברים את ה-CHECK constraints לפני שה-test מסתיים.

---

## API — נקודות קצה עיקריות

```
# אימות
POST /api/auth/send-otp
POST /api/auth/verify-otp
POST /api/auth/onboarding

# פרופיל DNA
GET  /api/dna/:userId
PUT  /api/dna/:userId
POST /api/dna/:userId/checkin

# זנים
GET  /api/strains
GET  /api/inventory

# תפריט OCR
POST /api/parse-menu
POST /api/fetch-menu

# קהילה — יומן
POST   /api/journal/treatment
GET    /api/journal/treatment
PATCH  /api/journal/treatment/:id
POST   /api/journal/treatment/:id/share
DELETE /api/journal/treatment/:id/share

# קהילה — פיד
GET  /api/feed
POST /api/feed/:id/help
GET  /api/feed/:id/comments
POST /api/feed/:id/comments

# קהילה — השפעה + תנאים
GET  /api/impact
GET  /api/terms/status
POST /api/terms/accept

# בתי מרקחת + basket
GET  /api/pharmacies
POST /api/basket/plan

# כלים
GET  /api/health
GET  /api/community-stats
```

---

## פריסה לפרודקשן (URL ציבורי ב-HTTPS)

המטרה: כתובת אחת ב-HTTPS שנפתחת מכל טלפון בסלולר וניתנת לשיתוף בלינק. הארכיטקטורה: **מקור יחיד** — שרת ה-Node (`api/server.js`) מגיש גם את ה-API וגם את ה-React build (`dist/`) מאותו דומיין, כך שקריאות `/api` היחסיות והמצלמה (`getUserMedia`) נשארות same-origin. המסד הוא Postgres מנוהל נפרד.

> **מה שאתה (האדם) עושה ידנית — אל תיתן ל-AI:** פתיחת חשבונות, הזנת כרטיס אשראי, הדבקת סודות אמיתיים בלוח הסביבה של המארח. הסודות נוצרים אצלך ולא נכנסים ל-Git.

### שלב 1 — מסד נתונים מנוהל (Postgres)
1. פתח Postgres מנוהל אצל ספק לבחירתך (Render PostgreSQL / Railway / Neon / Supabase).
2. ודא שהתוספים נתמכים: `vector` (pgvector), `pgcrypto`, `pg_trgm`. ב-Neon/Supabase הם זמינים; אם חסר pgvector — בחר ספק שתומך.
3. העתק את ה-`DATABASE_URL` (פורמט `postgresql://USER:PASS@HOST:5432/DB?sslmode=require`).

### שלב 2 — סודות סביבה (נוצרים אצלך, לא ב-Git)
הרץ מקומית וצור ערכים:
```bash
node -e "console.log('JWT_SECRET='+require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('SERVER_HMAC_SECRET='+require('crypto').randomBytes(32).toString('hex'))"
```
**צ׳קליסט משתני סביבה (חובה בפרודקשן — השרת מסרב לעלות בלעדיהם):**

| משתנה | חובה | תיאור |
|---|---|---|
| `NODE_ENV` | ✅ | `production` — מפעיל הגשת SPA + אכיפת CORS + בדיקות fail-fast |
| `JWT_SECRET` | ✅ | חתימת טוקני התחברות |
| `SERVER_HMAC_SECRET` | ✅ | HMAC של מספרי רישיון — **לעולם אל תאפס בפרודקשן** |
| `DATABASE_URL` | ✅ | חיבור ה-Postgres המנוהל |
| `PRODUCTION_ORIGIN` | ✅ | דומיין הפרודקשן המלא (במקור יחיד — אותו דומיין של השירות) |
| `PORT` | ⬜ | לרוב מוזרק ע״י המארח |
| `ANTHROPIC_API_KEY` | ⬜ | לא נדרש למסלול הליבה (OCR/דירוג מקומיים) |

(התבנית המלאה: `.env.example`.)

### שלב 3 — הרצת מיגרציות מול המסד המנוהל
מהמחשב שלך, עם `DATABASE_URL` של הפרודקשן:
```bash
# Bash / macOS / Linux
DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB?sslmode=require" npm run db:migrate

# PowerShell
$env:DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB?sslmode=require"; npm run db:migrate
```
`db:migrate` (api/db/migrate.js) רץ אידמפוטנטית — מריץ רק מיגרציות שטרם הוחלו, עוקב בטבלת `schema_migrations`. אופציונלי: `npm run db:seed` לזריעת זנים.

### שלב 4 — פריסת השירות (frontend + API במקור אחד)
ה-`Dockerfile` בונה את ה-React (`vite build`) ומריץ `node api/server.js` שמגיש גם את `dist/` וגם את `/api`.

**Render (דוגמה):**
1. New → **Web Service** → חבר את ריפו ה-GitHub.
2. Environment: **Docker** (משתמש ב-`Dockerfile` הקיים).
3. הוסף את משתני הסביבה משלב 2. הגדר `PRODUCTION_ORIGIN` ל-URL שהמארח נותן (למשל `https://cannamatch.onrender.com`).
4. Deploy. המארח מספק HTTPS אוטומטית.

**Railway / Fly.io:** אותו עיקרון — Docker deploy + אותם משתני סביבה.

חלופה (split): frontend ב-Vercel (`vercel.json` קיים) + API נפרד — דורש להצביע את ה-frontend ל-base URL של ה-API ולהתאים CORS. מסלול המקור-היחיד פשוט יותר ומומלץ ל-MVP.

### שלב 5 — אימות אחרי פריסה
- `GET https://<domain>/api/health` → `200`.
- פתח את ה-URL בטלפון בסלולר — האפליקציה נטענת ב-HTTPS.
- **מצלמה:** "צלם עכשיו" עובד רק ב-HTTPS (או localhost) — secure context. בפרודקשן זמין אוטומטית.
- **Service worker / PWA:** `manifest.webmanifest` + `sw.js` נרשמים ב-HTTPS; "הוסף למסך הבית" הופך לזמין. ה-SW לעולם לא מטמן `/api` (auth/דירוג נשארים חיים).

### הערות
- אל תקבע סודות בקוד. אל תעלה `.env` (ב-`.gitignore`).
- בדיקת build מקומית לפני פריסה: `npm run build` ואז `npm run preview`. ב-localhost המצלמה וה-SW עובדים (localhost = secure context).
- מ job ה-scraper (קטלוג) רץ ב-cron בתוך אותו שרת; אינו דורש הגדרה נוספת.

---

## פרטיות ובטיחות

- מספר הרישיון המקורי ומספר ת"ז **לא נכתבים לעולם ל-DB** — נשמר רק HMAC ותוצאת האימות.
- `notes` ו-`side_effects_other` ביומן הפרטי **לא מועתקים לדיווח הציבורי** בשום תנאי — הפרדה מבנית ב-`journalToReview.js`.
- דיווחים ציבוריים אנונימיים: אין שם, אין `user_id`, אין כל פרט מזהה ב-response.
- `user_id` תמיד מה-session (JWT), אף פעם לא מה-request body.
- `SERVER_HMAC_SECRET` אסור שיופיע ב-bundle, ב-log, או שיועבר ללקוח.

---

## סטטוס ומה עוד נשאר

### מה בנוי ופועל

- מנוע ניקוד 3-שכבות + kill-switch + evidence factors
- מערכת קהילה מלאה C1–C6 (אימות רישיון → יומן → שיתוף → פיד → השפעה → שער תנאים)
- OCR רישיון + HMAC privacy layer
- basket planner עם אכיפת קוטה T/C
- סנכרון תפריט ביה"מ + COA batch ingestion (jobs יומיים)

### ממתין לפני go-live

| פריט | מה נדרש |
|------|---------|
| ניסוח סופי של תנאי השימוש | החלפת `TERMS_TEXT` ב-`api/lib/termsConfig.js` + העלאת `TERMS_VERSION` ב-1 |
| כתובת ליצירת קשר | מילוי `[כתובת ליצירת קשר]` בסעיף 11 של תנאי השימוש |
| רשימת מילים חסומות בתגובות | מילוי stub ב-`api/lib/commentFilterConfig.js` |
| בדיקות DB ידניות | אימות `idx_users_license_uniqueness_key` קיים; רישיון ריק = NULL לא `''` |

---

## רישיון

אין קובץ `LICENSE` ב-repo זה. כל הזכויות שמורות.

</div>
