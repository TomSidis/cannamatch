/**
 * File:        api/lib/groqAdapter.js
 * Purpose:     Zero-cost LLM via Groq's free-tier API.
 *              Free tier limits (as of 2025): 30 RPM, 14,400 RPD, 6,000 TPM.
 *              Models available for free: llama-3.1-8b-instant (text),
 *                                         meta-llama/llama-4-scout-17b-16e-instruct (vision)
 *
 * Usage:       Set GROQ_API_KEY in .env (free key from console.groq.com).
 *              If key is absent, every function throws — callers must catch.
 *
 * No external npm package — raw fetch only.
 */

const GROQ_BASE   = 'https://api.groq.com/openai/v1/chat/completions';
const TEXT_MODEL  = 'llama-3.1-8b-instant';       // fastest free text model
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'; // free vision model

function getKey() {
  const k = process.env.GROQ_API_KEY;
  if (!k) throw new Error('GROQ_API_KEY is not set in .env');
  return k;
}

/**
 * callGroq({ systemPrompt, messages, maxTokens, temperature })
 *
 * messages: OpenAI-format array of { role: 'user'|'assistant', content: string }
 * Returns: string (assistant reply)
 */
export async function callGroq({
  systemPrompt,
  messages,
  maxTokens  = 650,
  temperature = 0.65,
}) {
  const resp = await fetch(GROQ_BASE, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${getKey()}`,
    },
    body: JSON.stringify({
      model:       TEXT_MODEL,
      max_tokens:  maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
    signal: AbortSignal.timeout(14_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Groq ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Groq returned empty content');
  return text;
}

/**
 * callGroqVision({ systemPrompt, userText, imageBase64, mediaType, maxTokens })
 *
 * Sends an image to the Groq vision model for analysis.
 * Returns: string (assistant reply)
 */
export async function callGroqVision({
  systemPrompt,
  userText,
  imageBase64,
  mediaType  = 'image/jpeg',
  maxTokens  = 700,
}) {
  const resp = await fetch(GROQ_BASE, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${getKey()}`,
    },
    body: JSON.stringify({
      model:      VISION_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type:      'image_url',
              image_url: { url: `data:${mediaType};base64,${imageBase64}` },
            },
            {
              type: 'text',
              text: userText || 'מה מופיע בתמונה? פענח לי זנים, קטגוריות ישראליות (T/C), ומידע רפואי.',
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(18_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Groq Vision ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Groq Vision returned empty content');
  return text;
}

/** isAvailable() → bool — cheap sync check: key is present */
export function isGroqAvailable() {
  return Boolean(process.env.GROQ_API_KEY);
}
