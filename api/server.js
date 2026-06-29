/**
 * File:            api/server.js
 * Responsibility:  Express application bootstrap — mounts all route modules,
 *                  applies CORS / JSON middleware, and starts the HTTP listener.
 *                  No LLM SDK is required or initialised at startup.
 * Dependencies:    express, cors, dotenv,
 *                  api/routes/* (auth, dna, catalog, menu, social, journal, products, ai)
 */

import express    from "express";
import cors       from "cors";
import dotenv     from "dotenv";
import cron       from "node-cron";
import rateLimit  from "express-rate-limit";

import authRouter       from "./routes/auth.js";
import adminRouter      from "./routes/admin.js";
import dnaRouter        from "./routes/dna.js";
import catalogRouter    from "./routes/catalog.js";
import menuRouter       from "./routes/menu.js";
import socialRouter     from "./routes/social.js";
import journalRouter    from "./routes/journal.js";
import productsRouter   from "./routes/products.js";
import aiRouter         from "./routes/ai.js";
import pharmaciesRouter from "./routes/pharmacies.js";
import basketRouter     from "./routes/basket.js";
import feedRouter       from "./routes/feed.js";
import impactRouter     from "./routes/impact.js";
import termsRouter      from "./routes/terms.js";
import { runDailySync }           from "./jobs/dailySync.js";
import { runBatchIngestJob }      from "./jobs/batchIngestJob.js";
import { runStrainDetectionJob }  from "./jobs/strainDetectionJob.js";
import { bootstrapAdmin }         from "./lib/adminBootstrap.js";

dotenv.config();

// Fail fast if JWT_SECRET is not set in production.
// In development the fallback string is used but warns at startup.
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET env var is not set. Refusing to start in production.');
    process.exit(1);
  } else {
    console.warn('[WARN] JWT_SECRET not set — using insecure dev fallback. Set it in .env before deploying.');
  }
}

// Fail fast if SERVER_HMAC_SECRET is missing — license uniqueness checks will not work.
// Resetting this value in production invalidates all existing uniqueness keys.
if (!process.env.SERVER_HMAC_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] SERVER_HMAC_SECRET env var is not set. Refusing to start in production.');
    process.exit(1);
  } else {
    console.warn('[WARN] SERVER_HMAC_SECRET not set — license uniqueness checks will throw. Set it in .env before deploying.');
  }
}

// Fail fast if PRODUCTION_ORIGIN is missing in production — CORS cannot be wildcard.
if (process.env.NODE_ENV === 'production' && !process.env.PRODUCTION_ORIGIN) {
  console.error('[FATAL] PRODUCTION_ORIGIN must be set before production deploy — CORS cannot be wildcard in production.');
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 8787;

// In production: restrict to the declared origin (set PRODUCTION_ORIGIN in env).
// In development: allow all origins so local tooling works without config.
const corsOrigin = process.env.NODE_ENV === 'production'
  ? process.env.PRODUCTION_ORIGIN
  : true;

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// ── Rate limiters ─────────────────────────────────────────────
// Auth (OTP): strict — 5 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "יותר מדי ניסיונות אימות — נסו שוב בעוד 15 דקות." } },
});

// Catalog / strains: 200 per 15 minutes — allows browsing, blocks scraping
const catalogLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "הגעתם למגבלת הבקשות — נסו שוב בעוד כמה דקות." } },
});

// Reviews / community: 20 per hour — prevents spam / data poisoning
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "הגעתם למגבלת הדיווחים לשעה." } },
});

// General API: broad safety net — 500 per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "יותר מדי בקשות — נסו שוב בעוד כמה דקות." } },
});

