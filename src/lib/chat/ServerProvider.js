import { ChatProvider } from './ChatProvider.js';

/**
 * ServerProvider — delegates to the Express backend which handles
 * Groq (when key present) → localBot Intent A/B/C.
 *
 * This is the existing behaviour, untouched, just wrapped in the interface.
 */
export class ServerProvider extends ChatProvider {
  getName() { return 'server'; }

  async isAvailable() {
    try {
      const res = await fetch('/api/health', {
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async sendMessage(message, history, context = {}) {
    const { image } = context;
    const body = {
      message,
      history: (history || []).map(m => ({ role: m.role, content: m.content })),
      ...(image ? { image } : {}),
    };

    const res = await fetch('/api/zemach-chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    return {
      reply:          data.reply || 'מצטער, לא הצלחתי לענות.',
      citations:      data.citations || [],
      local_fallback: data.local_fallback ?? false,
      intent:         data.intent || 'C',
      provider:       'server',
    };
  }
}
