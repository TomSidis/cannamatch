/**
 * File:            api/lib/localBot.js
 * Responsibility:  Conversational routing engine for the "Zemach" assistant.
 *                  Three intent tiers:
 *                    A — local knowledge retrieval (terpenes, storage, clinical)
 *                    B — real-time data (pharmacy hours, live stock, web search)
 *                    C — open-ended: Groq LLM with optional web RAG context
 *                  When GROQ_API_KEY is set, intents A and B are enhanced by
 *                  Groq to produce natural Hebrew prose instead of raw templates.
 *                  Image analysis is routed to Groq Vision (also free-tier).
 *                  Falls back 100% locally if Groq is unavailable.
 */

import { readFileSync }                                  from 'fs';
import { fileURLToPath }                                 from 'url';
import { dirname, resolve }                              from 'path';
import { pool }                                          from '../db.js';
import { computeOpenStatus, ISRAELI_PHARMACY_FALLBACK }  from './pharmacyHours.js';
import { verifyClinicalSafety }                          from './clinicalCore.js';
import { callGroq, callGroqVision, isGroqAvailable }    from './groqAdapter.js';
import { webSearch }                                     from './webSearch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const KNOWLEDGE  = resolve(__dirname, '../../src/knowledge');

// ── Knowledge-base loaders (singleton, synchronous) ───────────────────────────
let _terpeneData    = null;
let _indicationData = null;
let _productData    = null;

function terpenes()    { return _terpeneData    ??= JSON.parse(readFileSync(resolve(KNOWLEDGE, 'terpene_science.json'),  'utf8')); }
function indications() { return _indicationData ??= JSON.parse(readFileSync(resolve(KNOWLEDGE, 'indications.json'),      'utf8')); }
function products()    { return _productData    ??= JSON.parse(readFileSync(resolve(KNOWLEDGE, 'israeli_products.json'), 'utf8')); }

// ── Strength → display mapping ────────────────────────────────────────────────
const STRENGTH_ICON = { very_strong: '🟢', strong: '🟢', 'strong (for aromatherapy/inhalation)': '🟢',
                        'moderate-strong': '🟡', moderate: '🟡', 'low-moderate': '🔵', low: '🔵' };
const INDICATION_LABELS = {
  pain: 'כאב', sleep: 'שינה', anxiety: 'חרדה', inflammation: 'דלקת',
  ptsd: 'PTSD', depression: 'דיכאון', epilepsy: 'אפילפסיה',
  neuroprotection: 'נוירו-הגנה', cancer: 'אונקולוגיה', muscle_spasm: 'עווית שרירים',
  copd_asthma: 'ריאות/אסטמה', memory_cognition: 'זיכרון/קוגניציה',
  crohns_ibd: 'קרוהן/IBD', skin_conditions: 'עור', addiction: 'התמכרות',
  topical_delivery: 'מתן מקומי', alertness: 'עירנות', immune: 'חיסוניות', gerd: 'רפלוקס',
  antidiabetic: 'סוכרת', neuroprotection: 'נוירו-הגנה', cancer: 'אונקולוגיה',
  antimicrobial: 'אנטי-מיקרוביאלי',
};

// ── Build terpene response map (keyed by terpene id and Hebrew name) ──────────
let _terpeneResponses = null;

