// Production logger — Pino (JSON output, fast, minimal overhead).
// Falls back gracefully: if pino is not installed, uses a structured console shim.
// Usage:
//   import logger from "./utils/logger.js";
//   logger.info({ userId, strainId, event: "ocr_success", names: 12 });
//   logger.warn({ event: "trgm_miss", query: "ViStA" });
//   logger.error({ event: "db_error", err: formatErr(e) });

import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ── Field masks — never log raw PII or sensitive medical data ─────────────
const MASKED = "***";
const MASK_KEYS = new Set([
  "license_number","license_id","id_number","password","token",
  "jwt","authorization","cookie","indication_detail","diagnosis",
]);

function maskPiiFields(obj, depth = 0) {
  if (depth > 4 || obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => maskPiiFields(v, depth + 1));
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      MASK_KEYS.has(k.toLowerCase()) ? MASKED : maskPiiFields(v, depth + 1),
    ])
  );
}

// ── Format an Error for structured logging ────────────────────────────────
export function formatErr(err) {
  if (!(err instanceof Error)) return { message: String(err) };
  return { message: err.message, code: err.code, stack: err.stack?.split("\n").slice(0, 4).join(" ↳ ") };
}

// ── Build the logger ──────────────────────────────────────────────────────
function createStructuredLogger() {
  const base = {
    service: "cannamatch-api",
    env:     process.env.NODE_ENV || "development",
  };

  try {
    const pino = require("pino");
    return pino({
      level:     process.env.LOG_LEVEL || "info",
      base,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        log(obj) { return maskPiiFields(obj); },
      },
      redact: {
        paths:   ["*.password","*.token","*.jwt","*.cookie","*.authorization"],
        censor:  MASKED,
      },
    });
  } catch {
    // Pino not installed — structured console shim
    const levels = { trace:0, debug:1, info:2, warn:3, error:4, fatal:5 };
    const minLevel = levels[process.env.LOG_LEVEL || "info"] ?? 2;
    const log = (level, obj, msg) => {
      if ((levels[level] ?? 0) < minLevel) return;
      const entry = JSON.stringify({
        time: new Date().toISOString(), level, ...base,
        ...(typeof obj === "string" ? { msg: obj } : { ...maskPiiFields(obj), msg: msg ?? obj.msg }),
      });
      (level === "error" || level === "fatal" ? console.error : console.log)(entry);
    };
    return Object.fromEntries(
      Object.keys(levels).map((l) => [l, (obj, msg) => log(l, obj, msg)])
    );
  }
}

const logger = createStructuredLogger();
export default logger;

// ── Usage examples in an Express error handler ────────────────────────────
//
// Example 1: OCR failure rate tracking (attach to parseMenuImageWithAI catch)
//   app.post("/api/parse-menu", async (req, res) => {
//     try {
//       const names = await parseMenuImageWithAI(base64, mediaType);
//       logger.info({ event: "ocr_success", userId: req.userId, nameCount: names.length });
//     } catch (err) {
//       logger.warn({ event: "ocr_failure", userId: req.userId, err: formatErr(err) });
//       // ... existing fallback ...
//     }
//   });
//
// Example 2: trgm miss + global Express error handler
//   async function scoreMenuNames(names, userId) {
//     for (const name of names) {
//       const { rows } = await pool.query(`SELECT ... WHERE s.name % $1`, [name]);
//       if (!rows.length) {
//         logger.warn({ event: "trgm_miss", query: name, userId });
//       }
//     }
//   }
//
//   app.use((err, req, res, next) => {
//     logger.error({
//       event:    "unhandled_error",
//       userId:   req.userId,
//       method:   req.method,
//       path:     req.path,
//       err:      formatErr(err),
//     });
//     res.status(500).json({ error: { message: "שגיאת שרת פנימית" } });
//   });
