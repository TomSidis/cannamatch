// Security middleware for POST /api/claude
// Drop this file in, then wire it in server.js:
//   import { claudeRateLimit, verifySession, validateClaudePayload } from "./security/claudeProxyShield.js";
//   app.post("/api/claude", claudeRateLimit, verifySession, validateClaudePayload, existingHandler);
//
// Required env vars:
//   JWT_SECRET      — for session token verification
//   ALLOWED_MODELS  — comma-separated whitelist, default "claude-sonnet-4-6,claude-haiku-4-5-20251001"

import { rateLimit }  from "express-rate-limit";
import jwt            from "jsonwebtoken";

const JWT_SECRET     = process.env.JWT_SECRET || "change-me-in-production";
const ALLOWED_MODELS = (process.env.ALLOWED_MODELS || "claude-sonnet-4-6,claude-haiku-4-5-20251001")
  .split(",").map((s) => s.trim());

// ── 1. Rate limit — per IP, tight window on the expensive proxy route ─────
export const claudeRateLimit = rateLimit({
  windowMs:        15 * 60 * 1000,
  limit:           100,
  standardHeaders: "draft-7",
  legacyHeaders:   false,
  validate:        false,
  handler: (_req, res) => {
    res.status(429).json({ error: { message: "יותר מדי בקשות — נסה שוב בעוד דקה." } });
  },
});

// ── 2. Session / JWT verification ─────────────────────────────────────────
export function verifySession(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: { message: "נדרשת הזדהות." } });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId    = payload.sub || payload.userId;
    next();
  } catch (err) {
    const msg = err.name === "TokenExpiredError" ? "פג תוקף ההתחברות — יש להתחבר מחדש." : "אסימון לא תקין.";
    res.status(401).json({ error: { message: msg } });
  }
}

// ── 3. Payload validation ─────────────────────────────────────────────────
const INJECTION_PATTERNS = [
  /ignore (previous|all|prior) instructions/i,
  /disregard (your|all) (instructions|rules|guidelines)/i,
  /you are now/i,
  /act as/i,
  /jailbreak/i,
  /DAN mode/i,
  /pretend (you are|to be)/i,
];

const ALLOWED_CONTENT_TYPES = new Set(["text","image","document"]);

export function validateClaudePayload(req, res, next) {
  const body = req.body;

  if (!body.model || !ALLOWED_MODELS.includes(body.model)) {
    return res.status(400).json({
      error: { message: `מודל לא מותר: ${body.model}. מותרים: ${ALLOWED_MODELS.join(", ")}` },
    });
  }

  if (typeof body.max_tokens !== "number" || body.max_tokens > 4096) {
    return res.status(400).json({ error: { message: "max_tokens חייב להיות מספר עד 4096." } });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: { message: "messages חסר או ריק." } });
  }

  if (body.system) {
    return res.status(400).json({ error: { message: "שדה system אינו מותר ממשתמשים." } });
  }

  for (const msg of body.messages) {
    if (msg.role !== "user" && msg.role !== "assistant") {
      return res.status(400).json({ error: { message: `תפקיד הודעה לא חוקי: ${msg.role}` } });
    }

    const blocks = Array.isArray(msg.content) ? msg.content : [{ type: "text", text: msg.content }];
    for (const block of blocks) {
      if (!ALLOWED_CONTENT_TYPES.has(block.type)) {
        return res.status(400).json({ error: { message: `סוג תוכן לא מותר: ${block.type}` } });
      }
      if (block.type === "text") {
        const text = block.text || "";
        for (const pattern of INJECTION_PATTERNS) {
          if (pattern.test(text)) {
            return res.status(400).json({ error: { message: "בקשה נדחתה: תבנית הזרקה אסורה זוהתה." } });
          }
        }
        if (text.length > 8000) {
          return res.status(400).json({ error: { message: "טקסט ארוך מדי — מקסימום 8000 תווים." } });
        }
      }
      if ((block.type === "image" || block.type === "document") && block.source?.type !== "base64") {
        return res.status(400).json({ error: { message: "מקור תמונה/מסמך חייב להיות base64." } });
      }
    }
  }

  next();
}