function getTerpeneResponses() {
  if (_terpeneResponses) return _terpeneResponses;
  _terpeneResponses = {};

  for (const t of terpenes().terpenes) {
    // Top 3 clinical applications by evidence strength
    const apps = Object.entries(t.clinical_applications || {})
      .sort(([, a], [, b]) => {
        const rank = (s) => Object.keys(STRENGTH_ICON).findIndex((k) => s.strength.startsWith(k.replace(/^(very_)?/, '')));
        return rank(a) - rank(b);
      })
      .slice(0, 3)
      .map(([k, v]) => {
        const icon  = STRENGTH_ICON[v.strength] ?? '🔵';
        const label = INDICATION_LABELS[k] || k;
        return `${icon} ${label}`;
      })
      .join(' · ');

    // Each terpene's strain list is stored under `cannabis_strains_high_<id>`
    const strains = (t[`cannabis_strains_high_${t.id}`] || []).slice(0, 4).join(', ');

    const caution = t.caution_he || t.clinical_kill_switch_note
      ? `\n⚠️  ${t.caution_he || t.clinical_kill_switch_note}`
      : '';

    const lines = [
      `*${t.name_he} (${t.name_en})* — ${(t.aroma_he || []).slice(0, 3).join(', ')} 🌿`,
      '',
      `📌 *מנגנון:* ${(t.pharmacology?.mechanisms || '').slice(0, 200)}`,
      '',
      `💊 *שימושים:* ${apps || 'מידע מוגבל'}`,
      strains ? `🌱 *זנים ידועים:* ${strains}` : '',
      t.boiling_point_c
        ? `🌡️  *ואפורייזר:* ${t.vaporizer_temp_note || `${t.boiling_point_c}°C`}`
        : '',
      caution,
      '',
      `📚 *אמינות מחקרית:* ${t.pharmacology?.evidence_quality || 'לא ידוע'}`,
    ];

    const reply = lines.filter((l) => l !== '').join('\n');
    _terpeneResponses[t.id]      = reply;
    _terpeneResponses[t.name_he] = reply;
  }

  return _terpeneResponses;
}

// ── Vaporizer temperature guide (built once from knowledge file) ──────────────
function buildVaporizerGuide() {
  try {
    const guide = terpenes().vaporizer_temperature_guide;
    return Object.entries(guide || {})
      .filter(([k]) => k !== '195_plus')
      .map(([range, data]) => {
        const terps = (data.terpenes || []).map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ');
        return `• *${range.replace('_', '–')}°C:* ${terps} — ${data.effect}`;
      })
      .join('\n');
  } catch {
    return '• 160–175°C: קריופילן, הומולן, פינן\n' +
           '• 175–185°C: מירסן, לימונן, לינלול (THC/CBD peak)\n' +
           '• 185–195°C: נרולידול, CBN';
  }
}

