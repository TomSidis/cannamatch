import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://cannamatch:cannamatch@localhost:5432/cannamatch",
  max:                    20,   // max concurrent DB connections
  idleTimeoutMillis:      30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle:        true,
});

// Surface pool-level errors so they don't crash the process silently
pool.on("error", (err) => {
  console.error("pg pool unexpected error:", err.message);
});
