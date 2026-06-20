/**
 * File:            api/lib/localBot.js
 * Responsibility:  Deterministic conversational routing engine for the "Zemach"
 *                  assistant.  Zero LLM calls.  Three intent tiers:
 *                    A — local knowledge retrieval (terpenes, storage, clinical)
 *                    B — real-time data (pharmacy hours, live stock, web search stub)
 *                    C — friendly Hebrew fallback
 * Dependencies:    fs (Node built-in), path (Node built-in),
 *                  api/db.js (PostgreSQL pool),
 *                  api/lib/pharmacyHours.js (computeOpenStatus, fallback list),
 *                  api/lib/clinicalCore.js (verifyClinicalSafety — kill-switch),
 *                  src/knowledge/terpene_science.json,
 *                  src/knowledge/indications.json,
 *                  src/knowledge/israeli_products.json
 */

import { readFileSync }                                  from 'fs';
import { fileURLToPath }                                 from 'url';
import { dirname, resolve }                              from 'path';
import { pool }                                          from '../db.js';
import { computeOpenStatus, ISRAELI_PHARMACY_FALLBACK }  from './pharmacyHours.js';
import { verifyClinicalSafety }                          from './clinicalCore.js';

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

// ── Web / search stub ─────────────────────────────────────────────────────────
// Attempts Google Custom Search → SerpAPI → local pharmacy response.
// Never throws; always resolves to a { reply, citations } object.
async function webSearchStub(query, inventory = []) {
  const GOOGLE_KEY = process.env.GOOGLE_CSE_KEY;
  const GOOGLE_CX  = process.env.GOOGLE_CSE_CX;
  const SERP_KEY   = process.env.SERPAPI_KEY;

  // Pharmacy-hours queries answered locally without any external call
  if (/בית\s*מרקחת|פתוח|שעות/i.test(query)) {
    return buildLocalPharmacyResponse(inventory);
  }

  let results = [];

  // ── Attempt 1: Google Custom Search ─────────────────────────────────────
  if (GOOGLE_KEY && GOOGLE_CX) {
    try {
      const url =
        'https://www.googleapis.com/customsearch/v1?' +
        `key=${encodeURIComponent(GOOGLE_KEY)}&cx=${encodeURIComponent(GOOGLE_CX)}` +
        `&q=${encodeURIComponent(query + ' ישראל קנאביס רפואי')}&num=5&hl=iw&gl=il`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (resp.ok) {
        const data = await resp.json();
        results = (data.items || []).slice(0, 3).map((item) => ({
          title:   item.title,
          snippet: item.snippet,
          url:     item.link,
        }));
      }
    } catch (err) {
      console.warn('localBot Google CSE error:', err.message);
    }
  }

  // ── Attempt 2: SerpAPI ───────────────────────────────────────────────────
  if (!results.length && SERP_KEY) {
    try {
      const url =
        'https://serpapi.com/search.json?' +
        `q=${encodeURIComponent(query + ' קנאביס רפואי ישראל')}` +
        `&api_key=${encodeURIComponent(SERP_KEY)}&engine=google&hl=iw&gl=il&num=5`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (resp.ok) {
        const data = await resp.json();
        results = (data.organic_results || []).slice(0, 3).map((r) => ({
          title:   r.title,
          snippet: r.snippet,
          url:     r.link,
        }));
      }
    } catch (err) {
      console.warn('localBot SerpAPI error:', err.message);
    }
  }

  // ── Fallback: local data only ─────────────────────────────────────────────
  if (!results.length) return buildLocalPharmacyResponse(inventory);

  const bullets = results
    .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   🔗 ${r.url}`)
    .join('\n\n');

  return {
    reply: `מצאתי ${results.length} תוצאות עדכניות עבורך:\n\n${bullets}\n\n` +
           `💡 המידע לעיל מגיע ממקורות חיצוניים — תמיד בדוק ישירות עם בית המרקחת.`,
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
 * handleZemachQuery(message, dnaProfile, inventory)
 *   → Promise<{ reply: string, citations: object[], local_fallback: boolean, intent: string }>
 *
 * Deterministic routing — zero LLM calls:
 *   A → knowledge response built from local JSON files
 *   B → live pharmacy/stock data, or external search API stub
 *   C → friendly Hebrew fallback with optional stock personalisation
 */
async function handleZemachQuery(message, dnaProfile = null, inventory = []) {
  if (!message || typeof message !== 'string' || !message.trim()) {
    return { reply: FALLBACK_MESSAGE, citations: [], local_fallback: true, intent: 'C' };
  }

  const intent = detectIntent(message);

  // ── Intent A ─────────────────────────────────────────────────────────────
  if (intent.type === 'A') {
    try {
      let reply = intent.rule.respond() || FALLBACK_MESSAGE;
      if (dnaProfile?.indications?.length) {
        reply += `\n\n📌 *לפי הפרופיל שלך (${dnaProfile.indications.join(', ')}):* ` +
                 'שאל אותי על טרפנים ספציפיים שרלוונטיים להתוויות שלך!';
      }
      return { reply, citations: [], local_fallback: false, intent: 'A' };
    } catch (err) {
      console.error('localBot Intent A error:', err.message);
      return { reply: FALLBACK_MESSAGE, citations: [], local_fallback: true, intent: 'C' };
    }
  }

  // ── Intent B ─────────────────────────────────────────────────────────────
  if (intent.type === 'B') {
    try {
      const result = await webSearchStub(message, inventory);
      return { ...result, local_fallback: false, intent: 'B' };
    } catch (err) {
      console.error('localBot Intent B error:', err.message);
      return { ...buildLocalPharmacyResponse(inventory), local_fallback: true, intent: 'B' };
    }
  }

  // ── Intent C ─────────────────────────────────────────────────────────────
  let reply = FALLBACK_MESSAGE;
  if (dnaProfile?.indications?.length && inventory.length) {
    const inStock = inventory.filter((b) => b.in_stock).slice(0, 3);
    if (inStock.length) {
      reply += `\n\nכרגע במלאי: ${inStock.map((b) => `${b.name} (${b.pharmacy_name || '?'})`).join(', ')}.`;
    }
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