// ── Static knowledge strings ──────────────────────────────────────────────────
// Defined as a factory function so the vaporizer guide is built after module load,
// ensuring the file is already cached before we read it.
function buildStaticKnowledge() {
  return {
    generals: `*מהם טרפנים?* 🌿

טרפנים הם תרכובות ריחניות אורגניות שמייצרים הצמחים (לא רק קנאביס). בקנאביס יש יותר מ-200 טרפנים שונים — הם אחראים לריח, הטעם, ולחלק מהאפקטים הרפואיים.

*הטרפנים הנפוצים ביותר בקנאביס ישראלי:*
• מירסן (Myrcene) — אדמתי, מנגו | שינה, כאב, דלקת
• קריופילן (Caryophyllene) — פלפלי, עצי | כאב נוירופתי, IBD
• לינלול (Linalool) — לבנדר, פרחוני | חרדה, שינה, PTSD
• לימונן (Limonene) — הדרים | מצב רוח, דיכאון
• פינן (Pinene) — אורן | עירנות, COPD
• הומולן (Humulene) — כשתוני | דלקת, אנטי-גידול

כל הטרפנים הנ"ל עובדים בסינרגיה עם THC ו-CBD — "אפקט האנטורז'" (Entourage Effect). שאל אותי על טרפן ספציפי לעומק!`,

    storage: `*אחסון קנאביס רפואי* — המדריך הקצר 📦

• *טמפרטורה:* 15–21°C (לא מעל 25°C — חום מפרק THC ל-CBN הלא-פסיכואקטיבי)
• *לחות:* 55–62% RH — הזון המתוק. מתחת ל-50%: הפרח מתייבש. מעל 65%: סכנת עובש
• *אור:* כלי אטום, רצוי זכוכית כהה — UV מפרק קנבינואידים
• *מיכל:* זכוכית >> פלסטיק. פלסטיק סופג טרפנים לאורך זמן
• *משך:* צרוך תוך 6–12 חודשים מתאריך הייצור לתוצאות מיטביות
• *טיפ:* פקק לחות Boveda 62% — הדרך הכי פשוטה לשמור על הפרח`,

    mold: `*עובש על קנאביס — זיהוי ובטיחות* 🚨

עובש מייצר מיקוטוקסינים — סכנה מוחשית לחולים מדוכאי חיסון (כימותרפיה, MS, HIV).

*איך מזהים:*
• כתמים לבנים/אפורים/ירוקים "כמו אבקה" — שונים מטריכומים גבישיים
• ריח "עפוש", לח, "מחסן ישן"
• מרקם דביק/רך בנקודה ספציפית

*מה עושים:*
• אל תשאף — זרוק את המנה המלאה (עובש חלקי = מנה שלמה מזוהמת)
• הודע לבית המרקחת (חייבים לתעד)

*מניעה:* 55–62% RH, פקק Boveda, אל תדחוס בשקיות`,

    humidity: `*לחות לאחסון קנאביס* 💧

• *< 50% RH:* הפרח מתייבש → טרפנים נאדים → פחות טעם ואפקט
• *55–62% RH:* אידאלי — שיווי משקל מושלם
• *> 65% RH:* עובש מתחיל לצמוח בתוך ימים בטמפרטורת חדר

*הכלים:*
• פקק Boveda 62% (40 גרם ל-28 גרם פרח) — הכי פשוט
• מד לחות דיגיטלי — השקעה חכמה לכל חולה עם יותר ממנה אחת`,

    temperature: `*טמפרטורת ואפורייזר לטרפנים שונים* 🌡️\n\n${buildVaporizerGuide()}\n\n*כלל אצבע:* התחל ב-175°C (מלא-ספקטרום בסיסי), תקן לפי טרפן המטרה`,
  };
}

let _staticKnowledge = null;
function staticKnowledge() {
  return _staticKnowledge ??= buildStaticKnowledge();
}

// ── Build clinical indication response ────────────────────────────────────────
function buildIndicationResponse(indicationId) {
  const ind = indications().indications.find((i) => i.id === indicationId);
  if (!ind) return FALLBACK_MESSAGE;

  const terpList = (ind.terpenes?.primary || [])
    .map((id) => {
      const td = terpenes().terpenes.find((x) => x.id === id);
      return td ? `${td.name_he} (${td.name_en})` : id;
    })
    .join(', ');

  const productSection = (() => {
    const quickmap = products().indication_to_product_quickmap?.quickmap || {};
    const entry    = quickmap[indicationId]
                  ?? quickmap[Object.keys(quickmap).find((k) => indicationId.startsWith(k)) || ''];
    if (!entry) return '';
    return `\n🏥 *מוצרים ישראלים מומלצים:* ${(entry.primary || []).slice(0, 3).join(', ')}`;
  })();

  return [
    `*${ind.he}* — סיכום קליני 📋`,
    '',
    `📊 *רמת עדות:* ${ind.evidence_level}`,
    terpList ? `🌿 *טרפנים מועדפים:* ${terpList}` : '',
    productSection,
    '',
    ind.clinical_notes_he || '',
    '',
    `⚕️ *תזכורת:* המידע הוא עזר חינוכי בלבד. שינוי טיפול — תמיד עם הרופא המטפל.`,
  ].filter(Boolean).join('\n');
}

