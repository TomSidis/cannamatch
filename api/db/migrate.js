/**
 * migrate.js — runs all pending migrations from api/db/migrations/ in order.
 *
 * Tracks applied migrations in the `schema_migrations` table (created on first run).
 * Safe to run multiple times — already-applied migrations are skipped.
 *
 * Usage: node api/db/migrate.js
 *        npm run migrate
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function main() {
  const client = await pool.connect();
  try {
    // Tracking table — idempotent, safe on every run.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Collect all .sql files, sort numerically by the leading number (004, 005, ...).
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith(".sql"))
      .sort((a, b) => {
        const numA = parseInt(a.match(/^(\d+)/)?.[1] ?? "0", 10);
        const numB = parseInt(b.match(/^(\d+)/)?.[1] ?? "0", 10);
        return numA - numB;
      });

    if (files.length === 0) {
      console.log("ℹ️  No migration files found in", MIGRATIONS_DIR);
      return;
    }

    // Fetch already-applied migrations.
    const { rows } = await client.query("SELECT filename FROM schema_migrations");
    const applied  = new Set(rows.map(r => r.filename));

    let ran = 0;
    for (const filename of files) {
      if (applied.has(filename)) {
        console.log(`  ✓ skip  ${filename}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");
        console.log(`  ✅ ran   ${filename}`);
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ❌ FAILED ${filename}:`, err.message);
        process.exit(1);
      }
    }

    if (ran === 0) {
      console.log("✅ All migrations already applied — nothing to do.");
    } else {
      console.log(`\n✅ ${ran} migration(s) applied successfully.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Migration runner error:", err.message);
  process.exit(1);
});
