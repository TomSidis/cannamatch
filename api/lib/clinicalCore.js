// ─────────────────────────────────────────────────────────
//  קנאמאצ׳ — מנוע האמת הקליני (clinicalCore.js)
//  גנטיקה = מקור האמת · טרפנים = שכבת אימות · בטיחות = kill-switch
//  כל מיפוי מבוסס על המחקר שלנו (נוהל 106 + ספרות מאומתת)
// ─────────────────────────────────────────────────────────

import { getKillSwitchThreshold } from "../../src/data/killSwitchConfig.ts";

// קטגוריות יק"ר רשמיות (נוהל 106)
const YAKAR_CATEGORIES = {
  thc_rich: ["T22/C4", "T18/C3", "T15/C3", "T12/C2", "T10/C2"],
  balanced: ["T12/C12", "T10/C10", "T8/C8", "T5/C5", "T1/C1"],
  cbd_rich: ["T0/C26", "T1/C22", "T3/C18", "T3/C15", "T3/C12", "T5/C10"],
};

// מיפוי קליני: התוויה → גנטיקה+טרפנים חיוביים + טריגרים אסורים
// kill_switch: טרפנים שמאפסים את הציון מיידית (בטיחות לפני הכל)
const CLINICAL_MAP = {
  ptsd: {
    label_he: "פוסט-טראומה",
    positive_lineages: ["Kush", "Purple", "OG"],
    positive_terpenes: ["linalool", "myrcene", "caryophyllene"],
    kill_switch: ["terpinolene", "pinene"],   // מעוררים → סכנת עוררות/פאניקה
    preferred_categories: ["T15/C3", "T12/C12", "T10/C10"],
    evidence: "T3_contested",
    regulatory_warning: "המועצה הלאומית ל-PTSD המליצה נגד. הצג שני צדדים, הפנה לרופא.",
  },
  anxiety: {
    label_he: "חרדה",
    positive_lineages: ["Cookies", "Kush"],
    positive_terpenes: ["limonene", "linalool", "caryophyllene"],
    kill_switch: ["terpinolene"],
    preferred_categories: ["T1/C22", "T3/C15", "T10/C10"],
    evidence: "T1",
  },
  chronic_pain: {
    label_he: "כאב נוירופתי כרוני",
    positive_lineages: ["Diesel", "Chemdawg", "OG", "Kush"],
    positive_terpenes: ["caryophyllene", "myrcene", "humulene"],
    kill_switch: [],
    preferred_categories: ["T22/C4", "T18/C3", "T15/C3"],
    evidence: "T2",
  },
  fibromyalgia: {
    label_he: "פיברומיאלגיה",
    positive_lineages: ["Kush", "OG"],
    positive_terpenes: ["caryophyllene", "myrcene", "linalool"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T12/C12"],
    evidence: "T3",
  },
  endometriosis: {
    label_he: "אנדומטריוזיס",
    positive_lineages: ["Kush", "Cookies"],
    positive_terpenes: ["caryophyllene", "myrcene"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T10/C10"],
    evidence: "T3",
  },
  oncology: {
    label_he: "אונקולוגיה",
    positive_lineages: ["OG", "Kush", "Diesel"],
    positive_terpenes: ["myrcene", "limonene", "caryophyllene"],
    kill_switch: [],
    preferred_categories: ["T22/C4", "T18/C3"],
    evidence: "T2",
  },
  palliative: {
    label_he: "טיפול פליאטיבי",
    positive_lineages: ["Kush", "OG", "Cookies"],
    positive_terpenes: ["myrcene", "caryophyllene", "linalool"],
    kill_switch: [],
    preferred_categories: ["T22/C4", "T20/C4", "T15/C3"],
    evidence: "T2",
  },
  crohns: {
    label_he: "קרוהן",
    positive_lineages: ["Kush", "Cookies"],
    positive_terpenes: ["caryophyllene", "myrcene", "humulene"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T10/C10", "T1/C22"],
    evidence: "T1_emerging",
  },
  colitis: {
    label_he: "קוליטיס כיבית",
    positive_lineages: ["Kush", "Cookies"],
    positive_terpenes: ["caryophyllene", "humulene"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T1/C22", "T0/C26"],
    evidence: "T1_emerging",
  },
  ms: {
    label_he: "טרשת נפוצה",
    positive_lineages: ["Kush", "OG"],
    positive_terpenes: ["caryophyllene", "myrcene", "linalool"],
    kill_switch: [],
    preferred_categories: ["T10/C10", "T12/C12", "T8/C8"],
    evidence: "T2",
  },
  parkinsons: {
    label_he: "פרקינסון",
    positive_lineages: ["Kush"],
    positive_terpenes: ["linalool", "myrcene", "caryophyllene"],
    kill_switch: [],
    preferred_categories: ["T10/C10", "T3/C15"],
    evidence: "T3",
  },
  tourette: {
    label_he: "תסמונת טורט",
    positive_lineages: ["Kush", "OG"],
    positive_terpenes: ["linalool", "myrcene"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T10/C2"],
    evidence: "T3",
  },
  epilepsy: {
    label_he: "אפילפסיה עמידה",
    positive_lineages: ["CBD-rich"],
    positive_terpenes: ["linalool"],
    kill_switch: [],                       // CBD טהור — THC גבוה לא רצוי אך לא kill
    preferred_categories: ["T0/C26", "T1/C22", "T3/C18"],
    evidence: "T1_high",
  },
  autism: {
    label_he: "אוטיזם (ASD)",
    positive_lineages: ["CBD-rich"],
    positive_terpenes: ["linalool", "myrcene"],
    kill_switch: ["terpinolene", "pinene"], // רגישות לעוררות
    preferred_categories: ["T0/C26", "T1/C22"],
    evidence: "T3",
    regulatory_warning: "התוויה רגישה (כולל קטינים). חובת מומחה.",
  },
  hiv_wasting: {
    label_he: "תסמונת כחיון (HIV)",
    positive_lineages: ["OG", "Diesel"],
    positive_terpenes: ["myrcene", "limonene"],
    kill_switch: [],
    preferred_categories: ["T22/C4", "T18/C3"],
    evidence: "T2",
  },
  glaucoma: {
    label_he: "גלאוקומה",
    positive_lineages: ["OG", "Kush"],
    positive_terpenes: ["myrcene", "caryophyllene"],
    kill_switch: [],
    preferred_categories: ["T15/C3", "T10/C2"],
    evidence: "T3",
  },
};

const TERP_IDX = { myrcene:4, limonene:5, caryophyllene:6, linalool:7,
                   pinene:8, humulene:9, terpinolene:10, ocimene:11 };

function computeTerpeneTotal(sv) {
  return sv.reduce((s, x, i) => (i >= 4 ? s + x : s), 0) || 1;
}

function filterLineageByFamilies(lineage = "", families = []) {
  const l = lineage.toLowerCase();
  return families.filter((f) => l.includes(f.toLowerCase()));
}

/**
 * verifyClinicalSafety — שער הבטיחות. מחזיר boolean + payload.
 * strainData  = { lineage, embedding:[12], category }
 * userProfile = { indications:[...] }
 */
function verifyClinicalSafety(strainData, userProfile) {
  const sv = strainData.embedding;
  const inds = userProfile.indications || [];
  const total = sv ? computeTerpeneTotal(sv) : 1;

  for (const ind of inds) {
    const map = CLINICAL_MAP[ind];
    if (!map) continue;

    // ── kill-switch: טריגר נוכח → אפס מיידי ──
    for (const trig of map.kill_switch) {
      const frac = sv ? (sv[TERP_IDX[trig]] || 0) / total : 0;
      if (frac >= getKillSwitchThreshold(trig)) {
        const TERP_HE = { terpinolene: "טרפינולן", pinene: "פינן" };
        return {
          safe: false,
          score_override: 0,
          flag: `trigger_${trig}_for_${ind}`,
          indication: map.label_he,
          trigger: TERP_HE[trig] || trig,
          // טון חבר — מזהיר אבל לא מפחיד
          companion_message:
            `רגע, עצור! 🛑 הזן הזה עמוס ב${TERP_HE[trig] || trig} — וזה בדיוק מה ` +
            `שמדליק לך את ה${map.label_he}. חסמתי אותו בשבילך. הלב שלך יודה לי אחר כך. 💚`,
        };
      }
    }
  }

  return { safe: true, score_override: null, flag: null,
           companion_message: null };
}

export { CLINICAL_MAP, YAKAR_CATEGORIES, verifyClinicalSafety, filterLineageByFamilies, TERP_IDX };