// ── Intent A: keyword → knowledge rules ──────────────────────────────────────
const INTENT_A_RULES = [
  { id: 'generals',             patterns: [/\bטרפנ/i, /\bterpene/i, /\bentourage/i, /אנטורז/i, /מה זה טרפ/i],          respond: () => staticKnowledge().generals },
  { id: 'myrcene',              patterns: [/\bמירסן/i, /\bmyrcene/i],                                                    respond: () => getTerpeneResponses()['myrcene'] },
  { id: 'caryophyllene',        patterns: [/\bקריופילן/i, /\bcaryophyllene/i, /\bβ-cary/i, /קריו\b/i],                  respond: () => getTerpeneResponses()['caryophyllene'] },
  { id: 'linalool',             patterns: [/\bלינלול/i, /\blinalool/i],                                                  respond: () => getTerpeneResponses()['linalool'] },
  { id: 'limonene',             patterns: [/\bלימונן/i, /\blimonene/i],                                                  respond: () => getTerpeneResponses()['limonene'] },
  { id: 'pinene',               patterns: [/\bפינן/i, /\bpinene/i, /\bα-pinene/i, /אלפא.?פינן/i],                      respond: () => getTerpeneResponses()['pinene'] },
  { id: 'terpinolene',          patterns: [/\bטרפינולן/i, /\bterpinolene/i],                                             respond: () => getTerpeneResponses()['terpinolene'] },
  { id: 'humulene',             patterns: [/\bהומולן/i, /\bhumulene/i],                                                  respond: () => getTerpeneResponses()['humulene'] },
  { id: 'ocimene',              patterns: [/\bאוסימן/i, /\bocimene/i],                                                   respond: () => getTerpeneResponses()['ocimene'] },
  { id: 'nerolidol',            patterns: [/\bנרולידול/i, /\bnerolidol/i],                                               respond: () => getTerpeneResponses()['nerolidol'] },
  { id: 'bisabolol',            patterns: [/\bביסבולול/i, /\bbisabolol/i],                                               respond: () => getTerpeneResponses()['bisabolol'] },
  { id: 'eucalyptol',           patterns: [/\bאוקליפטול/i, /\beucalyptol/i, /\bcineole/i, /סינאול/i],                  respond: () => getTerpeneResponses()['eucalyptol'] },
  { id: 'geraniol',             patterns: [/\bגרניול/i, /\bgeraniol/i],                                                  respond: () => getTerpeneResponses()['geraniol'] },
  { id: 'storage',              patterns: [/\bאחסו/i, /\bלשמור/i, /\bשמירה/i, /\bשמר/i, /איך לאחסן/i],                 respond: () => staticKnowledge().storage },
  { id: 'mold',                 patterns: [/\bעובש/i, /\bעופש/i, /\bmold/i, /\bmould/i],                                respond: () => staticKnowledge().mold },
  { id: 'humidity',             patterns: [/\bלחות/i, /\bRH\b/i, /\bhumidity/i, /\bboveda/i],                           respond: () => staticKnowledge().humidity },
  { id: 'temperature',          patterns: [/\bטמפ/i, /\bvaporize/i, /\bואפורייזר/i, /\bvaporizer/i, /\bאידוי/i],       respond: () => staticKnowledge().temperature },
  { id: 'ptsd',                 patterns: [/\bPTSD\b/i, /\bפוסט.?טראומ/i, /\bטראומ/i],                                 respond: () => buildIndicationResponse('ptsd') },
  { id: 'pain',                 patterns: [/\bכאב\b/i, /\bכאבי\b/i, /\bנוירופתי/i, /\bpain\b/i, /\bפיברו/i],          respond: () => buildIndicationResponse('chronic_pain') },
  { id: 'sleep',                patterns: [/\bשינה\b/i, /\bנדודי\s*שינה/i, /\binsomni/i],                               respond: () => buildIndicationResponse('sleep') },
  { id: 'anxiety',              patterns: [/\bחרדה\b/i, /\banxiety/i, /\bGAD\b/i, /\bפאניקה/i],                        respond: () => buildIndicationResponse('anxiety') },
  { id: 'epilepsy',             patterns: [/\bאפילפסי/i, /\bepileps/i, /\bseizure/i],                                   respond: () => buildIndicationResponse('epilepsy') },
  { id: 'crohns',               patterns: [/\bקרוהן/i, /\bcrohn/i, /\bIBD\b/i, /\bקוליטיס/i, /\bcolitis/i],           respond: () => buildIndicationResponse('crohns') },
  { id: 'ms',                   patterns: [/\bMS\b/, /\bטרשת\s*נפוצה/i, /\bmultiple\s*sclerosis/i],                    respond: () => buildIndicationResponse('ms') },
];

