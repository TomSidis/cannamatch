import { Router }  from "express";
import multer      from "multer";
import { requireRole }   from "../middleware/requireRole.js";
import { parseCOAFile }  from "../lib/coa/parseCOA.js";
import { ingestBatch, runFullIngestion } from "../lib/batchIngestor.js";

const router = Router();

// Every route on this router requires role='admin'.
// requireRole() verifies the JWT AND checks payload.role.
router.use(requireRole("admin"));

// ── File upload config: memory storage, 20 MB limit ──────────────────────────
// Accepts: PDF, image, CSV, plain text COA uploads.
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter(_req, file, cb) {
    const allowed = ['application/pdf', 'text/csv', 'text/plain',
                     'image/png', 'image/jpeg', 'image/jpg', 'image/tiff', 'image/bmp'];
    cb(null, allowed.includes(file.mimetype) || file.mimetype.startsWith('image/'));
  },
});

// ── Health check ──────────────────────────────────────────────────────────────
router.get("/health", (req, res) => {
  res.json({ ok: true, userId: req.userId, role: req.role });
});

// ── Users ─────────────────────────────────────────────────────────────────────
router.get("/users", async (_req, res) => {
  try {
    const { pool } = await import("../db.js");
    const { rows } = await pool.query(
      `SELECT id, email, phone, role, created_at FROM users ORDER BY created_at DESC LIMIT 100`,
    );
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

router.post("/users/:id/role", async (req, res) => {
  const { id }   = req.params;
  const { role } = req.body ?? {};

  if (!["admin", "user", "pharmacy"].includes(role)) {
    return res.status(400).json({ error: { message: "role חייב להיות: admin | user | pharmacy" } });
  }
  try {
    const { pool } = await import("../db.js");
    const { rowCount } = await pool.query(
      `UPDATE users SET role = $1 WHERE id = $2`, [role, id],
    );
    if (rowCount === 0) return res.status(404).json({ error: { message: "משתמש לא נמצא." } });
    res.json({ ok: true, id, role });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// ── POST /api/admin/upload-coa ────────────────────────────────────────────────
// Manual-upload fallback (Phase 3): drag a COA file → same parseCOA → same DB store.
// Used when the scraper couldn't reach a manufacturer's site.
// This endpoint is the authoritative manual fallback and MUST remain admin-only.
router.post("/upload-coa", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: { message: "קובץ COA לא צורף." } });
  }

  const manufacturerId = req.body.manufacturer_id || "unknown";
  const { buffer, mimetype, originalname } = req.file;

  let pool = null;
  try { ({ pool } = await import("../db.js")); } catch { /* no DB in test env */ }

  // Parse COA (OCR → extract text → parseCOA)
  let parseResult;
  try {
    parseResult = await parseCOAFile(buffer, mimetype, manufacturerId, originalname);
  } catch (err) {
    return res.status(422).json({ error: { message: `שגיאה בעיבוד קובץ: ${err.message}` } });
  }

  const { batches, warnings } = parseResult;

  if (batches.length === 0) {
    return res.status(422).json({
      error:    { message: "לא נמצאו אצוות תקינות בקובץ." },
      warnings,
    });
  }

  // Ingest each batch into grow_batch table
  const ingested = [];
  const errors   = [];

  for (const parsed of batches) {
    try {
      await ingestBatch(pool, parsed, manufacturerId);
      ingested.push(parsed.batchNo);
    } catch (err) {
      errors.push({ batchNo: parsed.batchNo, error: err.message });
    }
  }

  res.json({
    ingested: ingested.length,
    batchNos: ingested,
    warnings,
    errors,
  });
});

// ── GET /api/admin/ingest-report ──────────────────────────────────────────────
// Morning report: yesterday's scrape results + which manufacturers failed.
// Failed manufacturers each get a "upload manually" link in the admin UI.
router.get("/ingest-report", async (_req, res) => {
  try {
    const { pool } = await import("../db.js");

    // Last scrape run
    const { rows: [latestRun] } = await pool.query(
      `SELECT * FROM scrape_run_log ORDER BY run_at DESC LIMIT 1`,
    );

    // Current manufacturer statuses
    const { rows: manufacturers } = await pool.query(
      `SELECT id, display_name, scrape_status, last_scraped, last_error
         FROM manufacturer_registry ORDER BY display_name`,
    );

    res.json({ latestRun: latestRun ?? null, manufacturers });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// ── POST /api/admin/ingest-now ────────────────────────────────────────────────
// Trigger a manual immediate ingestion run (for testing without waiting for 08:00).
router.post("/ingest-now", async (_req, res) => {
  let pool = null;
  try { ({ pool } = await import("../db.js")); } catch { /* no DB */ }

  try {
    const result = await runFullIngestion(pool);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// ── Cache invalidation ────────────────────────────────────────────────────────
router.post("/cache/invalidate", async (_req, res) => {
  try {
    const { invalidateStrains } = await import("../middleware/cache.js");
    const n = await invalidateStrains();
    res.json({ invalidated: n });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
