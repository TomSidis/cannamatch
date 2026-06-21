/**
 * BrowserLocalProvider — runs completely in the browser, zero network calls.
 *
 * Covers:
 *   Intent A  — terpene science, storage, indications (from bundled JSON)
 *   Greeting  — warm Hebrew welcome
 *   Fallback  — honest "I'm offline" message with guidance
 *
 * Does NOT cover Intent B (pharmacy hours need the server clock/DB) or
 * Intent C (open-ended LLM — see WebLLMProvider for that).
 *
 * JSON files are in src/knowledge/ — Vite bundles them at build time so
 * they are available offline once the app shell is cached by the SW.
 */

import { ChatProvider } from './ChatProvider.js';
import TERPENE_SCIENCE  from '../../knowledge/terpene_science.json';
import INDICATIONS      from '../../knowledge/indications.json';

// ── Strength → icon map (same as backend) ────────────────────────────────────
const STRENGTH_ICON = {
  very_strong: '🟢', strong: '🟢',
  'strong (for aromatherapy/inhalation)': '🟢',
  'moderate-strong': '🟡', moderate: '🟡',
  'low-moderate': '🔵', low: '🔵',
};
const INDICATION_LABELS = {
  pain: 'כאב', sleep: 'שינה', anxiety: 'חרדה', inflammation: 'דלקת',
  ptsd: 'PTSD', depression: 'דיכאון', epilepsy: 'אפילפסיה',
  neuroprotection: 'נוירו-הגנה', cancer: 'אונקולוגיה',
  muscle_spasm: 'עווית שרירים', copd_asthma: 'ריאות/אסטמה',
  memory_cognition: 'זיכרון/קוגניציה', crohns_ibd: 'קרוהן/IBD',
  skin_conditions: 'עור', addiction: 'התמכרות', alertness: 'עירנות',
  immune: 'חיסוניות', gerd: 'רפלוקס', antidiabetic: 'סוכרת',
  antimicrobial: 'אנטי-מיקרוביאלי', topical_delivery: 'מתן מקומי',
};

// ── Build terpene response map once ──────────────────────────────────────────
let _terpeneResponses = null;

function getTerpeneResponses() {
  if (_terpeneResponses) return _terpeneResponses;
  _terpeneResponses = {};

  for (const t of TERPENE_SCIENCE.terpenes) {
    const apps = Object.entries(t.clinical_applications || {})
      .sort(([, a], [, b]) => {
        const rank = (s) => Object.keys(STRENGTH_ICON).findIndex(k =>
          s.strength?.startsWith(k.replace(/^(very_)?/, '')));
        return rank(a) - rank(b);
      })
      .slice(0, 3)
      .map(([k, v]) => {
        const icon  = STRENGTH_ICON[v.strength] ?? '🔵';
        const label = INDICATION_LABELS[k] || k;
        return `${icon} ${label}`;
      }).join(' · ');

    const strains = (t[`cannabis_strains_high_${t.id}`] || []).slice(0, 4).join(', ');
    const caution = t.caution_he || t.clinical_kill_switch_note
      ? `\n⚠️  ${t.caution_he || t.clinical_kill_switch_note}` : '';

    const reply = [
      `*${t.name_he} (${t.name_en})* — ${(t.aroma_he || []).slice(0, 3).join(', ')} 🌿`,
      '',
      `📌 *מנגנון:* ${(t.pharmacology?.mechanisms || '').slice(0, 200)}`,
      '',
      `💊 *שימושים:* ${apps || 'מידע מוגבל'}`,
      strains ? `🌱 *זנים ידועים:* ${strains}` : '',
      t.boiling_point_c ? `🌡️  *ואפורייזר:* ${t.vaporizer_temp_note || `${t.boiling_point_c}°C`}` : '',
      caution,
      '',
      `📚 *אמינות מחקרית:* ${t.pharmacology?.evidence_quality || 'לא ידוע'}`,
    ].filter(l => l !== '').join('\n');

    _terpeneResponses[t.id]      = reply;
    _terpeneResponses[t.name_he] = reply;
  }
  return _terpeneResponses;
}