// ── Intent B: real-time query patterns ───────────────────────────────────────
const INTENT_B_PATTERNS = [
  /בית\s*מרקחת\s*(?:פתוח|פתוחים|שעות|היכן|איפה|ליד)/i,
  /מרקחת\s*פתוח/i,
  /שעות\s*פתיחה/i,
  /מלאי\s*(?:זמין|עכשיו|חי|ב?חוץ)/i,
  /זמין\s*(?:עכשיו|ב?חוץ|היום)/i,
  /היכן\s*(?:לקנות|למצוא|אפשר\s*לקנות)/i,
  /איפה\s*(?:קונים|לקנות|מוצאים)/i,
  /ב?זמינות\s*(?:עכשיו|כרגע|היום)/i,
];

// ── Build Groq system prompt from user's DNA profile ─────────────────────────
function buildSystemPrompt(dnaProfile) {
  const profileSection = dnaProfile
    ? [
        '',
        '=== פרופיל המטופל ===',
        dnaProfile.indications?.length
          ? `התוויות: ${dnaProfile.indications.join(', ')}`
          : '',
        Object.keys(dnaProfile.target_terpenes || {}).length
          ? `טרפנים מועדפים: ${Object.keys(dnaProfile.target_terpenes).join(', ')}`
          : '',
        Object.keys(dnaProfile.trigger_terpenes || {}).length
          ? `טרפנים אסורים (kill-switch): ${Object.keys(dnaProfile.trigger_terpenes).join(', ')}`
          : '',
      ].filter(Boolean).join('\n')
    : '';

  return (
    `אתה צמח (Zemach), עוזר AI ידידותי ומקצועי של אפליקציית קנאמאצ׳ — שוק הקנאביס הרפואי הישראלי.
ענה תמיד בעברית בלבד, בטון חם ובגובה העיניים — כמו חבר מנוסה, לא כמו רופא.
אל תיתן ייעוץ רפואי ישיר. הפנה לרופא בנושאי טיפול.
היה קצר ומדויק — עד 3 פסקאות. השתמש ב-emoji מדי פעם להנגשה.
אתה מכיר היטב: טרפנים, קנבינואידים, זנים ישראלים, נוהל 106, ויק"ר (T/C).
אל תמציא נתוני מחירים או מלאי — הם מגיעים ממסד הנתונים המחובר.${profileSection}`
  );
}

