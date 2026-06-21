/**
 * chatRouter — picks the right ChatProvider per request.
 *
 * Decision tree:
 *   manual override 'local'   → BrowserLocalProvider
 *   manual override 'webllm'  → WebLLMProvider (if available)
 *   manual override 'server'  → ServerProvider
 *
 *   auto (default):
 *     navigator.onLine + /api/health reachable → ServerProvider
 *       └─ if ServerProvider throws mid-call   → BrowserLocalProvider (graceful finish)
 *     offline OR health check fails:
 *       WebLLMProvider available (WebGPU + downloaded) → WebLLMProvider for Intent C
 *       else                                            → BrowserLocalProvider
 *
 * The active provider name is exported so the UI can show the mode indicator.
 */

import { ServerProvider }       from './ServerProvider.js';
import { BrowserLocalProvider } from './BrowserLocalProvider.js';
import { WebLLMProvider }       from './WebLLMProvider.js';

const server       = new ServerProvider();
const browserLocal = new BrowserLocalProvider();
const webllm       = new WebLLMProvider();

const MODE_KEY = 'cannamatch_chat_mode';

// ── Exports ───────────────────────────────────────────────────────────────────
export function getChatMode() {
  try { return localStorage.getItem(MODE_KEY) || 'auto'; } catch { return 'auto'; }
}

export function setChatMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
}

/**
 * routeMessage(message, history, context) → Promise<ChatResult & { provider: string }>
 *
 * Never throws — always returns a ChatResult (possibly with an error message
 * as the reply text) so the UI never shows a blank crash.
 */
export async function routeMessage(message, history, context = {}) {
  const mode = getChatMode();

  // ── Manual overrides ──────────────────────────────────────────────────────
  if (mode === 'local') {
    return _safeCall(browserLocal, message, history, context);
  }
  if (mode === 'webllm') {
    if (await webllm.isAvailable()) {
      return _safeCall(webllm, message, history, context);
    }
    // Requested WebLLM but not ready — tell the user
    return {
      reply:   'מודל WebLLM עדיין לא הורד 🔄\nהורד אותו מהגדרות → מצב לא מקוון.',
      citations: [], local_fallback: true, intent: 'C', provider: 'webllm-pending',
    };
  }
  if (mode === 'server') {
    return _safeCall(server, message, history, context);
  }

  // ── Auto mode ─────────────────────────────────────────────────────────────
  if (navigator.onLine) {
    const serverUp = await server.isAvailable().catch(() => false);
    if (serverUp) {
      try {
        const result = await server.sendMessage(message, history, context);
        return result;
      } catch (err) {
        console.warn('[chatRouter] ServerProvider failed, falling back to local:', err.message);
        // Graceful mid-call fallback
      }
    }
  }

  // Offline or server unreachable — prefer WebLLM if downloaded
  if (await webllm.isAvailable().catch(() => false)) {
    return _safeCall(webllm, message, history, context);
  }

  return _safeCall(browserLocal, message, history, context);
}

async function _safeCall(provider, message, history, context) {
  try {
    return await provider.sendMessage(message, history, context);
  } catch (err) {
    console.error('[chatRouter] Provider error:', provider.getName(), err.message);
    return {
      reply:          'שגיאה זמנית — נסה שוב בעוד רגע 🙏',
      citations:      [],
      local_fallback: true,
      intent:         'C',
      provider:       provider.getName() + '-error',
    };
  }
}

/**
 * Probe which provider will be used WITHOUT sending a message.
 * Useful for the mode indicator.
 * @returns {Promise<'server'|'webllm'|'browser-local'>}
 */
export async function probeActiveProvider() {
  const mode = getChatMode();
  if (mode === 'local') return 'browser-local';
  if (mode === 'webllm') return await webllm.isAvailable() ? 'webllm' : 'browser-local';
  if (mode === 'server') return 'server';

  if (navigator.onLine && await server.isAvailable().catch(() => false)) return 'server';
  if (await webllm.isAvailable().catch(() => false)) return 'webllm';
  return 'browser-local';
}
