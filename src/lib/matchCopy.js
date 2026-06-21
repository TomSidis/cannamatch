// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — Friend-voice match copy generation
//  Pure functions, no DOM, no side-effects.
//  These produce the warm "why" text that appears under each match —
//  the sentence that makes the user feel "this gets me."
// ─────────────────────────────────────────────────────────────────────────────

import { TERPENES } from '../data/strainsConfig.js';
import { terp as terpHuman } from './terpeneToHuman.js';

// ── Indication-specific warm copy ────────────────────────────────────────────
// Each key = indication id from REASONS.
// terpBoost = per-terpene copy override — more specific than the base copy.
const IND_COPY = {
  sleep: {
    high: 'ינוח לך בלילה — מירצן ולינלול ביחד עושים כאן עבודה שקטה ועמוקה 🌙',
    mid:  'יכול לתמוך בשינה — לא הייתי שם אותו ראשון, אבל הפרופיל שלך מתאים',
    terpBoost: {
      myrcene:  'מירצן גבוה = שינה עמוקה יותר, בלי קהות בבוקר. זה הזן שאנשים כמוך בוחרים לפני השינה 🌙',
      linalool: 'לינלול — הרגעה עדינה שמכניסה לשינה בלי ה-"נחיתה" שמגיעה עם זנים כבדים',
      myrcene_linalool: 'מירצן + לינלול ביחד — השניים שהכי מדווחים עליהם לשינה עמוקה בפרופיל שלך',
    },
  },
  pain: {
    high: 'קריופילן גבוה = פועל על הכאב ישירות, בלי להעמיס על הראש. הגוף ירגיש את זה 💪',
    mid:  'יש כאן קצת קריופילן — יסייע לכאב, לא יפתור לבד',
    terpBoost: {
      caryophyllene: 'נוגד-דלקת ישיר — הטרפן שעובד על הגוף, לא על הראש. מה שצריכים אנשים כמוך',
      myrcene:       'מרפה שרירים בשקט, בלי ריחוף — טוב לכאב כרוני שלא מרפה',
      humulene:      'הומולן + קריופילן — צמד נוגד-דלקת שעובד ברקע, לא תרגיש "גבוה" ממנו',
    },
  },
  anxiety: {
    high: 'לימונן + לינלול = כמו מזגן לחרדה. מרגיע בלי להרדים, מרים בלי לזרז 🍋',
    mid:  'יש כאן טרפנים שעוזרים לחרדה — תלוי בעוצמה שלך',
    terpBoost: {
      limonene: 'לימונן מרים את מצב הרוח — פחות ראש כבד, יותר בהירות. זה מה שאנשים כמוך בוחרים ביום',
      linalool: 'לינלול — הרגעה עדינה בלי מחיר של ישנוניות. מאוזן ונקי',
      terpinolene: 'טרפינולן + לימונן — מרוממים, בלי להכניס לתוך הראש',
    },
  },
  ptsd: {
    high: 'לינלול + קריופילן — הצמד שהכי מדווח עליו לפוסט-טראומה בפרופילים דומים לשלך',
    mid:  'מתאים חלקית — יש כאן מרכיבים שמרגיעים, אבל לא התאמה מלאה לפרופיל שלך',
    terpBoost: {
      linalool:      'לינלול — מוריד עוררות. עוזר לשבת עם מה שקשה לשבת איתו, בלי לברוח ממנו',
      caryophyllene: 'קריופילן — עוזר לדלקת הכרונית שנלווית לרוב ל-PTSD',
      myrcene:       'מירצן — שקט גופני שמאפשר להניח את המשא לשעות',
    },
  },
  focus: {
    high: 'פינן — ריח יערות אורן, ממוקד ובהיר. הבחירה ליום שצריך ראש צלול בלי להיות בענן 🌲',
    mid:  'יש כאן קצת פינן — יסייע לריכוז, לא יפגע',
    terpBoost: {
      pinene:      'פינן = ריכוז ועירנות — לא מנמנם, לא מטשטש. זה מה שאנשים כמוך מחפשים ביום',
      terpinolene: 'טרפינולן מרענן — אנרגיה נקייה לבוקר ולצהריים בלי ריחוף',
      limonene:    'לימונן + פינן — מרים וממקד. מכינה טוב לשעות עבודה',
    },
  },
  appetite: {
    high: 'מירצן גבוה + אינדיקה = מעורר תיאבון קלאסי. יאללה, לאכול בשלום 🍽️',
    mid:  'יסייע לתיאבון — לא הבחירה הראשונה, אבל בהחלט תורם',
    terpBoost: {
      myrcene:  'מירצן — מרגיע את הגוף ומאפשר לאכול בנינוחות, בלי הלחץ שמונע',
      limonene: 'לימונן מרים את מצב הרוח לצד הארוחה — עושה את האכילה לחוויה',
    },
  },
  gi: {
    high: 'קריופילן + הומולן — השניים שהכי עובדים על מערכת העיכול בפרופילים דומים לשלך',
    mid:  'יש כאן קצת תמיכה למערכת העיכול — לא הספציפי ביותר',
    terpBoost: {
      caryophyllene: 'קריופילן — נוגד-דלקת שעובד גם על דרכי העיכול',
      humulene:      'הומולן — עוזר בנפיחות ואי-נוחות בבטן, ברקע שקט',
    },
  },
  diabetes: {
    high: 'קריופילן + לינלול — מה שמדווח לנוירופתיה בפרופילים קרובים לשלך',
    mid:  'מתאים חלקית — מבנה טרפני קרוב לפרופיל שלך',
    terpBoost: {
      caryophyllene: 'קריופילן — נוגד-דלקת עצבי ישיר',
      linalool:      'לינלול — מרגיע את הרגישות העצבית, עוזר לשינה עם כאב',
    },
  },
};