// ── Web / search — now uses the full free search chain ────────────────────────
async function doWebSearch(query, inventory = []) {
  if (/בית\s*מרקחת|פתוח|שעות/i.test(query)) {
    return buildLocalPharmacyResponse(inventory);
  }

  const results = await webSearch(query + ' קנאביס רפואי ישראל').catch(() => []);
  if (!results.length) return buildLocalPharmacyResponse(inventory);

  const bullets = results
    .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}${r.url ? `\n   🔗 ${r.url}` : ''}`)
    .join('\n\n');

  return {
    reply: `מצאתי ${results.length} תוצאות עדכניות:\n\n${bullets}\n\n` +
           `💡 המידע לעיל ממקורות חיצוניים — תמיד בדוק ישירות.`,
    citations: results,
  };
}

// ── Local pharmacy hours builder ─────────────────────────────────────────────
function buildLocalPharmacyResponse(inventory) {
  const inStock = (inventory || []).filter((b) => b.in_stock);
  const stockBlock = inStock.length
    ? '\n\n🌿 *מלאי חי (ממסד הנתונים שלנו):*\n' +
      inStock.slice(0, 5)
        .map((b) => `• ${b.name} (${b.pharmacy_name || 'בית מרקחת'}) — ₪${b.price ?? '?'}`)
        .join('\n')
    : '';

  const pharmacyLines = ISRAELI_PHARMACY_FALLBACK.map((ph) => {
    const { is_open, hours_today } = computeOpenStatus(ph);
    const status   = is_open ? '🟢 פתוח עכשיו' : '🔴 סגור';
    const delivery = ph.delivery ? ' · משלוח ✓' : '';
    return `• **${ph.name}** (${ph.city}) — ${status}${delivery}\n  שעות היום: ${hours_today || 'לא זמין'} | ${ph.phone}`;
  }).join('\n');

  return {
    reply: `*בתי מרקחת לקנאביס רפואי — סטטוס נוכחי* 🏥\n\n${pharmacyLines}${stockBlock}\n\n` +
           `ℹ️ השעות מחושבות לפי השעון הישראלי. למידע מדויק — התקשר ישירות לבית המרקחת.`,
    citations: [],
  };
}

// ── k-anonymity guard ────────────────────────────────────────────────────────
/**
 * kAnonGuard(row) → row | null
 * Returns null if n_reports < 20, preventing disclosure of community data
 * from population subsets that are too small to anonymise.
 */
function kAnonGuard(row) {
  if (!row || typeof row.n_reports !== 'number') return null;
  return row.n_reports >= 20 ? row : null;
}

// ── Clinical kill-switch integration ─────────────────────────────────────────
/**
 * applyClinicalGuard(reply, dnaProfile, strainEmbedding) → { reply, blocked }
 * Prepends the kill-switch companion message when a strain's terpene profile
 * triggers a restricted condition for this user's indications.
 */
function applyClinicalGuard(reply, dnaProfile, strainEmbedding) {
  if (!dnaProfile || !strainEmbedding) return { reply, blocked: false };
  const safety = verifyClinicalSafety({ embedding: strainEmbedding }, dnaProfile);
  if (!safety.safe) {
    return { reply: safety.companion_message + '\n\n' + reply, blocked: true };
  }
  return { reply, blocked: false };
}

// ── Intent detection ──────────────────────────────────────────────────────────
function detectIntent(message) {
  for (const rule of INTENT_A_RULES) {
    if (rule.patterns.some((p) => p.test(message))) return { type: 'A', rule };
  }
  if (INTENT_B_PATTERNS.some((p) => p.test(message))) return { type: 'B' };
  return { type: 'C' };
}

// ── Fallback message ─────────────────────────────────────────────────────────
const FALLBACK_MESSAGE =
  'חבר, אני לא בטוח לגבי המושג הזה, אבל בוא נבדוק בקטלוג הזנים שמסונכרן ' +
  'אצלנו מקומית בדוקר! נסה לשאול על טרפן ספציפי (למשל "מה זה מירסן?"), ' +
  'על אחסון ("איך לשמור?"), על בתי מרקחת פתוחים, או על זן שאתה מעוניין בו. 💚';

// ── Public entry-point ────────────────────────────────────────────────────────
/**
 * handleZemachQuery(message, dnaProfile, inventory, image)
 *   → Promise<{ reply, citations, local_fallback, intent }>
 *
 * Routing:
 *   IMAGE → Groq Vision (free) when GROQ_API_KEY is set
 *   A     → Local knowledge JSON; optionally naturalised by Groq
 *   B     → Free multi-source web search; synthesised by Groq when available
 *   C     → Groq with web RAG context; pure local fallback otherwise
 *
 * @param {string} message
 * @param {object|null} dnaProfile
 * @param {Array} inventory
 * @param {{ data: string, type: string }|null} image  base64 for vision queries
 */
async function handleZemachQuery(message = '', dnaProfile = null, inventory = [], image = null) {
  if (!message?.trim() && !image) {
    return { reply: FALLBACK_MESSAGE, citations: [], local_fallback: true, intent: 'C' };
  }

  const systemPrompt = buildSystemPrompt(dnaProfile);
  const useGroq      = isGroqAvailable();
  const trimmed      = (message || '').trim();

  // ── GREETING / small-talk detection ──────────────────────────────────────
  const GREETING_RE = /^(שלום|היי|הי|שב"?ת שלום|בוקר טוב|ערב טוב|לילה טוב|מה שלומך|מה נשמע|מה קורה|מה המצב|hey|hello|hi\b|yo\b)/i;
  const THANKS_RE   = /^(תודה|תנקס|תודה רבה|thanks|thank you)/i;
  const ACK_RE      = /^(בסדר|אוקי|אוקיי|הבנתי|קיבלתי|מעולה|נכון|בדיוק|ok\b|okay\b)/i;

  if (GREETING_RE.test(trimmed) || THANKS_RE.test(trimmed) || ACK_RE.test(trimmed)) {
    const name = dnaProfile?.name;
    let reply;
    if (THANKS_RE.test(trimmed)) {
      reply = 'בשמחה גדולה! 💚\nאני כאן בשבילך 24/7 — שאל על טרפנים, זנים, בתי מרקחת, או שלח תמונת תפריט לניתוח.';
    } else if (ACK_RE.test(trimmed)) {
      reply = 'מעולה 🙌 מה עוד אתה רוצה לדעת?';
    } else {
      reply = `שלום${name ? ` ${name}` : ''}! 🌿 אני צמח — העוזר הרפואי האישי שלך לקנאביס.\n\nאני יכול לעזור לך עם:\n• מידע על טרפנים וקנבינואידים\n• בתי מרקחת פתוחים ומלאי חי\n• אחסון נכון ושיטות צריכה\n• ניתוח תפריטים — שלח תמונה!\n\nמה מעניין אותך היום?`;
    }
    return { reply, citations: [], local_fallback: true, intent: 'greeting' };
  }

  // ── IMAGE ANALYSIS ────────────────────────────────────────────────────────
  if (image?.data) {
    if (useGroq) {
      try {
        const reply = await callGroqVision({
          systemPrompt,
          userText:    message?.trim() || 'מה מופיע בתמונה? פענח זנים, קטגוריות T/C, ומידע רפואי.',
          imageBase64: image.data,
          mediaType:   image.type || 'image/jpeg',
        });
        return { reply, citations: [], local_fallback: false, intent: 'IMAGE' };
      } catch (err) {
        console.warn('Groq Vision error:', err.message);
        return {
          reply: 'לא הצלחתי לנתח את התמונה כרגע 📸 — נסה שוב, או שלח את שם הזן בטקסט ואענה.',
          citations: [], local_fallback: true, intent: 'IMAGE',
        };
      }
    }
    return {
      reply: 'ניתוח תמונות דורש חיבור ל-Groq API 🔑\n' +
             'הוסף GROQ_API_KEY ל-.env (חינמי ב-console.groq.com) ואפענח תפריטים תוך שניות!',
      citations: [], local_fallback: true, intent: 'IMAGE',
    };
  }

  const intent = detectIntent(message);

  // ── INTENT A: local knowledge ─────────────────────────────────────────────
  if (intent.type === 'A') {
    let localReply;
    try { localReply = intent.rule.respond() || FALLBACK_MESSAGE; }
    catch (err) { console.error('localBot Intent A:', err.message); localReply = FALLBACK_MESSAGE; }

    if (useGroq) {
      try {
        const reply = await callGroq({
          systemPrompt,
          messages: [
            { role: 'user', content: message },
            {
              role: 'assistant',
              content: localReply + '\n\n[הנ"ל ידע קליני מובנה. המר לתגובה שיחתית, חמה ומדויקת בעברית. שמור על כל העובדות. עד 3 פסקאות.]',
            },
          ],
          maxTokens: 500,
        });
        const suffix = dnaProfile?.indications?.length
          ? `\n\n📌 לפי הפרופיל שלך (${dnaProfile.indications.join(', ')}) — שאל אותי על טרפנים ספציפיים!`
          : '';
        return { reply: reply + suffix, citations: [], local_fallback: false, intent: 'A' };
      } catch (err) {
        console.warn('Groq Intent A naturalisation:', err.message);
      }
    }

    if (dnaProfile?.indications?.length) {
      localReply += `\n\n📌 *לפי הפרופיל שלך (${dnaProfile.indications.join(', ')}):* שאל אותי על טרפנים ספציפיים!`;
    }
    return { reply: localReply, citations: [], local_fallback: true, intent: 'A' };
  }

  // ── INTENT B: real-time / web ─────────────────────────────────────────────
  if (intent.type === 'B') {
    try {
      const searchResult = await doWebSearch(message, inventory);

      if (useGroq && searchResult.citations?.length) {
        try {
          const snippets = searchResult.citations
            .map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`)
            .join('\n');
          const reply = await callGroq({
            systemPrompt,
            messages: [{
              role: 'user',
              content: `שאלת המשתמש: ${message}\n\nתוצאות חיפוש חיות:\n${snippets}\n\nענה בעברית חמה ומדויקת לפי המידע הנ"ל.`,
            }],
            maxTokens: 550,
          });
          return { reply, citations: searchResult.citations, local_fallback: false, intent: 'B' };
        } catch (err) { console.warn('Groq Intent B synthesis:', err.message); }
      }

      return { ...searchResult, local_fallback: false, intent: 'B' };
    } catch (err) {
      console.error('localBot Intent B:', err.message);
      return { ...buildLocalPharmacyResponse(inventory), local_fallback: true, intent: 'B' };
    }
  }

  // ── INTENT C: open-ended → Groq + web RAG ────────────────────────────────
  if (useGroq) {
    let citations  = [];
    let ragContext = '';

    if (message.length > 10) {
      try {
        const results = await webSearch(message + ' cannabis medical Israel קנאביס');
        if (results.length) {
          citations  = results;
          ragContext = '\n\nמידע עדכני מהרשת (השתמש רק אם רלוונטי):\n' +
                      results.slice(0, 3).map((r) => `• ${r.title}: ${r.snippet}`).join('\n');
        }
      } catch { /* non-fatal */ }
    }

    const inStock  = (inventory || []).filter((b) => b.in_stock).slice(0, 4);
    const stockCtx = inStock.length
      ? '\n\nמלאי חי: ' + inStock.map((b) => `${b.name} (${b.pharmacy_name || '?'}) ₪${b.price ?? '?'}`).join(', ')
      : '';

    try {
      const reply = await callGroq({
        systemPrompt: systemPrompt + ragContext + stockCtx,
        messages: [{ role: 'user', content: message }],
        maxTokens: 650,
      });
      return { reply, citations, local_fallback: false, intent: 'C' };
    } catch (err) { console.warn('Groq Intent C:', err.message); }
  }

  // ── Final local fallback ──────────────────────────────────────────────────
  let reply     = FALLBACK_MESSAGE;
  const inStock = (inventory || []).filter((b) => b.in_stock).slice(0, 3);
  if (dnaProfile?.indications?.length && inStock.length) {
    reply += `\n\nכרגע במלאי: ${inStock.map((b) => `${b.name} (${b.pharmacy_name || '?'})`).join(', ')}.`;
  }
  return { reply, citations: [], local_fallback: true, intent: 'C' };
}

export {
  handleZemachQuery,
  detectIntent,
  kAnonGuard,
  applyClinicalGuard,
  FALLBACK_MESSAGE,
};
