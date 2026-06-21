// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/chat — Server-side Anthropic proxy
//
//  The browser NEVER touches api.anthropic.com.
//  The API key lives only in process.env.ANTHROPIC_API_KEY (.env, never client).
//
//  Request body:
//    { messages: [...], system?: string, max_tokens?: number }
//
//  Response (mirrors the Anthropic Messages shape the client already expects):
//    { content: [{ type: "text", text: "..." }] }
//    or on error: { error: { message: "..." } }
// ─────────────────────────────────────────────────────────────────────────────

import { Router }    from 'express';
import Anthropic     from '@anthropic-ai/sdk';
import { claudeRateLimit } from '../security/claudeProxyShield.js';

const router = Router();

const MODEL      = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

// ── Warm system prompt — "friend helping a friend", decision-support only ──
const DEFAULT_SYSTEM = `אתה צמח — עוזר חכם ואנושי לניווט בין מוצרי קנאביס רפואי בישראל.

הרוח: חבר שעוזר לחבר. חמים, קצר, ישיר. לא קליני, לא מרצה, לא שיווקי.
כתוב בעברית תמיד. RTL. משפטים קצרים.

✅ אפשר: לעזור בבחירת זן, להסביר הבדלים בין מוצרים, לדון בתופעות לוואי שדווחו, לעזור להבין תפריט.
❌ אסור: לייעץ על מינון ספציפי, להבטיח תוצאות רפואיות, להחליף רופא.

כשהמשתמש שואל על השפעה — תאר נטייה, לא הבטחה: "מדווח על", "עשוי לעזור ב-", "לפי מה שנאמר".
אם אין לך מידע — אמור את זה בפשטות. עדיף "לא יודע" על פני ניחוש.
בסוף כל תשובה שעוסקת בהשפעה רפואית: משפט קצר — "זה לא ייעוץ רפואי — תמיד עם הרופא/ה."`.trim();

// ── Validate messages array ────────────────────────────────────────────────
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.every(m =>
    m && typeof m === 'object' &&
    (m.role === 'user' || m.role === 'assistant') &&
    (typeof m.content === 'string' || Array.isArray(m.content))
  );
}

// ── POST /api/chat ─────────────────────────────────────────────────────────
router.post('/', claudeRateLimit, async (req, res) => {
  // ── API key guard ────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith('sk-ant-xxx')) {
    console.error('[chat] ANTHROPIC_API_KEY is missing or placeholder — set it in .env');
    return res.status(503).json({
      error: {
        message: 'השרת לא מוגדר עם מפתח API. בקש מהאדמין להוסיף ANTHROPIC_API_KEY ל-.env',
        code: 'NO_API_KEY',
      },
    });
  }

  const { messages, system, max_tokens } = req.body || {};

  // ── Input validation ─────────────────────────────────────────────────────
  if (!validateMessages(messages)) {
    return res.status(400).json({
      error: { message: 'messages חייב להיות מערך עם לפחות הודעה אחת.' },
    });
  }

  // Clamp max_tokens — never exceed 4096, default 1024
  const tokens = Math.min(Math.max(Number(max_tokens) || MAX_TOKENS, 1), 4096);

  // ── Call Anthropic (server-side) ─────────────────────────────────────────
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: tokens,
      system:     (typeof system === 'string' && system.trim()) ? system : DEFAULT_SYSTEM,
      messages,
    });

    // Mirror the Anthropic shape so the existing frontend code needs zero changes
    return res.json({
      id:           response.id,
      type:         'message',
      role:         'assistant',
      content:      response.content,
      model:        response.model,
      stop_reason:  response.stop_reason,
      usage:        response.usage,
    });

  } catch (err) {
    // Log the full error server-side so failures are visible in the terminal
    console.error('[chat] Anthropic API error:', err?.status, err?.message, err?.error);

    const status  = err?.status || 500;
    const message = err?.error?.error?.message || err?.message || 'שגיאה לא ידועה מה-API';

    return res.status(status).json({
      error: {
        message,
        code: err?.error?.error?.type || 'anthropic_error',
        status,
      },
    });
  }
});

export default router;
