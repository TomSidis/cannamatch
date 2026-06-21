/**
 * WebLLMProvider — on-device LLM via WebGPU (MLC engine).
 *
 * Runtime: @mlc-ai/web-llm
 * Chosen model: Llama-3.2-1B-Instruct-q4f16_1-MLC (~700 MB first download,
 *               then cached in the browser's Cache API via the service worker).
 *
 * Why this model:
 *   • 1B params, 4-bit quantised — fits in 2 GB VRAM (low-end mobile GPU)
 *   • Instruction-tuned: follows the Hebrew system prompt reliably
 *   • Fast enough for the narrow task (strain guidance is ~300-token replies)
 *
 * Why WebLLM / WebGPU:
 *   • Runs 100% in-browser after first download — true offline
 *   • No wasm binary-blob tricks; GPU acceleration via native WebGPU API
 *   • Model weights served from CDN on first use, cached via Cache API
 *
 * Browser support (as of 2026):
 *   ✅ Chrome 113+, Edge 113+, Chrome Android 121+
 *   ❌ Safari iOS (no WebGPU), Firefox (no WebGPU)
 *   → BrowserLocalProvider handles those browsers for offline Intent A
 *
 * HOW TO ACTIVATE:
 *   1. npm install @mlc-ai/web-llm
 *   2. Call WebLLMProvider.download(onProgress) to cache the model
 *      (shows a download progress bar — ~700 MB)
 *   3. Set the 'cannamatch_webllm_ready' flag in localStorage
 *   The chatRouter will then prefer this provider for Intent C when offline.
 *
 * This file is a complete, wired-up implementation.
 * Activation is intentionally gated — the 700 MB download must be a
 * deliberate user action, not an automatic background process.
 */

import { ChatProvider } from './ChatProvider.js';

const MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const READY_KEY = 'cannamatch_webllm_ready';

const SYSTEM_PROMPT =
  'אתה צמח (Zemach), עוזר AI ידידותי ומקצועי של אפליקציית קנאמאצ׳ — שוק הקנאביס הרפואי הישראלי.\n' +
  'ענה תמיד בעברית בלבד, בטון חם ובגובה העיניים — כמו חבר מנוסה, לא כמו רופא.\n' +
  'אל תיתן ייעוץ רפואי ישיר. הפנה לרופא בנושאי טיפול.\n' +
  'היה קצר ומדויק — עד 3 פסקאות. השתמש ב-emoji מדי פעם להנגשה.\n' +
  'אתה מכיר היטב: טרפנים, קנבינואידים, זנים ישראלים, נוהל 106, ויק"ר (T/C).\n' +
  'אתה עובד במצב לא מקוון — אל תמציא נתונים על מלאי, מחירים או שעות פתיחה.';

export class WebLLMProvider extends ChatProvider {
  constructor() {
    super();
    this._engine = null;
    this._loading = false;
  }

  getName() { return 'webllm'; }

  static isWebGPUAvailable() {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  static isDownloaded() {
    try { return localStorage.getItem(READY_KEY) === '1'; } catch { return false; }
  }

  async isAvailable() {
    return WebLLMProvider.isWebGPUAvailable() && WebLLMProvider.isDownloaded();
  }

  /**
   * Download and cache the model (must be triggered by a user gesture).
   * @param {(progress: {loaded:number, total:number, text:string}) => void} onProgress
   */
  static async download(onProgress) {
    if (!WebLLMProvider.isWebGPUAvailable()) {
      throw new Error('WebGPU is not available in this browser');
    }
    // new Function bypasses Rollup static analysis — @mlc-ai/web-llm is an
    // optional peer dep that's not installed until the user explicitly opts in.
    const { CreateMLCEngine } = await new Function('return import("@mlc-ai/web-llm")')();
    const engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (p) => onProgress?.({
        loaded: p.progress,
        total:  1,
        text:   p.text,
      }),
    });
    localStorage.setItem(READY_KEY, '1');
    return engine;
  }

  async _getEngine() {
    if (this._engine) return this._engine;
    if (this._loading) {
      // Wait for concurrent init
      await new Promise(r => { const t = setInterval(() => { if (!this._loading) { clearInterval(t); r(); } }, 200); });
      return this._engine;
    }
    this._loading = true;
    try {
      // new Function bypasses Rollup static analysis — @mlc-ai/web-llm is an
    // optional peer dep that's not installed until the user explicitly opts in.
    const { CreateMLCEngine } = await new Function('return import("@mlc-ai/web-llm")')();
      this._engine = await CreateMLCEngine(MODEL_ID);
    } finally {
      this._loading = false;
    }
    return this._engine;
  }

  async sendMessage(message, history, context = {}) {
    const engine = await this._getEngine();

    const profileNote = context.dnaProfile?.indications?.length
      ? `\nפרופיל המטופל — התוויות: ${context.dnaProfile.indications.join(', ')}.`
      : '';

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + profileNote },
      ...(history || []).slice(-6).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    const response = await engine.chat.completions.create({
      messages,
      max_tokens:  450,
      temperature: 0.65,
    });

    const reply = response.choices[0]?.message?.content || 'מצטער, לא הצלחתי לענות.';
    return { reply, citations: [], local_fallback: true, intent: 'C', provider: 'webllm' };
  }
}