const KIND_SUFFIX = {
  'אינדיקה': 'מתאים יותר לערב ולמנוחה',
  'סאטיבה':  'יום — נקי ועירני יותר',
  'היברידי': 'מאוזן — טוב יום וערב',
};

/**
 * friendWhy — returns a warm Hebrew sentence explaining this strain match.
 * Used under each match card. One sentence, max.
 *
 * @param {object} strain  - from STRAINS catalog (has terps, effects, kind)
 * @param {object} profile - output of buildProfile (terpene weight map)
 * @param {object} ans     - onboarding answers (reasons[], helped[], etc.)
 * @returns {string}
 */
export function friendWhy(strain, profile, ans) {
  const reasons    = ans?.reasons || [];
  const topReason  = reasons[0];
  const terps      = strain.terps || {};

  // Find the terpene in THIS strain that has the highest combined relevance score
  // (profile weight × strain intensity = how much this terp matters to this user for this strain)
  const topStrainTerp = Object.entries(terps)
    .filter(([, v]) => v > 0.3)
    .sort(([ta, va], [tb, vb]) => (profile[tb] || 0) * vb - (profile[ta] || 0) * va)[0]?.[0];

  const kindSuffix = KIND_SUFFIX[strain.kind];

  // Indication-specific copy with terpene override
  if (topReason && IND_COPY[topReason]) {
    const indCopy = IND_COPY[topReason];
    const isEffectMatch = (strain.effects || []).includes(topReason);

    // Check for multi-terpene combo key first (e.g. "myrcene_linalool")
    const topTerps = Object.entries(terps)
      .filter(([, v]) => v > 0.4)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([t]) => t);
    const comboKey = topTerps.sort().join('_');
    if (indCopy.terpBoost?.[comboKey]) {
      const line = indCopy.terpBoost[comboKey];
      return kindSuffix ? `${line} · ${kindSuffix}` : line;
    }

    // Single terpene boost
    if (topStrainTerp && indCopy.terpBoost?.[topStrainTerp]) {
      const line = indCopy.terpBoost[topStrainTerp];
      return kindSuffix ? `${line} · ${kindSuffix}` : line;
    }

    const line = isEffectMatch ? indCopy.high : indCopy.mid;
    return kindSuffix ? `${line} · ${kindSuffix}` : line;
  }

  // Generic terpene-based fallback (no indication set)
  if (topStrainTerp && TERPENES[topStrainTerp]) {
    const meta = TERPENES[topStrainTerp];
    const line = `${terpHuman(topStrainTerp,'shortLabel')} דומיננטי — ${meta.flavor}`;
    return kindSuffix ? `${line} · ${kindSuffix}` : line;
  }

  return kindSuffix ? `מתאים לפרופיל שלך · ${kindSuffix}` : 'מתאים לפרופיל שלך — נסה ותדווח 🌱';
}

/**
 * killSwitchSummary — describes what was filtered out and why.
 * Returns null if nothing meaningful was filtered.
 *
 * @param {object} profile      - terpene weight map (negative values = avoid)
 * @param {number} totalBefore  - strains before kill-switch filter
 * @param {number} totalAfter   - strains after filter
 * @returns {string|null}
 */
export function killSwitchSummary(profile, totalBefore, totalAfter) {
  const filtered = totalBefore - totalAfter;
  if (filtered <= 0) return null;

  const avoidedTerps = Object.entries(profile)
    .filter(([, v]) => v < -0.5)
    .sort(([, a], [, b]) => a - b)          // most avoided first
    .slice(0, 2)
    .map(([t]) => terpHuman(t, 'shortLabel') || t);

  if (!avoidedTerps.length) {
    return `🛡️ הסרתי ${filtered} זנים שלא מתאימים לפרופיל שלך`;
  }

  return `🛡️ הסרתי ${filtered} זנים עם ${avoidedTerps.join(' ו-')} גבוה — זוהה כטריגר בפרופיל שלך`;
}

/**
 * computeMapDiff — compares top-10 rankings before and after a rating change.
 * Returns { added, removed } — used for the "map updated" moment animation.
 *
 * @param {object}   ans        - onboarding answers
 * @param {object}   oldRatings - ratings before the new report
 * @param {object}   newRatings - ratings after the new report
 * @param {Function} scoreAllFn - (ans, ratings) => Strain[] sorted best-first
 * @param {number}   topN       - how many top results to compare (default 8)
 * @returns {{ added: number, removed: number }}
 */
export function computeMapDiff(ans, oldRatings, newRatings, scoreAllFn, topN = 8) {
  try {
    const before = new Set(scoreAllFn(ans, oldRatings).slice(0, topN).map(s => s.id));
    const after  = new Set(scoreAllFn(ans, newRatings).slice(0, topN).map(s => s.id));
    const added   = [...after].filter(id => !before.has(id)).length;
    const removed = [...before].filter(id => !after.has(id)).length;
    return { added, removed };
  } catch {
    return { added: 0, removed: 0 };
  }
}

/**
 * nextExperimentStrain — the top untried strain from the ranked list.
 *
 * @param {object[]} scored  - sorted scored strains (best first)
 * @param {string[]} tried   - strain IDs user has already rated or marked as tried
 * @returns {object|null}
 */
export function nextExperimentStrain(scored, tried = []) {
  return scored.find(s => !tried.includes(s.id)) || null;
}