app.use("/api", generalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/strains", catalogLimiter);
app.use("/api/reviews", reviewLimiter);
app.use("/api/social", reviewLimiter);

// ── Route domains ─────────────────────────────────────────────
// pharmacies.js — must mount BEFORE catalogRouter so /:id/menu etc. take priority
// over the plain GET /pharmacies in catalog.js (which becomes fallback dead code)
app.use("/api/pharmacies", pharmaciesRouter);

// auth.js  defines /send-otp, /verify-otp, /admin-login  → /api/auth/*
app.use("/api/auth",    authRouter);

// admin.js — all routes require role='admin' in JWT (enforced inside the router)
app.use("/api/admin",   adminRouter);

// dna.js   defines /dna/:userId, /dna/:id/checkin,  → /api/dna/... and /api/match/...
//                   /match/:userId
app.use("/api",         dnaRouter);

// catalog.js defines /strains, /inventory,          → /api/strains, /api/inventory, …
//               /pharmacies, /pharmacy-stock/:id
app.use("/api",         catalogRouter);

// menu.js  defines /parse-menu, /fetch-menu         → /api/parse-menu, /api/fetch-menu
app.use("/api",         menuRouter);

// social.js defines /social/twins/:id,              → /api/social/twins/:id, …
//                    /social/genetic-twins/:userId,  → /api/social/genetic-twins/:userId
//                    /recommendations/:userId,       → /api/recommendations/:userId
//                    /reviews                        → /api/reviews
app.use("/api",         socialRouter);

// journal.js defines POST /, GET /:userId           → /api/journal (POST), /api/journal/:userId
app.use("/api/journal", journalRouter);

// products.js defines /genetic-equivalents/:id,     → /api/genetic-equivalents/:id
//                     /price-arbitrage/:id           → /api/price-arbitrage/:id
app.use("/api",         productsRouter);

// ai.js    defines /health, /community-stats         → /api/health, /api/community-stats
app.use("/api",         aiRouter);

// basket.js defines /basket/plan                    → /api/basket/plan
app.use("/api",         basketRouter);

// feed.js defines /feed, /feed/:id/help             → /api/feed, /api/feed/:id/help
app.use("/api",         feedRouter);

// impact.js defines /impact                         → /api/impact
app.use("/api",         impactRouter);

// terms.js defines /terms/status, /terms/accept     → /api/terms/*
app.use("/api",         termsRouter);

// ── Daily 09:00 sync job (Asia/Jerusalem) ─────────────────────────────────────
// Refreshes pharmacy list from MOH + Google Places hours if GOOGLE_PLACES_KEY is set.
// pool is not yet available at module load time — delay import until server is up.
let _pool = null;
import('./db.js').then(async ({ pool }) => {
  _pool = pool;

  // Admin bootstrap — idempotent, reads ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD from env.
  // No-op if env vars are not set (production where admin already exists).
  await bootstrapAdmin(pool);

  cron.schedule('0 7 * * *', () => runStrainDetectionJob(_pool), { timezone: 'Asia/Jerusalem' });
  cron.schedule('0 9 * * *', () => runBatchIngestJob(_pool),     { timezone: 'Asia/Jerusalem' });
  cron.schedule('0 10 * * *', () => runDailySync(_pool),          { timezone: 'Asia/Jerusalem' });
  console.log('🕘 COA batch ingestion scheduled for 09:00 (Asia/Jerusalem)');
  console.log('🕙 Pharmacy sync scheduled for 10:00 (Asia/Jerusalem)');
}).catch((err) => {
  // DB not configured — cron still works when pool is null; both jobs guard it
  console.warn('[startup] DB not available — admin bootstrap skipped:', err.message);
  cron.schedule('0 7 * * *', () => runStrainDetectionJob(null), { timezone: 'Asia/Jerusalem' });
  cron.schedule('0 9 * * *', () => runBatchIngestJob(null),     { timezone: 'Asia/Jerusalem' });
  cron.schedule('0 10 * * *', () => runDailySync(null),          { timezone: 'Asia/Jerusalem' });
  console.log('🕘 COA batch ingestion scheduled (no DB)');
});

app.listen(PORT, () => {
  console.log(`🌿 שרת קנאמאצ׳ פועל על http://localhost:${PORT}`);
});
