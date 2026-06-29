import { Router }  from "express";
import jwt          from "jsonwebtoken";
import bcrypt       from "bcryptjs";
import { pool }     from "../db.js";
import {
  OTP_TTL_MIN, MAX_ATTEMPTS,
  generateOtpCode, detectContactChannel, hashOtpCode, verifyOtpCodeHash, dispatchOtp,
} from "../lib/otp.js";
import { buildInitialDNA }       from "../lib/onboardingVector.js";
import { verifyLicensePayload }  from "../lib/licenseVerify.js";

const router     = Router();

// Require JWT_SECRET from env — never fall back to a hardcoded string in this module.
// adminBootstrap.js warns loudly if it's missing; here we just use it.
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production-set-JWT_SECRET-env";

// In-process throttle: contact → last-sent timestamp.
// Replaced by Redis in production; this guards a single process.
const otpRateLimitMap = new Map();

// role is included in the JWT so requireRole() can validate without a DB hit.
function issueToken(userId, role = "user", expiresIn = "30d") {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn });
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
        ? `SELECT id, role FROM users WHERE email = $1`
        : `SELECT id, role FROM users WHERE phone = $1`,
      [normalized],
    );

    let userId = existing?.id;
    let role   = existing?.role ?? "user";

    if (!userId) {
      const { rows: [created] } = await client.query(
        isEmail
          ? `INSERT INTO users (email) VALUES ($1) RETURNING id, role`
          : `INSERT INTO users (phone) VALUES ($1) RETURNING id, role`,
        [normalized],
      );
      userId = created.id;
      role   = created.role ?? "user";
    }

    await client.query("COMMIT");
    res.json({ token: issueToken(userId, role), user: { id: userId, contact: normalized, role } });
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

