/**
 * File:            api/server.js
 * Responsibility:  Express application bootstrap — mounts all route modules,
 *                  applies CORS / JSON middleware, and starts the HTTP listener.
 *                  No LLM SDK is required or initialised at startup.
 * Dependencies:    express, cors, dotenv,
 *                  api/routes/* (auth, dna, catalog, menu, social, journal, products, ai)
 */

import express from "express";
import cors    from "cors";
import dotenv  from "dotenv";

import authRouter     from "./routes/auth.js";
import dnaRouter      from "./routes/dna.js";
import catalogRouter  from "./routes/catalog.js";
import menuRouter     from "./routes/menu.js";
import socialRouter   from "./routes/social.js";
import journalRouter  from "./routes/journal.js";
import productsRouter from "./routes/products.js";
import aiRouter       from "./routes/ai.js";

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── Route domains ─────────────────────────────────────────────
// auth.js  defines /send-otp, /verify-otp           → /api/auth/*
app.use("/api/auth",    authRouter);

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

// ai.js    defines /health, /claude, /zemach-chat   → /api/health, /api/claude, /api/zemach-chat
app.use("/api",         aiRouter);

app.listen(PORT, () => {
  console.log(`🌿 שרת קנאמאצ׳ פועל על http://localhost:${PORT}`);
});
