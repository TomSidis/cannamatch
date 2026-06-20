// Redis cache middleware for GET /api/strains and POST /api/parse-menu
// TTL: 24h for strain lists, 24h for menu parses (keyed by content hash)
// Requires: npm install ioredis (optional dep — degrades gracefully when Redis absent)

import crypto from "crypto";

let redis = null;

async function getRedisClient() {
  if (redis) return redis;
  try {
    const { default: Redis } = await import("ioredis");
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      lazyConnect:         true,
      enableOfflineQueue:  false,
      connectTimeout:      2000,
      maxRetriesPerRequest: 1,
    });
    redis.on("error", (e) => {
      // Demote to a one-time warn so logs aren't flooded when Redis is absent
      if (!redis._warnedOnce) { console.warn("Redis unavailable, caching disabled:", e.message); redis._warnedOnce = true; }
    });
    await redis.connect();
    return redis;
  } catch {
    redis = null;
    return null;
  }
}

const TTL_STRAINS = 60 * 60 * 24;       // 24h — strain catalog changes rarely
const TTL_MENU    = 60 * 60 * 24;       // 24h — same image → same parse result
const TTL_MISS    = 60 * 5;             // 5m  — negative cache (no match found)

function computeShortHash(data) {
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 32);
}

// Build a deterministic cache key for GET /api/strains
function buildStrainsCacheKey(query) {
  const { type = "", q = "", user_id = "", limit = 100 } = query;
  // user_id is included because scoreAll output depends on the profile
  return `cm:strains:${computeShortHash(`${type}|${q}|${user_id}|${limit}`)}`;
}

// Build a deterministic cache key for POST /api/parse-menu
// Keyed on content, not the full base64 blob (too large to store as key)
function buildMenuCacheKey(body) {
  const { text = "", image_base64 = "", user_id = "" } = body;
  const content = text || image_base64.slice(0, 2048); // use prefix of large blobs
  return `cm:menu:${computeShortHash(`${content}|${user_id}`)}`;
}

// ── strainsCache ─────────────────────────────────────────────
// Usage:  app.get("/api/strains", strainsCache, handler)
export async function strainsCache(req, res, next) {
  const client = await getRedisClient();
  if (!client) return next(); // Redis offline → passthrough

  const key = buildStrainsCacheKey(req.query);
  try {
    const hit = await client.get(key);
    if (hit) {
      res.setHeader("X-Cache", "HIT");
      return res.json(JSON.parse(hit));
    }
  } catch { /* cache read failure is non-fatal */ }

  // Monkey-patch res.json so we can cache the response transparently
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.setHeader("X-Cache", "MISS");
    if (res.statusCode === 200 && body) {
      const ttl = Array.isArray(body) && body.length === 0 ? TTL_MISS : TTL_STRAINS;
      client.set(key, JSON.stringify(body), "EX", ttl).catch(() => {});
    }
    return originalJson(body);
  };
  next();
}

// ── menuCache ────────────────────────────────────────────────
// Usage:  app.post("/api/parse-menu", menuCache, handler)
export async function menuCache(req, res, next) {
  const client = await getRedisClient();
  if (!client) return next();

  // Only cache text-based requests and image requests (not streaming)
  const { text, image_base64 } = req.body || {};
  if (!text && !image_base64) return next();

  const key = buildMenuCacheKey(req.body);
  try {
    const hit = await client.get(key);
    if (hit) {
      res.setHeader("X-Cache", "HIT");
      return res.json(JSON.parse(hit));
    }
  } catch {}

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.setHeader("X-Cache", "MISS");
    if (res.statusCode === 200 && body && !body.db_offline) {
      // Don't cache offline-fallback responses — they contain no real data
      const ttl = body.count === 0 ? TTL_MISS : TTL_MENU;
      client.set(key, JSON.stringify(body), "EX", ttl).catch(() => {});
    }
    return originalJson(body);
  };
  next();
}

// ── Cache invalidation helpers (call from admin routes or cron) ──
export async function invalidateStrains() {
  const client = await getRedisClient();
  if (!client) return 0;
  const keys = await client.keys("cm:strains:*");
  if (keys.length) await client.del(...keys);
  return keys.length;
}

export async function invalidateMenuForUser(userId) {
  const client = await getRedisClient();
  if (!client) return 0;
  // Menu keys include user_id in the hash — we can't pattern-delete exactly,
  // so flush all menu cache when user DNA updates significantly.
  const keys = await client.keys("cm:menu:*");
  if (keys.length) await client.del(...keys);
  return keys.length;
}