// ── Build indication response ─────────────────────────────────────────────────
function buildIndicationResponse(indicationId) {
  const ind = INDICATIONS.indications.find(i => i.id === indicationId);
  if (!ind) return null;

  const terpList = (ind.terpenes?.primary || [])
    .map(id => {
      const td = TERPENE_SCIENCE.terpenes.find(x => x.id === id);
      return td ? `${td.name_he} (${td.name_en})` : id;
    }).join(', ');

  return [
    `*${ind.he}* — סיכום קליני 📋`,
    '',
    `📊 *רמת עדות:* ${ind.evidence_level}`,
    terpList ? `🌿 *טרפנים מועדפים:* ${terpList}` : '',
    '',
    ind.clinical_notes_he || '',
    '',
    `⚕️ *תזכורת:* המידע הוא עזר חינוכי בלבד. שינוי טיפול — תמיד עם הרופא המטפל.`,
  ].filter(Boolean).join('\n');
}

// ── Static knowledge strings ──────────────────────────────────────────────────
const STATIC = {
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

  temperature: `*טמפרטורת ואפורייזר לטרפנים שונים* 🌡️

• *160–175°C:* קריופילן, הומולן, פינן
• *175–185°C:* מירסן, לימונן, לינלול (THC/CBD peak)
• *185–195°C:* נרולידול, CBN

*כלל אצבע:* התחל ב-175°C (מלא-ספקטרום בסיסי), תקן לפי טרפן המטרה`,
};

// ── Intent A rules (same patterns as backend) ─────────────────────────────────
const INTENT_A_RULES = [
  { patterns: [/טרפנ/i, /\bterpene/i, /\bentourage/i, /אנטורז/i, /מה זה טרפ/i],   respond: () => STATIC.generals },
  { patterns: [/מירסן/i, /\bmyrcene\b/i],                                            respond: () => getTerpeneResponses()['myrcene'] },
  { patterns: [/קריופילן/i, /\bcaryophyllene\b/i, /β-cary/i, /קריו/i],             respond: () => getTerpeneResponses()['caryophyllene'] },
  { patterns: [/לינלול/i, /\blinalool\b/i],                                          respond: () => getTerpeneResponses()['linalool'] },
  { patterns: [/לימונן/i, /\blimonene\b/i],                                          respond: () => getTerpeneResponses()['limonene'] },
  { patterns: [/פינן/i, /\bpinene\b/i, /α-pinene/i, /אלפא.?פינן/i],               respond: () => getTerpeneResponses()['pinene'] },
  { patterns: [/טרפינולן/i, /\bterpinolene\b/i],                                    respond: () => getTerpeneResponses()['terpinolene'] },
  { patterns: [/הומולן/i, /\bhumulene\b/i],                                          respond: () => getTerpeneResponses()['humulene'] },
  { patterns: [/אוסימן/i, /\bocimene\b/i],                                           respond: () => getTerpeneResponses()['ocimene'] },
  { patterns: [/נרולידול/i, /\bnerolidol\b/i],                                       respond: () => getTerpeneResponses()['nerolidol'] },
  { patterns: [/ביסבולול/i, /\bbisabolol\b/i],                                       respond: () => getTerpeneResponses()['bisabolol'] },
  { patterns: [/אוקליפטול/i, /\beucalyptol\b/i, /\bcineole\b/i, /סינאול/i],        respond: () => getTerpeneResponses()['eucalyptol'] },
  { patterns: [/גרניול/i, /\bgeraniol\b/i],                                          respond: () => getTerpeneResponses()['geraniol'] },
  { patterns: [/אחסו/i, /לשמור/i, /שמירה/i, /שמר/i, /איך לאחסן/i],                 respond: () => STATIC.storage },
  { patterns: [/עובש/i, /עופש/i, /\bmold\b/i, /\bmould\b/i],                        respond: () => STATIC.mold },
  { patterns: [/לחות/i, /\bRH\b/i, /\bhumidity\b/i, /\bboveda\b/i],                 respond: () => STATIC.humidity },
  { patterns: [/טמפ/i, /\bvaporize\b/i, /ואפורייזר/i, /\bvaporizer\b/i, /אידוי/i], respond: () => STATIC.temperature },
  { patterns: [/\bPTSD\b/i, /פוסט.?טראומ/i, /טראומ/i],                             respond: () => buildIndicationResponse('ptsd') },
  { patterns: [/כאב/i, /נוירופתי/i, /\bpain\b/i, /פיברו/i],                        respond: () => buildIndicationResponse('chronic_pain') },
  { patterns: [/שינה/i, /נדודי\s*שינה/i, /\binsomni/i],                              respond: () => buildIndicationResponse('sleep') },
  { patterns: [/חרדה/i, /\banxiety\b/i, /\bGAD\b/i, /פאניקה/i],                    respond: () => buildIndicationResponse('anxiety') },
  { patterns: [/אפילפסי/i, /\bepileps/i, /\bseizure\b/i],                            respond: () => buildIndicationResponse('epilepsy') },
  { patterns: [/קרוהן/i, /\bcrohn/i, /\bIBD\b/i, /קוליטיס/i, /\bcolitis\b/i],     respond: () => buildIndicationResponse('crohns') },
];

