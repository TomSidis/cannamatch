import { Router }  from "express";
import jwt          from "jsonwebtoken";
import { pool }     from "../db.js";
import {
  OTP_TTL_MIN, MAX_ATTEMPTS,
  generateOtpCode, detectContactChannel, hashOtpCode, verifyOtpCodeHash, dispatchOtp,
} from "../lib/otp.js";
import { buildInitialDNA } from "../lib/onboardingVector.js";

const router     = Router();
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

// In-process throttle: contact → last-sent timestamp.
// Replaced by Redis in production; this guards a single process.
const otpRateLimitMap = new Map();

function issueToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

// ── Input guard ───────────────────────────────────────────────
function validateContact(contact) {
  return typeof contact === "string" && contact.trim().length >= 4;
}

// POST /api/auth/send-otp
router.post("/send-otp", async (req, res) => {
  const { contact } = req.body;
  if (!validateContact(contact)) {
    return res.status(400).json({ error: { message: "כתובת מייל או טלפון לא תקינים." } });
  }
  const normalized = contact.trim().toLowerCase();

  const lastSent = otpRateLimitMap.get(normalized);
  if (lastSent && Date.now() - lastSent < 30_000) {
    return res.status(429).json({ error: { message: "נשלח קוד לאחרונה — נסו שוב בעוד כמה שניות." } });
  }

  try {
    const channel   = detectContactChannel(normalized);
    const code      = generateOtpCode();
    const codeHash  = await hashOtpCode(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000);

    await pool.query(
      `INSERT INTO otp_codes (contact, channel, code_hash, expires_at) VALUES ($1,$2,$3,$4)`,
      [normalized, channel, codeHash, expiresAt],
    );

    const dispatch = await dispatchOtp(normalized, code);
    otpRateLimitMap.set(normalized, Date.now());

    res.json({ sent: true, channel, dev_mode: dispatch.dev === true });
  } catch (err) {
    console.error("send-otp error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בשליחת קוד אימות." } });
  }
});

// POST /api/auth/verify-otp
router.post("/verify-otp", async (req, res) => {
  const { contact, code } = req.body;
  if (!contact || !code) {
    return res.status(400).json({ error: { message: "חסר contact או code." } });
  }
  const normalized = contact.trim().toLowerCase();
  const client     = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [otpRow] } = await client.query(
      `SELECT * FROM otp_codes
       WHERE contact = $1 AND consumed = FALSE AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [normalized],
    );

    if (!otpRow) {
      await client.query("ROLLBACK");
      return res.status(401).json({ error: { message: "הקוד פג תוקף או לא קיים — בקשו קוד חדש." } });
    }
    if (otpRow.attempts >= MAX_ATTEMPTS) {
      await client.query("ROLLBACK");
      return res.status(429).json({ error: { message: "יותר מדי ניסיונות שגויים — בקשו קוד חדש." } });
    }

    const valid = await verifyOtpCodeHash(String(code), otpRow.code_hash);
    if (!valid) {
      await client.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otpRow.id]);
      await client.query("COMMIT");
      return res.status(401).json({ error: { message: "קוד שגוי." } });
    }

    await client.query(`UPDATE otp_codes SET consumed = TRUE WHERE id = $1`, [otpRow.id]);

    const isEmail = otpRow.channel === "email";
    const { rows: [existing] } = await client.query(
      isEmail
        ? `SELECT id FROM users WHERE email = $1`
        : `SELECT id FROM users WHERE phone = $1`,
      [normalized],
    );

    let userId = existing?.id;
    if (!userId) {
      const { rows: [created] } = await client.query(
        isEmail
          ? `INSERT INTO users (email) VALUES ($1) RETURNING id`
          : `INSERT INTO users (phone) VALUES ($1) RETURNING id`,
        [normalized],
      );
      userId = created.id;
    }

    await client.query("COMMIT");
    res.json({ token: issueToken(userId), user: { id: userId, contact: normalized } });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("verify-otp error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת באימות הקוד." } });
  } finally {
    client.release();
  }
});

// POST /api/auth/onboarding
// Authenticated. Takes 5-stage wizard payload, atomically writes the initial
// DNA profile + sets thc_tolerance on the users row.
router.post("/onboarding", async (req, res) => {
  const authHeader = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!authHeader) {
    return res.status(401).json({ error: { message: "אימות נדרש." } });
  }

  let userId;
  try {
    const decoded = jwt.verify(authHeader, JWT_SECRET);
    userId = decoded.sub;
  } catch {
    return res.status(401).json({ error: { message: "טוקן לא תקין." } });
  }

  const { payload } = req.body || {};
  if (!payload || !Array.isArray(payload.indications)) {
    return res.status(400).json({ error: { message: "פורמט פייקון לא תקין." } });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dna = buildInitialDNA(payload);

    await client.query(
      `INSERT INTO user_dna_profiles (user_id, profile)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET profile = $2, updated_at = now()`,
      [userId, JSON.stringify(dna)],
    );

    const tolerance = ["new", "medium", "veteran"].includes(payload.thcTolerance)
      ? payload.thcTolerance
      : "new";

    await client.query(
      `UPDATE users SET thc_tolerance = $1 WHERE id = $2`,
      [tolerance, userId],
    );

    await client.query("COMMIT");

    res.json({
      success:      true,
      dna,
      killSwitches: dna.trigger_terpenes,
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("onboarding error:", err);
    res.status(500).json({ error: { message: "שגיאת שרת בשמירת הפרופיל." } });
  } finally {
    client.release();
  }
});

export default router;
