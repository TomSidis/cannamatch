/**
 * adminBootstrap — seeds the first admin user from environment variables.
 *
 * SECURITY RULES:
 *   - Reads ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD from env ONLY.
 *   - Never logs the password or its hash.
 *   - Never commits credentials to source control — .env is git-ignored.
 *   - Skips silently if either env var is missing (safe in production
 *     where the admin already exists and no seed is needed).
 *   - Uses ON CONFLICT to be idempotent: re-running never duplicates the user
 *     and never overwrites an existing password (protects deliberate rotation).
 *
 * Call once at server startup — after the DB pool is ready.
 */

import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12; // 12 = ~250ms on commodity hardware — adequate cost

export async function bootstrapAdmin(pool) {
  const email    = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_INITIAL_PASSWORD;

  if (!email || !password) {
    // Not configured — skip. Normal for production where admin already exists.
    return;
  }

  // Validate that the env-provided email looks sane before touching the DB.
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    console.warn("[adminBootstrap] ADMIN_EMAIL looks invalid — skipping.");
    return;
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    await pool.query(
      `INSERT INTO users (email, role, password_hash)
       VALUES ($1, 'admin', $2)
       ON CONFLICT (email) DO UPDATE
         SET role         = 'admin',
             -- only write the hash if the row has no hash yet (protects deliberate rotation)
             password_hash = CASE
               WHEN users.password_hash IS NULL THEN EXCLUDED.password_hash
               ELSE users.password_hash
             END`,
      [email, hash],
    );

    console.log(`[adminBootstrap] Admin ready: ${email}`);
  } catch (err) {
    // Log the error but never surface the password or hash in any message.
    console.error("[adminBootstrap] Failed to seed admin:", err.message);
  }
}