// POST /api/auth/verify-license
// Authenticated. Accepts OCR-extracted license fields, derives uniqueness key server-side,
// stores only the 5 privacy-safe fields. Raw licenseNumber is never written anywhere.
// Used by: onboarding wizard (Stage 0) AND community entry gate — same endpoint, same logic.
router.post("/verify-license", async (req, res) => {
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

  // Destructure raw OCR fields — licenseNumber and idNumber (ת"ז) are in scope only until
  // verifyLicensePayload returns. Neither is logged, echoed in responses, or persisted.
  const { licenseNumber, idNumber, expiry, categories, gramsByCategory } = req.body || {};

  if (!licenseNumber || typeof licenseNumber !== "string" || !licenseNumber.trim()) {
    return res.status(400).json({ error: { message: "מספר רישיון חסר." } });
  }

  // In-memory verification — derives the 5 safe fields. licenseNumber and idNumber
  // enter verifyLicensePayload and are immediately discarded; neither is in the return value.
  let verified;
  try {
    verified = verifyLicensePayload({ licenseNumber, idNumber, expiry, categories, gramsByCategory });
  } catch (err) {
    // Raw fields intentionally absent from this log line.
    console.error("verify-license: payload validation failed:", err.message);
    return res.status(400).json({ error: { message: "רישיון לא תקין — בדוק את הנתונים." } });
  }
  // licenseNumber and idNumber are no longer referenced from this point.

  const { license_uniqueness_key, license_expiry, license_categories, monthly_grams_by_category } = verified;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE users SET
         license_verified          = true,
         license_uniqueness_key    = $1,
         license_expiry            = $2,
         license_categories        = $3,
         monthly_grams_by_category = $4
       WHERE id = $5`,
      [
        license_uniqueness_key,
        license_expiry,
        license_categories,
        JSON.stringify(monthly_grams_by_category),
        userId,
      ],
    );

    await client.query("COMMIT");

    res.json({
      verified:       true,
      expiry:         license_expiry,
      categories:     license_categories,
      gramsByCategory: monthly_grams_by_category,
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}

    // 23505 = PostgreSQL unique_violation — another user already registered this license.
    // Logged as an anomaly signal (userId only — no raw license data).
    if (err.code === "23505") {
      console.warn("[anomaly] duplicate-license-attempt userId=%s", userId);
      return res.status(409).json({ error: { message: "רישיון זה כבר רשום במערכת." } });
    }

    // Raw input fields are intentionally absent from this log line.
    console.error("verify-license: db error:", err.message);
    res.status(500).json({ error: { message: "שגיאת שרת באימות הרישיון." } });
  } finally {
    client.release();
  }
});

// POST /api/auth/admin-login
// Password-based login for admin users only.
// Regular users authenticate via OTP — this endpoint is intentionally admin-only.
router.post("/admin-login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: { message: "חסרים שדות: email, password." } });
  }

  let client;
  try {
    client = await pool.connect();
    const { rows: [user] } = await client.query(
      `SELECT id, role, password_hash FROM users WHERE email = $1 AND role = 'admin'`,
      [String(email).toLowerCase().trim()],
    );

    // Deliberate: same error for "user not found" vs "wrong password" — no user enumeration.
    if (!user?.password_hash) {
      return res.status(401).json({ error: { message: "אימות נכשל." } });
    }

    const valid = await bcrypt.compare(String(password), user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: { message: "אימות נכשל." } });
    }

    // Admin sessions are shorter-lived (8h) than OTP user tokens (30d).
    const token = issueToken(user.id, user.role, "8h");
    res.json({ token, role: user.role });
  } catch (err) {
    console.error("admin-login error:", err.message);
    res.status(500).json({ error: { message: "שגיאת שרת." } });
  } finally {
    client?.release();
  }
});

// POST /api/auth/signup
// Email + password registration for regular users. Stores a bcrypt hash, never plaintext.
// On success returns a 30d session token — the F0 guard routes onward from there.
router.post("/signup", async (req, res) => {
  const { email, password } = req.body ?? {};
  const normalized = String(email ?? "").toLowerCase().trim();

  if (!/\S+@\S+\.\S+/.test(normalized)) {
    return res.status(400).json({ error: { message: "כתובת המייל אינה תקינה." } });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: { message: "הסיסמה חייבת להכיל לפחות 8 תווים." } });
  }

  try {
    const { rows: existing } = await pool.query(`SELECT id FROM users WHERE email = $1`, [normalized]);
    if (existing.length) {
      return res.status(409).json({ error: { message: "כתובת המייל כבר רשומה — נסו להתחבר." } });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const { rows: [created] } = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, role`,
      [normalized, password_hash],
    );

    return res.json({
      token: issueToken(created.id, created.role),
      user:  { id: created.id, email: normalized, role: created.role },
    });
  } catch (err) {
    // 23505 = unique_violation — lost a race against a concurrent signup with the same email.
    if (err.code === "23505") {
      return res.status(409).json({ error: { message: "כתובת המייל כבר רשומה — נסו להתחבר." } });
    }
    console.error("signup error:", err.message);
    return res.status(500).json({ error: { message: "שגיאת שרת בהרשמה." } });
  }
});

// Precomputed bcrypt hash of a throwaway string. When the email is not found we still run
// bcrypt.compare against this so response timing does not reveal whether an email exists.
// The user list is cannabis patients — email-existence must not be probeable.
const DUMMY_HASH = bcrypt.hashSync("cannamatch-login-timing-dummy", 12);

// POST /api/auth/login
// Email + password login. "email not found" and "wrong password" return the IDENTICAL
// message and status (401) — deliberate anti-enumeration: an attacker cannot tell which
// emails are registered. Timing is equalized via DUMMY_HASH above.
router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  const normalized = String(email ?? "").toLowerCase().trim();

  if (!normalized || typeof password !== "string" || !password) {
    return res.status(400).json({ error: { message: "חסרים מייל או סיסמה." } });
  }

  try {
    const { rows: [user] } = await pool.query(
      `SELECT id, role, password_hash FROM users WHERE email = $1`,
      [normalized],
    );

    // Always run a compare (real hash or dummy) so the no-such-email and wrong-password
    // paths take the same time and return the same response.
    const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !user.password_hash || !valid) {
      return res.status(401).json({ error: { message: "אימייל או סיסמה שגויים" } });
    }

    return res.json({
      token: issueToken(user.id, user.role),
      user:  { id: user.id, email: normalized, role: user.role },
    });
  } catch (err) {
    console.error("login error:", err.message);
    return res.status(500).json({ error: { message: "שגיאת שרת בכניסה." } });
  }
});

export default router;