const GREETING_RE = /^(שלום|היי|הי|שב"?ת שלום|בוקר טוב|ערב טוב|לילה טוב|מה שלומך|מה נשמע|מה קורה|מה המצב|hey|hello|hi\b|yo\b)/i;
const THANKS_RE   = /^(תודה|תנקס|תודה רבה|thanks|thank you)/i;
const ACK_RE      = /^(בסדר|אוקי|אוקיי|הבנתי|קיבלתי|מעולה|נכון|בדיוק|ok\b|okay\b)/i;

const OFFLINE_REPLY =
  'אני עובד במצב מנותק כרגע 📴\n\n' +
  'אני יכול לענות על:\n' +
  '• טרפנים — "מה זה מירסן?"\n' +
  '• אחסון — "איך לשמור?"\n' +
  '• התוויות — "מה עוזר לשינה?"\n\n' +
  'לשאלות על בתי מרקחת, מלאי חי ושאלות פתוחות — אתחבר כשיחזור האינטרנט 🌿';

// ── Public class ──────────────────────────────────────────────────────────────
export class BrowserLocalProvider extends ChatProvider {
  getName() { return 'browser-local'; }

  async isAvailable() { return true; }

  async sendMessage(message, _history, context = {}) {
    const trimmed = (message || '').trim();

    // Greeting / thanks / ack
    if (GREETING_RE.test(trimmed) || THANKS_RE.test(trimmed) || ACK_RE.test(trimmed)) {
      const name = context.dnaProfile?.name;
      let reply;
      if (THANKS_RE.test(trimmed)) {
        reply = 'בשמחה גדולה! 💚\nאני כאן בשבילך 24/7 — שאל על טרפנים, זנים, בתי מרקחת, או שלח תמונת תפריט לניתוח.';
      } else if (ACK_RE.test(trimmed)) {
        reply = 'מעולה 🙌 מה עוד אתה רוצה לדעת?';
      } else {
        reply = `שלום${name ? ` ${name}` : ''}! 🌿 אני צמח — העוזר הרפואי האישי שלך לקנאביס.\n\nמצב: עובד במנותק. אני יכול לענות על שאלות טרפנים, אחסון והתוויות.\n\nמה מעניין אותך היום?`;
      }
      return { reply, citations: [], local_fallback: true, intent: 'greeting', provider: 'browser-local' };
    }

    // Image — can't process offline
    if (context.image?.data) {
      return {
        reply: 'ניתוח תמונות דורש חיבור לשרת 📸\nכשהאינטרנט יחזור אוכל לפענח לך תפריטים תוך שניות!',
        citations: [], local_fallback: true, intent: 'IMAGE', provider: 'browser-local',
      };
    }

    // Intent A — local knowledge matching
    for (const rule of INTENT_A_RULES) {
      if (rule.patterns.some(p => p.test(trimmed))) {
        try {
          const raw = rule.respond();
          if (raw) {
            return {
              reply:          raw,
              citations:      [],
              local_fallback: true,
              intent:         'A',
              provider:       'browser-local',
            };
          }
        } catch { /* fall through */ }
      }
    }

    // No match — honest offline message
    return {
      reply:          OFFLINE_REPLY,
      citations:      [],
      local_fallback: true,
      intent:         'C',
      provider:       'browser-local',
    };
  }
}
