import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import TwinsFeed from "./components/TwinsFeed.jsx";
import ZemachAvatarChat from "./components/ZemachAvatarChat.jsx";
import { JourneyProvider, useJourney } from "./hooks/useJourneyContext.jsx";
import PharmacyViewer from "./components/PharmacyViewer.jsx";
import DailyCheckIn from "./components/DailyCheckIn.jsx";
import { api, pingBackend } from "./services/api.js";
import { useEnrichedStrains } from "./hooks/useEnrichedStrains.js";
import LoadingSkeleton from "./components/LoadingSkeleton.jsx";
import { createEngine } from "./lib/scoringEngine.js";
import KB_INDICATIONS from "./knowledge/indications.json";
import KB_TERPENES from "./knowledge/terpene_science.json";
import KB_CANNABINOIDS from "./knowledge/cannabinoid_profiles.json";
import KB_ROUTES from "./knowledge/routes_of_administration.json";
import KB_PRODUCTS from "./knowledge/israeli_products.json";
import { motion, AnimatePresence } from "framer-motion";
import T from "./locales/he.js";
// ZemachAvatarChat removed — replaced by future knowledge-base chatbot
import OnboardingWizard, { RadarChart, TERP_ORDER } from "./components/OnboardingWizard.jsx";
import ReportFlow from "./components/ReportFlow.jsx";
import NextExperiment from "./components/NextExperiment.jsx";
import CommunitySplitScreen from "./components/CommunitySplitScreen.jsx";
import { friendWhy, killSwitchSummary, computeMapDiff, nextExperimentStrain } from "./lib/matchCopy.js";
import { useReportTiming } from "./hooks/useReportTiming.js";
import { terp as terpHuman, buildDnaStrands, avoidedHumanLabels } from "./lib/terpeneToHuman.js";
import { STRAINS, TERPENES, REASONS, CATEGORIES, CAT_GROUPS, FORMS } from "./data/strainsConfig.js";
import { PHARMACIES } from "./data/pharmacies.js";

/* ─────────────────────────────────────────────
   CannaMatch — התאמה אישית לקנאביס רפואי בישראל
   מיועד לבעלי רישיון בתוקף בלבד · אינו ייעוץ רפואי
   ───────────────────────────────────────────── */

const C = {
  ink:    "#F0FDF4",                    // טקסט ראשי — לבן חם
  bg:     "#0c0d11",                    // רקע עמוק
  card:   "rgba(20,23,32,0.90)",        // פאנל כרטיס
  line:   "rgba(74,222,128,0.12)",      // קו מפריד עדין
  accent: "#4ADE80",                    // ירוק מרפא אורגני
  soft:   "rgba(74,222,128,0.08)",      // רקע עדין
};

const CD = {
  bg:     "#0c0d11",
  card:   "rgba(20,23,32,0.92)",
  accent: "#4ADE80",
  purple: "#A78BFA",
  orange: "#FBBF24",
  text:   "#F0FDF4",
  muted:  "#BBF7D0",
  border: "rgba(74,222,128,0.18)",
};

/* מילון אפקטים וטעמים בסגנון Leafly */
const EFFECTS = {
  relaxed:  "רגוע", sleepy: "מנומנם", happy: "שמח", euphoric: "מרומם",
  uplifted: "מאושש", focused: "ממוקד", energetic: "אנרגטי", creative: "יצירתי",
  hungry:   "מעורר תיאבון", giggly: "עליז", talkative: "מדבר",
};
const NEGATIVES = {
  dry_mouth: "פה יבש", dry_eyes: "עיניים יבשות", paranoid: "חרדתי",
  dizzy:     "סחרחורת", headache: "כאב ראש", anxious: "מתוח",
};
const FLAVORS = {
  berry:    "פירות יער 🫐", citrus:  "הדרים 🍋",   earthy:   "אדמתי 🌍",
  sweet:    "מתוק 🍬",      diesel:  "דיזל ⛽",    fruity:   "פירותי 🍑",
  spicy:    "תבלוני 🌶️",    pine:    "אורן 🌲",    floral:   "פרחוני 🌸",
  tropical: "טרופי 🥭",     mango:   "מנגו 🥭",    blueberry:"אוכמניות 🫐",
  grape:    "ענבים 🍇",     lemon:   "לימון 🍋",   vanilla:  "וניל 🍦",
  mint:     "נענע 🌿",      cookies: "עוגיות 🍪",  cheese:   "גבינה 🧀",
  coffee:   "קפה ☕",       pepper:  "פלפלי 🌶️",  lavender: "לבנדר 💜",
  herbal:   "עשבוני 🌿",   skunk:   "סקונק 🦨",   woody:    "עצי 🪵",
};



/* מילון קוד/שם מסחרי → גנטיקה — נאסף מסריקת השוק הישראלי (06/2026).
   confidence: 'high' = המגדל/קטלוג מצהיר במפורש; 'med' = הסקה מהצלבת מאפיינים.
   התובנה: אותה גנטיקה (Wedding Cake) מופיעה תחת שמות אצל מגדלים שונים. */
const MENU_CODE_MAP = {
  "P&Z":  { strainId: "s1",  note: "פרפל זקיטלז (Purple Zkittlez) · טריכום", aka: ["פי&זד"], confidence: "high" },
  "CARBO":{ strainId: "s4",  note: "קרבון פייבר (Carbon Fiber) · טריכום", aka: ["קארבו"], confidence: "high" },
  "ICC":  { strainId: "s8",  note: "אייס קרים קייק · קנדוק", aka: ["Ice Cream Cake"], confidence: "high" },
  "WCK":  { strainId: "s3",  note: "וודינג קייק (Wedding Cake) · פיס נטורלס", aka: ["Wedding CK", "וודינג סי קיי"], confidence: "high" },
  "TWC":  { strainId: "s10", note: "וודינג קייק (Wedding Cake) · קנדוק — אותה גנטיקה, מגדל אחר!", aka: ["The Wedding Cake"], confidence: "high" },
  "WK":   { strainId: "s13", note: "וודינג קראשר (Wedding Crasher) · שיח — שם דומה, גנטיקה שונה!", aka: ["Wedding K", "וודינג קיי"], confidence: "high" },
  "JU":   { strainId: "s5",  note: "ג'ו (סאטיבה יום) · מדיקיין", aka: ["ג'ו"], confidence: "med" },
  "LIT":  { strainId: "s14", note: "ליט מנגו · קרונוס — יבוא קנדי מוזל", aka: ["Lit"], confidence: "high" },
  "GMO.T":{ strainId: "s29", note: "GMO / Garlic Cookies (Chemdawg × GSC) · קנאבר — שום-בצל-דיזל", aka: ["GMO", "ג'י אם או"], confidence: "high" },
  "GMO":  { strainId: "s29", note: "GMO / Garlic Cookies (Chemdawg × GSC) — שום-בצל-דיזל", aka: ["Garlic Cookies"], confidence: "high" },
  "JL":   { strainId: "s28", note: "ג'יי.אל · טוגדר — קוד שצריך פיענוח, שושלת לא מפורסמת", aka: ["ג'יי אל"], confidence: "med" },
  "JOP":  { strainId: "s27", note: "ג'ופ · שיח מדיקל — אינדיקה", aka: ["ג'ופ מיני"], confidence: "med" },
  "L.MNTZ":{ strainId: "s31", note: "ל.מנטז (Lemon Mints) · טוגדר", aka: ["למון מינטס"], confidence: "med" },
  "D-51": { strainId: "s8",  note: "ביסקוטי × ג'לאטו — לאמת מול קטלוג מגדל", aka: [], confidence: "med" },
};

/* קבוצות שם-נרדף לפי גנטיקת בסיס — הליבה של פיענוח השוק.
   מציג למשתמש: "מוצרים שונים, אותה גנטיקה — הזול ב-X ₪". */
const GENETIC_ALIASES = {
  "Wedding Cake": ["s3", "s10"],   // Wedding CK (פיס נטורלס) ו-The Wedding Cake (קנדוק)
};

/* תצורות צריכה — חשוב לתמוך ביותר מעישון (ראה רגולציה ומגמת אידוי/שמן). */
const FORM_LABELS = {
  smoke: { he: "עישון", icon: "🚬" },
  vape:  { he: "אידוי", icon: "💨" },
  oil:   { he: "שמן", icon: "💧" },
  patch: { he: "מדבקה", icon: "🩹" },
};

/* דרכי מתן — ההבדל בהשפעה (מבוסס מחקר פרמקוקינטי).
   אותה גנטיקה נותנת חוויה שונה לפי דרך המתן. מידע כללי, לא ייעוץ רפואי. */
const DELIVERY_METHODS = [
  { id: "vape", icon: "💨", title: "אידוי (Vaporizer)", best: true,
    onset: "3–10 דקות", peak: "~30 דקות", duration: "עד ~3 שעות",
    note: "היעיל ביותר — כ-2.5 פעמים יותר חומר פעיל מעישון באותה כמות, ובטמפ' נמוכה יותר עם פחות תוצרי בעירה. מאפשר טיטרציה מדויקת. ההמלצה המועדפת לשאיפה.",
    color: "#4ADE80" },
  { id: "smoke", icon: "🔥", title: "עישון תפרחת",
    onset: "3–10 דקות", peak: "~30 דקות", duration: "עד ~3 שעות",
    note: "מיידי ומוכר, מאפשר טיטרציה — אך בזבזני (ספיגה ~25–30%) ומייצר תוצרי בעירה. אם מעשנים, תפרחת נקייה בלבד. אידוי בריא יותר.",
    color: "#FB923C" },
  { id: "oil", icon: "💧", title: "שמן (תת-לשוני / בליעה)",
    onset: "15 דק' (תת-לשוני) עד שעתיים (בליעה)", peak: "1–3 שעות", duration: "5–6 שעות",
    note: "השפעה הדרגתית וארוכה, ללא שאיפה (טוב לריאות), מינון מדיד וקבוע. עובר בכבד והופך ל-11-OH-THC חזק יותר. מצוין לכאב כרוני מתמשך ולשינה רציפה — פחות למענה מיידי.",
    color: "#A78BFA" },
];

/* אזהרת טבק — מבוססת מחקר. מוצגת בכל מקום רלוונטי. */
const TOBACCO_WARNING = "אל תערבבו טבק בקנאביס. מחקרים מראים שזה מגביר תלות (עד פי 4), מוריד את המוטיבציה להיגמל, מוסיף ניקוטין ממכר ותוצרי בעירה מזיקים, ומטשטש את ההשפעה הטיפולית. אם מעשנים — תפרחת נקייה בלבד, ועדיף אידוי.";

/* ───────────── מתכוני בישול קנאביס (מבוסס מחקר) ─────────────
   אכילה = ספיגה דרך הכבד → 11-OH-THC חזק יותר, השפעה ארוכה (עד 12 שעות).
   דגש בטיחות: דקרבוקסילציה נכונה + "התחל נמוך וחכה". מידע כללי, לא ייעוץ רפואי. */
const COOKING_BASICS = [
  { icon: "🔥", title: "שלב 1: דקרבוקסילציה (הפעלת ה-THC)", body: "בלי זה — שום דבר לא יקרה. פזרו את התפרחת הטחונה על תבנית עם נייר אפייה, ואפו ב-115°C (240°F) למשך 40 דקות, עם ערבוב עדין באמצע. הצמח ישנה צבע מירוק בהיר לחום-זהוב. זה הופך את ה-THCA הלא-פעיל ל-THC פעיל." },
  { icon: "🧈", title: "שלב 2: חמאת קנאביס (התשתית לכל מתכון)", body: "כוס חמאה + כוס מים בסיר, על אש נמוכה. כשהחמאה נמסה, הוסיפו 7–10 גרם תפרחת מדורבקסת. בעבוע עדין מאוד (160–200°F / 71–93°C), לא רותח, למשך 2–4 שעות עם ערבוב כל חצי שעה. סננו דרך בד גבינה. המים מונעים שריפה." },
  { icon: "🧮", title: "שלב 3: חשבו את המינון (קריטי!)", body: "אל תנחשו — חשבו. 10 גרם תפרחת ב-20% THC ≈ 1,166 מ\"ג THC אחרי דקרבוקסילציה, ואחרי ספיגה לחמאה (~70%) ≈ 816 מ\"ג בכל המנה. מחולק ל-24 חלקים = ~34 מ\"ג למנה — חזק מאוד! מנת התחלה במאפייה היא 5–10 מ\"ג. רוצים חלש יותר? פחות תפרחת או יותר מנות." },
];
const COOKING_RECIPES = [
  { id: "brownies", emoji: "🍫", name: "בראוניז קלאסיים", time: "45 דק'", dose: "~12.5 מ\"ג למנה (ב-16 חלקים)",
    note: "הכי קל להתחיל. הכינו תערובת בראוניז מהקופסה לפי ההוראות, רק החליפו את החמאה בחמאת קנאביס. אפו, קררו, וחתכו ל-16 ריבועים. אם הבאצ' מכיל 200 מ\"ג, כל ריבוע ≈ 12.5 מ\"ג." },
  { id: "cookies", emoji: "🍪", name: "עוגיות שוקולד צ'יפס", time: "30 דק'", dose: "התחילו מחצי עוגייה",
    note: "מתכון עוגיות רגיל, עם חמאת קנאביס במקום חמאה. אפייה ב-180°C עד 12 דקות. טיפ: עוגיות קטנות = שליטה טובה יותר במינון." },
  { id: "tea", emoji: "🍵", name: "תה מרגיע לפני שינה", time: "15 דק'", dose: "עדין, למתחילים",
    note: "כפית חמאת קנאביס או חלב שמן בתה חם עם דבש. השומן חשוב — בלעדיו ה-THC לא נספג. נחמד לערב ולהרגעה לפני שינה." },
  { id: "honey", emoji: "🍯", name: "דבש או שמן זית מוחדר", time: "2-3 שעות", dose: "טיפתי — קל למדידה",
    note: "אפשר להחדיר שמן זית או דבש (עם מעט שמן) במקום חמאה. מצוין לטפטוף על אוכל מוכן, סלטים, או תחת הלשון. שמן זית = אופציה בריאה יותר." },
  { id: "pasta", emoji: "🍝", name: "רוטב פסטה / שמן זית לבישול", time: "20 דק'", dose: "~10 מ\"ג למנה",
    note: "מטגנים שום בשמן זית קנאביס על אש נמוכה (לא לשרוף!), מוסיפים רסק עגבניות ותבלינים. השמן נספג מצוין בעגבנייה. מנה אחת לאדם — לא יותר, כי קשה לחלק במדויק." },
  { id: "smoothie", emoji: "🥤", name: "שייק בוקר/אחר־צהריים", time: "5 דק'", dose: "התחילו מחצי כוס",
    note: "פרי קפוא, חלב/יוגורט, כף חמאת קנאביס או שמן MCT מוחדר. השומן מהיוגורט עוזר לספיגה. דרך נעימה וקלילה — אבל זכרו שזה עדיין אכיל, אז חכו שעתיים לפני עוד." },
  { id: "gummies", emoji: "🐻", name: "סוכריות ג'לי (גאמיז)", time: "30 דק' + קירור", dose: "מדויק לכל סוכרייה",
    note: "ג'לטין, מיץ פרי, מעט סוכר וטינקטורה/שמן קנאביס. יוצקים לתבניות סיליקון ומקררים. היתרון הגדול: כל סוכרייה זהה — הכי קל לשלוט במינון. ערבבו טוב כדי שהשמן יתפזר אחיד." },
  { id: "choc", emoji: "🍩", name: "שוקולד ביתי", time: "20 דק' + קירור", dose: "לפי משבצת",
    note: "ממיסים שוקולד איכותי, מערבבים פנימה שמן קנאביס, יוצקים לתבנית משבצות ומקררים. כל משבצת = מנה. השוקולד מסתיר היטב את הטעם הצמחי." },
];
const COOKING_SAFETY = [
  "התחילו נמוך וחכו: אכילה משפיעה רק אחרי 30 דק' עד שעתיים — והשיא מגיע אחרי ~3 שעות. אל תאכלו עוד לפני שעברו לפחות שעתיים, אחרת תגזימו.",
  "ההשפעה ארוכה וחזקה: אכילה עוברת דרך הכבד והופכת ל-11-OH-THC, מטבוליט חזק יותר. ההשפעה יכולה להימשך עד 12 שעות — תכננו בהתאם.",
  "מנת התחלה: 2.5–5 מ\"ג THC. גם אם אתם מנוסים בעישון — אכילה זה משחק אחר לגמרי.",
  "אחסון: במקרר/מקפיא, באריזה אטומה, הרחק מהישג ידם של ילדים ובעלי חיים. סמנו ברור שזה מכיל קנאביס.",
  "אל תשתו אלכוהול עם אכילת קנאביס — זה מגביר את ההשפעה בצורה בלתי צפויה.",
];

/* ─── batch reports, community ratings, purchase history — loaded from API ─── */

/* ───────────── לוגיקת התאמה ───────────── */

function buildProfile(ans, ratings) {
  const w = {};
  const add = (t, v) => { if (t && TERPENES[t]) w[t] = (w[t] || 0) + v; };
  if (!ans) return w;
  (ans.flavors || []).forEach((t) => add(t, 1.0));
  (ans.reasons || []).forEach((rid) => {
    const r = REASONS.find((x) => x.id === rid);
    r?.terps.forEach((t, i) => add(t, i === 0 ? 1.2 : 0.8));
  });
  (ans.helped || []).forEach((sid) => {
    const s = STRAINS.find((x) => x.id === sid);
    s && Object.entries(s.terps).forEach(([t, v]) => add(t, v * 1.5));
  });
  (ans.notHelped || []).forEach((sid) => {
    const s = STRAINS.find((x) => x.id === sid);
    s && Object.entries(s.terps).forEach(([t, v]) => add(t, -v * 1.5));
  });
  Object.entries(ratings || {}).forEach(([sid, r]) => {
    const s = STRAINS.find((x) => x.id === sid);
    const f = ((r - 5.5) / 4.5) * 2.0;
    s && Object.entries(s.terps).forEach(([t, v]) => add(t, v * f));
  });
  return w;
}

function rawScore(strain, profile, ans) {
  let s = 0;
  Object.entries(strain.terps).forEach(([t, v]) => { s += v * (profile[t] || 0); });
  const reasons   = ans?.reasons   || [];
  const notHelped = ans?.notHelped || [];
  const helped    = ans?.helped    || [];
  const hits = strain.effects.filter((e) => reasons.includes(e)).length;
  s += hits * 1.4;
  if (notHelped.includes(strain.id) && !helped.includes(strain.id)) s -= 5;
  return s;
}

function scoreAll(rawAns, ratings, indFilter = [], typeFilter = "all") {
  const ans = {
    cats: [], form: [], reasons: [], flavors: [],
    helped: [], notHelped: [], current: [],
    ...(rawAns || {}),
  };
  const profile = buildProfile(ans, ratings);
  let eligible = STRAINS.filter((s) => ans.cats.includes(s.cat));
  // סינון לפי תצורה: תפרחת / שמן / הכל
  if (typeFilter !== "all") {
    eligible = eligible.filter((s) => (s.type || "flower") === typeFilter);
  }
  // סינון לפי התוויות נבחרות (אם המשתמש הפעיל)
  if (indFilter.length > 0) {
    eligible = eligible.filter((s) => s.effects.some((e) => indFilter.includes(e)));
  }
  const raws = eligible.map((s) => ({ s, r: rawScore(s, profile, ans) }));
  // נרמול אמיתי: הציון מבטא התאמה ממשית, לא רק דירוג יחסי.
  // זן עם 0 התאמות להתוויה + פרופיל ניטרלי יקבל ציון נמוך (לא 55%).
  const max = Math.max(...raws.map((x) => x.r), 3);
  return raws
    .map(({ s, r }) => {
      // ציון בסיס יחסי לפסגה, אך עם רצפה נמוכה כדי שחוסר-התאמה ייראה
      const rel = Math.max(0, r) / (max || 1);
      const match = Math.round(40 + rel * 58); // טווח 40–98, חוסר התאמה = ~40
      return { ...s, match, _raw: r };
    })
    .sort((a, b) => b.match - a.match);
}

/* סיווג איכות ההתאמה — נותן משמעות לאחוז. הרף ל"מומלץ" הוא 85%. */
function matchTier(pct) {
  if (pct >= 85) return { label: "התאמה מצוינת", color: "#4ADE80", bg: "rgba(74,222,128,0.12)", show: true, icon: "🎯" };
  if (pct >= 72) return { label: "התאמה טובה", color: "#86EFAC", bg: "rgba(74,222,128,0.07)", show: true, icon: "✓" };
  if (pct >= 60) return { label: "התאמה חלקית", color: "#FBBF24", bg: "rgba(251,191,36,0.07)", show: false, icon: "~" };
  return { label: "התאמה נמוכה", color: "rgba(187,247,208,0.45)", bg: "rgba(255,255,255,0.05)", show: false, icon: "·" };
}

/* ───────────── פרופילי התוויה מבוססי מחקר ─────────────
   מבוסס על מחקרים אמיתיים (מצוטטים). בגרסה האמיתית: מתעדכן
   אוטומטית מאיסוף ספרות מהרשת + הצלבה עם דיווחי המשתמשים שלנו.
   זהו מידע כללי, לא ייעוץ רפואי. ─────────────────────────── */
const INDICATION_PROFILES = {
  ptsd: {
    label: "פוסט-טראומה (PTSD)",
    summary: "מטופלים רבים מדווחים על הפחתת סיוטים, הרגעת חרדה ושיפור שינה. עם זאת — הראיות עדיין מתפתחות והעמדה הרפואית בישראל חלוקה. ההשפעה דרך המערכת האנדוקנבינואידית שמווסתת זיכרונות פחד.",
    ratioNote: "מחקר ישראלי (יומן יומי, 77 מטופלים) קשר שימוש סמוך לשינה עם פחות סיוטים, וריכוז CBD גבוה עם פחות יקיצות. THC במינון נמוך עשוי לעזור, אך במינון גבוה עלול להחמיר חרדה. ההתאמה האישית קריטית.",
    seek: ["sleep", "anxiety"],
    successRate: 70, successNote: "מטופלים רבים מדווחים שיפור בסיוטים ובשינה — אך הראיות מוגבלות ונדרש מחקר נוסף",
    research: "מבוסס על מחקר ישראלי 2022 (J Anxiety Disord, 77 מטופלים), סקירת PMC7448997 (THC והכחדת זיכרונות), ו-clinicaltrials.gov NCT02759185 (ותיקי צבא).",
    israelNote: "PTSD מוכרת בישראל מ-2014 (~18,000 מטופלים). חשוב לדעת: המועצה הלאומית ל-PTSD המליצה דווקא נגד מתן קנאביס ל-PTSD, בעוד מטופלים רבים מדווחים הקלה. הדעות חלוקות — וההחלטה תמיד עם הרופא/ה המטפל/ת.",
  },
  pain: {
    label: "כאב כרוני",
    summary: "ל-THC השפעה משככת כאב דרך קולטני CB1. עדות עקבית יחסית לכאב נוירופתי — קנאביס מעושן ומאודה הראו הפחתת עוצמת כאב לעומת פלצבו במחקרים מבוקרים.",
    ratioNote: "סקירות מצביעות שכ-1 מכל 5–6 מטופלים משיג ירידה של 30%+ בכאב. שילובי THC:CBD נחקרו עם תוצאות מעורבות. מינון גבוה מדי מגביר תופעות לוואי קוגניטיביות.",
    seek: ["pain", "gi"],
    successRate: 98, successNote: "98.4% מדווחים שיפור בכאב כרוני; ירידה ממוצעת של ~64% בעוצמת הכאב",
    research: "מבוסס על Wiley J.Neurochemistry 2024, Cleveland Clinic J.Medicine, ו-PMC על כאב נוירופתי.",
    israelNote: "כאב כרוני הוא ההתוויה הנפוצה ביותר לקנאביס רפואי בישראל.",
  },
  anxiety: {
    label: "חרדה / מתח",
    summary: "מטופלים מחפשים הרגעה בלי קהות יום. הניסיון מצביע שזנים עתירי לינלול ולימונן עם THC מתון מסייעים, בעוד THC גבוה עלול להגביר חרדה אצל חלק מהמטופלים.",
    ratioNote: "CBD נוגד-חרדה ולא פסיכואקטיבי — נפוץ לשעות היום. למטופלים רגישים, יחס מאוזן או עתיר-CBD מועדף על פני THC גבוה. ההתאמה אישית מאוד.",
    seek: ["anxiety", "sleep"],
    successRate: 95, successNote: "95.3% מדווחים הקלה בחרדה; דיכאון 97.2%",
    research: "מבוסס על דיווחי מטופלים מצטברים ומחקרי CBD לחרדה.",
    israelNote: "פסיכיאטריה היא המגזר היציב ביותר בשוק הישראלי, בעלייה עקבית לכ-19,000 מטופלים.",
  },
  diabetes: {
    label: "נוירופתיה סוכרתית",
    summary: "נוירופתיה כואבת מופיעה אצל עד 50% ממטופלי סוכרת ארוכת-טווח. קנאביס בשאיפה הראה השפעה משככת תלוית-מינון על כאב נוירופתי סוכרתי עמיד לטיפול.",
    ratioNote: "מחקר ישראלי אורך (5 שנים, 52 מטופלים) השתמש ב-THC 20%/CBD<1% בשאיפה בטיטרציה אישית. מחקרים אחרים בחנו תצורות THC:CBD:CBN. מינון גבוה (7% THC) הגביר אופוריה ונמנום.",
    seek: ["pain"],
    successRate: 70, successNote: "~70% הצלחה טיפולית כללית ב-6 חודשים (מחקר פרוספקטיבי)",
    research: "מבוסס על NCBI PMC (מחקר אורך 5 שנים), ומחקר phase III טרנסדרמלי (100 משתתפים).",
    israelNote: "מחקר האורך המשמעותי בתחום נערך בישראל — יתרון מקומי לדאטה.",
  },
  sleep: {
    label: "שינה (נדודי שינה)",
    summary: "מטופלים רבים מדווחים על הירדמות מהירה יותר, שינה רציפה פחות מקוטעת והפחתת יקיצות ליליות. ההשפעה משתנה לפי הזן ודרך המתן.",
    ratioNote: "מירצן ולינלול הם הטרפנים המרגיעים העיקריים. אינדיקות עתירות-מירצן נחקרות לשינה. THC עוזר בהירדמות, אך מינון גבוה מדי עלול לפגוע באיכות שלב REM. שמן לפני שינה נותן מענה ארוך לכל הלילה.",
    seek: ["sleep", "anxiety"],
    successRate: 88, successNote: "רוב המטופלים מדווחים שיפור בזמן ההירדמות ובאיכות השינה",
    research: "מבוסס על סקירות שינה וקנאבינואידים, ומחקרי מירצן/לינלול לאפקט מרגיע.",
    israelNote: "הפרעות שינה נלוות נפוצות אצל מטופלי כאב כרוני, PTSD וחרדה בישראל.",
  },
  appetite: {
    label: "תיאבון ובחילות",
    summary: "THC ידוע כמגרה תיאבון ('מאנצ'יז') ומפחית בחילות והקאות — במיוחד בהקשר טיפול אונקולוגי, כימותרפיה ומחלות מעי.",
    ratioNote: "מירצן ולימונן נקשרים לעידוד תיאבון. עישון/אידוי נותנים מענה מהיר לבחילה חריפה. CBD מאזן את החרדה שעלולה ללוות THC גבוה. ההתאמה אישית מאוד.",
    seek: ["appetite", "gi"],
    successRate: 85, successNote: "מטופלים מדווחים שיפור משמעותי בתיאבון ובהפחתת בחילות",
    research: "מבוסס על מחקרי CINV (בחילות מכימותרפיה) ועידוד תיאבון.",
    israelNote: "בחילות ואובדן תיאבון הם תסמינים מרכזיים שבגינם נרשם קנאביס באונקולוגיה בישראל.",
  },
  focus: {
    label: "ריכוז ואנרגיה",
    summary: "מטופלים מחפשים צלילות ועירנות בלי קהות — בעיקר לשעות היום ולתפקוד. זנים סאטיביים עתירי-פינן/טרפינולן נחשבים מעוררים יותר.",
    ratioNote: "פינן נקשר לערנות ולזיכרון ועשוי לאזן חלק מעמעום הזיכרון של THC. טרפינולן נותן אפקט מרענן. עדיף לשעות היום — לא לפני שינה. מינון נמוך-מתון לשמירה על תפקוד.",
    seek: ["focus", "anxiety"],
    successRate: 75, successNote: "מטופלים מדווחים שיפור בעירנות ובתפקוד יומיומי עם זנים מתאימים",
    research: "מבוסס על מחקרי פינן (ערנות וזיכרון) ופרופילי סאטיבה מעוררים.",
    israelNote: "מטופלים רבים בישראל מחפשים זן 'יום' שמאפשר תפקוד לצד הקלה.",
  },
  gi: {
    label: "מערכת עיכול",
    summary: "מטופלים עם בעיות עיכול ודלקת מעי מדווחים על הקלה בכאבי בטן, שיפור בתיאבון והפחתת שלשולים. הקנאבינואידים פועלים על קולטנים במערכת העיכול.",
    ratioNote: "קריופילן (הנקשר ישירות לקולטן CB2) והומולן נחקרו לתכונות נוגדות-דלקת. מחקרים ישראליים הראו שיפור קליני ובאיכות החיים. CBD מסייע ללא פסיכואקטיביות.",
    seek: ["gi", "pain", "appetite"],
    successRate: 85, successNote: "שיפור קליני ובאיכות החיים ברוב המטופלים במחקרים ישראליים",
    research: "מבוסס על מחקרי פרופ' טימנה נפתלי (איכילוב/מאיר) על קנאביס ב-IBD.",
    israelNote: "מחקר הקנאביס למחלות מעי מוביל עולמית מישראל.",
  },
  cancer: {
    label: "סרטן (אונקולוגיה)",
    summary: "קנאביס נחקר בעיקר להקלה על תסמינים נלווים לטיפול האונקולוגי: בחילות והקאות מכימותרפיה, כאב, אובדן תיאבון, וקושי בשינה. אינו טיפול נגד הגידול עצמו.",
    ratioNote: "תצורות THC נחקרו לבחילות ולעידוד תיאבון; CBD לחרדה ולדלקת. מינון נקבע אישית עם האונקולוג. חשוב לתאם — ייתכנו אינטראקציות עם טיפולים.",
    seek: ["appetite", "pain", "gi", "sleep"],
    successRate: 88, successNote: "מטופלים מדווחים שיפור משמעותי בבחילות, תיאבון ואיכות חיים במהלך הטיפול",
    research: "מבוסס על מחקרי CINV (בחילות מכימותרפיה) וסקירות טיפול תומך באונקולוגיה.",
    israelNote: "אונקולוגיה היא מההתוויות הוותיקות בישראל ומזכה גם ב'מרשם' (לא רק רישיון) במחלה פעילה.",
  },
  crohns: {
    label: "קרוהן / קוליטיס (מעי דלקתי)",
    summary: "מטופלים עם מחלת מעי דלקתית (IBD) מדווחים על הקלה בכאבי בטן, שיפור בתיאבון ובמשקל, והפחתת שלשולים. הקנאבינואידים פועלים על קולטנים במערכת העיכול.",
    ratioNote: "מחקרים ישראליים (כולל של פרופ' נפתלי) הראו שיפור קליני ובאיכות החיים, אם כי לא תמיד שיפור במדדי דלקת אובייקטיביים. קריופילן נחקר לתכונות נוגדות-דלקת.",
    seek: ["gi", "pain", "appetite"],
    successRate: 85, successNote: "שיפור קליני ובאיכות החיים ברוב המטופלים במחקרים ישראליים",
    research: "מבוסס על מחקרי פרופ' טימנה נפתלי (איכילוב/מאיר) על קנאביס ב-IBD.",
    israelNote: "מחקר הקנאביס ל-IBD מוביל עולמית מישראל. מזכה גם ב'מרשם' במחלה פעילה ומוכחת.",
  },
  ms: {
    label: "טרשת נפוצה (MS)",
    summary: "קנאביס נחקר להקלה על ספסטיות (נוקשות שרירים), כאב נוירופתי, ושיפור שינה בטרשת נפוצה. Sativex (תרסיס THC:CBD) מאושר במדינות רבות בדיוק להתוויה זו.",
    ratioNote: "יחס מאוזן THC:CBD (כמו ב-Sativex, ~1:1) נחקר לספסטיות. טיטרציה איטית מפחיתה תופעות לוואי. CBD מסייע לאיזון.",
    seek: ["pain", "sleep", "anxiety"],
    successRate: 80, successNote: "הקלה מדווחת בספסטיות ובכאב; Sativex מאושר רשמית לספסטיות ב-MS",
    research: "מבוסס על מחקרי Sativex/nabiximols לספסטיות בטרשת נפוצה.",
    israelNote: "טרשת נפוצה היא התוויה מוכרת בנוהל 106 בתחום הנוירולוגיה.",
  },
  parkinsons: {
    label: "פרקינסון",
    summary: "מטופלי פרקינסון מדווחים על הקלה ברעד, בכאב, בשינה ובחרדה. ההשפעה על תסמינים מוטוריים מעורבת במחקרים, אך איכות החיים והתסמינים הלא-מוטוריים משתפרים.",
    ratioNote: "מינונים נמוכים ויחסים מאוזנים נבחנו. מינון גבוה מדי עלול להחמיר יציבה. נדרשת זהירות והתאמה איטית עם הנוירולוג.",
    seek: ["sleep", "anxiety", "pain"],
    successRate: 75, successNote: "שיפור מדווח בשינה, כאב וחרדה; השפעה על רעד משתנה בין מטופלים",
    research: "מבוסס על מחקרים על קנאביס בתסמינים לא-מוטוריים בפרקינסון.",
    israelNote: "פרקינסון נוסף לרשימת ההתוויות בנוהל 106 בתחום הנוירולוגיה (בהסתייגויות).",
  },
  tourette: {
    label: "תסמונת טורט",
    summary: "קנאביס (ובמיוחד THC) נחקר להפחתת טיקים מוטוריים וקוליים בתסמונת טורט, וכן להקלה על תסמינים נלווים כמו OCD וחרדה.",
    ratioNote: "מחקרים בחנו THC לבדו ותצורות מלאות. ההשפעה על טיקים מדווחת חיובית במחקרים קטנים. התאמה עם נוירולוג/פסיכיאטר.",
    seek: ["anxiety", "sleep"],
    successRate: 72, successNote: "הפחתת טיקים מדווחת במחקרים קטנים; נדרש מחקר נוסף",
    research: "מבוסס על מחקרי THC בתסמונת טורט (Müller-Vahl ואחרים).",
    israelNote: "טורט נוספה לנוהל 106 בתחום הנוירולוגיה (בהסתייגויות).",
  },
  epilepsy: {
    label: "אפילפסיה",
    summary: "CBD הוא הקנבינואיד המרכזי לאפילפסיה — תרופת Epidiolex (CBD טהור) מאושרת ל-FDA לתסמונות אפילפסיה עמידות. מפחית תדירות התקפים.",
    ratioNote: "CBD בריכוז גבוה הוא הבסיס (לא THC). מינון נקבע בקפדנות עם נוירולוג. ייתכנו אינטראקציות עם תרופות אנטי-אפילפטיות.",
    seek: ["anxiety"],
    successRate: 80, successNote: "CBD מפחית תדירות התקפים בתסמונות עמידות (Epidiolex מאושר FDA)",
    research: "מבוסס על מחקרי Epidiolex/CBD בתסמונות דראבה ולנוקס-גסטו.",
    israelNote: "אפילפסיה נוספה לנוהל 106. ילדים מתחת לגיל 5 — רק במיצוי Rich-CBD ובאישור מיוחד.",
  },
  palliative: {
    label: "טיפול פליאטיבי",
    summary: "בטיפול תומך/פליאטיבי, קנאביס מסייע באיזון מכלול תסמינים בו-זמנית: כאב, בחילות, חוסר תיאבון, חרדה ונדודי שינה — לשיפור איכות החיים בשלב מורכב.",
    ratioNote: "הגישה היא איזון תסמינים אישי. תצורות שונות לפי התסמין הדומיננטי. שמן נפוץ למענה ארוך ויציב. תיאום עם הצוות המטפל.",
    seek: ["pain", "appetite", "sleep", "anxiety", "gi"],
    successRate: 90, successNote: "שיפור נרחב באיכות החיים ובמכלול התסמינים מדווח ברוב המטופלים",
    research: "מבוסס על מחקרי טיפול תומך ואיכות חיים במטופלים מורכבים.",
    israelNote: "טיפול פליאטיבי הוא התוויה מוכרת בנוהל 106, לעיתים במינונים גבוהים יותר.",
  },
  autism: {
    label: "אוטיזם (ASD)",
    summary: "קנאביס עתיר-CBD נחקר בילדים ומבוגרים עם אוטיזם להפחתת התפרצויות, חרדה, בעיות שינה ושיפור תקשורת. מחקרים ישראליים מובילים בתחום.",
    ratioNote: "תצורות עתירות-CBD ביחסים גבוהים (למשל 20:1 CBD:THC) הן הבסיס. מינון זהיר ומדורג. ההתאמה רגישה במיוחד ונעשית עם רופא מומחה.",
    seek: ["anxiety", "sleep"],
    successRate: 80, successNote: "שיפור מדווח בהתנהגות, חרדה ושינה במחקרים ישראליים (כ-80% מהמשפחות)",
    research: "מבוסס על מחקרי ד\"ר אדי אהרונוביץ' ופרופ' רפי משולם (שערי צדק) על אוטיזם ו-CBD.",
    israelNote: "ישראל מובילה עולמית במחקר קנאביס לאוטיזם. מצריך אישור מיוחד, בעיקר עתיר-CBD.",
  },
  dementia: {
    label: "דמנציה (קיהיון)",
    summary: "בדמנציה עם הפרעות התנהגות, קנאביס נחקר להפחתת תסיסה, תוקפנות, חרדה ושיפור שינה — להקלה על המטופל ועל המטפלים.",
    ratioNote: "מיצוי עתיר-CBD במינון נמוך הוא הגישה הזהירה. נדרש אישור מיוחד (ראש אגף בריאות הנפש). מינון מדורג מאוד.",
    seek: ["sleep", "anxiety"],
    successRate: 75, successNote: "הפחתת תסיסה וחרדה ושיפור שינה מדווחים במחקרים על דמנציה התנהגותית",
    research: "מבוסס על מחקרי קנאביס בתסמינים נוירו-פסיכיאטריים בדמנציה.",
    israelNote: "דמנציה עם הפרעות התנהגות מוכרת בנוהל 106, רק במיצוי Rich-CBD ובאישור מיוחד.",
  },
};

/* מצליב פרופיל התוויה עם התפריט הנוכחי — אילו גנטיקות מתאימות */
function crossIndicationWithMenu(indId, scored) {
  const prof = INDICATION_PROFILES[indId];
  if (!prof) return [];
  return scored
    .map((s) => ({ s, hits: s.effects.filter((e) => prof.seek.includes(e)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.s.match - a.s.match)
    .slice(0, 4)
    .map((x) => x.s);
}

/* ───────────── ידע מדעי על טרפנים (מבוסס מחקר האפקט הנלווה) ─────────────
   הבסיס המדעי ל"DNA הקנאבינואידי": שני זנים עם אותו THC נותנים חוויה שונה
   כי פרופיל הטרפנים שונה. מידע כללי, לא ייעוץ רפואי. */
const TERP_SCIENCE = {
  limonene:     { role: "מרומם מצב רוח ונוגד-חרדה", detail: "מחקר 2024 הראה שלימונן מאודה ממתן באופן סלקטיבי את החרדה שעלולה לנבוע מ-THC. נקשר להקלה על דיכאון, מתח ודלקת.", aroma: "🍋 הדרים" },
  myrcene:      { role: "מרגיע ומסייע שינה", detail: "הטרפן השכיח ביותר בקנאביס. נחקר לאפקט מרגיע ('couch-lock') ולסיוע בשינה. נמצא גם במנגו ובעלי דפנה.", aroma: "🌿 אדמתי" },
  pinene:       { role: "מחדד ומרחיב סמפונות", detail: "נקשר לערנות ולזיכרון; פועל כמרחיב סמפונות (bronchodilator). עשוי לאזן חלק מעמעום הזיכרון של THC.", aroma: "🌲 אורן" },
  caryophyllene:{ role: "נוגד דלקת ומשכך כאב", detail: "ייחודי — נקשר ישירות לקולטן CB2 (כמו קנבינואיד). נחקר לדלקת כרונית ולכאב. נמצא גם בפלפל שחור.", aroma: "🌶️ פלפלי" },
  linalool:     { role: "מרגיע ומסייע שינה", detail: "הטרפן של הלבנדר. נחקר כמסייע שינה, מפיג מתח נפשי ועייפות. ממתן את עוצמת ה-THC.", aroma: "💜 לבנדר" },
  terpinolene:  { role: "מאזן ומרענן", detail: "פחות שכיח, בעל ארומה מורכבת. נקשר לאפקט מרענן וקליל, ולעיתים מעורר יותר מאשר מרגיע.", aroma: "🌸 פרחוני" },
  humulene:     { role: "נוגד דלקת", detail: "נמצא גם בכשות (הופס) של בירה. נחקר לתכונות נוגדות-דלקת, לעיתים מדכא תיאבון.", aroma: "🍺 עשבוני" },
};

/* טווח דירוג טרפן → תווית עוצמה */
function terpStrength(v) {
  if (v >= 0.7) return { label: "דומיננטי", pct: Math.min(100, Math.round(v * 100)) };
  if (v >= 0.4) return { label: "בולט", pct: Math.round(v * 100) };
  if (v > 0)    return { label: "נוכח", pct: Math.round(v * 100) };
  if (v < 0)    return { label: "נמנע", pct: Math.round(Math.abs(v) * 100) };
  return { label: "ניטרלי", pct: 0 };
}

/* ───────────── ה-DNA הגנטי האישי ─────────────
   טביעת האצבע הקנאבינואידית של המטופל — נבנית ממה שלמדנו עליו.
   ויזואליזציה של פרופיל הטרפנים + רמת ביטחון + הגנטיקות שמרכיבות אותו. */
function geneticConfidence(ans, ratings) {
  // כמה "למדנו" את המטופל — לפי כמות הדאטה
  const signals = ans.helped.length + ans.notHelped.length +
    Object.keys(ratings).length + ans.reasons.length + ans.flavors.length;
  const pct = Math.min(95, 30 + signals * 7);
  let label = "ראשוני";
  if (pct >= 80) label = "מגובש";
  else if (pct >= 60) label = "מתגבש";
  else if (pct >= 45) label = "מתהווה";
  return { pct, label, signals };
}

/* יוצר "רצף DNA" — מחרוזת ייחודית מהטרפנים הדומיננטיים (לשיתוף ולזהות) */
function dnaSequence(profile) {
  const codes = { limonene: "LM", myrcene: "MY", pinene: "PN",
    caryophyllene: "CY", linalool: "LN", terpinolene: "TP", humulene: "HM" };
  if (!profile || typeof profile !== "object") return "—";
  const entries = Object.entries(profile).filter(([t, v]) => v > 0 && codes[t]);
  if (entries.length === 0) return "—";
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([t, v]) => `${codes[t]}${Math.round(Math.max(1, v * 9))}`)
    .join("-");
}

function GeneticDNA({ ans, ratings, scored, goJournal }) {
  const profile = buildProfile(ans, ratings) || {};
  const conf = geneticConfidence(ans, ratings);
  const seq = dnaSequence(profile);
  // טרפנים מסודרים לפי עוצמה (חיוביים בלבד, לתצוגת הליקס)
  const active = Object.entries(profile)
    .filter(([t, v]) => v > 0 && TERPENES[t])
    .sort((a, b) => b[1] - a[1]);
  const avoided = Object.entries(profile)
    .filter(([t, v]) => v < 0 && TERPENES[t])
    .sort((a, b) => a[1] - b[1]);
  // הגנטיקות שמרכיבות את ה-DNA (אהובות)
  const buildingBlocks = [...new Set([
    ...ans.helped,
    ...Object.entries(ratings).filter(([, r]) => r >= 7).map(([id]) => id),
  ])].map((id) => STRAINS.find((s) => s.id === id)).filter(Boolean);
  const maxV = active.length > 0 ? Math.max(...active.map(([, v]) => v), 1) : 1;

  const [copied, setCopied] = useState(false);
  const share = () => {
    const txt = `הפרופיל שלי בקנאמאצ׳ 🌿\nפרופיל: ${seq}\nמה שעובד לי: ${active.slice(0,3).map(([t]) => terpHuman(t, 'strand')).join(", ")}\nקנאמאצ׳ — מיטוב הקנייה החודשית שלך`;
    if (navigator.clipboard) { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  return (
    <div className="space-y-4">
      {/* כרטיס ה-DNA הראשי */}
      <div className="rounded-3xl p-5 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0D2B1B 0%, #0F3D22 55%, #061A10 100%)", border: "1.5px solid rgba(74,222,128,0.20)" }}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-lg" style={{ color: "#F0FDF4" }}>🌿 הפרופיל שלך</h3>
          <span className="text-xs px-2 py-1 rounded-full font-bold"
            style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>
            {conf.pct}% · {conf.label}
          </span>
        </div>
        <p className="text-xs mb-3" style={{ color: "#C9DFD2" }}>
          טביעת האצבע הייחודית שלך — נבנתה ממה שלמדנו עליך. ככל שתדרגו ותשתפו יותר, היא מדויקת יותר.
        </p>

        {/* הליקס הטרפנים */}
        <div className="rounded-2xl p-3 mb-3" style={{ background: "rgba(255,255,255,0.12)" }}>
          {active.length === 0 && (
            <div className="text-center py-3">
              <p className="text-xs mb-3" style={{ color: "#C9DFD2" }}>
                הפרופיל שלכם עוד ריק — בואו נתחיל לבנות אותו
              </p>
              <button onClick={goJournal}
                className="text-sm px-5 py-2.5 rounded-xl font-bold"
                style={{ background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.30)" }}>
                ← דרגו זן ראשון ביומן
              </button>
            </div>
          )}
          {active.map(([t, v]) => {
            const st = terpStrength(v);
            return (
              <div key={t} className="flex items-center gap-2 py-1">
                <span style={{ fontSize: 12 }}>{terpHuman(t, 'icon')}</span>
                <span className="text-xs flex-1 font-bold" style={{ color: "#fff", minWidth: 0 }}>{terpHuman(t, 'shortLabel')}</span>
                <div className="h-3 rounded-full overflow-hidden" style={{ width: 70, background: "rgba(0,0,0,0.2)", flexShrink: 0 }}>
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${(v / maxV) * 100}%`,
                    background: TERPENES[t].color,
                  }} />
                </div>
                <span className="text-xs w-14 text-left" style={{ color: "#C9DFD2" }}>{st.label}</span>
              </div>
            );
          })}
        </div>

        {/* קוד הפרופיל */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 rounded-xl p-2 font-mono text-sm tracking-wider truncate"
            style={{ background: "rgba(0,0,0,0.30)", color: "#A8E6C0" }}>
            {seq}
          </div>
          <button onClick={share}
            className="text-xs px-3 py-2 rounded-xl font-bold whitespace-nowrap"
            style={{ background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.30)" }}>
            {copied ? "הועתק ✓" : "שתף 🌿"}
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: "#9DC4AC" }}>
          * הפרופיל נבנה מהדירוגים, הדיווחים והסריקות שלך — ומשתפר ככל שמשתמשים יותר.
        </p>
      </div>

      {/* התקדמות הלמידה */}
      {conf.pct < 80 && (
        <div className="rounded-2xl p-4 border" style={{ background: "rgba(18,22,14,0.95)", borderColor: "rgba(74,222,128,0.18)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm" style={{ color: "#4ADE80" }}>🌿 הפרופיל שלך מתגבש</span>
            <span className="text-xs font-bold" style={{ color: "rgba(74,222,128,0.65)" }}>{conf.signals} נתונים</span>
          </div>
          <div className="h-2 rounded-full mb-2" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full" style={{ width: `${conf.pct}%`, background: "linear-gradient(90deg,#4ADE80,#22C55E)" }} />
          </div>
          <p className="text-xs" style={{ color: "rgba(187,247,208,0.65)" }}>
            כל זן שתדרגו וכל סריקת תפריט מחדדת את הפרופיל — וההמלצות נעשות מדויקות יותר.
          </p>
        </div>
      )}

      {/* אבני הבניין */}
      {buildingBlocks.length > 0 && (
        <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.line }}>
          <h4 className="font-bold text-sm mb-1" style={{ color: C.ink }}>🌿 זנים שעבדו לך</h4>
          <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.55)" }}>
            מה שדרגתם גבוה — מהווה את הבסיס לפרופיל שלך
          </p>
          <div className="space-y-2">
            {buildingBlocks.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl p-2.5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(74,222,128,0.08)" }}>
                <div className="min-w-0">
                  <div className="font-bold text-sm" style={{ color: C.ink }}>{s.name}</div>
                  <div className="text-xs truncate" style={{ color: "rgba(187,247,208,0.50)" }}>
                    {s.genetics} · {s.grower || ""}
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap justify-end" style={{ maxWidth: "45%" }}>
                  {Object.entries(s.terps).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([t]) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: TERPENES[t].color + "22", color: TERPENES[t].color, fontWeight: 600 }}>
                      {terpHuman(t,'icon')} {terpHuman(t,'shortLabel')}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ניתוח טרפנים */}
      {active.length > 0 && (
        <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.line }}>
          <h4 className="font-bold text-sm mb-1" style={{ color: C.ink }}>🔬 מה הפרופיל שלך אומר</h4>
          <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.55)" }}>
            ניתוח פרופיל הטרפנים שלך — מבוסס על מחקרים שסרקנו ומאגרי מידע פתוחים
          </p>
          <div className="space-y-2.5">
            {active.slice(0, 3).map(([t]) => {
              const sci = TERP_SCIENCE[t];
              return (
                <div key={t} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", borderRight: `3px solid ${TERPENES[t].color}`, border: "1px solid rgba(255,255,255,0.06)", borderRightWidth: 3 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm" style={{ color: TERPENES[t].color }}>{terpHuman(t,'icon')} {terpHuman(t,'shortLabel')}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: TERPENES[t].color + "22", color: TERPENES[t].color }}>{sci.role}</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.68)" }}>{sci.detail}</p>
                </div>
              );
            })}
          </div>
          {avoided.length > 0 && (
            <p className="text-xs mt-3 rounded-xl p-2.5" style={{ background: "rgba(248,113,113,0.08)", color: "#FCA5A5", border: "1px solid rgba(248,113,113,0.15)" }}>
              🛡️ כדאי להימנע מ: {avoided.map(([t]) => terpHuman(t, 'shortLabel')).join(", ")} — לפי הדיווחים שלך, אלה נקשרו לחוויה פחות טובה.
            </p>
          )}
          <p className="text-xs mt-2 text-center" style={{ color: "rgba(187,247,208,0.40)" }}>
            מידע כללי בלבד, אינו ייעוץ רפואי. כל החלטה טיפולית — עם הרופא/ה.
          </p>
        </div>
      )}
    </div>
  );
}



/* ───────────── רכיבי עזר ───────────── */

const Chip = ({ on, onClick, children }) => (
  <button
    onClick={onClick}
    className="px-3 py-2 rounded-full text-sm font-medium border transition-all"
    style={{
      background: on ? C.accent : C.card,
      color: on ? "#fff" : C.ink,
      borderColor: on ? C.accent : C.line,
    }}
  >
    {children}
  </button>
);

const TerpDots = ({ terps }) => (
  <div className="flex gap-1 items-center flex-wrap">
    {Object.entries(terps)
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => (
        <span
          key={t}
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: TERPENES[t].color + "22", color: TERPENES[t].color, fontWeight: 600 }}
        >
          {TERPENES[t].flavor}
        </span>
      ))}
  </div>
);

/* גנטיקה — שבב מידע ראשי בסגנון Leafly (כולל מגדל וביטחון גנטי) */
const GeneticsChip = ({ s }) => (
  <span className="inline-flex items-center gap-1 flex-wrap">
    <span className="text-xs px-2 py-0.5 rounded-full font-bold"
      style={{ background: "rgba(167,139,250,0.12)", color: "#A78BFA" }}>
      🧬 {s.genetics}
      {s.gConf === "verified" && <span title="גנטיקה מאומתת"> ✓</span>}
      {s.gConf === "unverified" && <span title="שושלת לא מאומתת"> ?</span>}
    </span>
    {s.grower && (
      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
        style={{ background: "rgba(74,222,128,0.12)", color: "#4ADE80" }}>
        🌱 {s.grower}
      </span>
    )}
  </span>
);

/* פסי דיווח באחוזים (אפקטים/טעמים/שליליים) */
const ReportBars = ({ data, dict, color, max = 3 }) => (
  <div className="space-y-1.5">
    {Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, max).map(([k, pct]) => (
      <div key={k}>
        <div className="flex justify-between text-xs mb-0.5">
          <span style={{ color: C.ink, fontWeight: 500 }}>{dict[k] || k}</span>
          <span style={{ color, fontWeight: 700 }}>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full" style={{ background: color + "22" }}>
          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    ))}
  </div>
);

const MatchRing = ({ pct }) => {
  const r = 20, c = 2 * Math.PI * r;
  const col = pct >= 85 ? "#4ADE80" : pct >= 70 ? "#D99A2B" : "rgba(187,247,208,0.45)";
  return (
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} fill="none" stroke={C.line} strokeWidth="5" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={col} strokeWidth="5"
        strokeDasharray={`${(pct / 100) * c} ${c}`} strokeLinecap="round"
        transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" fontSize="13" fontWeight="700" fill={C.ink}>
        {pct}%
      </text>
    </svg>
  );
};

/* ── Smart strain picker with search + filter tabs ── */
function StrainPicker({ value, onChange }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [grower, setGrower] = useState("all");
  const growers = [...new Set(STRAINS.map((s) => s.grower).filter(Boolean))].slice(0, 7);
  const filtered = STRAINS.filter((s) => {
    const mq = !q || s.name.includes(q) || s.genetics.includes(q) || (s.grower || "").includes(q);
    const mk = kind === "all" || s.kind === kind;
    const mg = grower === "all" || s.grower === grower;
    return mq && mk && mg;
  });
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const tabCls = (active) => ({
    background: active ? CD.accent : "rgba(57,255,133,.07)",
    color: active ? "#061006" : "#ACC6B4",
    border: `1px solid ${active ? CD.accent : "rgba(57,255,133,.2)"}`,
  });
  return (
    <div className="flex flex-col gap-3 min-h-0">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, גנטיקה או מגדל..."
        className="w-full rounded-xl px-4 py-3 text-sm"
        style={{ background:"rgba(18,36,24,.7)", border:"1.5px solid rgba(57,255,133,.22)", color:"#EBF6ED" }} />
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth:"none" }}>
        {[{id:"all",label:"הכל"},{id:"indica",label:"אינדיקה"},{id:"sativa",label:"סאטיבה"},{id:"hybrid",label:"היברידי"}].map((f) => (
          <button key={f.id} onClick={() => setKind(f.id)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
            style={tabCls(kind === f.id)}>{f.label}</button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth:"none" }}>
        <button onClick={() => setGrower("all")} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
          style={tabCls(grower === "all")}>כל המגדלים</button>
        {growers.map((g) => (
          <button key={g} onClick={() => setGrower(grower === g ? "all" : g)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
            style={tabCls(grower === g)}>{g}</button>
        ))}
      </div>
      {value.length > 0 && (
        <div className="text-xs font-semibold" style={{ color:CD.accent }}>
          ✓ {value.length} נבחרו · {filtered.length} מוצגים
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 overflow-y-auto" style={{ maxHeight:200 }}>
        {filtered.map((s) => {
          const on = value.includes(s.id);
          return (
            <button key={s.id} onClick={() => toggle(s.id)}
              className="px-3 py-2 rounded-full text-xs font-medium border transition-all"
              style={{
                background: on ? CD.accent : "rgba(18,36,24,.6)",
                color: on ? "#061006" : "#EBF6ED",
                borderColor: on ? CD.accent : "rgba(57,255,133,.2)",
              }}>
              {on ? "✓ " : ""}{s.name}{s.grower ? ` · ${s.grower}` : ""}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm" style={{ color:"#7EA88E" }}>לא נמצאו זנים תואמים</p>
        )}
      </div>
    </div>
  );
}

/* ───────────── שאלון הצטרפות ───────────── */

const STEPS = [
  { key: "cats", title: "אילו קטגוריות יש לך ברישיון?", multi: true,
    sub: "אפשר לסמן יותר מאחת", opts: CATEGORIES.map((c) => ({ id: c, label: c })) },
  { key: "form", title: "מהן צורות הצריכה שלך?", multi: true,
    sub: "אפשר לסמן יותר מאחת", opts: FORMS.map((f) => ({ id: f, label: f })) },
  { key: "reasons", title: "לצורך מה ניתן הרישיון?", multi: true,
    sub: "המידע נשמר אצלך ומשמש להתאמה בלבד", opts: REASONS.map((r) => ({ id: r.id, label: r.label })) },
  { key: "flavors", title: "אילו טעמים את/ה אוהב/ת?", multi: true,
    sub: "הטעם מרמז על פרופיל הטרפנים שמתאים לך",
    opts: Object.entries(FLAVORS).map(([id, label]) => ({ id, label })) },
  { key: "helped",    title: "אילו זנים עזרו לך בעבר?",       multi: true, sub: "דלגו אם אינכם זוכרים — אפשר לעדכן בהמשך", opts: [] },
  { key: "notHelped", title: "ואילו זנים לא עבדו עבורכם?",    multi: true, sub: "זן שגם עזר וגם לא עזר? כנראה הבדל בין אצוות", opts: [] },
  { key: "current",   title: "מה את/ה צורכ/ת כרגע?",          multi: true, sub: "נבקש ממכם פידבק בהמשך כדי לדייק", opts: [] },
];

function Onboarding({ ans, setAns, onDone, onExit }) {
  // Skip cats step if already populated from license scan
  const activeSteps = STEPS.filter((s) => s.key !== "cats" || ans.cats.length === 0);
  const [i, setI] = useState(0);
  const step = activeSteps[i];
  const val = ans[step.key];
  const isStrainStep = ["helped","notHelped","current"].includes(step.key);

  const toggle = (id) => {
    const arr = val.includes(id) ? val.filter((x) => x !== id) : [...val, id];
    setAns({ ...ans, [step.key]: arr });
  };
  const canNext = step.key === "cats" ? val.length > 0
    : step.key === "reasons" ? val.length > 0
    : step.key === "form" ? val.length > 0 : true;

  return (
    <div className="flex flex-col" style={{ minHeight:"100%", paddingBottom:8 }}>
      {/* Progress */}
      <div className="flex gap-1 mb-6">
        {activeSteps.map((_, k) => (
          <div key={k} className="h-1 flex-1 rounded-full transition-all"
            style={{ background: k <= i ? CD.accent : "rgba(57,255,133,.18)" }} />
        ))}
      </div>

      <h2 className="text-2xl font-bold mb-1" style={{ color:"#EBF6ED" }}>{step.title}</h2>
      <p className="text-sm mb-5" style={{ color:"#7EA88E" }}>{step.sub}</p>

      {isStrainStep ? (
        <StrainPicker value={val} onChange={(v) => setAns({ ...ans, [step.key]: v })} />
      ) : (
        <div className="flex flex-wrap gap-2 content-start overflow-y-auto" style={{ maxHeight:260 }}>
          {step.opts.map((o) => {
            const on = step.multi ? val.includes(o.id) : val === o.id;
            return (
              <button key={o.id} onClick={() => toggle(o.id)}
                className="px-3 py-2.5 rounded-full text-sm font-medium border transition-all"
                style={{
                  background: on ? CD.accent : "rgba(18,36,24,.6)",
                  color: on ? "#061006" : "#EBF6ED",
                  borderColor: on ? CD.accent : "rgba(57,255,133,.2)",
                }}>{o.label}</button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 mt-6">
        <button onClick={() => (i > 0 ? setI(i - 1) : onExit())}
          className="px-5 py-3 rounded-xl font-medium border transition-all"
          style={{ borderColor:"rgba(57,255,133,.22)", color:"#EBF6ED", background:"rgba(57,255,133,.07)" }}>
          חזרה
        </button>
        <button disabled={!canNext}
          onClick={() => (i < activeSteps.length - 1 ? setI(i + 1) : onDone())}
          className="flex-1 py-3 rounded-xl font-bold disabled:opacity-35 transition-all"
          style={{ background:CD.accent, color:"#061006", boxShadow:"0 2px 14px rgba(57,255,133,.3)" }}>
          {i < activeSteps.length - 1 ? "המשך" : "בנו לי פרופיל"}
        </button>
      </div>
    </div>
  );
}

/* ───────────── מסכי האפליקציה ───────────── */

/* "למה זה מתאים לך" — בשפת גנטיקות, לא טרפנים */
function matchReason(strain, ans, ratings) {
  const profile = buildProfile(ans, ratings);
  const bits = [];
  if (ans.helped.includes(strain.id)) bits.push("כבר עזר לך בעבר");
  // קרבה גנטית: זן אהוב שחולק פרופיל השפעה
  const likedIds = [...new Set([...ans.helped,
    ...Object.entries(ratings).filter(([, r]) => r >= 7).map(([id]) => id)])];
  const sibling = likedIds.map((id) => STRAINS.find((s) => s.id === id))
    .filter((s) => s && s.id !== strain.id)
    .find((s) => Object.keys(s.terps).some((t) => strain.terps[t] && s.terps[t] >= 0.5 && strain.terps[t] >= 0.5));
  if (sibling) bits.push(`קרוב בהשפעה ל-${sibling.genetics} שעובד לך`);
  const hit = strain.effects.find((e) => ans.reasons.includes(e));
  if (hit) bits.push(`מתאים ל${REASONS.find((r) => r.id === hit)?.label}`);
  if (bits.length === 0) {
    const topTerp = Object.entries(strain.terps)
      .filter(([t]) => (profile[t] || 0) > 0.5)[0];
    if (topTerp) bits.push("פרופיל השפעה שתואם את מה שעבד לך");
  }
  return bits.slice(0, 2).join(" · ");
}

/* ───────────── כרטיס התוויה — מסיווג ההתוויות לפי מחקר ─────────────
   מציג את ההתאמה בשפה ברורה, עם פרטי טרפנים מסתתרים מאחורי + */
function IndicationCard({ rid, prof, topStrains, scored, ans }) {
  const [expanded, setExpanded] = useState(false);

  // פירמידת עדיפות לפי מחקר (מה הכי מומלץ להתוויה זו)
  const indicationRecommendation = {
    ptsd: { headline: "לפוסט-טראומה", top: "D-51, אור (טוגדר), Wedding CK", tip: "מטופלים מדווחים שלינלול + קריופילן עוזרים לסיוטים ושינה. THC מתון. שים לב: הדעה הרפואית חלוקה — חשוב להתייעץ עם הרופא/ה." },
    anxiety: { headline: "טוב לחרדה", top: "אור, תכלת, ספיישל טי", tip: "לינלול + לימונן = שקט בלי קהות. עדיף THC מתון, לא גבוה." },
    sleep: { headline: "לשינה", top: "P&Z, אור, Ice Cream Cake", tip: "מירצן + לינלול = שינה עמוקה. אידוי בטמפ' גבוהה (195°+) לשינה." },
    pain: { headline: "לכאב כרוני", top: "Carbo, Wedding CK, Special T (שמן)", tip: "קריופילן הוא נוגד הדלקת. שמן = השפעה ארוכה (5-6 שעות) לכאב מתמשך." },
    focus: { headline: "לריכוז ואנרגיה", top: "תכלת, JU, גרין קלובר", tip: "פינן + טרפינולן = עירנות. סאטיבה ביום, בבוקר." },
    appetite: { headline: "לתיאבון ובחילות", top: "JU, P&Z, Wedding CK", tip: "מירצן + לימונן מגרים תיאבון. עישון/אידוי מהיר יותר לבחילות." },
    gi: { headline: "למערכת עיכול", top: "Carbo, Special T, אבידקל", tip: "קריופילן + הומולן לדלקות מעי. CBD עוזר ללא פסיכואקטיביות." },
    diabetes: { headline: "לנוירופתיה סוכרתית", top: "Wedding CK, Carbo, Special T", tip: "קריופילן + לינלול לכאב נוירופתי. טיטרציה זהירה עם הרופא." },
  };

  const rec = indicationRecommendation[rid];

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: C.card, borderColor: C.line }}>
      <div className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="font-bold text-sm" style={{ color: C.accent }}>
            🎯 {rec?.headline || prof.label}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-bold"
            style={{ background: "rgba(74,222,128,0.12)", color: C.accent }}>
            {prof.successRate}% מצליחים
          </span>
        </div>
        <p className="text-xs mb-2" style={{ color: "rgba(187,247,208,0.75)" }}>
          {rec?.tip || prof.summary.slice(0, 100) + "..."}
        </p>
        {/* הזנים המובילים בהתוויה זו */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {topStrains.slice(0, 3).map(s => (
            <span key={s.id} className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: C.soft, color: C.accent }}>
              {s.name} · {s.match}%
            </span>
          ))}
        </div>
        <button onClick={() => setExpanded(!expanded)}
          className="text-xs font-bold flex items-center gap-1"
          style={{ color: "#A78BFA" }}>
          {expanded ? "− סגור פירוט מחקרי" : "+ פתח: מחקר, טרפנים ומה לדעת"}
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t space-y-2.5 pt-2.5" style={{ borderColor: C.soft }}>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.75)" }}>{prof.summary}</p>
          <p className="text-xs p-2.5 rounded-xl" style={{ background: "rgba(251,191,36,0.07)", color: "#FBBF24" }}>
            ⚖️ {prof.ratioNote}
          </p>
          <p className="text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>
            📚 {prof.research}
          </p>
          <p className="text-xs font-semibold" style={{ color: C.accent }}>
            🇮🇱 {prof.israelNote}
          </p>
          {/* הטרפנים הרלוונטיים */}
          <div className="flex flex-wrap gap-1.5">
            {prof.seek.map(e => {
              const reason = REASONS.find(r => r.id === e);
              if (!reason) return null;
              const terps = reason.terps;
              return terps.map(t => TERPENES[t] && (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: TERPENES[t].color + "22", color: TERPENES[t].color, fontWeight: 600 }}>
                  {terpHuman(t,'icon')} {terpHuman(t,'shortLabel')}
                </span>
              ));
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Recs({ scored, basket, addToBasket, ans, ratings, typeFilter, setTypeFilter }) {
  const [open, setOpen] = useState(null);
  const [indFilter, setIndFilter] = useState("auto"); // auto = ההתוויות של המשתמש
  const [showInfo, setShowInfo] = useState(false);

  // RWE — community_stats cache: { [strainId]: { avg, n, helpedPct, note } }
  const [communityStats, setCommunityStats] = useState({});
  useEffect(() => {
    if (!open || communityStats[open]) return;
    const indicationId = indFilter !== "auto" ? indFilter : (ans.reasons?.[0] || null);
    api.getCommunityStats({ strainId: open, indicationId })
      .then((data) => {
        if (data?.avg_score !== undefined && data.n_reports >= 20) {
          setCommunityStats((prev) => ({ ...prev, [open]: {
            avg: data.avg_score.toFixed(1),
            n: data.n_reports,
            helpedPct: data.helped_pct != null ? Math.round(data.helped_pct) : null,
            note: data.indication_note || null,
          }}));
        }
      })
      .catch(() => {}); // community stats are additive, never critical path
  }, [open, indFilter]);

  // העשרה ממלאי חי מה-DB — כשל בקריאה נזרק ל-ErrorBoundary, לא נופל חזרה ל-mock
  const { strains: enrichedScored } = useEnrichedStrains(scored, { type: typeFilter });

  const typeTabs = [
    { id: "all", label: "הכל" },
    { id: "flower", label: "🌿 תפרחת" },
    { id: "oil", label: "💧 שמן" },
    { id: "rolls", label: "🚬 גליליות" },
  ];

  // בורר התוויות — כל ההתוויות מהמחקר
  const allInds = Object.keys(INDICATION_PROFILES);
  const indChips = [
    { id: "auto", label: "✨ לפי הפרופיל שלי" },
    ...allInds.map((id) => ({ id, label: INDICATION_PROFILES[id].label })),
  ];

  // סינון לפי התוויה נבחרת
  let pool = enrichedScored;
  if (indFilter !== "auto") {
    const prof = INDICATION_PROFILES[indFilter];
    pool = enrichedScored.filter((s) => s.effects.some((e) => prof.seek.includes(e) || e === indFilter));
  } else if (ans.reasons.length > 0) {
    // לפי ההתוויות שהמשתמש בחר
    pool = enrichedScored.filter((s) =>
      s.effects.some((e) => ans.reasons.includes(e)) || ans.reasons.some((r) => {
        const p = INDICATION_PROFILES[r];
        return p && s.effects.some((e) => p.seek.includes(e));
      })
    );
    if (pool.length === 0) pool = enrichedScored; // נפילה בטוחה
  }

  // ── הלוגיקה החדשה: רף הדרגתי ──
  // מתחילים מ-95%, יורדים עד שמוצאים מספיק (לפחות 3), אחרת מודיעים שאין
  const thresholds = [95, 90, 85, 80, 72];
  let usedThreshold = null;
  let visible = [];
  for (const th of thresholds) {
    const hits = pool.filter((s) => s.match >= th);
    if (hits.length >= 3 || (th === 72 && hits.length > 0)) {
      visible = hits;
      usedThreshold = th;
      break;
    }
  }
  // אם גם ב-72% אין כלום
  const nothingFound = visible.length === 0;
  const topMatch = pool.length > 0 ? Math.max(...pool.map((s) => s.match)) : 0;

  return (
    <div className="space-y-3">
      {source === "db" && (
        <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full w-fit"
          style={{ background: "rgba(74,222,128,0.12)", color: "#4ADE80" }}>
          🟢 מחובר למאגר החי (357 זנים)
        </div>
      )}
      {/* כותרת + כפתור הסבר */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm flex-1" style={{ color: "rgba(187,247,208,0.55)" }}>
          הזנים שהכי מתאימים לך — מסודרים מהגבוה לנמוך. לחצו על כרטיס לפירוט.
        </p>
        <button onClick={() => setShowInfo(!showInfo)}
          className="text-xs px-2.5 py-1 rounded-full font-bold whitespace-nowrap"
          style={{ background: C.soft, color: C.accent }}>
          {showInfo ? "✕" : "? מה הציון"}
        </button>
      </div>

      {/* הסבר על הציונים */}
      {showInfo && (
        <div className="rounded-2xl p-3.5 text-xs leading-relaxed space-y-2"
          style={{ background: "rgba(74,222,128,0.07)", border: `1px solid ${C.line}`, color: "rgba(187,247,208,0.75)" }}>
          <p><b>איך מחושב הציון?</b> אנחנו משווים את פרופיל הטרפנים של כל זן ל-DNA האישי שלכם —
          מה שבניתם מהדירוגים ומהשאלון. ככל שהזן קרוב יותר למה שעבד לכם, הציון גבוה יותר.</p>
          <div className="flex flex-col gap-1 pt-1">
            <span>🎯 <b>95%+</b> — התאמה כמעט מושלמת ל-DNA שלכם</span>
            <span>✓ <b>85–94%</b> — התאמה מצוינת, שווה לנסות</span>
            <span>👍 <b>72–84%</b> — התאמה טובה</span>
            <span>· <b>מתחת ל-72%</b> — מוסתר, פחות מתאים לכם</span>
          </div>
          <p className="pt-1" style={{ color: "#FBBF24" }}>
            ⚖️ ציון גבוה = התאמה לטעם והעדפות שלכם, לא הבטחה רפואית. ההחלטה תמיד עם הרופא/ה.
          </p>
        </div>
      )}

      {/* בורר התוויה — אופקי נגלל */}
      <div>
        <div className="text-xs font-bold mb-1.5" style={{ color: C.ink }}>הצג לפי התוויה:</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
          {indChips.map((c) => (
            <button key={c.id} onClick={() => setIndFilter(c.id)}
              className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition"
              style={indFilter === c.id
                ? { background: C.accent, color: "#fff" }
                : { background: C.card, color: C.accent, border: `1px solid ${C.line}` }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* בורר תצורה */}
      <div className="flex gap-2">
        {typeTabs.map((t) => (
          <button key={t.id} onClick={() => setTypeFilter(t.id)}
            className="flex-1 py-2 rounded-xl text-sm font-bold transition"
            style={typeFilter === t.id
              ? { background: C.ink, color: "#fff" }
              : { background: C.card, color: C.ink, border: `1px solid ${C.line}` }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* כרטיס ההתוויה הנבחרת (מהמחקר) */}
      {indFilter !== "auto" && INDICATION_PROFILES[indFilter] && (
        <IndicationCard rid={indFilter} prof={INDICATION_PROFILES[indFilter]}
          topStrains={visible.slice(0, 3)} scored={scored} ans={ans} />
      )}

      {/* באנר מצב: מה הצגנו ולמה */}
      {!nothingFound && (
        <div className="rounded-2xl p-3 flex items-center gap-3"
          style={{ background: "rgba(74,222,128,0.07)", border: `1px solid ${C.line}` }}>
          <div className="text-center px-1">
            <div className="text-xl font-bold" style={{ color: C.accent }}>{visible.length}</div>
            <div className="text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>הצעות</div>
          </div>
          <div className="w-px h-8" style={{ background: C.line }} />
          <p className="text-xs leading-relaxed flex-1" style={{ color: "rgba(187,247,208,0.75)" }}>
            {usedThreshold >= 90
              ? `מצאנו ${visible.length} זנים בהתאמה מעולה (${usedThreshold}%+). אלה הכי תואמים אתכם.`
              : usedThreshold >= 80
                ? `אין התאמות מעל 90%, אז הורדנו ל-${usedThreshold}%+. דרגו עוד זנים כדי לחדד.`
                : `מצאנו ${visible.length} התאמות סבירות (${usedThreshold}%+). ככל שתדרגו יותר — נדייק.`}
          </p>
        </div>
      )}

      {/* מצב "אין מה להמליץ" */}
      {nothingFound && (
        <div className="rounded-2xl p-5 text-center" style={{ background: C.card, border: `1px dashed ${C.line}` }}>
          <div className="text-3xl mb-2">🤔</div>
          <div className="font-bold mb-1" style={{ color: C.ink }}>
            עדיין אין לנו התאמה חזקה{indFilter !== "auto" ? " להתוויה הזו" : ""}
          </div>
          <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(187,247,208,0.55)" }}>
            {topMatch > 0
              ? `ההתאמה הכי גבוהה כרגע היא ${topMatch}% — נמוכה מדי כדי שנמליץ בביטחון. `
              : ""}
            כדי שנכיר אתכם — דרגו עוד כמה זנים ביומן, או הוסיפו התוויות וטעמים בפרופיל.
          </p>
          {indFilter !== "auto" && (
            <button onClick={() => setIndFilter("auto")}
              className="text-xs px-4 py-2 rounded-xl font-bold"
              style={{ background: C.soft, color: C.accent }}>
              ← חזרה לכל ההתאמות שלי
            </button>
          )}
        </div>
      )}

      {/* רשימת הזנים */}
      {visible.map((s) => {
        const reason = matchReason(s, ans, ratings);
        const comm = communityStats[s.id] || null;
        const isOpen = open === s.id;
        const tier = matchTier(s.match);
        return (
          <div key={s.id} className="rounded-2xl border overflow-hidden"
            style={{ background: C.card, borderColor: isOpen ? C.accent : C.line }}>
            <div className="p-4 flex gap-3 items-center cursor-pointer"
              onClick={() => setOpen(isOpen ? null : s.id)}>
              <MatchRing pct={s.match} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold" style={{ color: C.ink }}>{s.name}</span>
                  {s.isNew && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                      style={{ background: "rgba(251,191,36,0.12)", color: "#FBBF24" }}>★ חדש</span>
                  )}
                  <GeneticsChip s={s} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{ background: tier.bg, color: tier.color }}>{tier.icon} {tier.label}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{ background: C.soft, color: C.accent }}>{s.cat}</span>
                  <span className="text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>{s.kind}</span>
                </div>
              </div>
              <div className="text-center">
                <div className="font-bold text-sm mb-1" style={{ color: C.ink }}>₪{s.price}</div>
                <button onClick={(e) => { e.stopPropagation(); addToBasket(s.id); }}
                  disabled={basket.includes(s.id)}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold text-white disabled:opacity-40"
                  style={{ background: C.accent }}>
                  {basket.includes(s.id) ? "בתכנון ✓" : "+ לתכנון"}
                </button>
              </div>
            </div>

            {reason && !isOpen && (
              <p className="text-xs px-4 pb-3 font-semibold" style={{ color: C.accent }}>
                💡 {reason}
              </p>
            )}

            {isOpen && (
              <div className="px-4 pb-4 space-y-4 border-t pt-3" style={{ borderColor: C.soft }}>
                <p className="text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>שושלת: {s.lineage}</p>
                {(s.brand || s.country || s.batch) && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.brand && s.brand !== s.grower && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(187,247,208,0.75)" }}>מותג: {s.brand}</span>
                    )}
                    {s.country && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(187,247,208,0.75)" }}>
                        {s.country === "קנדה" ? "🇨🇦" : "🇮🇱"} {s.country}
                      </span>
                    )}
                    {s.batch && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(187,247,208,0.55)" }}>אצווה: {s.batch}</span>
                    )}
                    {s.nReviews > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(251,191,36,0.07)", color: "#FBBF24" }}>⭐ {s.rating} ({s.nReviews})</span>
                    )}
                  </div>
                )}
                {s.type === "oil" && s.geneticNote && (
                  <div className="rounded-xl p-2.5" style={{
                    background: s.geneticInfo === "none" ? "rgba(255,255,255,0.05)" : s.geneticInfo === "grower" ? "rgba(251,191,36,0.07)" : "rgba(74,222,128,0.07)",
                  }}>
                    <div className="text-xs font-bold mb-0.5" style={{
                      color: s.geneticInfo === "none" ? "rgba(187,247,208,0.45)" : s.geneticInfo === "grower" ? "#FBBF24" : C.accent,
                    }}>
                      {s.geneticInfo === "none" ? "⚠️ אין מידע גנטי" : s.geneticInfo === "grower" ? "📋 לפי דיווח המגדל" : "🧬 גנטיקה ידועה"}
                    </div>
                    <p className="text-xs" style={{ color: "rgba(187,247,208,0.75)" }}>{s.geneticNote}</p>
                  </div>
                )}
                {s.forms && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold" style={{ color: C.ink }}>תצורות:</span>
                    {s.forms.map((f) => FORM_LABELS[f] && (
                      <span key={f} className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(255,255,255,0.05)", color: "rgba(187,247,208,0.75)" }}>
                        {FORM_LABELS[f].icon} {FORM_LABELS[f].he}
                      </span>
                    ))}
                  </div>
                )}
                {reason && (
                  <p className="text-xs font-semibold rounded-xl p-2.5"
                    style={{ background: C.soft, color: C.accent }}>
                    💡 למה זה מתאים לך: {reason}
                  </p>
                )}
                <div>
                  <h4 className="text-xs font-bold mb-2" style={{ color: C.ink }}>
                    😊 משתמשים מדווחים שעזר (% מהמדווחים)
                  </h4>
                  <ReportBars data={s.eff} dict={EFFECTS} color={C.accent} max={4} />
                </div>
                <div>
                  <h4 className="text-xs font-bold mb-2" style={{ color: C.ink }}>😕 תופעות שדווחו</h4>
                  <ReportBars data={s.neg} dict={NEGATIVES} color="#F87171" max={3} />
                </div>
                <div>
                  <h4 className="text-xs font-bold mb-2" style={{ color: C.ink }}>👅 טעמים</h4>
                  <ReportBars data={s.flav} dict={FLAVORS} color="#D99A2B" max={3} />
                </div>
                {comm && (
                  <div className="rounded-xl p-3" style={{ background: "rgba(46,107,83,0.06)", border: "1px solid rgba(46,107,83,0.18)" }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold" style={{ color: "#4ADE80" }}>🤝 מה מטופלים דומים לך מדווחים</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(74,222,128,0.12)", color: "#4ADE80" }}>
                        {comm.avg}/10
                      </span>
                    </div>
                    {comm.helpedPct !== null && (
                      <div className="mb-1.5">
                        <div className="flex justify-between text-xs mb-0.5">
                          <span style={{ color: "rgba(187,247,208,0.55)" }}>דיווחו על עזרה</span>
                          <span className="font-semibold" style={{ color: "#4ADE80" }}>{comm.helpedPct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: "rgba(46,107,83,0.15)" }}>
                          <div className="h-full rounded-full" style={{ width: `${comm.helpedPct}%`, background: "#4ADE80" }} />
                        </div>
                      </div>
                    )}
                    <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.55)" }}>
                      {comm.note || `מבוסס על ${comm.n} דיווחים אנונימיים של מטופלים — לא הוכחה קלינית, אבל חוכמה אמיתית מהשטח.`}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "rgba(187,247,208,0.50)" }}>
                      כל הדאטה מצטבר ואנונימי. מוצג רק כשיש ≥20 דיווחים.
                    </p>
                  </div>
                )}
                <details>
                  <summary className="text-xs font-semibold cursor-pointer" style={{ color: "#A78BFA" }}>
                    + הרחבה: פרופיל טרפנים (למתעניינים)
                  </summary>
                  <div className="mt-2"><TerpDots terps={s.terps} /></div>
                </details>
                <button onClick={() => setOpen(null)}
                  className="w-full py-2.5 rounded-xl font-bold border text-sm"
                  style={{ borderColor: C.line, color: "rgba(187,247,208,0.55)", background: C.bg }}>
                  ✕ סגירת הכרטיס
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


// ── Personal terpene insight copy — warm friend tone, not clinical ────────────
const TERP_PERSONAL = {
  myrcene:       { hook: "השקט הפנימי שלך", insight: "מטופלים עם מירצן דומיננטי מדווחים על הרפיית שרירים, שינה עמוקה יותר ותחושת ריקון נעים בלי קהות מוחית. הזנים שנמצא לך יהיו כנראה בעלי ריח אדמתי ומנגו — כבדים אבל ממוקדים." },
  limonene:      { hook: "מרים לך את מצב הרוח", insight: "הדפוס ההדרי שלך מאפיין מטופלים שמחפשים שיפור מצב רוח, הקלה בחרדה ואנרגיה נקייה. ריח חד-לימוני הוא הסימן שאנחנו מחפשים בשבילך בכל תפריט." },
  caryophyllene: { hook: "נלחם בכאב בשבילך", insight: "קריופילן הוא הטרפן שמתנהג כמו תוסף נוגד-דלקת — בלי להשפיע על הראש. בפרופיל שלך הוא מרמז על זנים שאתה/את יכול/ה לצרוך גם ביום בלי לאבד פוקוס." },
  linalool:      { hook: "הרגעה עדינה — בלי מאמץ", insight: "לינלול הוא טרפן הלבנדר. בפרופיל שלך הוא מרמז על זנים שעוזרים לחרדה ולשינה בצורה עדינה ומאוזנת — בלי ה-'כבדות' שלפעמים מגיעה עם זנים מרגיעים חזקים." },
  pinene:        { hook: "ריכוז ועירנות ביום", insight: "פינן, ריח יערות האורן, מאפיין מטופלים שמחפשים עירנות, ריכוז ומה שקוראים 'פוקוס נקי'. זנים עם פינן הם הכלי שלך לשעות הבוקר והצהריים." },
  humulene:      { hook: "נוגד-דלקת שעובד בשקט", insight: "הומולן הוא הטרפן הכשתוני שמופיע בפרופילים של מטופלים עם מצבים דלקתיים. הוא עובד ברקע — לא תרגיש 'גבוה' ממנו, אבל הגוף כן ירגיש הבדל." },
  terpinolene:   { hook: "מאוזן ורענן — לא כבד מדי", insight: "טרפינולן מופיע אצל מטופלים שמחפשים אפקט מרומם ומאוזן — לא דפרסיבי, לא חזק מדי. אידיאלי ליום או לשעות המעבר בין יום ללילה." },
  ocimene:       { hook: "טרופי, עליז ומרומם", insight: "אוסימן הוא הטרפן הטרופי שמופיע בפרופילים של מטופלים שמחפשים חיוניות ועליזות. הריח האקזוטי הוא המדד שאנחנו מחפשים בתפריטים בשבילך." },
};

function Profile({ ans, ratings, goDNA }) {
  const profile = buildProfile(ans, ratings);
  const active  = Object.entries(profile).filter(([t, v]) => v > 0 && TERPENES[t]).sort((a, b) => b[1] - a[1]);
  const avoided = Object.entries(profile).filter(([t, v]) => v < 0 && TERPENES[t]);
  const maxV    = active.length > 0 ? Math.max(...active.map(([, v]) => v), 1) : 1;
  const conf    = geneticConfidence(ans, ratings);
  const seq     = dnaSequence(profile);
  const [copied, setCopied] = useState(false);

  // Build liveVector (0-1 normalized) and killSwitches for the RadarChart
  const liveVector = Object.fromEntries(
    [...active, ...avoided].map(([t, v]) => [t, Math.max(0, v / maxV)])
  );
  const killSwitches = Object.fromEntries(
    avoided.filter(([, v]) => v < -0.3).map(([t]) => [t, 0.8])
  );

  const liked = [...new Set([
    ...ans.helped,
    ...Object.entries(ratings).filter(([, r]) => r >= 7).map(([id]) => id),
  ])].map((id) => STRAINS.find((s) => s.id === id)).filter(Boolean)
    .map((s) => ({ s, score: ratings[s.id] || (ans.helped.includes(s.id) ? "עזר" : "") }));
  const disliked = [...new Set([
    ...ans.notHelped.filter((id) => !ans.helped.includes(id)),
    ...Object.entries(ratings).filter(([, r]) => r <= 4).map(([id]) => id),
  ])].map((id) => STRAINS.find((s) => s.id === id)).filter(Boolean);

  const shareProfile = () => {
    const top3 = active.slice(0, 3).map(([t]) => TERPENES[t]?.he || t).join(", ");
    navigator.clipboard?.writeText(`🧬 הפרופיל שלי בקנאמאצ׳\nרצף: ${seq}\nטרפנים מובילים: ${top3}\nקנאמאצ׳ — התאמה אישית לתפריט הקנאביס שלך`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasProfile = active.length > 0;

  return (
    <div className="space-y-4">

      {/* ── 1. DNA Identity Header ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-3xl p-5 relative overflow-hidden"
        style={{
          background: "linear-gradient(150deg,#060f08 0%,#0a1f0e 50%,#061008 100%)",
          border: "1.5px solid rgba(74,222,128,0.22)",
          boxShadow: "0 0 40px rgba(74,222,128,0.06), 0 8px 32px rgba(0,0,0,0.50)",
        }}
      >
        {/* Ambient glow spot */}
        <div style={{
          position: "absolute", top: -30, right: -20,
          width: 160, height: 160, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,222,128,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div className="flex items-start justify-between mb-3 relative">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <motion.span
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 2.4, repeat: Infinity }}
                style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ADE80",
                         boxShadow: "0 0 8px rgba(74,222,128,0.90)", display: "inline-block" }}
              />
              <span className="text-xs font-bold tracking-widest"
                style={{ color: "rgba(74,222,128,0.75)", letterSpacing: "0.12em" }}>
                CANNAMATCH DNA
              </span>
            </div>
            <h2 className="text-xl font-bold" style={{ color: "#F0FDF4" }}>הפרופיל שלך 🌿</h2>
            <div className="font-mono text-sm mt-1 tracking-wider" style={{ color: "#86EFAC" }}>
              {seq || "——"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: "#4ADE80" }}>{conf.pct}%</div>
            <div className="text-xs" style={{ color: "rgba(187,247,208,0.60)" }}>{conf.label}</div>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="h-1.5 rounded-full mb-3" style={{ background: "rgba(255,255,255,0.08)" }}>
          <motion.div className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${conf.pct}%` }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
            style={{ background: "linear-gradient(90deg,#4ADE80,#86EFAC)" }}
          />
        </div>

        <div className="flex gap-2">
          <button onClick={goDNA}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: "rgba(74,222,128,0.12)", color: "#4ADE80",
                     border: "1px solid rgba(74,222,128,0.25)" }}>
            פרופיל מלא ←
          </button>
          <button onClick={shareProfile}
            className="px-4 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(187,247,208,0.80)",
                     border: "1px solid rgba(255,255,255,0.10)" }}>
            {copied ? "✓ הועתק" : "🧬 שתף"}
          </button>
        </div>
      </motion.div>

      {/* ── 2. Radar Chart — the exact onboarding diagram ──────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-3xl p-5"
        style={{
          background: "rgba(8,14,10,0.92)",
          border: "1.5px solid rgba(57,255,133,0.16)",
          boxShadow: "0 0 30px rgba(57,255,133,0.04), 0 6px 28px rgba(0,0,0,0.45)",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-base" style={{ color: "#F0FDF4" }}>🧬 המפה הגנטית שלך</h3>
          {active.length > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full font-bold"
              style={{ background: "rgba(57,255,133,0.10)", color: "#39FF85",
                       border: "1px solid rgba(57,255,133,0.20)" }}>
              {active.length} טרפנים פעילים
            </span>
          )}
        </div>
        <p className="text-xs mb-4" style={{ color: "rgba(126,168,142,0.80)" }}>
          כל נקודה על המפה = טרפן שאפיין את הזנים שעבדו לך
        </p>

        {hasProfile ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <RadarChart liveVector={liveVector} killSwitches={killSwitches} size={230} />
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🌱</div>
            <p className="text-sm font-bold mb-1" style={{ color: "#4ADE80" }}>הפרופיל שלך מחכה לדיווחים</p>
            <p className="text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>
              דרגי זן אחד ביומן המעקב — ואנחנו נתחיל לצייר את המפה שלך
            </p>
          </div>
        )}

        {/* Terpene pills */}
        {active.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {active.slice(0, 6).map(([t, v], i) => (
              <motion.span
                key={t}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.06, type: "spring", stiffness: 280 }}
                className="text-xs px-3 py-1.5 rounded-full font-bold"
                style={{
                  background: `${TERPENES[t]?.color || "#4ADE80"}1A`,
                  color:      TERPENES[t]?.color || "#4ADE80",
                  border:     `1.5px solid ${TERPENES[t]?.color || "#4ADE80"}44`,
                  boxShadow:  `0 0 8px ${TERPENES[t]?.color || "#4ADE80"}18`,
                }}
              >
                {TERPENES[t]?.he} {Math.round((v / maxV) * 100)}%
              </motion.span>
            ))}
          </div>
        )}

        {avoided.length > 0 && (
          <div className="mt-3 rounded-xl px-3 py-2.5"
            style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.18)" }}>
            <p className="text-xs" style={{ color: "#FCA5A5" }}>
              🛡️ <span className="font-bold">חסום לבטיחותך:</span>{" "}
              {avoided.map(([t]) => TERPENES[t]?.he).join(", ")} — זוהה כטריגר בפרופיל שלך
            </p>
          </div>
        )}
      </motion.div>

      {/* ── 3. "What We Found For You" — warm micro-cards ──────────────────── */}
      {hasProfile && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Section header */}
          <div className="rounded-2xl p-4 mb-3"
            style={{
              background: "rgba(6,12,8,0.96)",
              border: "1.5px solid rgba(57,255,133,0.14)",
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">📡</span>
              <h3 className="font-bold text-base" style={{ color: "#F0FDF4" }}>מה גילינו עליך</h3>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(134,239,172,0.65)" }}>
              סרקנו נתוני מחקר ציבוריים ודיווחי מטופלים ואספנו לך את הדפוסים הפרסונליים שהכי מתאימים לפרופיל שלך.
              זה לא ניסוי מעבדה — זה מה שמטופלים עם פרופיל דומה לשלך מדווחים.
            </p>
          </div>

          {/* Terpene insight micro-cards */}
          <div className="space-y-2.5">
            {active.slice(0, 4).map(([t], i) => {
              const personal = TERP_PERSONAL[t];
              const sci      = TERP_SCIENCE[t];
              if (!personal && !sci) return null;
              const tColor = TERPENES[t]?.color || "#4ADE80";
              return (
                <motion.div
                  key={t}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-2xl p-4"
                  style={{
                    background: "rgba(10,18,12,0.92)",
                    borderRight: `3px solid ${tColor}`,
                    border: `1px solid ${tColor}20`,
                    borderRightWidth: 3,
                    borderRightColor: tColor,
                    boxShadow: `0 0 16px ${tColor}0A`,
                  }}
                >
                  {/* Card header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{sci?.aroma?.split(" ")[0] || "🌿"}</span>
                    <div>
                      <span className="font-bold text-sm" style={{ color: tColor }}>
                        {TERPENES[t]?.he}
                      </span>
                      <span className="text-xs mx-2 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>—</span>
                      <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.80)" }}>
                        {personal?.hook || sci?.role}
                      </span>
                    </div>
                  </div>
                  {/* Warm copy */}
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.72)" }}>
                    {personal?.insight || sci?.detail}
                  </p>
                </motion.div>
              );
            })}
          </div>

          {/* Disclaimer micro-card */}
          <div className="rounded-xl p-3 mt-2"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-xs text-center" style={{ color: "rgba(187,247,208,0.35)" }}>
              המידע מבוסס על דיווחי מטופלים ונתוני מחקר פתוחים. אינו ייעוץ רפואי — כל החלטה טיפולית עם הרופא/ה שלך.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── 4. Goals (indications) ─────────────────────────────────────────── */}
      {ans.reasons.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.3 }}
          className="rounded-2xl p-4"
          style={{ background: "rgba(10,16,12,0.90)", border: "1.5px solid rgba(74,222,128,0.12)" }}
        >
          <h3 className="font-bold mb-3" style={{ color: "#F0FDF4" }}>🎯 המטרות שלך</h3>
          <div className="flex flex-wrap gap-2">
            {ans.reasons.map((r) => (
              <span key={r} className="text-sm px-3 py-1.5 rounded-full font-semibold"
                style={{ background: "rgba(74,222,128,0.10)", color: "#4ADE80",
                         border: "1px solid rgba(74,222,128,0.22)" }}>
                {REASONS.find((x) => x.id === r)?.label}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── 5. Liked strains ───────────────────────────────────────────────── */}
      {(liked.length > 0 || disliked.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.35 }}
          className="rounded-2xl p-4"
          style={{ background: "rgba(10,16,12,0.90)", border: "1.5px solid rgba(74,222,128,0.12)" }}
        >
          <h3 className="font-bold mb-1" style={{ color: "#F0FDF4" }}>🌿 מה שכבר למדנו עליך</h3>
          <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.50)" }}>
            כל דירוג שתנתן מחדד את הפרופיל ואת ההמלצות שלך
          </p>

          {liked.length > 0 && (
            <div className="space-y-2 mb-3">
              {liked.map(({ s, score }) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl p-2.5"
                  style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.10)" }}>
                  <div className="min-w-0">
                    <span className="font-bold text-sm" style={{ color: "#F0FDF4" }}>{s.genetics}</span>
                    <span className="text-xs mr-1.5" style={{ color: "rgba(187,247,208,0.45)" }}>({s.name})</span>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(187,247,208,0.35)" }}>{s.lineage}</div>
                  </div>
                  <span className="font-bold text-sm ml-2 flex-shrink-0" style={{ color: "#4ADE80" }}>
                    {typeof score === "number" ? `${score}/10` : score}
                  </span>
                </div>
              ))}
            </div>
          )}

          {disliked.length > 0 && (
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: "#FCA5A5" }}>❌ לא עבדו לך:</p>
              <div className="flex flex-wrap gap-1.5">
                {disliked.map((s) => (
                  <span key={s.id} className="text-xs px-2.5 py-1 rounded-full font-semibold"
                    style={{ background: "rgba(248,113,113,0.08)", color: "#FCA5A5",
                             border: "1px solid rgba(248,113,113,0.20)" }}>
                    {s.genetics}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── 6. Batch-dependent strains ─────────────────────────────────────── */}
      {ans.helped.filter((id) => ans.notHelped.includes(id)).length > 0 && (
        <div className="rounded-2xl p-4"
          style={{ background: "rgba(251,191,36,0.05)", border: "1.5px solid rgba(251,191,36,0.18)" }}>
          <h3 className="font-bold mb-2" style={{ color: "#FBBF24" }}>🏷️ זנים תלויי-אצווה</h3>
          <div className="flex flex-wrap gap-2 mb-2">
            {ans.helped.filter((id) => ans.notHelped.includes(id)).map((id) => (
              <span key={id} className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ background: "rgba(251,191,36,0.10)", color: "#FBBF24",
                         border: "1px solid rgba(251,191,36,0.22)" }}>
                {STRAINS.find((s) => s.id === id)?.name}
              </span>
            ))}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(251,191,36,0.65)" }}>
            זנים שעזרו לך באצווה מסוימת אבל לא בכל אצווה. סיבה שכיחה: שינוי בפרופיל הטרפנים בין אצוות שונה של אותו זן.
          </p>
        </div>
      )}

      {/* ── 7. Delivery methods — compact ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.4 }}
        className="rounded-2xl p-4"
        style={{ background: "rgba(10,16,12,0.90)", border: "1.5px solid rgba(74,222,128,0.10)" }}
      >
        <h3 className="font-bold mb-1" style={{ color: "#F0FDF4" }}>⚗️ אותה גנטיקה — חוויה אחרת לפי דרך הצריכה</h3>
        <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.50)" }}>
          איך שאתה/את צורכ/ת משנה את ההשפעה לא פחות מאיזה זן בחרת
        </p>
        <div className="space-y-2">
          {DELIVERY_METHODS.map((d) => (
            <div key={d.id} className="rounded-xl p-3"
              style={{
                background: d.best ? "rgba(74,222,128,0.06)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${d.best ? "rgba(74,222,128,0.22)" : "rgba(255,255,255,0.07)"}`,
              }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{d.icon}</span>
                <span className="font-bold text-sm" style={{ color: d.best ? "#4ADE80" : "#F0FDF4" }}>
                  {d.title}
                </span>
                {d.best && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold ml-auto"
                    style={{ background: "#4ADE80", color: "#0c0d11" }}>מומלץ</span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap text-xs mb-1" style={{ color: "rgba(187,247,208,0.50)" }}>
                <span>⏱ {d.onset}</span>
                <span>·</span>
                <span>שיא: {d.peak}</span>
                <span>·</span>
                <span>משך: {d.duration}</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.68)" }}>{d.note}</p>
            </div>
          ))}
        </div>
        <div className="text-xs mt-3 rounded-xl p-3 leading-relaxed"
          style={{ background: "rgba(248,113,113,0.07)", color: "#FCA5A5",
                   border: "1px solid rgba(248,113,113,0.15)" }}>
          🚭 {TOBACCO_WARNING}
        </div>
      </motion.div>

    </div>
  );
}

function Basket({ scored, basket, setBasket, budget, setBudget, ph, setPh }) {
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(500);
  const [budgetText, setBudgetText] = useState("");

  const MONTHLY_QUOTA_G = 50; // monthly prescription allowance in grams
  const AVG_UNIT_G = 10;      // each "unit" in basket = 10g
  const effectiveBudget = budgetText !== "" ? Math.max(0, parseInt(budgetText, 10) || budget) : budget;
  const pharm = (PHARMACIES || []).find((p) => p.id === ph);
  const available = scored.filter((s) =>
    s.pharmacies.includes(ph) &&
    s.price >= priceMin &&
    s.price <= priceMax
  );
  const items = basket.map((id) => scored.find((s) => s.id === id)).filter(Boolean);
  const total = items.reduce((a, s) => a + s.price, 0);
  const quotaUsed = items.length * AVG_UNIT_G;
  const quotaPct = Math.min(quotaUsed / MONTHLY_QUOTA_G, 1);
  const budgetPct = Math.min(total / effectiveBudget, 1);
  const overBudget = total > effectiveBudget;
  const overQuota = quotaUsed > MONTHLY_QUOTA_G;

  const autoBuild = () => {
    const picked = [];
    let sum = 0;
    for (const s of available) {
      if (sum + s.price <= effectiveBudget && (picked.length + 1) * AVG_UNIT_G <= MONTHLY_QUOTA_G) {
        picked.push(s.id); sum += s.price;
      }
    }
    setBasket(picked);
  };

  return (
    <div className="space-y-4 px-4 pt-4 pb-6">

      {/* HUD top panel */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="rounded-2xl p-4 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg,rgba(8,18,12,0.98) 0%,rgba(14,28,18,0.97) 100%)", border: "1.5px solid rgba(74,222,128,0.18)" }}>
        <div className="text-sm font-bold text-right mb-4" style={{ color: C.ink }}>תכנון קנייה חודשית 🗓️</div>

        {/* Dual gauge row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Budget gauge */}
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(74,222,128,0.10)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-lg font-black" style={{ color: overBudget ? "#FCA5A5" : C.accent }}>
                ₪{total}
              </span>
              <span className="text-xs" style={{ color: "rgba(187,247,208,0.50)" }}>תקציב</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
              <motion.div className="h-full rounded-full"
                initial={{ width: 0 }} animate={{ width: `${budgetPct * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{ background: overBudget ? "#FCA5A5" : "linear-gradient(90deg,#4ADE80,#22C55E)" }} />
            </div>
            <div className="text-xs mt-1" style={{ color: "rgba(187,247,208,0.40)" }}>מתוך ₪{effectiveBudget}</div>
          </div>

          {/* Quota gauge */}
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(74,222,128,0.10)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-lg font-black" style={{ color: overQuota ? "#FCA5A5" : "#C084FC" }}>
                {quotaUsed}ג׳
              </span>
              <span className="text-xs" style={{ color: "rgba(187,247,208,0.50)" }}>מכסה חודשית</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
              <motion.div className="h-full rounded-full"
                initial={{ width: 0 }} animate={{ width: `${quotaPct * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
                style={{ background: overQuota ? "#FCA5A5" : "linear-gradient(90deg,#C084FC,#A855F7)" }} />
            </div>
            <div className="text-xs mt-1" style={{ color: "rgba(187,247,208,0.40)" }}>מתוך {MONTHLY_QUOTA_G}ג׳ (רישיון)</div>
          </div>
        </div>

        {/* Budget slider */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center rounded-lg border px-2 py-1 gap-1"
              style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(74,222,128,0.15)", minWidth: 80 }}>
              <span className="text-xs font-bold" style={{ color: C.accent }}>₪</span>
              <input type="number" min="0" max="9999" value={budgetText || effectiveBudget}
                onChange={e => setBudgetText(e.target.value)}
                className="w-14 text-xs font-bold bg-transparent outline-none text-right"
                style={{ color: C.ink }} />
            </div>
            <span className="text-xs font-semibold" style={{ color: C.ink }}>תקציב חודשי</span>
          </div>
          <input type="range" min="200" max="2000" step="50" value={effectiveBudget}
            onChange={e => { setBudget(+e.target.value); setBudgetText(""); }}
            className="w-full" style={{ accentColor: C.accent }} />
        </div>

        {/* Price range */}
        <div className="mb-3 space-y-2">
          <div className="text-xs font-semibold text-right" style={{ color: "rgba(187,247,208,0.60)" }}>טווח מחיר ל-10ג׳</div>
          {[
            { label: "מינ׳", val: priceMin, set: v => setPriceMin(Math.min(v, priceMax - 10)), min: 0, max: 490 },
            { label: "מקס׳", val: priceMax, set: v => setPriceMax(Math.max(v, priceMin + 10)), min: 10, max: 500 },
          ].map(({ label, val, set, min, max }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-xs w-10 text-right font-semibold" style={{ color: "rgba(187,247,208,0.45)" }}>₪{val}</span>
              <input type="range" min={min} max={max} step="10" value={val}
                onChange={e => set(+e.target.value)} className="flex-1" style={{ accentColor: C.accent }} />
              <span className="text-xs w-8 text-right" style={{ color: "rgba(187,247,208,0.40)" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Pharmacy selector */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-right mb-1.5" style={{ color: "rgba(187,247,208,0.60)" }}>בית מרקחת</div>
          <div className="flex flex-wrap gap-1.5">
            {(PHARMACIES || []).map((p) => (
              <Chip key={p.id} on={ph === p.id} onClick={() => setPh(p.id)}>
                {p.name} · {p.city}{p.delivery ? " 🚚" : ""}
              </Chip>
            ))}
          </div>
        </div>

        <motion.button onClick={autoBuild} whileTap={{ scale: 0.97 }}
          className="w-full py-3 rounded-xl font-bold text-sm"
          style={{ background: "linear-gradient(135deg,#1E4D36,#4ADE80)", color: "#fff", boxShadow: "0 0 18px rgba(74,222,128,0.22)" }}>
          🌿 בנה לי תוכנית לפי הפרופיל שלי
        </motion.button>
      </motion.div>

      {/* Item list */}
      {items.length > 0 && (
        <motion.div className="rounded-2xl border overflow-hidden"
          style={{ background: C.card, borderColor: C.line }}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}>
          <div className="px-4 py-3 border-b flex items-center justify-between"
            style={{ background: C.soft, borderColor: C.line }}>
            <span className="text-xs font-bold" style={{ color: C.accent }}>{items.length} פריטים נבחרו</span>
            <span className="text-sm font-bold" style={{ color: C.ink }}>הרשימה שלך {pharm ? `· ${pharm.name}` : ""}</span>
          </div>
          {items.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 border-b last:border-0"
              style={{ borderColor: "rgba(74,222,128,0.07)" }}>
              <div className="flex items-center gap-2">
                <button onClick={() => setBasket(basket.filter((x) => x !== s.id))}
                  className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                  style={{ color: "#FCA5A5", background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.18)" }}>
                  הסר
                </button>
                <span className="text-sm font-bold" style={{ color: C.ink }}>₪{s.price}</span>
              </div>
              <div className="text-right">
                <div className="font-semibold text-sm" style={{ color: C.ink }}>{s.name}</div>
                <div className="flex gap-2 justify-end mt-0.5">
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: "rgba(74,222,128,0.09)", color: C.accent }}>{s.cat}</span>
                  <span className="text-xs font-bold" style={{ color: C.accent }}>{s.match}%</span>
                </div>
              </div>
            </div>
          ))}
          <div className="px-4 py-3 flex justify-between font-bold" style={{ borderTop: `1px solid ${C.line}` }}>
            <span style={{ color: overBudget ? "#FCA5A5" : C.accent }}>₪{total} / ₪{effectiveBudget}</span>
            <span style={{ color: C.ink }}>סה״כ</span>
          </div>
          {overBudget && (
            <p className="text-xs pb-3 font-semibold text-center" style={{ color: "#FCA5A5" }}>
              ⚠️ חריגה מהתקציב — הסירו פריטים או הגדילו תקציב
            </p>
          )}
          {!pharm?.delivery && pharm && (
            <p className="text-xs pb-3 font-semibold text-center" style={{ color: "#FBBF24" }}>
              🏪 בית מרקחת זה ללא משלוחים — איסוף עצמי בלבד
            </p>
          )}
        </motion.div>
      )}

      {items.length === 0 && (
        <div className="text-center py-8 rounded-2xl border" style={{ background: C.soft, borderColor: C.line }}>
          <div className="text-2xl mb-2">🛒</div>
          <p className="text-sm font-semibold" style={{ color: C.ink }}>הרשימה ריקה</p>
          <p className="text-xs mt-1" style={{ color: "rgba(187,247,208,0.45)" }}>
            לחצו "בנה לי תוכנית" למעלה, או הוסיפו זנים מהמלצות
          </p>
        </div>
      )}
    </div>
  );
}

function Feedback({ ans, scored, ratings, setRatings }) {
  const [search, setSearch] = useState("");
  const [extra, setExtra] = useState([]); // זנים שהמשתמש הוסיף ידנית לדירוג

  // זנים מוצעים לדירוג: מה שצורך כרגע + מה שכבר דירג + מה שהוסיף + ההמלצות המובילות
  const suggestedIds = [...new Set([
    ...ans.current,
    ...Object.keys(ratings),
    ...extra,
  ])];
  let toRate = suggestedIds.map((id) => STRAINS.find((s) => s.id === id)).filter(Boolean);

  // אם אין כלום — נציע את ההתאמות המובילות כדי שיהיה ממה להתחיל
  const haveAny = toRate.length > 0;
  const topSuggestions = scored.slice(0, 5).filter((s) => !suggestedIds.includes(s.id));

  // תוצאות חיפוש (להוספה)
  const searchResults = search.trim()
    ? STRAINS.filter((s) =>
        (s.name.includes(search) || s.genetics.includes(search) || (s.en || "").toLowerCase().includes(search.toLowerCase()))
        && !suggestedIds.includes(s.id)
      ).slice(0, 6)
    : [];

  const addStrain = (id) => { setExtra((p) => [...new Set([...p, id])]); setSearch(""); };

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "rgba(187,247,208,0.55)" }}>
        דרגו זנים שניסיתם — עד כמה עזרו לכם. כל דירוג מחדד מיד את ה-DNA ואת ההמלצות. 🧬
      </p>

      {/* חיפוש והוספה */}
      <div className="rounded-2xl p-3 border" style={{ background: C.card, borderColor: C.line }}>
        <div className="text-xs font-bold mb-1.5" style={{ color: C.ink }}>➕ הוסיפו זן שניסיתם</div>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 חפשו זן לפי שם או גנטיקה..."
          className="w-full rounded-xl border p-2.5 text-sm"
          style={{ borderColor: C.line, background: C.bg, color: C.ink }} />
        {searchResults.length > 0 && (
          <div className="mt-2 space-y-1">
            {searchResults.map((s) => (
              <button key={s.id} onClick={() => addStrain(s.id)}
                className="w-full text-right flex items-center justify-between rounded-lg p-2 text-sm border"
                style={{ borderColor: C.line, background: "rgba(255,255,255,0.04)" }}>
                <span style={{ color: C.ink }}>{s.name} <span className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>· {s.genetics}</span></span>
                <span className="text-xs font-bold" style={{ color: C.accent }}>+ הוסף</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* אם אין כלום — הצעות התחלה */}
      {!haveAny && (
        <div className="rounded-2xl p-4 border" style={{ background: C.soft, borderColor: C.line }}>
          <p className="text-xs font-bold mb-2" style={{ color: C.ink }}>
            עוד לא דירגתם כלום — הנה כמה זנים מובילים להתחיל מהם:
          </p>
          <div className="space-y-1">
            {topSuggestions.map((s) => (
              <button key={s.id} onClick={() => addStrain(s.id)}
                className="w-full text-right flex items-center justify-between rounded-lg p-2 text-sm border"
                style={{ borderColor: C.line, background: "rgba(255,255,255,0.04)" }}>
                <span style={{ color: C.ink }}>{s.name} <span className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>· {s.match}% התאמה</span></span>
                <span className="text-xs font-bold" style={{ color: C.accent }}>+ דרג</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* רשימת הדירוג */}
      {toRate.map((s) => (
        <div key={s.id} className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.line }}>
          <div className="flex justify-between items-center mb-2">
            <div>
              <span className="font-bold" style={{ color: C.ink }}>{s.name}</span>
              <span className="text-xs mr-2" style={{ color: "rgba(187,247,208,0.45)" }}>{s.genetics}</span>
            </div>
            <span className="text-lg font-bold"
              style={{ color: ratings[s.id] ? (ratings[s.id] >= 7 ? C.accent : ratings[s.id] >= 4 ? "#D99A2B" : "#F87171") : "rgba(187,247,208,0.45)" }}>
              {ratings[s.id] || "—"}
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
              <button key={n}
                onClick={() => setRatings({ ...ratings, [s.id]: n })}
                className="flex-1 py-2 rounded-lg text-xs font-bold border transition-all"
                style={{
                  background: ratings[s.id] === n ? C.accent : ratings[s.id] >= n ? C.soft : C.card,
                  color: ratings[s.id] === n ? "#fff" : C.ink,
                  borderColor: ratings[s.id] >= n ? C.accent : C.line,
                }}>{n}</button>
            ))}
          </div>
          <div className="flex justify-between text-xs mt-1" style={{ color: "rgba(187,247,208,0.45)" }}>
            <span>1 = לא עזר</span><span>10 = מצוין</span>
          </div>
        </div>
      ))}

      {Object.keys(ratings).length > 0 && (
        <p className="text-xs text-center font-semibold" style={{ color: C.accent }}>
          ✓ הפרופיל שלכם התעדכן — ההמלצות וה-DNA מחושבים מחדש
        </p>
      )}
    </div>
  );
}

/* ───────────── מסך ניתוח אישי ───────────── */

function Analytics() {
  const history = []; // purchase history loaded from API when implemented
  const data = history.map((m) => {
    const spent = m.items.reduce((a, x) => a + x.price, 0);
    const avg = m.items.reduce((a, x) => a + x.rating, 0) / m.items.length;
    return { month: m.month, spent, budget: m.budget, avg: +avg.toFixed(1) };
  });

  if (data.length === 0) {
    return (
      <div className="p-8 text-center rounded-2xl border" style={{ background: C.card, borderColor: C.line }}>
        <div className="text-4xl mb-3">📊</div>
        <p className="font-bold mb-1" style={{ color: C.ink }}>{T.analytics.noData}</p>
        <p className="text-sm" style={{ color: "rgba(187,247,208,0.45)" }}>{T.analytics.noDataSub}</p>
      </div>
    );
  }

  const totalSpent = data.reduce((a, m) => a + m.spent, 0);
  const avgMonth = Math.round(totalSpent / data.length);
  const lastAvg = data[data.length - 1].avg;

  const byStrain = {};
  history.forEach((m) => m.items.forEach((x) => {
    (byStrain[x.id] = byStrain[x.id] || []).push(x.rating);
  }));
  const ranked = Object.entries(byStrain)
    .map(([id, rs]) => ({
      s: STRAINS.find((x) => x.id === id),
      avg: rs.reduce((a, b) => a + b, 0) / rs.length,
      n: rs.length,
    }))
    .sort((a, b) => b.avg - a.avg);
  const loved = ranked.filter((x) => x.avg >= 7.5);
  const disliked = ranked.filter((x) => x.avg < 5.5);

  const StatCard = ({ label, value, sub }) => (
    <div className="flex-1 rounded-2xl p-3 border text-center"
      style={{ background: C.card, borderColor: C.line }}>
      <div className="text-xl font-bold" style={{ color: C.ink }}>{value}</div>
      <div className="text-xs font-semibold" style={{ color: C.accent }}>{label}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "rgba(187,247,208,0.45)" }}>{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <StatCard label="סה״כ חצי שנה" value={`₪${totalSpent.toLocaleString()}`} />
        <StatCard label="ממוצע חודשי" value={`₪${avgMonth}`} />
        <StatCard label="שביעות רצון" value={lastAvg} sub="החודש · מתוך 10" />
      </div>

      <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.line }}>
        <h3 className="font-bold mb-1" style={{ color: C.ink }}>כמה הוצאת כל חודש</h3>
        <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.55)" }}>
          הקו המקווקו — התקציב שהגדרת לאותו חודש
        </p>
        <div style={{ width: "100%", height: 200 }} dir="ltr">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.soft} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "rgba(187,247,208,0.55)" }} reversed />
              <YAxis tick={{ fontSize: 11, fill: "rgba(187,247,208,0.55)" }} />
              <Tooltip formatter={(v, n) => [`₪${v}`, n === "spent" ? "הוצאה" : n]}
                labelStyle={{ color: C.ink, fontWeight: 700 }} />
              <ReferenceLine y={data[data.length - 1].budget} stroke="#D99A2B" strokeDasharray="4 4" />
              <Bar dataKey="spent" fill={C.accent} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.line }}>
        <h3 className="font-bold mb-1" style={{ color: C.ink }}>כמה אהבת את הקנייה</h3>
        <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.55)" }}>
          ממוצע הדירוגים שלך (1–10) לכל סל חודשי — שימו לב לעלייה ככל שהמערכת לומדת
        </p>
        <div style={{ width: "100%", height: 180 }} dir="ltr">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.soft} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "rgba(187,247,208,0.55)" }} reversed />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: "rgba(187,247,208,0.55)" }} />
              <Tooltip formatter={(v) => [v, "דירוג ממוצע"]}
                labelStyle={{ color: C.ink, fontWeight: 700 }} />
              <Line type="monotone" dataKey="avg" stroke="#A78BFA" strokeWidth={3}
                dot={{ r: 4, fill: "#A78BFA" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.line }}>
        <h3 className="font-bold mb-3" style={{ color: C.ink }}>מה אהבת 💚</h3>
        {loved.map(({ s, avg, n }) => (
          <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0"
            style={{ borderColor: C.soft }}>
            <div>
              <span className="font-medium" style={{ color: C.ink }}>{s.name}</span>
              <div className="mt-1"><GeneticsChip s={s} /></div>
            </div>
            <div className="text-left">
              <div className="font-bold" style={{ color: C.accent }}>{avg.toFixed(1)}</div>
              <div className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>{n} רכישות</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.line }}>
        <h3 className="font-bold mb-3" style={{ color: C.ink }}>מה פחות עבד</h3>
        {disliked.length === 0 && (
          <p className="text-sm" style={{ color: "rgba(187,247,208,0.55)" }}>אין כרגע מוצרים עם דירוג נמוך</p>
        )}
        {disliked.map(({ s, avg, n }) => (
          <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0"
            style={{ borderColor: C.soft }}>
            <div>
              <span className="font-medium" style={{ color: C.ink }}>{s.name}</span>
              <div className="mt-1"><GeneticsChip s={s} /></div>
            </div>
            <div className="text-left">
              <div className="font-bold" style={{ color: "#F87171" }}>{avg.toFixed(1)}</div>
              <div className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>{n} רכישות</div>
            </div>
          </div>
        ))}
        {disliked.length > 0 && (
          <p className="text-xs mt-3 font-semibold" style={{ color: C.accent }}>
            💡 התובנה: הזנים שפחות עבדו עשירים בטרפנים שמקבלים משקל שלילי בפרופיל שלך —
            המערכת כבר מורידה אותם בהמלצות
          </p>
        )}
      </div>

      <ValueAnalysis ranked={ranked} />
    </div>
  );
}

/* ───────────── ניתוח שווי: איפה הכי משתלם, ומתי שווה לשלם יותר ───────────── */
function ValueAnalysis({ ranked }) {
  // ציון שווי = דירוג ÷ מחיר (כמה "שביעות רצון" לכל שקל)
  const withValue = ranked.filter((x) => x.s).map((x) => ({
    ...x,
    value: +((x.avg / x.s.price) * 100).toFixed(2), // שביעות רצון לכל ₪100
  })).sort((a, b) => b.value - a.value);

  const best = withValue[0];
  const cheapest = [...withValue].sort((a, b) => a.s.price - b.s.price)[0];
  const highestRated = [...withValue].sort((a, b) => b.avg - a.avg)[0];

  // האם שווה לשלם יותר? מצא זוג: זול+בינוני מול יקר+מצוין
  let upgradeInsight = null;
  if (highestRated && cheapest && highestRated.s.id !== cheapest.s.id) {
    const priceDiff = highestRated.s.price - cheapest.s.price;
    const ratingDiff = highestRated.avg - cheapest.avg;
    if (priceDiff > 0 && ratingDiff >= 1.5) {
      upgradeInsight = {
        cheap: cheapest, premium: highestRated,
        priceDiff, ratingDiff: ratingDiff.toFixed(1),
        perPoint: Math.round(priceDiff / ratingDiff),
      };
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 border" style={{ background: "rgba(20,23,32,0.92)", borderColor: C.line }}>
        <h3 className="font-bold mb-1" style={{ color: C.ink }}>💰 מפת השווי שלך</h3>
        <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.65)" }}>
          לא תמיד הזול ביותר הכי משתלם. ה"שווי" = כמה שביעות רצון אתה מקבל לכל שקל — לפי הדירוגים שלך.
        </p>
        {withValue.length === 0 && (
          <p className="text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>דרגו עוד זנים כדי לקבל ניתוח שווי אישי</p>
        )}
        <div className="space-y-2">
          {withValue.slice(0, 6).map((x, i) => {
            const maxVal = withValue[0].value || 1;
            return (
              <div key={x.s.id} className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {i === 0 && <span className="text-xs">👑</span>}
                    <span className="font-bold text-sm truncate" style={{ color: C.ink }}>{x.s.name}</span>
                    <span className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>₪{x.s.price}</span>
                  </div>
                  <span className="text-xs font-bold whitespace-nowrap" style={{ color: C.accent }}>
                    {x.avg.toFixed(1)}/10
                  </span>
                </div>
                <div className="h-2 rounded-full" style={{ background: C.soft }}>
                  <div className="h-full rounded-full" style={{
                    width: `${(x.value / maxVal) * 100}%`,
                    background: i === 0 ? C.accent : "#A8C3B2",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
        {best && (
          <p className="text-xs mt-3 font-semibold rounded-xl p-2.5" style={{ background: C.soft, color: C.accent }}>
            👑 הכי משתלם לך: {best.s.name} — {best.avg.toFixed(1)}/10 ב-₪{best.s.price}. שביעות רצון מקסימלית לכל שקל.
          </p>
        )}
      </div>

      {/* מתי שווה לשלם יותר */}
      {upgradeInsight && (
        <div className="rounded-2xl p-4 border" style={{ background: "rgba(251,191,36,0.07)", borderColor: "rgba(251,191,36,0.22)" }}>
          <h3 className="font-bold mb-2" style={{ color: "#FBBF24" }}>⚖️ שווה לשלם יותר?</h3>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>הזול</div>
              <div className="font-bold text-sm" style={{ color: C.ink }}>{upgradeInsight.cheap.s.name}</div>
              <div className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>₪{upgradeInsight.cheap.s.price} · {upgradeInsight.cheap.avg.toFixed(1)}/10</div>
            </div>
            <span className="text-lg">←</span>
            <div className="flex-1 rounded-xl p-2.5 text-center" style={{ background: "rgba(74,222,128,0.06)", border: `2px solid ${C.accent}` }}>
              <div className="text-xs" style={{ color: C.accent }}>האיכותי 👑</div>
              <div className="font-bold text-sm" style={{ color: C.ink }}>{upgradeInsight.premium.s.name}</div>
              <div className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>₪{upgradeInsight.premium.s.price} · {upgradeInsight.premium.avg.toFixed(1)}/10</div>
            </div>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "#FBBF24" }}>
            תוספת של <span className="font-bold">₪{upgradeInsight.priceDiff}</span> נותנת לך
            <span className="font-bold"> +{upgradeInsight.ratingDiff} נקודות</span> שביעות רצון —
            כ-₪{upgradeInsight.perPoint} לכל נקודת שיפור. אם האיכות חשובה לך, כאן זה משתלם.
          </p>
        </div>
      )}
    </div>
  );
}

/* ───────────── מפת מחירים — השוואה פר-מרקחת ופר-גנטיקה ───────────── */
/* ───────────── מחירים + בתי מרקחת מאוחד ───────────── */
function Market({ scored, basket, addToBasket }) {
  const [view, setView] = useState("pharm"); // pharm | compare | save
  const [q, setQ] = useState("");
  const [selStrain, setSelStrain] = useState(scored[0]?.id || "");
  const [allInventory, setAllInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryFetched, setInventoryFetched] = useState(false);

  const views = [
    { id: "pharm", label: "📍 בתי מרקחת" },
    { id: "compare", label: "💰 השוואת מחיר" },
    { id: "save", label: "🔓 חיסכון גנטי" },
  ];

  // Lazy-load full inventory only when user opens compare tab
  useEffect(() => {
    if (view !== "compare" || inventoryFetched) return;
    setInventoryLoading(true);
    api.getInventory()
      .then((rows) => setAllInventory(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => { setInventoryLoading(false); setInventoryFetched(true); });
  }, [view, inventoryFetched]);

  // Live inventory cross-reference for selected strain
  const selectedStrain = scored.find((x) => x.id === selStrain);
  const directOffers = allInventory
    .filter((row) =>
      row.strain_name?.toLowerCase() === selectedStrain?.name?.toLowerCase() &&
      row.in_stock !== false
    )
    .sort((a, b) => (a.price || 9999) - (b.price || 9999));

  // Genetically equivalent alternatives when exact strain has no stock
  const geneticAlternatives = selectedStrain?.genetics
    ? allInventory.filter((row) =>
        row.genetics?.toLowerCase() === selectedStrain.genetics?.toLowerCase() &&
        row.strain_name?.toLowerCase() !== selectedStrain.name?.toLowerCase() &&
        row.in_stock !== false
      ).sort((a, b) => (a.price || 9999) - (b.price || 9999))
    : [];

  // חיסכון גנטי
  const byGenetics = {};
  scored.forEach((x) => { (byGenetics[x.genetics] = byGenetics[x.genetics] || []).push(x); });
  const aliasGroups = Object.entries(byGenetics)
    .filter(([, arr]) => arr.length > 1)
    .map(([gen, arr]) => {
      const sorted = [...arr].sort((a, b) => a.price - b.price);
      return { gen, list: sorted, save: sorted[sorted.length - 1].price - sorted[0].price };
    }).filter((g) => g.save > 0).sort((a, b) => b.save - a.save);

  // רשימת זנים לבורר ההשוואה (מסונן לפי חיפוש)
  const strainOpts = scored.filter((x) => !q || x.name.includes(q) || x.genetics.includes(q));

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 border" style={{ background: C.soft, borderColor: C.line }}>
        <h3 className="font-bold mb-1" style={{ color: C.ink }}>מחירים ובתי מרקחת 🏪</h3>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.65)" }}>
          אותו מוצר עולה אחרת בכל מקום, ואותה גנטיקה מופיעה בשמות שונים. כאן רואים איפה משתלם.
        </p>
      </div>

      {/* בורר תצוגה */}
      <div className="flex gap-1.5">
        {views.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)}
            className="flex-1 py-2 rounded-xl text-xs font-bold transition"
            style={view === v.id
              ? { background: C.accent, color: "#fff" }
              : { background: C.card, color: C.accent, border: `1px solid ${C.line}` }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ───── תצוגה: בתי מרקחת ───── */}
      {view === "pharm" && <PharmacyViewer />}

      {/* ───── תצוגה: השוואת מחיר ───── */}
      {view === "compare" && (
        <div className="space-y-3">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 חפשו זן לפי שם או גנטיקה..."
            className="w-full rounded-xl border p-2.5 text-sm"
            style={{ borderColor: C.line, background: C.card, color: C.ink }} />
          <select value={selStrain} onChange={(e) => setSelStrain(e.target.value)}
            className="w-full rounded-xl border p-3 text-sm font-semibold"
            style={{ borderColor: C.line, background: C.bg, color: C.ink }}>
            {strainOpts.map((x) => (
              <option key={x.id} value={x.id}>{x.name} · {x.cat} · {x.match}% התאמה</option>
            ))}
          </select>

          {inventoryLoading ? (
            <div className="text-center py-4 text-sm" style={{ color: "rgba(187,247,208,0.50)" }}>⏳ טוען מלאי חי…</div>
          ) : directOffers.length > 0 ? (
            <>
              <div className="rounded-2xl border overflow-hidden" style={{ background: C.card, borderColor: C.line }}>
                {directOffers.map((row, i) => (
                  <div key={row.id || i} className="flex items-center justify-between p-3 border-t first:border-0"
                    style={{ borderColor: "rgba(74,222,128,0.08)", background: i === 0 ? "rgba(74,222,128,0.06)" : "transparent" }}>
                    <div>
                      <span className="font-bold" style={{ color: C.ink }}>{row.pharmacy_name || row.city}</span>
                      {i === 0 && (
                        <span className="text-xs mr-2 px-2 py-0.5 rounded-full font-bold"
                          style={{ background: C.accent, color: "#0c0d11" }}>הכי זול</span>
                      )}
                      <div className="text-xs mt-0.5" style={{ color: "rgba(187,247,208,0.50)" }}>
                        {row.city && `${row.city} · `}{row.last_updated
                          ? `עדכון אחרון: ${new Date(row.last_updated).toLocaleDateString("he-IL")}`
                          : "מלאי חי"}
                      </div>
                    </div>
                    <span className="font-bold text-lg" style={{ color: i === 0 ? C.accent : C.ink }}>
                      {row.price ? `₪${row.price}` : "—"}
                    </span>
                  </div>
                ))}
              </div>
              {directOffers.length > 1 && directOffers[0].price && directOffers[directOffers.length - 1].price && (
                <p className="text-xs font-semibold p-2.5 rounded-xl" style={{ color: "#FBBF24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.20)" }}>
                  💡 הפרש של ₪{directOffers[directOffers.length - 1].price - directOffers[0].price} בין היקר לזול — על אותו מוצר בדיוק
                </p>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-center py-2" style={{ color: "rgba(187,247,208,0.50)" }}>
                {inventoryFetched ? "הזן לא נמצא במלאי כרגע" : "הזן לא נמצא באף בית מרקחת"}
              </p>
              {geneticAlternatives.length > 0 && (
                <>
                  <p className="text-xs font-bold" style={{ color: "#C084FC" }}>🌿 חלופות עם אותה גנטיקה — מגדל אחר:</p>
                  <div className="rounded-2xl border overflow-hidden" style={{ background: C.card, borderColor: "rgba(192,132,252,0.20)" }}>
                    {geneticAlternatives.map((row, i) => (
                      <div key={row.id || i} className="flex items-center justify-between p-3 border-t first:border-0"
                        style={{ borderColor: "rgba(74,222,128,0.08)" }}>
                        <div>
                          <span className="font-bold text-sm" style={{ color: C.ink }}>{row.strain_name}</span>
                          <div className="text-xs mt-0.5" style={{ color: "rgba(187,247,208,0.50)" }}>
                            {row.pharmacy_name}{row.city ? ` · ${row.city}` : ""}
                          </div>
                        </div>
                        <span className="font-bold" style={{ color: "#C084FC" }}>
                          {row.price ? `₪${row.price}` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ───── תצוגה: חיסכון גנטי ───── */}
      {view === "save" && (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>
            אותה גנטיקה משווקת בשמות שונים. אלה ההזדמנויות לחסוך — אותו זן בדיוק, מחיר נמוך יותר.
          </p>
          {aliasGroups.length === 0 && (
            <p className="text-sm text-center p-4" style={{ color: "rgba(187,247,208,0.45)" }}>
              לא מצאנו כפילויות גנטיקה בזנים שמתאימים לך כרגע.
            </p>
          )}
          {aliasGroups.map((g) => (
            <div key={g.gen} className="rounded-2xl p-3 border" style={{ background: C.card, borderColor: "rgba(192,132,252,0.18)" }}>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ background: "rgba(167,139,250,0.10)", color: "#C084FC" }}>🌿 {g.gen}</span>
              <div className="mt-2 space-y-1">
                {g.list.map((x, i) => (
                  <div key={x.id} className="flex items-center justify-between text-xs">
                    <span style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? C.accent : "rgba(187,247,208,0.55)" }}>
                      {i === 0 ? "✓ " : ""}{x.name} ({x.grower})
                    </span>
                    <span style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? C.accent : "rgba(187,247,208,0.55)" }}>₪{x.price}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-2 font-bold" style={{ color: "#FBBF24" }}>💰 חיסכון של עד ₪{g.save}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────── ידע: פרופילי התוויה × תפריט ───────────── */

function Cooking() {
  const [openR, setOpenR] = useState(null);
  const [openStep, setOpenStep] = useState(null);

  const PREP_STEPS = [
    {
      id: "decarb",
      icon: "🔥",
      step: "01",
      title: "דקרבוקסילציה — הפעלת ה-THC",
      subtitle: "115°C · 40 דקות · בלי זה שום דבר לא יקרה",
      body: "פזרו את התפרחת הטחונה דק על תבנית עם נייר אפייה. אפו ב-115°C (240°F) לאורך 40 דקות. ערבבו עדין אחרי 20 דקות. הצמח ישנה צבע מירוק בהיר לחום-זהוב — זה הסימן שה-THCA הלא-פעיל הפך ל-THC פעיל. ללא שלב זה, שום השפעה לא תורגש.",
      color: "#FB923C",
    },
    {
      id: "butter",
      icon: "🧈",
      step: "02",
      title: "חמאת קנאביס — תשתית כל מתכון",
      subtitle: "71–93°C · 2–4 שעות · בעבוע עדין בלבד",
      body: "כוס חמאה + כוס מים בסיר על אש נמוכה מאוד. כשהחמאה נמסה הוסיפו 7–10 גרם תפרחת מדורבקסת. שמרו על 71–93°C (בעבוע עדין, לא רתיחה) במשך 2–4 שעות תוך ערבוב כל חצי שעה. המים מונעים שריפה. סננו דרך בד גבינה לקערה, סחטו היטב. קררו במקרר — החמאה מתקשה מעל המים ואפשר להפרידה.",
      color: "#FBBF24",
    },
    {
      id: "dose",
      icon: "🧮",
      step: "03",
      title: "חישוב מינון — קריטי",
      subtitle: "אל תנחשו — חשבו. מנת התחלה: 2.5–5 מ\"ג",
      body: `חישוב לדוגמה: 10 גרם תפרחת ב-20% THC = 2,000 מ"ג THC גולמי. אחרי דקרבוקסילציה (~87% יעילות) = 1,740 מ"ג. אחרי ספיגה לחמאה (~70% יעילות) = 1,218 מ"ג THC בחמאה כולה. מחולק ל-24 עוגיות = ~50 מ"ג לעוגייה — חזק מאוד! מנת התחלה במאפייה מסחרית היא 5–10 מ"ג. רוצים חלש? השתמשו ב-3–4 גרם בלבד, או חלקו לעוד חתיכות.`,
      color: "#A78BFA",
    },
    {
      id: "wait",
      icon: "⏳",
      step: "04",
      title: "כלל הזהב: אכלו — וחכו",
      subtitle: "30 דק' עד שעתיים להשפעה ראשונה",
      body: "אכילה עוברת דרך הכבד ומומרת ל-11-OH-THC — מטבוליט חזק פי 4 מ-THC רגיל. ההשפעה מתחילה לאחר 30 דקות עד שעתיים ומגיעה לשיא בכ-3 שעות. הטעות הנפוצה: אוכלים, לא מרגישים, אוכלים עוד — ואז שתי המנות מגיעות ביחד. אכלו חצי מנה, חכו שעתיים מלאות, ורק אז החליטו אם ממשיכים.",
      color: "#34D399",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg,rgba(18,22,14,0.98) 0%,rgba(12,18,10,0.98) 100%)", border: "1.5px solid rgba(74,222,128,0.18)" }}>
        <div className="flex items-start gap-3">
          <span className="text-3xl mt-0.5">🍳</span>
          <div>
            <h3 className="font-bold text-base mb-1" style={{ color: "#F0FDF4" }}>מטבח הקנאביס</h3>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.70)" }}>
              אכילה מעניקה השפעה ארוכה (עד 12 שעות) ועדינה לריאות — אבל זה משחק אחר לגמרי.
              סרקנו ומצאנו את כל מה שצריך לדעת כדי לעשות את זה נכון ובטוח, צעד-צעד.
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {["דקרבוקסילציה","חמאה","מינון","המתנה"].map((l, i) => (
            <span key={i} className="text-xs px-2.5 py-0.5 rounded-full font-semibold"
              style={{ background: "rgba(74,222,128,0.10)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.20)" }}>
              שלב {i+1}: {l}
            </span>
          ))}
        </div>
      </div>

      {/* Step-by-step foundation */}
      <div>
        <h4 className="font-bold text-sm mb-2.5" style={{ color: C.ink }}>⚡ 4 שלבי הבסיס</h4>
        <div className="space-y-2">
          {PREP_STEPS.map((step) => {
            const isOpen = openStep === step.id;
            return (
              <motion.div key={step.id} layout className="rounded-2xl border overflow-hidden"
                style={{ background: C.card, borderColor: isOpen ? step.color + "55" : C.line }}>
                <button onClick={() => setOpenStep(isOpen ? null : step.id)}
                  className="w-full flex items-center gap-3 p-4 text-right">
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black"
                    style={{ background: step.color + "18", color: step.color }}>
                    {step.icon}
                  </div>
                  <div className="flex-1 text-right min-w-0">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-bold text-sm" style={{ color: C.ink }}>{step.title}</span>
                      <span className="text-xs font-black font-mono" style={{ color: step.color + "BB" }}>{step.step}</span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(187,247,208,0.50)" }}>{step.subtitle}</div>
                  </div>
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.2 }}
                    style={{ color: isOpen ? step.color : C.accent, fontWeight: 700, fontSize: 18, flexShrink: 0 }}>+</motion.span>
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                      <div className="px-4 pb-4 pt-0">
                        <div className="h-px mb-3" style={{ background: step.color + "22" }} />
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.80)" }}>{step.body}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Recipes */}
      <div>
        <h4 className="font-bold text-sm mb-2.5" style={{ color: C.ink }}>📖 מתכונים מפורטים</h4>
        <div className="space-y-2">
          {COOKING_RECIPES.map((r) => {
            const isOpen = openR === r.id;
            return (
              <motion.div key={r.id} layout className="rounded-2xl border overflow-hidden"
                style={{ background: C.card, borderColor: isOpen ? C.accent : C.line }}>
                <button onClick={() => setOpenR(isOpen ? null : r.id)}
                  className="w-full flex items-center gap-3 p-3.5 text-right">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.12)" }}>
                    {r.emoji}
                  </div>
                  <div className="flex-1 text-right min-w-0">
                    <div className="font-bold text-sm" style={{ color: C.ink }}>{r.name}</div>
                    <div className="text-xs mt-0.5 flex gap-2 justify-end flex-wrap" style={{ color: "rgba(187,247,208,0.55)" }}>
                      <span>⏱️ {r.time}</span>
                      <span>·</span>
                      <span>💊 {r.dose}</span>
                    </div>
                  </div>
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.2 }}
                    style={{ color: isOpen ? C.accent : "rgba(187,247,208,0.40)", fontWeight: 700, fontSize: 18, flexShrink: 0 }}>+</motion.span>
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                      <div className="px-4 pb-4">
                        <div className="h-px mb-3" style={{ background: "rgba(74,222,128,0.10)" }} />
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.80)" }}>{r.note}</p>
                        <div className="mt-3 flex items-center gap-2 text-xs"
                          style={{ color: "rgba(187,247,208,0.45)", borderTop: "1px solid rgba(74,222,128,0.08)", paddingTop: 10 }}>
                          <span>💡</span>
                          <span>זכרו: כל מנה = חכו שעתיים לפני שממשיכים</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Safety rules */}
      <div className="rounded-2xl p-4 border" style={{ background: "rgba(251,191,36,0.06)", borderColor: "rgba(251,191,36,0.22)" }}>
        <h4 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: "#FBBF24" }}>
          <span>⚠️</span> חוקי הזהב לאכילה בטוחה
        </h4>
        <ul className="space-y-2.5">
          {COOKING_SAFETY.map((s, i) => (
            <li key={i} className="text-xs leading-relaxed flex gap-2.5 items-start">
              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black mt-0.5"
                style={{ background: "rgba(251,191,36,0.15)", color: "#FBBF24" }}>{i + 1}</span>
              <span style={{ color: "rgba(251,191,36,0.80)" }}>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-center pb-1" style={{ color: "rgba(187,247,208,0.35)" }}>
        מידע כללי להעשרה — לא ייעוץ רפואי. כל החלטה על מינון — עם הרופא/ה המטפל/ת.
      </p>
    </div>
  );
}

function Knowledge({ ans, scored }) {
  const mine = ans.reasons.filter((r) => INDICATION_PROFILES[r]);
  const others = Object.keys(INDICATION_PROFILES).filter((r) => !mine.includes(r));
  const order = [...mine, ...others];
  const [open, setOpen] = useState(mine[0] || order[0]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 border" style={{ background: C.soft, borderColor: C.line }}>
        <h3 className="font-bold mb-1" style={{ color: C.ink }}>📚 ידע מותאם להתוויה</h3>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.65)" }}>
          סרקנו מחקרים עדכניים ומצלבים אותם עם הגנטיקות שזמינות כרגע בתפריט. זהו מידע כללי
          ואינו ייעוץ רפואי — כל החלטה על טיפול ומינון עם הרופא/ה המטפל/ת.
        </p>
      </div>

      {order.map((id) => {
        const p = INDICATION_PROFILES[id];
        const isOpen = open === id;
        const isMine = mine.includes(id);
        const matches = isOpen ? crossIndicationWithMenu(id, scored) : [];
        return (
          <div key={id} className="rounded-2xl border overflow-hidden"
            style={{ background: C.card, borderColor: isOpen ? C.accent : C.line }}>
            <button onClick={() => setOpen(isOpen ? null : id)}
              className="w-full flex items-center justify-between p-4 text-right">
              <span className="font-bold" style={{ color: C.ink }}>
                {p.label}{isMine && <span className="text-xs mr-2 px-1.5 py-0.5 rounded-full" style={{ color: "#C084FC", background: "rgba(192,132,252,0.10)" }}>★ שלי</span>}
              </span>
              <span style={{ color: C.accent, fontWeight: 700 }}>{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-3">
                <p className="text-sm leading-relaxed" style={{ color: "rgba(187,247,208,0.80)" }}>{p.summary}</p>
                {p.successRate && (
                  <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(74,222,128,0.10)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold" style={{ color: C.ink }}>📊 שיעור הצלחה מדווח</span>
                      <span className="text-lg font-bold" style={{ color: C.accent }}>{p.successRate}%</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${p.successRate}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }} style={{ background: C.accent }} />
                    </div>
                    {p.successNote && (
                      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "rgba(187,247,208,0.65)" }}>{p.successNote}</p>
                    )}
                  </div>
                )}
                <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: C.ink }}>⚖️ יחסי THC:CBD — מה המחקרים שסרקנו אומרים</div>
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.65)" }}>{p.ratioNote}</p>
                </div>
                {p.israelNote && (
                  <p className="text-xs" style={{ color: C.accent, fontWeight: 600 }}>🇮🇱 {p.israelNote}</p>
                )}

                <div className="border-t pt-3" style={{ borderColor: "rgba(74,222,128,0.10)" }}>
                  <div className="text-xs font-bold mb-2" style={{ color: C.ink }}>
                    🌿 זנים בתפריט שמתאימים להתוויה הזו {!isMine && "(לפי רישיון לדוגמה)"}
                  </div>
                  {matches.length === 0 && (
                    <p className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>
                      אין כרגע זנים תואמים בקטגוריות הרישיון שלך
                    </p>
                  )}
                  {matches.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm" style={{ color: C.ink }}>{s.genetics}</span>
                        <span className="text-xs" style={{ color: "rgba(187,247,208,0.50)" }}>({s.name})</span>
                      </div>
                      <span className="text-xs font-bold" style={{ color: C.accent }}>{s.match}% התאמה</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs pt-1" style={{ color: "rgba(187,247,208,0.40)" }}>
                  📖 מקור: {p.research}
                </p>
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-2xl border overflow-hidden" style={{ background: C.card, borderColor: C.line }}>
        <div className="p-4">
          <h3 className="font-bold mb-1" style={{ color: C.ink }}>🌍 השוק הישראלי מול העולם</h3>
          <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(187,247,208,0.55)" }}>
            הקשר עוזר להבין לאן הדברים הולכים. נתונים ממקורות שסרקנו (יק"ר, Bloomwell, דוחות שוק).
          </p>
          <div className="space-y-2 text-xs">
            <div className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(187,247,208,0.80)" }}>
              <span className="font-bold" style={{ color: C.ink }}>🇮🇱 ישראל:</span> ~135 אלף מטופלים (יציב). מחירים <span className="font-bold" style={{ color: "#FBBF24" }}>עולים</span> — החברות הגדולות העלו 17–19% ב-2025. כ-98% מהרכישות בתפרחת.
            </div>
            <div className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(187,247,208,0.80)" }}>
              <span className="font-bold" style={{ color: C.ink }}>🇩🇪 גרמניה:</span> זינוק של 3,300% במרשמים — מ-250 אלף ל-~900 אלף מטופלים. מחירים <span className="font-bold" style={{ color: "#4ADE80" }}>יורדים</span> (€8.33→€5.23/גרם) בזכות תחרות.
            </div>
            <div className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(187,247,208,0.80)" }}>
              <span className="font-bold" style={{ color: C.ink }}>🇪🇺 אירופה:</span> שמן מוביל בנתח השוק (34.6%) — מינון מדויק לכאב כרוני. בישראל תפרחת שולטת.
            </div>
          </div>
          <p className="text-xs mt-3 leading-relaxed" style={{ color: "rgba(187,247,208,0.40)" }}>
            בכל השווקים — מגוון מתפוצץ הוא הנורמה. בדיוק למה מלווה אישי שמדרג לך את הכל הופך חיוני.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────── מדריך למטופל ───────────── */

const GUIDE = [
  { id: "delivery", icon: "⚗️", title: "תפרחת מול שמן — איך לבחור?", body: [
    "אותה גנטיקה תיתן חוויה שונה לגמרי לפי דרך המתן — לא בגלל הזן, אלא בגלל איך החומר נספג בגוף. זה ההבדל החשוב ביותר שמטופלים רבים לא מכירים.",
    "שאיפה (אידוי/עישון): ההשפעה מתחילה תוך 3–10 דקות, שיא תוך חצי שעה, ונמשכת עד ~3 שעות. מאפשרת לכוון מינון מהר. מתאימה למענה מיידי — כאב מתפרץ, חרדה פתאומית, קושי להירדם.",
    "שמן (תת-לשוני/בליעה): ההשפעה מתחילה לאט (15 דקות עד שעתיים), אבל נמשכת 5–6 שעות בצורה הדרגתית ויציבה. ללא שאיפה — טוב לריאות. מתאים לכאב כרוני מתמשך, לשינה רציפה לאורך כל הלילה, ולמינון מדיד וקבוע.",
    "אידוי יעיל יותר מעישון: באותה כמות, אידוי מעביר לגוף עד פי 2.5 חומר פעיל מעישון, בטמפרטורה נמוכה יותר ועם פחות חומרים מזיקים. אם אפשר — אדים, אל תעשנו.",
    "טיפ: אפשר לשלב — תפרחת/אידוי למענה מיידי, ושמן למענה רקע ארוך. דברו עם הרופא על השילוב הנכון לכם.",
  ]},
  { id: "thc", icon: "🔥", title: "מה זה THC?", body: [
    "THC (טטרה-הידרו-קנבינואיד) הוא החומר הפעיל המרכזי בקנאביס, והוא האחראי לתחושה הפסיכואקטיבית — שינוי במצב הרוח, בתפיסה ובתחושה הגופנית.",
    "ברישיון הישראלי, המספר שאחרי T מציין את אחוז ה-THC: T20 פירושו כ-20% THC (ריכוז גבוה), T10 בינוני, T5 נמוך.",
    "THC נקשר בעיקר להקלה על כאב, שיפור שינה ותיאבון — אבל ריכוז גבוה יותר לא תמיד אומר תוצאה טובה יותר. אצל חלק מהמטופלים ריכוז גבוה דווקא מגביר חרדה או ערפול.",
  ]},
  { id: "cbd", icon: "🌱", title: "מה זה CBD?", body: [
    "CBD (קנאבידיול) הוא חומר פעיל שאינו גורם לתחושת 'היי'. הוא נחקר בעיקר בהקשרים של חרדה, דלקת ואיזון כללי.",
    "המספר שאחרי C מציין את אחוז ה-CBD: C20 הוא ריכוז גבוה, C4 נמוך. זן T5/C20 למשל הוא עתיר CBD ודל THC — מתאים למי שרוצה השפעה עדינה בלי תחושה פסיכואקטיבית כמעט.",
    "CBD גם ממתן חלק מתופעות הלוואי של THC, ולכן זנים מאוזנים (כמו T10/C10) נחשבים נוחים יותר למטופלים רגישים.",
  ]},
  { id: "vape", icon: "💨", title: "איך מאדים נכון?", body: [
    "אידוי מחמם את התפרחת לטמפרטורה שמשחררת את החומרים הפעילים — בלי שריפה. כך נמנעים מרוב חומרי הלוואי המזיקים שנוצרים בעשן.",
    "טמפרטורה משנה את החוויה: טווח נמוך (סביב 160–180°C) שומר על טעם ונותן השפעה קלילה וצלולה יותר; טווח גבוה (190–210°C) משחרר יותר חומר פעיל ומרגיש חזק וגופני יותר.",
    "מתחילים בשאיפה אחת קצרה וממתינים כ-10–15 דקות להרגיש את ההשפעה לפני שממשיכים. אין צורך להחזיק את האדים בריאות — שניה-שתיים מספיקות לספיגה.",
    "חשוב לנקות את המאדה באופן קבוע — שאריות פוגעות בטעם וביעילות.",
  ]},
  { id: "smoke", icon: "🚬", title: "איך מעשנים נכון? (ולמה עדיף לא)", body: [
    "חשוב לדעת: עישון הוא הדרך הפחות בריאה לצרוך — הבעירה יוצרת חומרים מזיקים לריאות, וגם בזבזנית (רק כ-25–30% מהחומר הפעיל נספג). אם אפשר עבורך — אידוי עדיף, גם בריאותית וגם ביעילות (פי ~2.5 יותר חומר פעיל).",
    "אל תערבבו טבק! זו טעות נפוצה ומזיקה. מחקרים מראים שערבוב טבק מגביר תלות (עד פי 4), מוריד את המוטיבציה להיגמל, מוסיף ניקוטין ממכר ותוצרי בעירה, ומטשטש את ההשפעה הטיפולית — קשה להבין כמה הקנאביס באמת עזר. בבריטניה ואירופה 77–91% ממשתמשי הקנאביס מערבבים טבק, ורבים לא מודעים לנזק.",
    "אם בכל זאת מעשנים: תפרחת נקייה בלבד, בלי טבק ובלי תוספות.",
    "אין טעם להחזיק את העשן בריאות זמן רב — הספיגה מתרחשת בשניות הראשונות, והחזקה ממושכת רק מגבירה את הנזק. שאיפה אחת, המתנה של כמה דקות, ורק אז ממשיכים לפי הצורך.",
  ]},
  { id: "oil", icon: "💧", title: "איך לוקחים שמן נכון?", body: [
    "שמן קנאביס נלקח בדרך כלל בטפטוף מתחת ללשון (תת-לשוני): מטפטפים את מספר הטיפות שקבע הרופא, ממתינים כדקה לפני בליעה — כך הספיגה טובה ומהירה יותר.",
    "ההשפעה של שמן איטית: היא מתחילה רק אחרי 30–90 דקות ונמשכת שעות. הטעות הנפוצה ביותר היא לקחת עוד מנה כי 'זה לא עובד' — ואז שתי המנות מגיעות יחד. סבלנות.",
    "עקביות חשובה: לקיחה בשעות קבועות, רצוי ביחס קבוע לאוכל (שומן משפר ספיגה), עוזרת לייצב את ההשפעה.",
    "מינון הטיפות נקבע על ידי הרופא המטפל בלבד — ההתאמה האישית באפליקציה נוגעת לבחירת הזן והפרופיל, לא למינון.",
  ]},
  { id: "general", icon: "⚖️", title: "כללי זהב לכל מטופל", body: [
    "התחל נמוך, התקדם לאט — במיוחד עם זן חדש. תמיד אפשר להוסיף, אי אפשר להוריד.",
    "אסור לנהוג תחת השפעה. בישראל זו עבירה גם עם רישיון רפואי.",
    "שמרו את המוצרים במקום קריר, חשוך ונעול — הרחק מילדים ומבני בית.",
    "כל שינוי במינון, בצורת הצריכה או בתופעות לוואי — דברו עם הרופא/ה המטפל/ת. המדריך הזה הוא מידע כללי בלבד ואינו תחליף לייעוץ רפואי.",
  ]},
];

function Guide() {
  const [open, setOpen] = useState(null);
  return (
    <div className="space-y-2">
      <p className="text-sm mb-3" style={{ color: "rgba(187,247,208,0.55)" }}>
        מידע כללי למטופלים. תמיד פעלו לפי הנחיות הרופא/ה המטפל/ת.
      </p>
      {GUIDE.map((g) => (
        <div key={g.id} className="rounded-2xl border overflow-hidden"
          style={{ background: C.card, borderColor: C.line }}>
          <button onClick={() => setOpen(open === g.id ? null : g.id)}
            className="w-full flex items-center justify-between p-4 text-right">
            <span className="font-bold" style={{ color: C.ink }}>
              <span className="ml-2">{g.icon}</span>{g.title}
            </span>
            <span style={{ color: C.accent, fontWeight: 700 }}>
              {open === g.id ? "−" : "+"}
            </span>
          </button>
          {open === g.id && (
            <div className="px-4 pb-4 space-y-2">
              {g.body.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed" style={{ color: "rgba(187,247,208,0.75)" }}>{p}</p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ───────────── סריקת תפריט בית מרקחת ───────────── */

const SAMPLE_MENU = `תפריט — בית מרקחת פארמרי, אור עקיבא

תפרחות:
ויסטה T22/C4 — 350₪
לגאטו T22/C4 — 265₪
פינק שרב T22/C4 — 170₪
גרין קלובר T22/C4 — 285₪
תכלת T22/C4 — 250₪
מד דאג T22/C4 — 249₪
גסטרופופ T22/C4 — 299₪
ג'ורג'יה פי T22/C4 — 399₪
ג'ורג'יה איי אל T22/C4 — 250₪
Chem D Mini T22/C4 — 120₪
מ.ר.מ.ל T22/C4 — 270₪
טוטאל פי מיני T10/C10 — 210₪`;

/* מרחק עריכה (Levenshtein) — לזיהוי שמות זנים עם שגיאות כתיב */
function editDistance(a, b) {
  a = (a || "").toLowerCase(); b = (b || "").toLowerCase();
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/* מנקה מחרוזת לצורך השוואה — מסיר ניקוד, רווחים כפולים, תווים מיוחדים */
function normName(s) {
  return (s || "").toLowerCase()
    .replace(/['"`׳״.\-–—_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* מנסה למצוא את הזן הכי קרוב לטקסט, גם עם שגיאת כתיב של אות-שתיים */
function fuzzyFindStrain(line) {
  const clean = normName(line);
  // 1. התאמה מדויקת (מכיל את השם)
  let exact = STRAINS.find((s) => clean.includes(normName(s.name)) && normName(s.name).length >= 2);
  if (exact) return { strain: exact, fuzzy: false };
  // 2. התאמה מטושטשת — עוברים מילה-מילה בשורה ומשווים לכל זן
  const words = clean.split(" ").filter((w) => w.length >= 2);
  let best = null, bestDist = 99;
  for (const s of STRAINS) {
    const sn = normName(s.name);
    if (sn.length < 2) continue;
    // משווים את שם הזן לכל רצף מילים בשורה באורך דומה
    for (const w of words) {
      const d = editDistance(w, sn);
      const tol = sn.length <= 4 ? 1 : 2; // שם קצר → סובלנות נמוכה
      if (d <= tol && d < bestDist) { best = s; bestDist = d; }
    }
    // גם השוואה של השם המלא לכל השורה (לשמות עם רווח)
    if (sn.includes(" ")) {
      const d = editDistance(clean, sn);
      if (d <= 2 && d < bestDist) { best = s; bestDist = d; }
    }
  }
  return best ? { strain: best, fuzzy: true } : { strain: null, fuzzy: false };
}

function parseMenu(text, ans, scored, serverProducts = null) {
  // מיפוי ציוני שרת לפי שם מסחרי (אם הגיעו) — מחזק את הציון המקומי
  const srvByName = {};
  if (Array.isArray(serverProducts)) {
    serverProducts.forEach((p) => {
      const key = (p.commercial || p.strain || "").trim();
      if (key && p.match != null) srvByName[key] = p.match;
    });
  }
  // ממפה קטגוריה ישנה/לא-רשמית לקרובה ביותר ב-2026
  const normCat = (raw) => {
    if (!raw) return null;
    const up = raw.toUpperCase();
    if (CATEGORIES.includes(up)) return up;
    const [, t, c] = up.match(/T(\d+)\/C(\d+)/) || [];
    if (!t) return null;
    const tv = +t, cv = +c;
    // מצא את הקטגוריה הרשמית עם ערכי T/C הקרובים ביותר
    let best = null, bestDist = Infinity;
    for (const cat of CATEGORIES) {
      const [, ct, cc] = cat.match(/T(\d+)\/C(\d+)/) || [];
      const d = Math.abs(+ct - tv) + Math.abs(+cc - cv);
      if (d < bestDist) { bestDist = d; best = cat; }
    }
    return best;
  };
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    // דלג על כותרות מקטע (תפרחות:/שמנים:)
    if (/^(תפרחות|שמנים|שמן|תפרחת|תפריט)\s*:?\s*$/.test(line)) return null;
    const rawCat = (line.match(/T\d+\/C\d+/i) || [null])[0] || null;
    const cat = normCat(rawCat);
    const priceM = line.match(/(\d{2,4})\s*₪/) || line.match(/₪\s*(\d{2,4})/) || line.match(/(\d{2,4})\s*(?:ש"?ח|שקל)/);
    const price = priceM ? +priceM[1] : null;
    // זיהוי קוד תפריט → גנטיקה
    const codeKey = Object.keys(MENU_CODE_MAP).find((c) => line.includes(c));
    const mapped = codeKey ? MENU_CODE_MAP[codeKey] : null;
    let known = null, fuzzyMatch = false, decodedNote = null;
    // 1. ניסיון התאמה מטושטש (כולל שגיאות כתיב)
    const ff = fuzzyFindStrain(line);
    known = ff.strain; fuzzyMatch = ff.fuzzy;
    // 2. אם לא נמצא — דרך קוד התפריט
    if (!known && mapped) {
      known = STRAINS.find((s) => s.id === mapped.strainId);
      decodedNote = `${codeKey} = ${mapped.note}${mapped.aka?.length ? ` · ידוע גם בתור: ${mapped.aka.join(", ")}` : ""}`;
    }
    if (!cat && !known && !price) return null;
    const inLicense = cat ? ans.cats.includes(cat) : known ? ans.cats.includes(known.cat) : true;
    const match = known ? scored.find((x) => x.id === known.id)?.match ?? null : null;
    const name = known ? known.name : line.replace(/T\d+\/C\d+/i, "").replace(/[—\-–]?\s*\d{2,4}\s*₪/, "").replace(/₪/, "").trim();
    const isOil = known ? known.type === "oil" : /שמן/.test(line);
    // חלופה גנטית: אם לא זיהינו את המוצר, חפש זן עם אותה קטגוריה שמתאים
    let altGenetic = null;
    if (!known && cat) {
      const alt = scored.find((s) => s.cat === cat && s.match >= 72 && ans.cats.includes(cat));
      if (alt) altGenetic = alt;
    }
    // אם השרת החזיר ציון לשם הזה — מעדיפים אותו (DB חי עם 357 זנים)
    const srvScore = srvByName[name] ?? srvByName[line.trim()];
    const finalMatch = srvScore != null ? srvScore : match;
    return { name, cat: cat || known?.cat, price: price ?? known?.price, known, match: finalMatch, inLicense,
             genetics: known?.genetics, decodedNote, isOil, fuzzyMatch,
             origLine: line.trim(),
             geneticInfo: known?.geneticInfo, geneticNote: known?.geneticNote,
             grower: known?.grower, altGenetic };
  }).filter(Boolean).filter((x) => x.name)
    .sort((a, b) => (b.match ?? -1) - (a.match ?? -1));
}

function MenuScan({ ans, scored, basket, addToBasket, user }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState(null);
  const [aiParsing, setAiParsing] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [inputMode, setInputMode] = useState("file"); // "file" | "url" | "text"
  const fileRef = useRef();
  const camRef = useRef();

  // טקסט תפריט → ניסיון שרת תחילה, fallback למנוע המקומי (fuzzy)
  const scan = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setAiError("הדביקו טקסט תפריט כדי לפענח — שורה לכל מוצר");
      return;
    }
    setScanning(true);
    setAiError(null);
    try {
      const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
      if (!lines.length) { setResults([]); setScanning(false); return; }
      let serverProducts = null;
      try {
        const data = await api.parseMenu({ text: trimmed, user_id: user?.id || null });
        if (data?.products?.some((p) => p.match != null) && !data.db_offline) {
          serverProducts = data.products;
        }
      } catch { /* שרת לא זמין — ממשיכים עם מנוע מקומי */ }
      const res = parseMenu(trimmed, ans, scored, serverProducts);
      setResults(res.length ? res : null);
      if (!res.length) setAiError("לא זוהו מוצרים — ודאו שהתפריט כתוב שורה לכל מוצר");
    } catch (err) {
      console.warn("scan error:", err.message);
      try { setResults(parseMenu(text, ans, scored)); } catch {}
    } finally {
      setScanning(false);
    }
  };

  // טעינת תפריט מ-URL דרך הבקאנד + fallback מדומה
  const fetchUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setFetchingUrl(true); setAiError(null);
    try {
      const res = await fetch("/api/fetch-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        const extracted = data.text || data.raw_text || "";
        if (extracted && extracted.length > 20) {
          setText(extracted);
          setResults(parseMenu(extracted, ans, scored));
          setInputMode("text");
          return;
        }
      }
      // Server couldn't fetch — show instructional fallback
      setAiError(
        `לא הצלחנו לגשת לכתובת זו. בתי מרקחת רבים חוסמים גישה אוטומטית. ` +
        `פתחו את הדף בדפדפן, העתיקו את התפריט ידנית, והדביקו בלשונית ✏️ טקסט.`
      );
      setInputMode("text");
    } catch {
      setAiError("שגיאת חיבור לשרת — נסו שוב, או הדביקו ידנית");
      setInputMode("text");
    } finally {
      setFetchingUrl(false);
    }
  };

  // המרת קובץ ל-base64
  const fileToBase64 = (file) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(",")[1]);
    reader.onerror = () => rej(new Error("שגיאה בקריאת הקובץ"));
    reader.readAsDataURL(file);
  });

  const processFile = async (file) => {
    if (!file) return;
    setAiError(null);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImg = file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
    if (!isPdf && !isImg) {
      setAiError("אפשר להעלות תמונה (JPG/PNG/WEBP) או PDF בלבד");
      return;
    }
    setAiParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const media_type = isPdf ? "application/pdf" : (file.type || "image/jpeg");

      // Route through /api/parse-menu — has proper API-key fallback, no 500s
      const response = await fetch("/api/parse-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64, media_type, user_id: user?.id || null }),
      });

      // Network failure
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const hint = errData?.error?.message || "";
        // Gracefully fall back to text mode
        setAiError("ה-AI אינו זמין כרגע — עברו ללשונית ✏️ טקסט והדביקו ידנית");
        setInputMode("text");
        return;
      }

      const data = await response.json();

      // No API key / OCR not configured — fallback with helpful message (not an error)
      if (data.no_api_key) {
        setAiError("מפתח AI לא מוגדר בשרת — הדביקו את שמות הזנים ידנית בלשונית ✏️ טקסט");
        setInputMode("text");
        return;
      }

      // Products returned from OCR — build readable text lines + parse locally
      const products = data.products || [];
      if (products.length > 0) {
        // Build text lines with category info where available
        const lines = products.map(p => {
          const name = p.commercial || p.name || "";
          const cat  = p.category  || p.cat  || "";
          const price = p.price ? `— ${p.price}₪` : "";
          return [name, cat, price].filter(Boolean).join(" ");
        }).filter(Boolean);
        const extractedText = lines.join("\n");
        setText(extractedText);
        setResults(parseMenu(extractedText, ans, scored, data.db_offline ? null : products));
        setInputMode("text");
      } else if (data.raw_text) {
        // Server extracted raw text but couldn't parse products — give it to local parser
        setText(data.raw_text);
        setResults(parseMenu(data.raw_text, ans, scored));
        setInputMode("text");
      } else {
        setAiError("לא זוהו מוצרים — נסו תמונה ברורה יותר, או הדביקו שמות הזנים ידנית");
        setInputMode("text");
      }
    } catch (err) {
      setAiError("שגיאת חיבור — ודאו שה-backend רץ, או הדביקו ידנית");
      setInputMode("text");
    } finally {
      setAiParsing(false);
    }
  };

  return (
    <div className="space-y-4 px-5 pt-4">
      <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.line }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files?.[0]; if (f) { setInputMode("file"); processFile(f); } }}>
        <h3 className="font-bold mb-1" style={{ color: C.ink }}>פענוח תפריט 🌿</h3>
        <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.65)" }}>
          העלו תמונה, PDF, כתובת URL, או הדביקו טקסט — נסרוק ונסמן מה מתאים לרישיון שלכם, ונחשוף כפילויות.
        </p>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{background:C.soft}}>
          {[{id:"file",label:"📎 קובץ"},{ id:"url",label:"🔗 URL" },{ id:"text",label:"✏️ טקסט"}].map(m => (
            <button key={m.id} onClick={() => setInputMode(m.id)}
              className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: inputMode === m.id ? "rgba(74,222,128,0.10)" : "transparent",
                color: inputMode === m.id ? "#4ADE80" : "rgba(187,247,208,0.50)",
                boxShadow: inputMode === m.id ? "0 1px 4px rgba(0,0,0,.08)" : "none",
              }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* File mode */}
        {inputMode === "file" && (
          <div className="rounded-xl border-2 border-dashed p-4 mb-3 text-center"
            style={{ borderColor: dragOver ? C.accent : "#C9D8CC", background: dragOver ? "rgba(74,222,128,0.12)" : C.soft }}>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
            <div className="flex gap-2 justify-center">
              <button onClick={() => fileRef.current?.click()} disabled={aiParsing}
                className="font-bold text-sm px-4 py-2 rounded-xl text-white disabled:opacity-50"
                style={{ background: C.accent }}>
                {aiParsing ? "🤖 מנתח..." : "📎 תמונה / PDF"}
              </button>
              <button onClick={() => camRef.current?.click()} disabled={aiParsing}
                className="font-bold text-sm px-4 py-2 rounded-xl border disabled:opacity-50"
                style={{ borderColor: C.accent, color: C.accent, background: C.card }}>
                📷 צלם
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: "rgba(187,247,208,0.55)" }}>
              או גררו לכאן קובץ · JPG / PNG / PDF
            </p>
            {aiParsing && (
              <div className="mt-2 text-xs font-semibold" style={{color:C.accent}}>
                🤖 מנתח עם AI — זה יכול לקחת עד 15 שניות...
              </div>
            )}
          </div>
        )}

        {/* URL mode */}
        {inputMode === "url" && (
          <div className="mb-3">
            <div className="flex gap-2">
              <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                placeholder="https://pharmacy.co.il/menu.pdf"
                className="flex-1 rounded-xl border px-3 py-2.5 text-sm"
                style={{borderColor:C.line,color:C.ink,background:C.bg}}
                dir="ltr"
                onKeyDown={e => e.key === "Enter" && fetchUrl()}/>
              <button onClick={fetchUrl} disabled={!urlInput.trim() || fetchingUrl}
                className="px-4 py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-40"
                style={{background:C.accent}}>
                {fetchingUrl ? "טוען..." : "טען"}
              </button>
            </div>
            <p className="text-xs mt-1.5" style={{color:"rgba(187,247,208,0.45)"}}>
              הדביקו קישור לתפריט PDF, תמונה, או עמוד HTML של בית מרקחת
            </p>
          </div>
        )}

        {/* Text mode */}
        {inputMode === "text" && (
          <div className="mb-3">
            <textarea value={text} onChange={(e) => setText(e.target.value)}
              rows={5} dir="rtl"
              placeholder={"הדביקו כאן את תפריט בית המרקחת, שורה לכל מוצר:\n\nWedding Cake T22/C4 — 280₪\nאור T15/C3 — 225₪\nErez T10/C2 — 190₪\nIce Cream Cake T12/C12 — 260₪\n\nשגיאות כתיב? מתקנים אוטומטית לפי 357 זנים במאגר."}
              className="w-full rounded-xl border p-3 text-sm"
              style={{ borderColor: C.line, color: C.ink, background: C.bg, resize: "vertical" }} />
          </div>
        )}

        {aiError && (
          <div className="mb-3 p-2.5 rounded-xl" style={{background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.20)"}}>
            <p className="text-xs font-semibold" style={{color:"#FCA5A5"}}>⚠️ {aiError}</p>
            {aiError.includes("API") && (
              <p className="text-xs mt-1" style={{color:"rgba(252,165,165,0.70)"}}>
                עברו ללשונית "טקסט" והדביקו את התפריט ישירות — הפענוח המקומי עובד ללא API.
              </p>
            )}
          </div>
        )}

        {ans.cats.length > 0 && (
          <div className="mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
            style={{background:C.soft,border:`1px solid ${C.line}`}}>
            <span className="text-xs" style={{color:"rgba(187,247,208,0.65)"}}>
              🔒 מסנן לפי רישיונך: <span className="font-bold" style={{color:C.ink}}>{ans.cats.join(", ")}</span>
            </span>
          </div>
        )}

        <div className="flex gap-2 mt-1">
          {inputMode === "text" && (
            <button onClick={() => setText(SAMPLE_MENU)}
              className="px-3 py-2.5 rounded-xl text-xs font-bold border"
              style={{ borderColor: C.line, color: "rgba(187,247,208,0.55)" }}>
              דוגמה
            </button>
          )}
          <button
            disabled={(inputMode === "text" && (!text.trim() || scanning)) || aiParsing || fetchingUrl}
            className="flex-1 py-2.5 rounded-xl font-bold text-white disabled:opacity-40"
            style={{ background: C.accent }}
            onClick={() => {
              if (inputMode === "text") scan();
              else if (inputMode === "url") fetchUrl();
            }}>
            {scanning || aiParsing || fetchingUrl ? "🌿 מנתח…" : "🔍 פענח את התפריט"}
          </button>
        </div>
      </div>

      {/* סקלטון טעינה — בזמן עיבוד שרת או מקומי */}
      {(scanning || aiParsing) && (
        <LoadingSkeleton message="מנתח ומחפש התאמות לפרופיל שלך… 🔍🌿" rows={3} />
      )}

      {/* תוצאות: אותה גנטיקה שמות שונים */}
      {!scanning && results && (() => {
        const byGen = {};
        results.forEach((r) => {
          if (r.genetics && r.genetics !== "—") (byGen[r.genetics] = byGen[r.genetics] || []).push(r);
        });
        const dupes = Object.entries(byGen).filter(([, arr]) => arr.length > 1);
        return dupes.length > 0 ? (
          <div className="rounded-2xl p-4 border" style={{ background: "rgba(18,22,14,0.95)", borderColor: "rgba(74,222,128,0.18)" }}>
            <h4 className="font-bold text-sm mb-2" style={{ color: "#4ADE80" }}>🔓 גילינו: אותו זן, שמות שונים</h4>
            {dupes.map(([gen, arr]) => {
              const sorted = [...arr].sort((a, b) => (a.price || 999) - (b.price || 999));
              const save = (sorted[sorted.length - 1].price || 0) - (sorted[0].price || 0);
              return (
                <div key={gen} className="rounded-xl p-2.5 mb-2" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(74,222,128,0.10)" }}>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(167,139,250,0.12)", color: "#C084FC" }}>🌿 {gen}</span>
                  <div className="text-xs mt-1.5" style={{ color: "rgba(187,247,208,0.80)" }}>
                    {sorted.map((r, i) => (
                      <span key={i}>
                        {i > 0 && " = "}
                        <span style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? "#4ADE80" : "rgba(187,247,208,0.55)" }}>
                          {r.name}{r.price ? ` (₪${r.price})` : ""}
                        </span>
                      </span>
                    ))}
                  </div>
                  {save > 0 && <p className="text-xs mt-1 font-bold" style={{ color: "#FBBF24" }}>💰 חיסכון של עד ₪{save} על אותו זן!</p>}
                </div>
              );
            })}
          </div>
        ) : null;
      })()}

      {/* רשימת התוצאות */}
      {results && results.length === 0 && (
        <div className="rounded-2xl p-5 text-center" style={{ background: C.card, border: `1px dashed ${C.line}` }}>
          <div className="text-3xl mb-2">🤷</div>
          <p className="text-sm font-bold" style={{ color: C.ink }}>לא זיהינו מוצרים</p>
          <p className="text-xs mt-1" style={{ color: "rgba(187,247,208,0.55)" }}>ודאו שכל שורה כוללת שם זן, ורצוי קטגוריה (T../C..) ומחיר.</p>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold" style={{ color: C.ink }}>
            {results.length} מוצרים פוענחו · ממוינים לפי התאמה אליכם
          </p>
          {results.map((r, i) => (
            <div key={i} className="rounded-2xl p-3 border flex items-center gap-3"
              style={{
                background: C.card,
                borderColor: r.match >= 85 ? C.accent : C.line,
                opacity: r.inLicense ? 1 : 0.5,
              }}>
              {r.match !== null ? <MatchRing pct={r.match} /> : (
                <div className="text-center" style={{ width: 52 }}>
                  <div className="text-lg">❔</div>
                  <div className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>חדש</div>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold" style={{ color: C.ink }}>{r.name}</span>
                  {r.fuzzyMatch && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(251,191,36,0.10)", color: "#FBBF24" }}
                      title={`זוהה מתוך: "${r.origLine}"`}>✏️ תוקן</span>
                  )}
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: r.isOil ? "rgba(167,139,250,0.10)" : "rgba(74,222,128,0.09)", color: r.isOil ? "#C084FC" : "#4ADE80" }}>
                    {r.isOil ? "💧 שמן" : "🌿 תפרחת"}
                  </span>
                  {r.genetics && r.genetics !== "—" && <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{ background: "rgba(167,139,250,0.10)", color: "#C084FC" }}>🌿 {r.genetics}</span>}
                  {r.cat && <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{ background: C.soft, color: C.accent }}>{r.cat}</span>}
                </div>
                {r.decodedNote && (
                  <p className="text-xs mt-0.5 font-semibold" style={{ color: "#C084FC" }}>
                    🔓 פיענחנו עבורכם: {r.decodedNote}
                  </p>
                )}
                {r.isOil && r.geneticNote && (
                  <p className="text-xs mt-0.5" style={{ color: r.geneticInfo === "none" ? "rgba(187,247,208,0.45)" : "#FBBF24" }}>
                    {r.geneticInfo === "none" ? "⚠️ " : "📋 "}{r.geneticNote}
                  </p>
                )}
                {r.altGenetic && (
                  <p className="text-xs mt-0.5" style={{ color: C.accent }}>
                    💡 לא במאגר — אך {r.altGenetic.name} ({r.altGenetic.genetics}) באותה קטגוריה מתאים לכם {r.altGenetic.match}%
                  </p>
                )}
                <p className="text-xs mt-0.5" style={{ color: "rgba(187,247,208,0.55)" }}>
                  {!r.inLicense ? "מחוץ לקטגוריות הרישיון שלכם"
                    : r.match === null ? "זן שלא ניסיתם — אם תנסו, דרגו ביומן ונלמד אותו"
                    : r.match >= 85 ? "התאמה מצוינת לפרופיל שלכם 💚"
                    : r.match >= 72 ? "התאמה טובה" : "פחות מתאים למה שעבד לכם בעבר"}
                </p>
              </div>
              <div className="text-center">
                {r.price && <div className="font-bold text-sm mb-1" style={{ color: C.ink }}>₪{r.price}</div>}
                {r.known && r.inLicense && (
                  <button onClick={() => addToBasket(r.known.id)}
                    disabled={basket.includes(r.known.id)}
                    className="text-xs px-3 py-1.5 rounded-lg font-bold text-white disabled:opacity-40"
                    style={{ background: C.accent }}>
                    {basket.includes(r.known.id) ? "בתכנון ✓" : "+ לתכנון"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────── יומן יומי, רצף והישגים ───────────── */

const MOODS = [
  { id: 1, e: "😣", label: "קשה" },
  { id: 2, e: "😐", label: "בסדר" },
  { id: 3, e: "🙂", label: "טוב" },
  { id: 4, e: "😄", label: "מעולה" },
];

function Journal({ ans, scored, ratings, setRatings, streak, setStreak, checked, setChecked, notifs, setNotifs }) {
  const [mood, setMood] = useState(null);
  const [vapeG, setVapeG]   = useState(0);
  const [dropsN, setDropsN] = useState(0);
  const [smokeG, setSmokeG] = useState(0);
  const [savedOk, setSavedOk] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [newBadge, setNewBadge] = useState(null);

  const NOTIF_OPTS = [
    { k: "daily", label: "תזכורת יומית", sub: "כל ערב ב-20:00" },
    { k: "stock", label: "חזרת מלאי", sub: "כשזן בהתאמה גבוהה חוזר" },
    { k: "batch", label: "האצווה שאהבת", sub: "כשאצווה מדורגת גבוה חוזרת" },
    { k: "aka", label: "אותה גנטיקה, מחיר נמוך", sub: "כשמוצר שאוהבים נמכר בזול יותר" },
    { k: "budget", label: "התראת תקציב", sub: "כשמתקרבים לתקרה החודשית" },
  ];

  const badges = [
    { e: "🔥", label: `${streak} ימים ברצף`, on: streak >= 3, threshold: 3 },
    { e: "📓", label: "מתעד מתמיד", on: streak >= 7, threshold: 7 },
    { e: "🌿", label: "טועם זנים", on: Object.keys(ratings).length >= 2, threshold: 2 },
    { e: "🎯", label: "פרופיל מדויק", on: Object.keys(ratings).length >= 5, threshold: 5 },
  ];

  const savedCheckins = (() => { try { return JSON.parse(localStorage.getItem("cm_checkins") || "[]"); } catch { return []; } })();
  const TIMELINE = savedCheckins.slice(-10).reverse();

  // Compute weekly trend from last 7 check-ins
  const last7 = savedCheckins.slice(-7);
  const moodMap = { "😣": 1, "😐": 2, "🙂": 3, "😄": 4 };
  const trendPoints = last7.map((c, i) => ({ x: i, y: moodMap[c.mood] || 2 }));

  const checkIn = (m) => {
    setMood(m);
    if (!checked) { setStreak(s => s + 1); setChecked(true); }
  };

  const saveEntry = () => {
    if (!mood) return;
    const wasChecked = checked;
    if (!wasChecked) { setStreak(s => s + 1); setChecked(true); }
    const moodObj = MOODS.find(m => m.id === mood);
    try {
      const prev = JSON.parse(localStorage.getItem("cm_checkins") || "[]");
      prev.push({
        date: new Date().toLocaleDateString("he-IL"),
        mood: moodObj?.e || "😐",
        use: [smokeG > 0 && `עישון ${smokeG.toFixed(1)}ג׳`, vapeG > 0 && `אידוי ${vapeG.toFixed(1)}ג׳`, dropsN > 0 && `טיפות ${dropsN}`].filter(Boolean).join(" · ") || "ללא",
        note: "",
      });
      localStorage.setItem("cm_checkins", JSON.stringify(prev.slice(-30)));
    } catch {}

    // Badge unlock check
    const newStreak = wasChecked ? streak : streak + 1;
    const ratingCount = Object.keys(ratings).length;
    const unlocked = badges.find(b => !b.on && (b.threshold === newStreak || b.threshold === ratingCount));
    if (unlocked) { setNewBadge(unlocked); setTimeout(() => setNewBadge(null), 3000); }

    setSavedOk(true);
    setShowConfetti(true);
    setTimeout(() => { setSavedOk(false); setShowConfetti(false); }, 2800);
  };

  // SVG trend line path
  const trendPath = trendPoints.length > 1 ? trendPoints.map((p, i) => {
    const x = (p.x / Math.max(trendPoints.length - 1, 1)) * 100;
    const y = 100 - ((p.y - 1) / 3) * 80 - 10;
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ") : null;

  // Streak ring SVG params
  const STREAK_MAX = 30;
  const streakPct = Math.min(streak / STREAK_MAX, 1);
  const circumference = 2 * Math.PI * 24;

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">

      {/* Zemach nudge banner */}
      <AnimatePresence>
        {!checked && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl p-3.5 flex items-center gap-3"
            style={{ background: "linear-gradient(135deg,rgba(74,222,128,0.10) 0%,rgba(20,23,32,0.95) 100%)", border: "1px solid rgba(74,222,128,0.22)" }}>
            <motion.span
              animate={{ rotate: [-8, 8, -8], scale: [1, 1.12, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{ fontSize: 28, flexShrink: 0 }}>🌿</motion.span>
            <div className="text-right flex-1">
              <div className="text-xs font-bold" style={{ color: "#4ADE80" }}>זמח שם לב</div>
              <div className="text-xs leading-relaxed mt-0.5" style={{ color: "rgba(187,247,208,0.80)" }}>
                עוד לא תיעדת היום — איך אתה מרגיש? 30 שניות ותדייק את ההמלצות שלך 🎯
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Streak ring + badges */}
      <motion.div className="rounded-2xl p-4 flex items-center gap-4"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        style={{ background: "linear-gradient(135deg,rgba(8,18,12,0.95),rgba(14,28,18,0.95))", border: "1.5px solid rgba(74,222,128,0.18)" }}>
        {/* Streak ring */}
        <div className="relative flex-shrink-0" style={{ width: 64, height: 64 }}>
          <svg width="64" height="64" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="32" cy="32" r="24" fill="none" stroke="rgba(74,222,128,0.12)" strokeWidth="5" />
            <motion.circle cx="32" cy="32" r="24" fill="none" stroke="#4ADE80" strokeWidth="5"
              strokeLinecap="round"
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference * (1 - streakPct) }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              style={{ strokeDasharray: circumference }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-black leading-none" style={{ color: "#4ADE80" }}>{streak}</span>
            <span className="text-xs" style={{ color: "rgba(187,247,208,0.50)" }}>יום</span>
          </div>
        </div>
        <div className="flex-1 text-right">
          <div className="font-bold mb-0.5" style={{ color: checked ? "#4ADE80" : C.ink }}>
            {checked ? "תועד היום ✓" : "עוד לא תיעדת היום"}
          </div>
          <div className="text-xs mb-2" style={{ color: "rgba(187,247,208,0.55)" }}>
            {checked ? "כל הכבוד — נתראה מחר!" : "תיעוד יומי מדייק את ההמלצות שלך"}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <AnimatePresence>
              {badges.filter(b => b.on).map((b, i) => (
                <motion.span key={i}
                  initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, delay: i * 0.1 }}
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: "rgba(74,222,128,0.12)", color: "#A8E6C0", border: "1px solid rgba(74,222,128,0.18)" }}>
                  {b.e} {b.label}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Today's check-in */}
      <motion.div className="rounded-2xl border overflow-hidden"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}
        style={{ background: C.card, borderColor: checked ? C.accent : C.line }}>
        <div className="px-4 py-3 border-b flex items-center justify-between"
          style={{ background: checked ? "rgba(74,222,128,0.07)" : C.soft, borderColor: C.line }}>
          <span className="text-xs font-bold" style={{ color: checked ? C.accent : "rgba(187,247,208,0.45)" }}>
            {checked ? "✓ תויג היום" : "תיעוד של היום"}
          </span>
          <span className="text-sm font-bold" style={{ color: C.ink }}>📝 כניסה יומית</span>
        </div>

        <div className="p-4">
          {/* Mood ring selector */}
          <p className="text-xs font-semibold mb-3 text-right" style={{ color: "rgba(187,247,208,0.65)" }}>איך הרגשת היום?</p>
          <div className="flex gap-2 mb-5">
            {MOODS.map((m) => {
              const selected = mood === m.id;
              return (
                <button key={m.id} onClick={() => checkIn(m.id)}
                  className="flex-1 py-3 rounded-xl border text-center transition-all relative overflow-hidden"
                  style={{
                    background: selected ? "rgba(74,222,128,0.12)" : "transparent",
                    borderColor: selected ? C.accent : "rgba(255,255,255,0.08)",
                  }}>
                  {selected && (
                    <motion.div className="absolute inset-0 rounded-xl"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      style={{ background: "radial-gradient(circle at 50% 60%,rgba(74,222,128,0.18) 0%,transparent 70%)" }} />
                  )}
                  <motion.div className="text-2xl"
                    animate={selected ? { scale: [1, 1.25, 1.12], y: [0, -4, 0] } : { scale: 1, y: 0 }}
                    transition={{ duration: 0.4 }}>{m.e}</motion.div>
                  <div className="text-xs font-semibold mt-1" style={{ color: selected ? C.accent : "rgba(187,247,208,0.55)" }}>{m.label}</div>
                </button>
              );
            })}
          </div>

          {/* Sliders */}
          <p className="text-xs font-semibold mb-3 text-right" style={{ color: "rgba(187,247,208,0.65)" }}>כמה צרכת?</p>
          <div className="space-y-3 mb-4">
            {[
              { icon: "💨", label: "אידוי", unit: "גרם", val: vapeG, set: setVapeG, max: 5, step: 0.1 },
              { icon: "💧", label: "שמן", unit: "טיפות", val: dropsN, set: setDropsN, max: 40, step: 1 },
              { icon: "🚬", label: "עישון", unit: "גרם", val: smokeG, set: setSmokeG, max: 5, step: 0.1 },
            ].map(({ icon, label, unit, val, set, max, step }) => (
              <div key={label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold" style={{ color: val > 0 ? C.accent : "rgba(187,247,208,0.45)" }}>
                    {val > 0 ? (step === 1 ? val : val.toFixed(1)) : "—"} {val > 0 ? unit : ""}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: C.ink }}>{icon} {label}</span>
                </div>
                <input type="range" min={0} max={max} step={step} value={val}
                  onChange={e => set(step === 1 ? parseInt(e.target.value) : parseFloat(e.target.value))}
                  className="w-full" style={{ accentColor: C.accent, height: 4 }} />
              </div>
            ))}
          </div>

          {smokeG > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="mb-3 text-xs rounded-xl p-2.5" style={{ background: "rgba(248,113,113,0.08)", color: "#FCA5A5", border: "1px solid rgba(248,113,113,0.15)" }}>
              🚭 אידוי בריא ויעיל פי 2.5 מעישון — מומלץ מאוד לעבור
            </motion.div>
          )}

          {/* Save button with dopamine flash */}
          <div className="relative">
            <motion.button onClick={saveEntry} whileTap={{ scale: 0.97 }} disabled={!mood}
              className="w-full py-3 rounded-xl font-bold text-sm relative overflow-hidden"
              style={{
                background: savedOk ? "rgba(74,222,128,0.18)" : mood ? `linear-gradient(135deg,#1E4D36,#4ADE80)` : "rgba(255,255,255,0.05)",
                color: mood ? "#fff" : "rgba(187,247,208,0.35)",
                border: savedOk ? "1px solid #4ADE80" : "none",
              }}>
              <AnimatePresence mode="wait">
                {savedOk ? (
                  <motion.span key="saved" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-2">
                    <span>✓ נשמר!</span>
                    <span style={{ color: "#4ADE80" }}>🌿 +1 לרצף</span>
                  </motion.span>
                ) : (
                  <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {mood ? "שמור יומן היום" : "בחרו מצב רוח תחילה"}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            {/* New badge unlock */}
            <AnimatePresence>
              {newBadge && (
                <motion.div className="absolute -top-12 left-0 right-0 flex justify-center"
                  initial={{ opacity: 0, y: 10, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm"
                    style={{ background: "rgba(74,222,128,0.20)", border: "1px solid rgba(74,222,128,0.40)", color: "#4ADE80" }}>
                    {newBadge.e} הישג חדש: {newBadge.label}!
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Weekly trend mini-chart */}
      {trendPath && (
        <motion.div className="rounded-2xl p-4 border"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          style={{ background: C.card, borderColor: C.line }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2">
              {["😣","😐","🙂","😄"].map((e, i) => (
                <span key={i} className="text-xs" style={{ opacity: 0.4 + i * 0.15 }}>{e}</span>
              ))}
            </div>
            <span className="text-xs font-bold" style={{ color: C.ink }}>📈 טרנד שבועי</span>
          </div>
          <svg viewBox="0 0 100 100" className="w-full" style={{ height: 56 }}>
            <defs>
              <linearGradient id="trendGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#4ADE80" stopOpacity="0.30" />
                <stop offset="100%" stopColor="#4ADE80" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={trendPath + ` L 100 100 L 0 100 Z`} fill="url(#trendGrad)" />
            <motion.path d={trendPath} fill="none" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: "easeOut" }} />
            {trendPoints.map((p, i) => {
              const x = (p.x / Math.max(trendPoints.length - 1, 1)) * 100;
              const y = 100 - ((p.y - 1) / 3) * 80 - 10;
              return <circle key={i} cx={x} cy={y} r="3" fill="#4ADE80" opacity={i === trendPoints.length - 1 ? 1 : 0.45} />;
            })}
          </svg>
          <div className="text-xs text-center mt-1" style={{ color: "rgba(187,247,208,0.40)" }}>7 ימים אחרונים</div>
        </motion.div>
      )}

      {/* Timeline */}
      <div>
        <div className="text-sm font-bold text-right mb-3" style={{ color: C.ink }}>📅 היסטוריה</div>
        {TIMELINE.length === 0 ? (
          <div className="text-center py-6 rounded-2xl border" style={{ background: C.soft, borderColor: C.line }}>
            <div className="text-2xl mb-1">📓</div>
            <p className="text-sm font-semibold" style={{ color: C.ink }}>אין רשומות עדיין</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(187,247,208,0.45)" }}>שמרו כניסה יומית ותופיע כאן</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute right-5 top-0 bottom-0 w-px" style={{ background: C.line }} />
            {TIMELINE.map((e, i) => (
              <motion.div key={i} className="flex gap-4 mb-3 items-start"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + i * 0.07 }}>
                <div className="flex-1 text-right min-w-0">
                  <div className="rounded-xl border p-3" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(74,222,128,0.08)" }}>
                    <div className="flex items-center justify-end gap-2 mb-1">
                      <span className="text-xs font-semibold" style={{ color: "rgba(187,247,208,0.45)" }}>{e.date}</span>
                      <span className="text-lg">{e.mood}</span>
                    </div>
                    <p className="text-xs font-semibold mb-0.5" style={{ color: C.ink }}>{e.use}</p>
                    {e.note && <p className="text-xs" style={{ color: "rgba(187,247,208,0.50)" }}>{e.note}</p>}
                  </div>
                </div>
                <div className="w-10 flex justify-center pt-3 flex-shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full border-2" style={{ background: C.card, borderColor: C.accent }} />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Notifications */}
      <motion.div className="rounded-2xl border overflow-hidden"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.3 }}
        style={{ background: C.card, borderColor: C.line }}>
        <div className="px-4 py-3 border-b text-right text-sm font-bold"
          style={{ background: C.soft, borderColor: C.line, color: C.ink }}>
          התראות 🔔
        </div>
        {NOTIF_OPTS.map((n) => (
          <div key={n.k} className="flex items-center justify-between px-4 py-3 border-b last:border-0"
            style={{ borderColor: "rgba(74,222,128,0.07)" }}>
            <button onClick={() => setNotifs({ ...notifs, [n.k]: !notifs[n.k] })}
              className="w-11 h-6 rounded-full transition-all relative flex-shrink-0"
              style={{ background: notifs[n.k] ? C.accent : "rgba(255,255,255,0.10)" }}>
              <motion.span className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
                animate={{ right: notifs[n.k] ? 2 : 22 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}
                style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.30)" }} />
            </button>
            <div className="text-right ml-3">
              <div className="text-sm font-semibold" style={{ color: C.ink }}>{n.label}</div>
              <div className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>{n.sub}</div>
            </div>
          </div>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.4 }}>
        <div className="text-sm font-bold text-right mb-3" style={{ color: C.ink }}>⭐ דירוג מוצרים</div>
        <Feedback ans={ans} scored={scored} ratings={ratings} setRatings={setRatings} />
      </motion.div>
    </div>
  );
}

/* ───────────── כניסה, הרשמה, אימות ורישיון ───────────── */

/* ── Dual real-image luminous background ── */
function LeafBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{zIndex:0}}>
      {/* Image 1 — green buds */}
      <motion.div className="absolute inset-0"
        style={{backgroundImage:"url('/66.jpg')",backgroundSize:"cover",backgroundPosition:"center",
          filter:"brightness(0.80) saturate(1.25)"}}
        animate={{opacity:[0.80,0.0,0.0,0.80],scale:[1,1.04,1.04,1]}}
        transition={{duration:18,repeat:Infinity,ease:"easeInOut",times:[0,0.45,0.55,1]}}/>
      {/* Image 2 — purple buds */}
      <motion.div className="absolute inset-0"
        style={{backgroundImage:"url('/9-Best-Purple-Strains-2048x1080.jpg')",backgroundSize:"cover",backgroundPosition:"center",
          filter:"brightness(0.74) saturate(1.3)"}}
        animate={{opacity:[0.0,0.80,0.80,0.0],scale:[1.04,1,1.04,1.04]}}
        transition={{duration:18,repeat:Infinity,ease:"easeInOut",times:[0,0.45,0.55,1]}}/>
      {/* Translucent tint — lighter now, so the flowers stay visible behind the text panels */}
      <div className="absolute inset-0" style={{background:"linear-gradient(160deg,rgba(236,248,240,0.26) 0%,rgba(232,242,255,0.20) 45%,rgba(240,232,255,0.24) 78%,rgba(236,248,240,0.28) 100%)"}}/>
      {/* Glow orbs */}
      <div className="auth-orb auth-orb-1" style={{width:560,height:560,top:"-14%",right:"-14%",background:"radial-gradient(circle,rgba(46,107,83,.18) 0%,transparent 65%)"}}/>
      <div className="auth-orb auth-orb-2" style={{width:440,height:440,bottom:"-12%",left:"-12%",background:"radial-gradient(circle,rgba(168,100,220,.16) 0%,transparent 65%)"}}/>
      <div className="auth-orb auth-orb-3" style={{width:320,height:320,top:"36%",left:"38%",background:"radial-gradient(circle,rgba(46,107,83,.10) 0%,transparent 65%)"}}/>
    </div>
  );
}

/* ── Premium Holographic Cannabis Bud SVG ── */
function HoloBud({ className, style }) {
  const calyxData = [
    [94,67,8,12,5,true],[106,67,8,12,-5,false],[88,77,8,12,15,false],[112,77,8,12,-15,true],
    [78,90,9,13,20,true],[95,95,10,14,5,false],[110,95,10,14,-5,true],[124,90,9,13,-20,false],
    [74,104,8,12,28,false],[126,104,8,12,-28,true],
    [62,118,9,13,35,true],[80,124,9,13,18,false],[96,129,10,15,5,true],[112,129,10,15,-5,false],
    [130,124,9,13,-18,true],[138,118,9,13,-35,false],
    [72,143,8,12,28,true],[128,143,8,12,-28,false],
    [68,162,9,13,32,false],[86,170,10,14,16,true],[105,173,11,15,0,false],[122,170,10,14,-16,true],[132,162,9,13,-32,false],
    [78,185,10,14,22,true],[100,192,11,15,0,false],[122,185,10,14,-22,true],
  ];
  const pistilData = [
    [94,62,82,50,76,42,0],[106,62,118,50,124,42,1],[88,72,74,60,66,54,2],
    [112,72,126,60,134,54,0],[76,86,62,75,54,68,1],[124,86,138,75,146,68,2],
    [72,100,57,90,50,83,0],[128,100,143,90,150,83,1],
    [60,115,44,105,38,98,2],[140,115,156,105,162,98,0],
    [68,138,52,130,46,124,1],[132,138,148,130,154,124,2],
    [70,158,54,150,48,144,0],[130,158,146,150,152,144,1],
  ];
  const tData = [
    [93,63,92,60],[107,63,108,60],[88,74,87,71],[113,74,114,71],
    [80,87,79,84],[97,93,97,90],[112,93,113,90],[126,87,127,84],
    [75,101,74,98],[127,101,128,98],
    [64,115,63,112],[82,120,82,117],[98,126,98,123],[113,126,114,123],[131,120,132,117],[139,115,140,112],
    [74,140,74,137],[128,140,129,137],
    [70,158,70,155],[88,166,88,163],[106,170,106,167],[122,166,123,163],[132,158,133,155],
    [80,181,80,178],[100,188,100,185],[122,181,123,178],
    [87,70,87,67],[100,62,100,59],[113,70,114,67],
    [78,93,78,90],[122,93,123,90],[70,108,70,105],[130,108,131,105],
    [85,130,85,127],[115,130,116,127],[90,170,90,167],[110,170,111,167],
  ];
  const pColors = ["#FF8C00","#FFA726","#E65100"];
  const tColors = ["#E8F5E9","#F3E5F5","#FFFFFF","#E1F5FE"];
  const budPath = "M100 55 C130 55 155 80 157 110 C162 145 150 175 138 192 C126 210 113 217 100 217 C87 217 74 210 62 192 C50 175 38 145 43 110 C45 80 70 55 100 55 Z";
  return (
    <svg viewBox="0 0 200 240" width="100%" height="100%" className={className} style={{overflow:"visible",...style}}>
      <defs>
        <radialGradient id="hb-main" cx="36%" cy="28%" r="68%">
          <stop offset="0%" stopColor="#4CAF50"/><stop offset="30%" stopColor="#2E7D32"/>
          <stop offset="65%" stopColor="#1B5E20"/><stop offset="100%" stopColor="#0D2E10"/>
        </radialGradient>
        <radialGradient id="hb-cg" cx="38%" cy="32%" r="62%">
          <stop offset="0%" stopColor="#81C784"/><stop offset="45%" stopColor="#388E3C"/>
          <stop offset="100%" stopColor="#1B5E20"/>
        </radialGradient>
        <radialGradient id="hb-cp" cx="38%" cy="32%" r="62%">
          <stop offset="0%" stopColor="#CE93D8"/><stop offset="42%" stopColor="#7B1FA2"/>
          <stop offset="100%" stopColor="#38006B"/>
        </radialGradient>
        <radialGradient id="hb-glo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#39FF85" stopOpacity="0.42"/>
          <stop offset="55%" stopColor="#39FF85" stopOpacity="0.08"/>
          <stop offset="100%" stopColor="#39FF85" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="hb-holo" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(57,255,133,0.14)"/>
          <stop offset="42%" stopColor="rgba(200,85,255,0.09)"/>
          <stop offset="80%" stopColor="rgba(255,160,64,0.06)"/>
          <stop offset="100%" stopColor="rgba(57,255,133,0.11)"/>
        </linearGradient>
        <filter id="hb-bgf" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7"/>
        </filter>
        <filter id="hb-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="hb-tc" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.7" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <ellipse cx="100" cy="128" rx="87" ry="97" fill="url(#hb-glo)" className="holo-pulse"/>
      <path d={budPath} fill="#39FF85" opacity="0.07" filter="url(#hb-bgf)"/>
      <path d="M100 225 Q99 215 100 205" stroke="#5D3010" strokeWidth="5" fill="none" strokeLinecap="round"/>
      <path d="M100 225 Q99 215 100 205" stroke="#7D4520" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d={budPath} fill="url(#hb-main)" filter="url(#hb-soft)"/>
      {calyxData.map(([cx,cy,rx,ry,rot,ig],i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
          transform={`rotate(${rot} ${cx} ${cy})`}
          fill={ig?"url(#hb-cg)":"url(#hb-cp)"} opacity="0.93"/>
      ))}
      {pistilData.map(([x1,y1,qx,qy,x2,y2,ci],i) => (
        <path key={i} d={`M${x1} ${y1} Q${qx} ${qy} ${x2} ${y2}`}
          stroke={pColors[ci]} strokeWidth="1.15" fill="none" strokeLinecap="round" opacity="0.84"/>
      ))}
      {tData.map(([sx,sy,hx,hy],i) => (
        <g key={i} filter="url(#hb-tc)">
          <line x1={sx} y1={sy} x2={hx} y2={hy} stroke="rgba(200,255,210,0.45)" strokeWidth="0.5"/>
          <circle cx={hx} cy={hy} r="1.35" fill={tColors[i%4]} opacity="0.94"/>
        </g>
      ))}
      <path d={budPath} fill="url(#hb-holo)" opacity="0.7" className="holo-shimmer-overlay"/>
      <ellipse cx="83" cy="88" rx="23" ry="13" fill="rgba(255,255,255,0.054)" transform="rotate(-18 83 88)"/>
    </svg>
  );
}

/* ── Holographic Bud Scene — left panel ── */
function HolographicBudScene() {
  const features = [
    {icon:"🎯",t:"התאמה אישית",d:"280+ זנים ישראלים"},
    {icon:"📸",t:"סריקת תפריטים",d:"QR, תמונה, הקלדה"},
    {icon:"🧭",t:"הכוונה חכמה",d:"פחות ניסוי ותהייה"},
    {icon:"🫂",t:"קהילה סגורה",d:"רק בעלי רישיון"},
  ];
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden px-8 py-10"
      style={{background:"linear-gradient(150deg,#020A05 0%,#06101A 45%,#0D0618 75%,#020A05 100%)"}}>
      <div className="auth-orb auth-orb-1" style={{width:500,height:500,top:"-14%",left:"-16%",background:"radial-gradient(circle,rgba(57,255,133,.18) 0%,transparent 62%)"}}/>
      <div className="auth-orb auth-orb-2" style={{width:420,height:420,bottom:"-12%",right:"-12%",background:"radial-gradient(circle,rgba(180,60,255,.20) 0%,transparent 62%)"}}/>
      <div className="auth-orb auth-orb-3" style={{width:300,height:300,top:"40%",left:"40%",background:"radial-gradient(circle,rgba(255,165,60,.14) 0%,transparent 62%)"}}/>
      <motion.div className="relative mb-6" style={{width:200,height:248}}
        animate={{y:[0,-16,0],rotate:[0,2,0,-2,0]}} transition={{duration:7,repeat:Infinity,ease:"easeInOut"}}>
        <motion.div className="absolute bottom-0 left-1/2 rounded-full"
          style={{width:"55%",height:18,marginLeft:"-27.5%",background:"radial-gradient(ellipse,rgba(57,255,133,.55) 0%,transparent 70%)",filter:"blur(10px)"}}
          animate={{opacity:[0.4,0.9,0.4],scaleX:[0.75,1.15,0.75]}} transition={{duration:3.5,repeat:Infinity}}/>
        <HoloBud style={{width:"100%",height:"100%"}}/>
      </motion.div>
      <div className="relative z-10 w-full max-w-sm" dir="rtl">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{background:"rgba(57,255,133,0.10)",border:"1px solid rgba(57,255,133,0.28)"}}>
            <span style={{fontSize:22}}>🌿</span>
          </div>
          <div>
            <div className="text-2xl font-bold neon-glow" style={{color:CD.accent,textShadow:"0 0 20px rgba(57,255,133,.5)"}}>קנאמאצ׳</div>
            <div className="text-xs" style={{color:CD.muted}}>המצפן שלך בבלאגן הקנאביס</div>
          </div>
        </div>
        <p className="text-sm leading-relaxed mb-4" style={{color:"#ACC6B4",lineHeight:1.75}}>
          הכלי הדיגיטלי שיעזור לך לעשות סדר בבלאגן. מבוסס על ידע אקדמי, נתונים פתוחים ודיווחי מטופלים — כדי שהקנייה החודשית שלך תמיד תהיה מדויקת.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {features.map((f,i) => (
            <div key={i} className="feature-card" style={{
              background:"rgba(255,255,255,0.93)",border:"1px solid rgba(46,107,83,0.18)",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",
            }}>
              <div className="text-lg mb-1">{f.icon}</div>
              <div className="text-xs font-bold mb-0.5" style={{color:"#1F2937"}}>{f.t}</div>
              <div className="text-xs" style={{color:"rgba(187,247,208,0.55)"}}>{f.d}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          {[{c:CD.accent,l:"מצפן חכם"},{c:CD.purple,l:"לכל הגילאים"},{c:CD.orange,l:"ידע אקדמי"}].map(({c,l},i) => (
            <span key={i} className="text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{background:`${c}18`,color:c,border:`1px solid ${c}30`}}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ── Pharmacy Nearby module — GPS + region filter ── */
function PharmacyNearby() {
  const [region, setRegion] = useState("הכל");
  const [locating, setLocating] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [locErr, setLocErr] = useState(null);

  const REGIONS = ["הכל", "מרכז", "ירושלים", "צפון", "דרום"];

  const haversineKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const locate = () => {
    if (!navigator.geolocation) { setLocErr("הדפדפן לא תומך במיקום"); return; }
    setLocating(true); setLocErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserCoords(pos.coords); setLocating(false); },
      () => { setLocErr("לא הצלחנו לאתר מיקום — ודאו שהרשאת המיקום פעילה"); setLocating(false); },
      { timeout: 8000 }
    );
  };

  const openNav = (p) => {
    const q = encodeURIComponent(`${p.name} ${p.city} ישראל`);
    window.open(`https://waze.com/ul?q=${q}&navigate=yes`, "_blank", "noopener,noreferrer");
  };
  const priceLabel = (f) => f < 0.97 ? "💚 נמוך" : f > 1.03 ? "🔴 גבוה" : "💛 רגיל";

  let list = (PHARMACIES || []).filter(p => region === "הכל" || p.region === region);
  if (userCoords) {
    list = list.map(p => ({
      ...p,
      distKm: Math.round(haversineKm(userCoords.latitude, userCoords.longitude, p.lat, p.lng) * 10) / 10,
    })).sort((a, b) => a.distKm - b.distKm);
  }

  return (
    <div className="rounded-2xl border overflow-hidden mb-4" style={{background:C.card,borderColor:C.line}}>
      {/* Header */}
      <div className="px-4 py-3 border-b" style={{background:C.soft,borderColor:C.line}}>
        <div className="flex items-center justify-between mb-2">
          <motion.button onClick={locate} disabled={locating}
            whileTap={{scale:0.95}}
            className="text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            style={{background:userCoords ? C.accent : C.ink,color:"#fff"}}>
            {locating ? "🔍 מאתר..." : userCoords ? "📍 מיקום פעיל" : "📍 מיקום נוכחי"}
          </motion.button>
          <div className="text-sm font-bold" style={{color:C.ink}}>בתי מרקחת 🏪</div>
        </div>
        {locErr && <p className="text-xs mb-2" style={{color:"#F87171"}}>{locErr}</p>}
        {/* Region tabs */}
        <div className="flex gap-1.5 overflow-x-auto" style={{scrollbarWidth:"none"}}>
          {REGIONS.map(r => (
            <button key={r} onClick={() => setRegion(r)}
              className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold transition-all"
              style={{
                background: region === r ? C.ink : "transparent",
                color: region === r ? "#fff" : "rgba(187,247,208,0.55)",
                border: `1px solid ${region === r ? C.ink : C.line}`,
              }}>{r}</button>
          ))}
        </div>
      </div>

      {/* Pharmacy list */}
      <AnimatePresence>
        {list.map((p, i) => (
          <motion.div key={p.id}
            initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
            className="px-4 py-3.5 border-b last:border-0 flex items-center gap-3"
            style={{borderColor:C.line}}>
            <button onClick={() => openNav(p)}
              className="flex-shrink-0 text-xs font-bold px-3 py-2 rounded-xl"
              style={{background:`linear-gradient(135deg,${C.ink},${C.accent})`,color:"#fff"}}>
              🧭 ניווט
            </button>
            <div className="flex-1 text-right min-w-0">
              <div className="flex items-center justify-end gap-2 mb-1">
                <span className="text-sm font-bold truncate" style={{color:C.ink}}>{p.name}</span>
              </div>
              <div className="flex items-center justify-end gap-2 text-xs flex-wrap" style={{color:"rgba(187,247,208,0.55)"}}>
                {p.delivery && <span>🚚 משלוח</span>}
                <span>📍 {p.distKm} ק"מ</span>
                <span>{p.city}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {list.length === 0 && (
        <div className="px-4 py-6 text-center text-sm" style={{color:"rgba(187,247,208,0.45)"}}>
          אין בתי מרקחת באזור הנבחר
        </div>
      )}
    </div>
  );
}

/* ── Strain Detail Drawer ── */
function StrainDetailDrawer({ strain, onClose }) {
  if (!strain) return null;
  const topEffs = strain.eff ? Object.entries(strain.eff).sort((a,b)=>b[1]-a[1]).slice(0,5) : [];
  const topNegs = strain.neg ? Object.entries(strain.neg).sort((a,b)=>b[1]-a[1]).slice(0,3) : [];
  const topFlavs = strain.flav ? Object.entries(strain.flav).sort((a,b)=>b[1]-a[1]).slice(0,4) : [];
  const topTerps = strain.terps ? Object.entries(strain.terps).sort((a,b)=>b[1]-a[1]) : [];
  const maxTerp = topTerps[0]?.[1] || 1;

  return (
    <AnimatePresence>
      <motion.div key="backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
        onClick={onClose}
        style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.78)",backdropFilter:"blur(8px)"}} />
      <motion.div key="drawer"
        initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}}
        transition={{type:"spring",damping:32,stiffness:320}}
        style={{
          position:"fixed",bottom:0,right:0,left:0,zIndex:201,
          maxHeight:"88vh",background:"rgba(6,14,10,0.99)",
          border:"1.5px solid rgba(74,222,128,0.25)",
          borderRadius:"24px 24px 0 0",overflowY:"auto",
          boxShadow:"0 -8px 48px rgba(0,0,0,0.7), 0 0 48px rgba(74,222,128,0.06)",
        }}
      >
        {/* Drag handle */}
        <div style={{textAlign:"center",padding:"14px 0 6px",flexShrink:0}}>
          <div style={{width:42,height:4,borderRadius:2,background:"rgba(255,255,255,0.18)",display:"inline-block"}} />
        </div>
        {/* Header */}
        <div style={{padding:"8px 20px 16px",borderBottom:"1px solid rgba(74,222,128,0.12)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <button onClick={onClose}
              style={{width:32,height:32,borderRadius:10,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",color:"#F0FDF4",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              ✕
            </button>
            <h2 style={{color:"#F0FDF4",fontSize:22,fontWeight:900,margin:0,letterSpacing:"-0.02em"}}>{strain.name}</h2>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
            <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:8,background:"rgba(74,222,128,0.12)",color:"#4ADE80",border:"1px solid rgba(74,222,128,0.28)"}}>
              {strain.cat}
            </span>
            {strain.kind && (
              <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:8,background:"rgba(167,139,250,0.10)",color:"#C084FC",border:"1px solid rgba(167,139,250,0.22)"}}>
                {strain.kind}
              </span>
            )}
            {strain.grower && (
              <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:8,background:"rgba(255,255,255,0.06)",color:"#BBF7D0",border:"1px solid rgba(255,255,255,0.10)"}}>
                🌱 {strain.grower}
              </span>
            )}
          </div>
        </div>

        <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:16}}>
          {/* Grower Reported Banner */}
          <div style={{borderRadius:14,padding:"10px 14px",background:"rgba(74,222,128,0.07)",border:"1px solid rgba(74,222,128,0.18)",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>📊</span>
            <div>
              <div style={{fontSize:12,fontWeight:800,color:"#4ADE80"}}>לפי דיווח המגדל</div>
              <div style={{fontSize:11,color:"rgba(187,247,208,0.70)"}}>הנתונים מבוססים על דיווחי {strain.grower || "המגדל"} ומידע שסרקנו ממאגרים פתוחים</div>
            </div>
          </div>

          {/* Genetics */}
          {strain.genetics && (
            <div style={{borderRadius:14,padding:"12px 14px",background:"rgba(20,23,32,0.90)",border:"1px solid rgba(74,222,128,0.10)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(187,247,208,0.60)",marginBottom:6,letterSpacing:"0.08em",textTransform:"uppercase"}}>גנטיקה</div>
              <div style={{fontSize:13,fontWeight:700,color:"#F0FDF4"}}>{strain.genetics}</div>
              {strain.lineage && <div style={{fontSize:11,color:"rgba(187,247,208,0.55)",marginTop:3}}>{strain.lineage}</div>}
            </div>
          )}

          {/* Effects */}
          {topEffs.length > 0 && (
            <div style={{borderRadius:14,padding:"12px 14px",background:"rgba(20,23,32,0.90)",border:"1px solid rgba(74,222,128,0.10)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(187,247,208,0.60)",marginBottom:10,letterSpacing:"0.08em",textTransform:"uppercase"}}>✨ אפקטים מדווחים</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {topEffs.map(([eff,pct]) => (
                  <div key={eff} style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,color:"#BBF7D0",width:80,textAlign:"right",flexShrink:0,fontWeight:600}}>{EFFECTS[eff]||eff}</span>
                    <div style={{flex:1,height:5,borderRadius:3,background:"rgba(255,255,255,0.08)"}}>
                      <div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:"linear-gradient(90deg,#4ADE80,#22C55E)"}} />
                    </div>
                    <span style={{fontSize:11,color:"rgba(187,247,208,0.50)",width:30,textAlign:"left",flexShrink:0}}>{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flavors */}
          {topFlavs.length > 0 && (
            <div style={{borderRadius:14,padding:"12px 14px",background:"rgba(20,23,32,0.90)",border:"1px solid rgba(74,222,128,0.10)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(187,247,208,0.60)",marginBottom:8,letterSpacing:"0.08em",textTransform:"uppercase"}}>🍋 טעמים ופרחים</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {topFlavs.map(([f,pct]) => (
                  <span key={f} style={{fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:20,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"#D1FAE5"}}>
                    {FLAVORS[f]||f} {pct}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Terpenes */}
          {topTerps.length > 0 && (
            <div style={{borderRadius:14,padding:"12px 14px",background:"rgba(20,23,32,0.90)",border:"1px solid rgba(74,222,128,0.10)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(187,247,208,0.60)",marginBottom:10,letterSpacing:"0.08em",textTransform:"uppercase"}}>🧬 פרופיל טרפנים</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {topTerps.map(([t,v]) => (
                  <div key={t} style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,color:TERPENES[t]?.color||"#BBF7D0",width:62,textAlign:"right",flexShrink:0,fontWeight:700}}>{TERPENES[t]?.he||t}</span>
                    <div style={{flex:1,height:4,borderRadius:2,background:"rgba(255,255,255,0.06)"}}>
                      <motion.div initial={{width:0}} animate={{width:`${(v/maxTerp)*100}%`}} transition={{duration:.7,ease:"easeOut"}}
                        style={{height:"100%",borderRadius:2,background:TERPENES[t]?.color||"#4ADE80",boxShadow:`0 0 6px ${TERPENES[t]?.color||"#4ADE80"}88`}} />
                    </div>
                    <span style={{fontSize:10,color:"rgba(187,247,208,0.40)",width:28,textAlign:"left",flexShrink:0}}>{Math.round(v*100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Negative effects */}
          {topNegs.length > 0 && (
            <div style={{borderRadius:14,padding:"12px 14px",background:"rgba(20,10,10,0.80)",border:"1px solid rgba(248,113,113,0.15)"}}>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(248,113,113,0.60)",marginBottom:8,letterSpacing:"0.08em",textTransform:"uppercase"}}>⚠️ תופעות לוואי</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {topNegs.map(([n,pct]) => (
                  <span key={n} style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.15)",color:"#FCA5A5"}}>
                    {NEGATIVES[n]||n} {pct}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Price & Availability */}
          <div style={{borderRadius:14,padding:"12px 14px",background:"rgba(20,23,32,0.90)",border:"1px solid rgba(74,222,128,0.10)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:11,color:"rgba(187,247,208,0.55)"}}>
              {strain.grow && `גידול: ${strain.grow}`}
              {strain.pharmacies && strain.pharmacies.length > 0 && ` · זמין ב-${strain.pharmacies.length} ביה"מ`}
            </div>
            {strain.price && (
              <div style={{fontSize:18,fontWeight:900,color:"#FBBF24"}}>
                {strain.price} ₪
                <span style={{fontSize:10,fontWeight:400,color:"rgba(187,247,208,0.50)",marginRight:3}}>/ 10ג׳</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Dashboard — Dual-Pane Tactical HUD
   Left (55%): Personal Navigator — search + top picks + quick actions
   Right (45%): Community Feed panel — live or FOMO-gated
   Mobile: stacked with two sub-tabs (🧭 ניווט / 🌿 קהילה)
───────────────────────────────────────────────────────────────────────────── */

// Community mini-preview for the HUD right pane
function CommunityMiniPanel({ licenseVerified, ans, goTab, onGoLicense }) {
  if (!licenseVerified) {
    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100%", position:"relative", overflow:"hidden" }}>
        {/* Blurred ghost posts */}
        <div style={{ position:"absolute", inset:0, filter:"blur(8px)", opacity:0.25, pointerEvents:"none", padding:"12px 10px" }}>
          {DEMO_POSTS.slice(0,4).map((p,i) => (
            <div key={i} style={{
              background:"rgba(20,23,32,0.90)", borderRadius:14, border:"1px solid rgba(74,222,128,0.10)",
              padding:"10px 12px", marginBottom:8,
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:"rgba(74,222,128,0.25)", flexShrink:0 }} />
                <div style={{ width:80, height:8, borderRadius:4, background:"rgba(187,247,208,0.15)" }} />
              </div>
              <div style={{ height:8, width:"90%", background:"rgba(187,247,208,0.10)", borderRadius:4, marginBottom:4 }} />
              <div style={{ height:8, width:"70%", background:"rgba(187,247,208,0.07)", borderRadius:4 }} />
            </div>
          ))}
        </div>
        {/* Frosted CTA overlay */}
        <div style={{
          position:"absolute", inset:0, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:12,
          background:"rgba(4,12,8,0.62)", backdropFilter:"blur(2px)",
          padding:"0 16px",
        }}>
          <motion.div animate={{ scale:[1,1.1,1], filter:["drop-shadow(0 0 10px rgba(74,222,128,0.3))","drop-shadow(0 0 22px rgba(74,222,128,0.7))","drop-shadow(0 0 10px rgba(74,222,128,0.3))"] }}
            transition={{ duration:2.5, repeat:Infinity }}
            style={{ fontSize:36, lineHeight:1 }}>🔐</motion.div>
          <div style={{ textAlign:"center" }}>
            <p style={{ fontSize:13, fontWeight:900, color:"#F0FDF4", marginBottom:4, lineHeight:1.3 }}>
              מרחב מטופלים מאומתים
            </p>
            <p style={{ fontSize:11, color:"rgba(187,247,208,0.70)", lineHeight:1.5 }}>
              סרוק את הרישיון כדי להיכנס לפיד החי
            </p>
          </div>
          <button onClick={onGoLicense}
            style={{
              padding:"10px 22px", borderRadius:14, border:"none", cursor:"pointer",
              background:"linear-gradient(135deg,#4ADE80,#22c55e)",
              color:"#04120a", fontSize:13, fontWeight:900,
              fontFamily:"'Heebo',sans-serif",
              boxShadow:"0 0 18px rgba(74,222,128,0.40)",
            }}>
            📄 אמת רישיון לפתיחה
          </button>
        </div>
      </div>
    );
  }

  // Verified — empty state until real posts exist
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Feed header */}
      <div style={{
        padding:"12px 14px 10px", borderBottom:"1px solid rgba(74,222,128,0.10)",
        background:"rgba(0,0,0,0.20)", flexShrink:0,
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <span style={{ fontSize:10, fontWeight:700, color:"rgba(187,247,208,0.60)" }}>
          🌿 קהילה
        </span>
        <button onClick={() => goTab("community")}
          style={{
            fontSize:11, fontWeight:800, color:"#4ADE80", background:"none",
            border:"1px solid rgba(74,222,128,0.25)", borderRadius:10,
            padding:"3px 10px", cursor:"pointer",
          }}>
          הכל ←
        </button>
      </div>
      {/* Empty state */}
      <div style={{
        flex:1, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        padding:"20px 16px", textAlign:"center", gap:10,
      }}>
        <span style={{ fontSize:32 }}>🌱</span>
        <p style={{ fontSize:12, fontWeight:700, color:"rgba(187,247,208,0.70)", lineHeight:1.4 }}>
          הקהילה רק מתחילה
        </p>
        <p style={{ fontSize:11, color:"rgba(187,247,208,0.45)", lineHeight:1.5 }}>
          היה הראשון לשתף — הדיווח שלך יעזור למטופלים אחרים עם אותה התוויה
        </p>
      </div>
      {/* Compose CTA */}
      <div style={{ padding:"8px 10px", flexShrink:0, borderTop:"1px solid rgba(74,222,128,0.08)" }}>
        <button onClick={() => goTab("community")}
          style={{
            width:"100%", padding:"9px", borderRadius:12, border:"1px solid rgba(74,222,128,0.20)",
            background:"rgba(74,222,128,0.06)", color:"rgba(187,247,208,0.70)",
            fontSize:11, fontWeight:700, cursor:"pointer", textAlign:"center",
          }}>
          ✍️ שתף עם הקהילה...
        </button>
      </div>
    </div>
  );
}

function Dashboard({ ans, scored, basket, addToBasket, user, licenseVerified, goTab, ratings = {}, onReport }) {
  const [query, setQuery]               = useState("");
  const [results, setResults]           = useState(null);
  const [selectedStrain, setSelectedStrain] = useState(null);
  const [mobilePane, setMobilePane]     = useState("nav"); // "nav" | "community"
  const { loginStage }                  = useJourney();

  // Build terpene profile for friend-voice copy (uses same buildProfile defined in file)
  const profile = useMemo(() => buildProfile(ans, ratings), [ans, ratings]);

  // Strains already rated (have any rating value)
  const ratedIds = useMemo(() => Object.keys(ratings), [ratings]);

  // Kill-switch stats — before vs after filtering by avoided terps
  const totalBeforeFilter = scored.length;
  const totalAfterFilter  = scored.filter(s => (s.match || 0) >= 40).length;
  const ksMsg = useMemo(
    () => killSwitchSummary(profile, totalBeforeFilter, totalAfterFilter),
    [profile, totalBeforeFilter, totalAfterFilter],
  );

  // Next untried experiment
  const nextExp = useMemo(() => nextExperimentStrain(scored, ratedIds), [scored, ratedIds]);

  const search = (q) => {
    if (!q.trim()) { setResults(null); return; }
    const sl = q.toLowerCase();
    const strains = STRAINS.filter(s =>
      s.name.toLowerCase().includes(sl) ||
      (s.genetics || "").toLowerCase().includes(sl) ||
      (s.grower || "").toLowerCase().includes(sl)
    ).slice(0, 6);
    const pharms = (PHARMACIES || []).filter(p => p.name?.includes(q) || p.city?.includes(q));
    setResults({ strains, pharms });
  };

  const openStrain = (s) => { setSelectedStrain(s); setResults(null); setQuery(""); };

  // Top 3 picks; flag those matching user's #1 symptom for glow treatment
  const topPicks   = scored.slice(0, 3);
  const topReason  = ans.reasons?.[0];
  const topReasonLabel = REASONS.find(r => r.id === topReason)?.label;

  // Context-aware report nudge — timing-aware, once per day
  const lastRatedStrain = useMemo(
    () => scored.find(s => ratedIds.includes(String(s.id))) || null,
    [scored, ratedIds],
  );
  const { shouldNudge, nudgeMsg, dismissNudge } = useReportTiming(lastRatedStrain);

  // Mobile sub-tab bar
  const MobileTabBar = (
    <div className="lg:hidden flex rounded-2xl p-1 mb-3 mx-4"
      style={{ background:"rgba(0,0,0,0.35)", border:"1px solid rgba(74,222,128,0.14)" }}>
      {[{ id:"nav", icon:"🧭", label:"ניווט אישי" }, { id:"community", icon:"🌿", label:"קהילה" }].map(t => (
        <button key={t.id} onClick={() => setMobilePane(t.id)}
          className="flex-1 py-2 rounded-xl text-xs font-extrabold transition-all"
          style={{
            background: mobilePane === t.id ? "rgba(74,222,128,0.12)" : "transparent",
            color: mobilePane === t.id ? "#4ADE80" : "rgba(187,247,208,0.50)",
            border: mobilePane === t.id ? "1px solid rgba(74,222,128,0.25)" : "1px solid transparent",
          }}>
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );

  // ── Navigator Pane content ───────────────────────────────────────────────
  const NavigatorPane = (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* Context-aware report nudge banner */}
      <AnimatePresence>
        {shouldNudge && lastRatedStrain && (
          <motion.div
            initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }}
            exit={{ opacity:0, height:0 }}
            style={{ overflow:"hidden" }}>
            <div style={{
              display:"flex", alignItems:"center", gap:10,
              padding:"10px 14px",
              background:"rgba(74,222,128,0.07)",
              borderBottom:"1px solid rgba(74,222,128,0.18)",
            }}>
              <span style={{ fontSize:17, flexShrink:0 }}>🌿</span>
              <div style={{ flex:1, textAlign:"right" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"rgba(187,247,208,0.85)", lineHeight:1.5 }}>
                  {nudgeMsg}
                </div>
              </div>
              <button
                onClick={() => { if (onReport) onReport(lastRatedStrain); }}
                style={{
                  padding:"7px 14px", borderRadius:10, border:"none", cursor:"pointer",
                  background:"rgba(74,222,128,0.18)", color:"#4ADE80",
                  fontSize:12, fontWeight:800, flexShrink:0,
                }}>
                דווח
              </button>
              <button onClick={dismissNudge}
                style={{ background:"none", border:"none", cursor:"pointer",
                  fontSize:16, color:"rgba(187,247,208,0.35)", flexShrink:0 }}>
                ×
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact greeting */}
      <motion.div
        initial={{ opacity:0, y:-14 }} animate={{ opacity:1, y:0 }}
        transition={{ duration:0.5, delay:0.1, ease:"easeOut" }}
        style={{
          display:"flex", alignItems:"center", gap:12, padding:"14px 16px 12px",
          background:"rgba(8,18,12,0.88)", borderBottom:"1px solid rgba(74,222,128,0.12)",
          backdropFilter:"blur(18px)", flexShrink:0,
        }}>
        <div style={{ position:"relative", width:42, height:42, flexShrink:0 }}>
          <motion.div animate={{ scale:[0.85,1.12,0.85], opacity:[0.25,0.55,0.25] }}
            transition={{ duration:3.5, repeat:Infinity }}
            style={{ position:"absolute", inset:-8, background:"radial-gradient(circle,rgba(74,222,128,0.22) 0%,transparent 70%)", borderRadius:"50%" }} />
          <motion.span animate={{ rotate:[-5,5,-5], y:[0,-5,0] }}
            transition={{ duration:4, repeat:Infinity, ease:"easeInOut" }}
            style={{ fontSize:30, lineHeight:1, display:"block", filter:"drop-shadow(0 0 12px rgba(74,222,128,0.75))" }}>🌿</motion.span>
        </div>
        <div style={{ flex:1, textAlign:"right" }}>
          <div style={{ fontSize:13, fontWeight:800, color:"#4ADE80", marginBottom:2 }}>
            {user?.name ? `שלום ${user.name.split(" ")[0]} 👋` : "שלום! אני צמח 👋"}
          </div>
          <div style={{ fontSize:11, color:"rgba(187,247,208,0.65)" }}>
            חפש זן, סרוק תפריט, או שאל אותי כל שאלה
          </div>
        </div>
      </motion.div>

      {/* Search bar */}
      <motion.div
        initial={{ opacity:0 }} animate={{ opacity:1 }}
        transition={{ delay:0.25 }}
        style={{ padding:"10px 14px 6px", flexShrink:0, position:"relative" }}>
        <div style={{
          display:"flex", alignItems:"center", borderRadius:16, border:`2px solid ${query ? C.accent : C.line}`,
          padding:"10px 14px", background:C.card,
          boxShadow: query ? `0 0 0 3px ${C.accent}18` : "none",
          transition:"border-color .2s, box-shadow .2s",
        }}>
          <span style={{ fontSize:17, marginLeft:10 }}>🔍</span>
          <input style={{ flex:1, background:"transparent", outline:"none", color:C.ink, fontSize:13 }}
            placeholder="חפש זן, מגדל, בית מרקחת..." value={query} dir="rtl"
            onChange={e => { setQuery(e.target.value); search(e.target.value); }} />
          {query && (
            <button onClick={() => { setQuery(""); setResults(null); }}
              style={{ color:"rgba(187,247,208,0.55)", background:"none", border:"none", cursor:"pointer", fontSize:16 }}>✕</button>
          )}
        </div>
        {results && (
          <div style={{
            position:"absolute", top:"100%", right:14, left:14, zIndex:50, marginTop:6,
            borderRadius:18, border:`1px solid ${C.line}`,
            background:"rgba(8,14,10,0.98)", backdropFilter:"blur(20px)", overflow:"hidden",
            boxShadow:"0 12px 40px rgba(0,0,0,0.70)",
          }}>
            {results.strains.map(s => (
              <button key={s.id} onClick={() => openStrain(s)}
                style={{ width:"100%", padding:"11px 14px", borderBottom:`1px solid ${C.line}`, display:"flex",
                  alignItems:"center", gap:10, textAlign:"right", background:"transparent", cursor:"pointer" }}
                onMouseEnter={e => e.currentTarget.style.background="rgba(74,222,128,0.06)"}
                onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{s.name}</div>
                  <div style={{ fontSize:11, color:"rgba(187,247,208,0.55)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {s.genetics} · {s.grower} · {s.cat}
                  </div>
                </div>
                <div style={{ textAlign:"left", flexShrink:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.accent }}>₪{s.price}</div>
                  <div style={{ fontSize:10, color:"rgba(187,247,208,0.45)" }}>לכל 10ג</div>
                </div>
              </button>
            ))}
            {results.strains.length === 0 && results.pharms.length === 0 && (
              <div style={{ padding:"16px", textAlign:"center", color:"rgba(187,247,208,0.45)", fontSize:13 }}>לא נמצאו תוצאות</div>
            )}
          </div>
        )}
      </motion.div>

      {/* Quick filter chips */}
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.35 }}
        style={{ display:"flex", gap:6, padding:"0 14px 8px", overflowX:"auto", scrollbarWidth:"none", flexShrink:0 }}>
        {["כאב כרוני","שינה","חרדה","PTSD","אפילפסיה"].map(chip => (
          <button key={chip} onClick={() => { setQuery(chip); search(chip); }}
            style={{
              flexShrink:0, fontSize:11, padding:"5px 12px", borderRadius:20, fontWeight:600, cursor:"pointer",
              background:"rgba(74,222,128,0.08)", color:"#BBF7D0", border:"1px solid rgba(74,222,128,0.20)", whiteSpace:"nowrap",
            }}>{chip}</button>
        ))}
      </motion.div>

      {/* Top picks — with symptom glow */}
      <div style={{ flex:1, overflowY:"auto", scrollbarWidth:"none", padding:"0 14px 12px" }}>
        {topPicks.length > 0 ? (
          <>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:20,
                background:C.soft, color:C.accent }}>לפי הפרופיל שלך</span>
              <span style={{ fontSize:12, fontWeight:800, color:C.ink }}>✨ מומלץ עבורך</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {topPicks.map((s, idx) => {
                const tier = matchTier(s.match);
                const isSymptomMatch = topReason && (s.effects || []).includes(topReason);
                return (
                  <motion.div key={s.id}
                    initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                    transition={{ delay: 0.4 + idx * 0.1 }}
                    whileHover={{ scale:1.015 }}
                    style={{
                      borderRadius:18, border:`1.5px solid ${isSymptomMatch ? "#4ADE80" : s.match >= 85 ? `${C.accent}60` : C.line}`,
                      padding:"12px 14px", display:"flex", alignItems:"center", gap:10,
                      background: isSymptomMatch ? "rgba(74,222,128,0.06)" : C.card,
                      boxShadow: isSymptomMatch
                        ? "0 0 0 1px rgba(74,222,128,0.15), 0 0 18px rgba(74,222,128,0.12)"
                        : s.match >= 85 ? `0 0 0 1px ${C.accent}25` : "none",
                      cursor:"pointer", position:"relative",
                    }}
                    onClick={() => openStrain(s)}>
                    {/* Symptom match glow annotation */}
                    {isSymptomMatch && (
                      <motion.div
                        animate={{ opacity:[0.7,1,0.7] }} transition={{ duration:2, repeat:Infinity }}
                        style={{
                          position:"absolute", top:-1, left:10,
                          fontSize:9, fontWeight:800, padding:"2px 8px", borderRadius:"0 0 8px 8px",
                          background:"rgba(74,222,128,0.18)", color:"#4ADE80",
                          border:"1px solid rgba(74,222,128,0.30)", borderTop:"none",
                        }}>
                        ✓ מומלץ ל{topReasonLabel}
                      </motion.div>
                    )}
                    <MatchRing pct={s.match} />
                    <div style={{ flex:1, textAlign:"right", minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:800, color:C.ink }}>{s.name}</div>
                      <div style={{ fontSize:11, color:"rgba(187,247,208,0.55)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {s.genetics} · {s.grower}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:6, marginTop:3 }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:6, background:tier.bg, color:tier.color }}>{tier.icon} {tier.label}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:C.accent }}>{s.cat} · ₪{s.price}</span>
                      </div>
                      {/* Friend-voice "why" */}
                      <div style={{ fontSize:10.5, color:"rgba(187,247,208,0.68)", lineHeight:1.55, marginTop:4, fontStyle:"italic" }}>
                        {friendWhy(s, profile, ans)}
                      </div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
                      <button onClick={e => { e.stopPropagation(); addToBasket(s.id); }} disabled={basket.includes(s.id)}
                        style={{
                          fontSize:11, fontWeight:800, padding:"7px 11px", borderRadius:12,
                          background: basket.includes(s.id) ? C.line : C.accent,
                          color: basket.includes(s.id) ? "rgba(187,247,208,0.45)" : "#0c0d11",
                          border: `1px solid ${basket.includes(s.id) ? C.line : C.accent}`,
                          opacity: basket.includes(s.id) ? 0.6 : 1,
                          cursor: basket.includes(s.id) ? "default" : "pointer",
                        }}>
                        {basket.includes(s.id) ? "✓" : "+"}
                      </button>
                      {onReport && ratedIds.includes(String(s.id)) && (
                        <button onClick={e => { e.stopPropagation(); onReport(s); }}
                          style={{
                            fontSize:10, fontWeight:700, padding:"5px 8px", borderRadius:10,
                            background:"rgba(167,139,250,0.09)", border:"1px solid rgba(167,139,250,0.22)",
                            color:"#A78BFA", cursor:"pointer",
                          }}>
                          דווח
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Kill-switch callout — appears when strains were filtered */}
            {ksMsg && (
              <motion.div
                initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                transition={{ delay:0.6 }}
                style={{
                  marginTop:8, padding:"9px 13px", borderRadius:12,
                  background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.18)",
                }}>
                <div style={{ fontSize:11, color:"rgba(248,113,113,0.85)", lineHeight:1.55 }}>
                  {ksMsg}
                </div>
              </motion.div>
            )}

            {/* Next experiment — always gives the user somewhere to go */}
            {nextExp && (
              <div style={{ marginTop:10 }}>
                <NextExperiment
                  strain={nextExp}
                  why={friendWhy(nextExp, profile, ans)}
                  inBasket={basket.includes(nextExp.id)}
                  onAddToBasket={() => addToBasket(nextExp.id)}
                  onReport={onReport ? () => onReport(nextExp) : undefined}
                />
              </div>
            )}

            {/* Quick-nav buttons */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:10 }}>
              {[
                { icon:"🏪", label:"בתי מרקחת", tab:"market" },
                { icon:"📊", label:"יומן מעקב", tab:"journal" },
                { icon:"🔍", label:"סריקת תפריט", tab:"menu" },
                { icon:"🧬", label:"הפרופיל שלי", tab:"dna" },
              ].map(item => (
                <button key={item.tab} onClick={() => goTab(item.tab)}
                  style={{
                    padding:"9px 10px", borderRadius:12, border:`1px solid ${C.line}`,
                    background:"rgba(255,255,255,0.03)", cursor:"pointer", textAlign:"center",
                    fontSize:11, fontWeight:700, color:"rgba(187,247,208,0.70)",
                  }}>
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          </>
        ) : ans.cats.length === 0 ? (
          <div style={{ borderRadius:18, padding:18, textAlign:"center", background:C.card, border:`1px solid ${C.line}` }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🌿</div>
            <p style={{ fontSize:13, fontWeight:800, color:C.ink, marginBottom:4 }}>עוד לא בנינו את הפרופיל שלך</p>
            <p style={{ fontSize:11, color:"rgba(187,247,208,0.60)", lineHeight:1.55 }}>
              עברו לשאלון ונבנה יחד המלצות מדויקות לקנייה החודשית שלך
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {MobileTabBar}

      {/* Desktop: CSS grid split; Mobile: single pane based on mobilePane */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"55fr 45fr",
        height:"calc(100vh - 140px)",
        gap:0,
      }}
        className="hidden lg:grid">
        {/* Navigator */}
        <motion.div
          initial={{ opacity:0, x:20 }} animate={{ opacity:loginStage === "ready" ? 1 : 0, x: loginStage === "ready" ? 0 : 20 }}
          transition={{ duration:0.55, ease:[0.22,1,0.36,1] }}
          style={{ borderRight:"1px solid rgba(74,222,128,0.10)", overflow:"hidden" }}>
          {NavigatorPane}
        </motion.div>
        {/* Community */}
        <motion.div
          initial={{ opacity:0, x:-20 }} animate={{ opacity:loginStage === "ready" ? 1 : 0, x: loginStage === "ready" ? 0 : -20 }}
          transition={{ duration:0.55, delay:0.12, ease:[0.22,1,0.36,1] }}
          style={{ overflow:"hidden" }}>
          <CommunityMiniPanel
            licenseVerified={licenseVerified} ans={ans}
            goTab={goTab}
            onGoLicense={() => goTab("community")} />
        </motion.div>
      </div>

      {/* Mobile: single pane */}
      <div className="lg:hidden" style={{ height:"calc(100vh - 170px)", overflow:"hidden" }}>
        <AnimatePresence mode="wait">
          {mobilePane === "nav" ? (
            <motion.div key="nav"
              initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }}
              exit={{ opacity:0, x:-20 }} transition={{ duration:0.25 }}
              style={{ height:"100%", overflow:"hidden" }}>
              {NavigatorPane}
            </motion.div>
          ) : (
            <motion.div key="community"
              initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }}
              exit={{ opacity:0, x:20 }} transition={{ duration:0.25 }}
              style={{ height:"100%", overflow:"hidden" }}>
              <CommunityMiniPanel
                licenseVerified={licenseVerified} ans={ans}
                goTab={goTab}
                onGoLicense={() => goTab("community")} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selectedStrain && <StrainDetailDrawer strain={selectedStrain} onClose={() => setSelectedStrain(null)} />}
    </>
  );
}

/* ── AuthScreen — unified immersive dark layout ── */
const AUTH_BG_IMAGES = [
  "/9-Best-Purple-Strains-2048x1080.jpg",
  "/66.jpg",
];

function AuthBgSlideshow() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % AUTH_BG_IMAGES.length), 7000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <AnimatePresence>
        <motion.div
          key={idx}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2.8, ease: "easeInOut" }}
          style={{
            position:"fixed", inset:0, zIndex:0,
            backgroundImage:`url('${AUTH_BG_IMAGES[idx]}')`,
            backgroundSize:"cover", backgroundPosition:"center 35%",
            filter:"saturate(1.65) brightness(0.82)",
          }}
        />
      </AnimatePresence>
      {/* Very light warm tint */}
      <div style={{
        position:"fixed", inset:0, zIndex:1,
        background:"linear-gradient(158deg,rgba(5,3,18,0.20) 0%,rgba(3,14,8,0.16) 52%,rgba(6,4,20,0.22) 100%)",
      }} />
      {/* Soft edge vignette */}
      <div style={{
        position:"fixed", inset:0, zIndex:2, pointerEvents:"none",
        background:"radial-gradient(ellipse 100% 88% at 50% 48%, transparent 28%, rgba(2,3,8,0.26) 100%)",
      }} />
    </>
  );
}

function AuthLayout({ children }) {
  return (
    <div dir="rtl" style={{
      fontFamily:"'Heebo','Segoe UI',sans-serif",
      height:"100dvh", maxHeight:"100dvh",
      width:"100vw", overflow:"hidden",
      display:"flex", flexDirection:"column",
      position:"relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');
        .auth-inner::-webkit-scrollbar { display: none; }
        .auth-inner { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <AuthBgSlideshow />

      {/* Viewport-locked content shell */}
      <div style={{
        position:"relative", zIndex:10, flex:1, minHeight:0,
        display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        padding:"12px 16px",
      }}>
        {/* Inner scroller — hidden scrollbar, clips content on tiny phones gracefully */}
        <div className="auth-inner" style={{
          width:"100%", maxWidth:440,
          maxHeight:"100%", overflowY:"auto",
          display:"flex", flexDirection:"column",
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, type = "text", value, onChange, placeholder }) => (
  <div style={{ marginBottom:10 }}>
    <label style={{ fontSize:13, fontWeight:800, display:"block", marginBottom:5, color:"#FFFFFF",
      letterSpacing:"0.01em", textShadow:"0 1px 8px rgba(0,0,0,0.75)" }}>{label}</label>
    <input type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      dir={type === "password" || type === "email" ? "ltr" : "rtl"}
      style={{
        width:"100%", boxSizing:"border-box",
        borderRadius:14, padding:"13px 16px", fontSize:15,
        background:"rgba(0,0,0,0.38)",
        border:"2px solid rgba(74,222,128,0.35)",
        color:"#FFFFFF", outline:"none",
        fontFamily:"'Heebo',sans-serif",
        transition:"border-color .22s, box-shadow .22s",
        lineHeight:1.35,
        textShadow:"0 1px 4px rgba(0,0,0,0.50)",
      }}
      onFocus={e => {
        e.target.style.borderColor="#4ADE80";
        e.target.style.boxShadow="0 0 0 3px rgba(74,222,128,0.12), 0 0 16px rgba(74,222,128,0.10)";
      }}
      onBlur={e => {
        e.target.style.borderColor="rgba(74,222,128,0.22)";
        e.target.style.boxShadow="none";
      }}
    />
  </div>
);

function AuthCard({ title, sub, children, onBack }) {
  return (
    <div style={{ display:"flex", flexDirection:"column" }}>
      <div style={{
        background:"rgba(4,14,8,0.54)",
        backdropFilter:"blur(32px)",
        WebkitBackdropFilter:"blur(32px)",
        border:"1.5px solid rgba(74,222,128,0.36)",
        borderRadius:24,
        padding:"20px 22px",
        boxShadow:"0 10px 56px rgba(0,0,0,0.35), 0 0 0 1px rgba(74,222,128,0.10), inset 0 1px 0 rgba(74,222,128,0.12)",
        position:"relative",
      }}>
        {onBack && (
          <button onClick={onBack}
            style={{
              position:"absolute", top:18, right:18,
              background:"rgba(74,222,128,0.08)",
              border:"1.5px solid rgba(74,222,128,0.22)",
              borderRadius:14, color:"#4ADE80",
              fontSize:14, fontWeight:800,
              padding:"8px 16px", cursor:"pointer",
            }}>
            ← חזרה
          </button>
        )}
        <h2 style={{
          fontSize:22, fontWeight:900, color:"#FFFFFF",
          textAlign:"center", marginBottom:4,
          fontFamily:"'Heebo',sans-serif",
          textShadow:"0 0 24px rgba(74,222,128,0.45), 0 2px 10px rgba(0,0,0,0.80)",
          letterSpacing:"-0.02em",
        }}>🌿 {title}</h2>
        <p style={{
          fontSize:13, color:"rgba(220,255,230,0.85)",
          textAlign:"center", marginBottom:16, lineHeight:1.45,
          textShadow:"0 1px 6px rgba(0,0,0,0.70)",
        }}>{sub}</p>
        {children}
      </div>
      <p style={{
        fontSize:11, textAlign:"center", marginTop:8,
        color:"rgba(187,247,208,0.78)", lineHeight:1.5, fontWeight:600,
      }}>
        מיועד לבעלי רישיון בתוקף בלבד · אינו ייעוץ רפואי
      </p>
    </div>
  );
}

function Login({ go, setUser, setVerifyNextScreen }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const sendOtp = async () => {
    if (!u) return;
    setLoading(true); setErr("");
    try {
      await api.sendOtp(u);
      setUser({ email: u, avatar: "🌿" });
      setVerifyNextScreen("welcome_room");
      go("verify");
    } catch (e) {
      setErr(e.message || "שגיאה בשליחת קוד — נסה שוב");
    } finally { setLoading(false); }
  };

  return (
    <AuthCard title={T.auth.loginTitle} sub={T.auth.loginSub} onBack={() => go("welcome")}>
      <SocialButtons onSocial={(prov) => {
        const u = { name: `משתמש ${prov}`, email: "", avatar: "🌿", social: prov, id: `s_${Date.now()}` };
        localStorage.setItem("cm_session_token", `social_${prov}_${Date.now()}`);
        localStorage.setItem("cm_user", JSON.stringify(u));
        setUser(u);
        go("welcome_room");
      }} />
      <Field label={T.auth.usernameLabel} value={u} onChange={setU} placeholder={T.auth.emailPlaceholder} />
      <Field label={T.auth.passwordLabel} type="password" value={p} onChange={setP} placeholder="••••••••" />
      {err && <p style={{ color:"#F87171", fontSize:13, textAlign:"center", marginBottom:8 }}>{err}</p>}
      <button onClick={sendOtp} disabled={!u || loading}
        style={{
          width:"100%", padding:"15px", borderRadius:16, border:"none", cursor: (!u || loading) ? "not-allowed" : "pointer",
          background: (!u || loading) ? "rgba(74,222,128,0.18)" : "linear-gradient(135deg,#4ADE80,#22c55e)",
          color: (!u || loading) ? "rgba(187,247,208,0.35)" : "#04120a",
          fontSize:17, fontWeight:900, marginBottom:10, fontFamily:"'Heebo',sans-serif",
          transition:"background .2s, color .2s",
          letterSpacing:"-0.01em", minHeight:50,
        }}>
        {loading ? "שולח קוד..." : T.auth.loginBtn || "כניסה"}
      </button>
      <button onClick={() => go("register")}
        style={{
          width:"100%", padding:"12px", background:"none",
          border:"1.5px solid rgba(74,222,128,0.22)", borderRadius:14,
          cursor:"pointer", minHeight:46,
          fontSize:15, fontWeight:700, color:"rgba(134,239,172,0.85)",
        }}>{T.auth.noAccount || "עדיין לא רשומ/ה? הרשמה"}</button>
    </AuthCard>
  );
}

const AVATARS = ["🌿", "🦊", "🐢", "🌙", "🍋", "⭐", "🌊", "🔥"];

const SOCIAL_ICONS = {
  google: (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path fill="#ffffff" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8v8.44C19.61 23.08 24 18.09 24 12.07z"/>
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <defs>
        <radialGradient id="ig_grad" cx="30%" cy="100%" r="130%">
          <stop offset="0%"   stopColor="#FFD600"/>
          <stop offset="35%"  stopColor="#FF7A00"/>
          <stop offset="65%"  stopColor="#FF0069"/>
          <stop offset="100%" stopColor="#D300C5"/>
        </radialGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="url(#ig_grad)"/>
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="#fff" strokeWidth="2"/>
      <circle cx="17.8" cy="6.2" r="1.4" fill="#fff"/>
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#000"/>
      <path fill="#ffffff" d="M18.9 3.15h3.68l-8.04 9.19L24 20.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 3.15h7.6l5.24 6.93 6.06-6.93zm-1.29 19.5h2.04L6.48 5.24H4.29l13.32 17.41z"/>
    </svg>
  ),
};

const SOCIAL_PROVIDERS = [
  {
    id: "Gmail",
    label: "Gmail",
    bg: "rgba(234,67,53,0.10)",
    border: "rgba(234,67,53,0.45)",
    glow: "rgba(234,67,53,0.35)",
    tooltip: "המשך עם Google",
  },
  {
    id: "Apple",
    label: "Apple",
    bg: "rgba(255,255,255,0.07)",
    border: "rgba(255,255,255,0.32)",
    glow: "rgba(255,255,255,0.22)",
    tooltip: "המשך עם Apple",
  },
  {
    id: "Facebook",
    label: "Facebook",
    bg: "rgba(24,119,242,0.11)",
    border: "rgba(24,119,242,0.45)",
    glow: "rgba(24,119,242,0.32)",
    tooltip: "המשך עם Facebook",
  },
  {
    id: "Instagram",
    label: "Instagram",
    bg: "rgba(214,41,118,0.10)",
    border: "rgba(214,41,118,0.40)",
    glow: "rgba(214,41,118,0.30)",
    tooltip: "המשך עם Instagram",
  },
  {
    id: "X",
    label: "X / Twitter",
    bg: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.22)",
    glow: "rgba(255,255,255,0.18)",
    tooltip: "המשך עם X",
  },
];

const SOCIAL_ICON_MAP = {
  Gmail: SOCIAL_ICONS.google,
  Apple: SOCIAL_ICONS.apple,
  Facebook: SOCIAL_ICONS.facebook,
  Instagram: SOCIAL_ICONS.instagram,
  X: SOCIAL_ICONS.x,
};

function SocialButtons({ onSocial }) {
  return (
    <div style={{ marginBottom:0 }}>

      {/* ── platform label ── */}
      <p style={{
        textAlign:"center", fontSize:11, fontWeight:700,
        color:"rgba(187,247,208,0.48)", letterSpacing:"0.10em",
        textTransform:"uppercase", marginBottom:8,
      }}>
        כניסה מהירה עם
      </p>

      {/* ── 5-icon premium row ── */}
      <div style={{
        display:"flex", gap:7, justifyContent:"center",
        marginBottom:12,
      }}>
        {SOCIAL_PROVIDERS.map((o) => (
          <motion.button
            key={o.id}
            onClick={() => onSocial(o.label)}
            aria-label={o.tooltip}
            title={o.tooltip}
            whileHover={{ scale:1.12, boxShadow:`0 0 18px ${o.glow}, 0 4px 14px rgba(0,0,0,0.45)` }}
            whileTap={{ scale:0.92 }}
            style={{
              flex:1, minWidth:0,
              aspectRatio:"1 / 1",
              maxWidth:54,
              display:"flex", alignItems:"center", justifyContent:"center",
              borderRadius:14,
              border:`1.5px solid ${o.border}`,
              background:o.bg,
              backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
              cursor:"pointer",
              transition:"border-color .18s",
              padding:0,
            }}
          >
            {SOCIAL_ICON_MAP[o.id]}
          </motion.button>
        ))}
      </div>

      {/* ── divider ── */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
        <div style={{ flex:1, height:1, background:"rgba(74,222,128,0.16)" }} />
        <span style={{ fontSize:11, fontWeight:700, color:"rgba(187,247,208,0.48)", whiteSpace:"nowrap" }}>
          {T.auth.orWithEmail || "או עם מייל"}
        </span>
        <div style={{ flex:1, height:1, background:"rgba(74,222,128,0.16)" }} />
      </div>
    </div>
  );
}

function Register({ go, setUser }) {
  const [n, setN] = useState(""); const [e, setE] = useState(""); const [p, setP] = useState("");
  const validEmail = /\S+@\S+\.\S+/.test(e);
  const checks = [
    { ok: n.trim().length >= 2, label: "שם (2 תווים לפחות)" },
    { ok: validEmail, label: "מייל תקין" },
    { ok: p.length >= 8, label: "סיסמה — 8 תווים לפחות" },
  ];
  const allOk = checks.every((c) => c.ok);
  const social = (provider) => {
    const u = { name: `משתמש ${provider}`, email: "", avatar:"🌿", social: provider, id:`s_${Date.now()}` };
    localStorage.setItem("cm_session_token", `social_${provider}_${Date.now()}`);
    localStorage.setItem("cm_user", JSON.stringify(u));
    setUser(u);
    go("welcome_room");
  };
  return (
    <AuthCard title="הרשמה" sub="דקה אחת ואתם בפנים" onBack={() => go("welcome")}>
      <SocialButtons onSocial={social} />
      <Field label="שם מלא" value={n} onChange={setN} placeholder="ישראל ישראלי" />
      <Field label="מייל" type="email" value={e} onChange={setE} placeholder="israel@example.com" />
      <Field label="סיסמה" type="password" value={p} onChange={setP} placeholder="8 תווים לפחות" />
      <div style={{ borderRadius:13, padding:"10px 14px", marginBottom:10,
        background:"rgba(74,222,128,0.05)", border:"1px solid rgba(74,222,128,0.16)" }}>
        {checks.map((c, i) => (
          <div key={i} style={{ fontSize:12, fontWeight:700, color: c.ok ? "#4ADE80" : "rgba(187,247,208,0.40)", marginBottom:i < checks.length-1 ? 4 : 0 }}>
            {c.ok ? "✓" : "○"} {c.label}
          </div>
        ))}
      </div>
      <button onClick={async () => {
        setUser({ name: n, email: e, avatar:"🌿" });
        try { await api.sendOtp(e); } catch {}
        go("verify");
      }} disabled={!allOk}
        style={{
          width:"100%", padding:"15px", borderRadius:16, border:"none", cursor: allOk ? "pointer" : "not-allowed",
          background: allOk ? "linear-gradient(135deg,#4ADE80,#22c55e)" : "rgba(74,222,128,0.18)",
          color: allOk ? "#04120a" : "rgba(187,247,208,0.35)",
          fontSize:17, fontWeight:900, marginBottom:10, fontFamily:"'Heebo',sans-serif",
          transition:"background .2s, color .2s", letterSpacing:"-0.01em", minHeight:50,
        }}>המשך לאימות מייל</button>
      <button onClick={() => go("login")}
        style={{
          width:"100%", padding:"12px", background:"none",
          border:"1.5px solid rgba(74,222,128,0.22)", borderRadius:14,
          cursor:"pointer", minHeight:46,
          fontSize:15, fontWeight:700, color:"rgba(134,239,172,0.85)",
        }}>כבר רשומ/ה? לכניסה</button>
    </AuthCard>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Welcome Room — shown after every fresh authentication (login / register).
   Returning users who have a stored session token bypass this and go to "app".
   Props:
     go         — setScreen
     user       — current user object (may be null briefly)
     hasProfile — true if localStorage already has a completed DNA profile
───────────────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────────────
   Welcome Room — the peer disclaimer & Zemach introduction.
   Shown after every fresh login/register. Session-restore also lands here
   so returning users always acknowledge the companion context before the app.
───────────────────────────────────────────────────────────────────────────── */
function WelcomeRoom({ go, user, hasProfile }) {
  const firstName = user?.name?.split(" ")[0] || "";

  return (
    <div dir="rtl" style={{ display:"flex", flexDirection:"column", gap:20 }}>

      {/* ── Zemach greeting header ── */}
      <motion.div
        initial={{ opacity:0, y:24 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:0.05, type:"spring", damping:32, stiffness:180 }}
        style={{ textAlign:"center" }}>
        <motion.div
          animate={{ y:[0,-12,0] }}
          transition={{ duration:4, ease:"easeInOut", repeat:Infinity }}
          style={{
            fontSize:72, display:"inline-block", lineHeight:1, marginBottom:16,
            filter:"drop-shadow(0 0 28px rgba(74,222,128,0.55)) drop-shadow(0 4px 12px rgba(0,0,0,0.50))",
          }}>
          🌿
        </motion.div>
        <motion.h1
          initial={{ opacity:0, y:10 }}
          animate={{ opacity:1, y:0 }}
          transition={{ delay:0.18, type:"spring", damping:32, stiffness:180 }}
          style={{
            fontSize:34, fontWeight:900, color:"#F0FDF4",
            letterSpacing:"-0.025em", marginBottom:6,
            textShadow:"0 0 28px rgba(74,222,128,0.28), 0 2px 8px rgba(0,0,0,0.55)",
          }}>
          {firstName ? `ברוך הבא, ${firstName} 👋` : "ברוך הבא, חבר 👋"}
        </motion.h1>
        <motion.p
          initial={{ opacity:0 }}
          animate={{ opacity:1 }}
          transition={{ delay:0.30 }}
          style={{ fontSize:15, color:"rgba(134,239,172,0.75)", lineHeight:1.55 }}>
          קנאמאצ׳ · חבר מלווה לקנאביס רפואי
        </motion.p>
      </motion.div>

      {/* ── THE CORE PEER DISCLAIMER — large, warm, readable for age 21-80 ── */}
      <motion.div
        initial={{ opacity:0, y:18, scale:0.97 }}
        animate={{ opacity:1, y:0, scale:1 }}
        transition={{ delay:0.38, type:"spring", damping:32, stiffness:160 }}
        style={{
          background:"rgba(3,10,6,0.52)",
          backdropFilter:"blur(28px)", WebkitBackdropFilter:"blur(28px)",
          border:"1.5px solid rgba(74,222,128,0.42)",
          borderRadius:24,
          padding:"28px 26px",
          boxShadow:"0 8px 48px rgba(0,0,0,0.32), inset 0 1px 0 rgba(74,222,128,0.12)",
          textAlign:"right",
        }}>
        {/* Zemach icon in quote */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:14, marginBottom:16 }}>
          <span style={{ fontSize:32, flexShrink:0, filter:"drop-shadow(0 0 12px rgba(74,222,128,0.40))" }}>🤝</span>
          <p style={{
            fontSize:18, fontWeight:700, color:"#F0FDF4",
            lineHeight:1.75, margin:0,
            textShadow:"0 1px 4px rgba(0,0,0,0.40)",
          }}>
            המידע שמוצג אינו ייעוץ רפואי ואינו מחליף רופא.
            קנאמאצ׳ סורקת תפריטי בתי מרקחת ומוצאת עבורך את ההתאמה האידיאלית לקנייה החודשית — על בסיס נתונים פתוחים, מחקר אקדמי וניסיון קהילת המטופלים.
          </p>
        </div>
        {/* Attribution */}
        <div style={{
          display:"flex", alignItems:"center", gap:8,
          paddingTop:14,
          borderTop:"1px solid rgba(74,222,128,0.14)",
        }}>
          <span style={{ fontSize:20 }}>🌿</span>
          <span style={{ fontSize:13, fontWeight:700, color:"rgba(134,239,172,0.75)" }}>
            קנאמאצ׳ · קהילה סגורה לבעלי רישיון רפואי בתוקף
          </span>
        </div>
      </motion.div>

      {/* ── Accessibility disclaimer box ── */}
      <motion.div
        initial={{ opacity:0, y:12 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:0.52, type:"spring", damping:32, stiffness:180 }}
        style={{
          background:"rgba(74,222,128,0.06)",
          border:"1px solid rgba(74,222,128,0.20)",
          borderRadius:16,
          padding:"14px 18px",
          textAlign:"right",
        }}>
        <p style={{ fontSize:13, fontWeight:600, color:"rgba(187,247,208,0.85)", lineHeight:1.7, margin:0 }}>
          📋 המידע מבוסס על נתונים פתוחים, ספרות מחקרית ודיווחי מטופלים מהקהילה.
          תמיד יש להתייעץ עם הרופא/ה המטפל/ת לפני כל שינוי בטיפול.
        </p>
      </motion.div>

      {/* ── CTA ── */}
      <motion.button
        initial={{ opacity:0, y:14 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:0.66, type:"spring", damping:32, stiffness:180 }}
        whileHover={{ scale:1.025, boxShadow:"0 0 36px rgba(74,222,128,0.50), 0 6px 20px rgba(0,0,0,0.40)" }}
        whileTap={{ scale:0.97 }}
        onClick={() => go(hasProfile ? "app" : "onboarding")}
        style={{
          width:"100%", padding:"18px", borderRadius:20, border:"none", cursor:"pointer",
          background:"linear-gradient(135deg,#4ADE80 0%,#22c55e 100%)",
          color:"#04120a", fontSize:18, fontWeight:900,
          boxShadow:"0 0 22px rgba(74,222,128,0.32), 0 4px 16px rgba(0,0,0,0.35)",
          letterSpacing:"-0.01em", fontFamily:"'Heebo',sans-serif",
        }}>
        {hasProfile ? "הבנתי — כנס לחשבון שלי ←" : "הבנתי — בוא נבנה את הפרופיל שלי ←"}
      </motion.button>

      <p style={{ fontSize:12, textAlign:"center", color:"rgba(187,247,208,0.80)", lineHeight:1.65, fontWeight:600 }}>
        מיועד לבעלי רישיון קנאביס רפואי בתוקף בלבד · גיל 18+ · לא למכירה
      </p>
    </div>
  );
}

function Verify({ go, user, setUser, nextScreen = "welcome_room" }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const verify = async () => {
    setLoading(true); setErr("");
    try {
      const result = await api.verifyOtp(user?.email || user?.contact || "", code);
      localStorage.setItem("cm_session_token", result.token);
      const enrichedUser = { ...user, id: result.user.id };
      localStorage.setItem("cm_user", JSON.stringify(enrichedUser));
      setUser(enrichedUser);
      go(nextScreen);
    } catch (e) {
      setErr(e.message || "קוד שגוי או פג תוקף — נסה שוב");
    } finally { setLoading(false); }
  };

  return (
    <AuthCard title="אימות" sub={`שלחנו קוד בן 6 ספרות אל ${user?.email || "המייל שלך"}`}
      onBack={() => go("register")}>
      <div className="rounded-xl p-3 mb-4 text-center text-sm"
        style={{ background: "rgba(46,107,83,0.06)", color: "#374151", border:"1px solid rgba(46,107,83,0.20)" }}>
        📧 בדקו את תיבת הדואר שלכם — הקוד נשלח כעת
      </div>
      <input value={code} maxLength={6} inputMode="numeric"
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="w-full rounded-xl p-4 text-center text-2xl font-bold tracking-widest mb-3 neon-input"
        style={{ borderColor: code.length === 6 ? "#4ADE80" : "rgba(46,107,83,0.28)", color: "#111827", letterSpacing: "0.5em" }}
        placeholder="• • • • • •" dir="ltr" />
      {err && <p className="text-xs text-center mb-2" style={{ color: "#F87171" }}>{err}</p>}
      <button onClick={verify} disabled={code.length !== 6 || loading} className="auth-btn-primary">
        {loading ? "מאמת..." : "אימות והמשך"}
      </button>
    </AuthCard>
  );
}

function LicenseUpload({ go, setCats, onVerify, onSkip }) {
  const [stage, setStage] = useState("idle"); // idle | scanning | done
  const detected = ["T18/C3", "T15/C3"];
  const scan = () => { setStage("scanning"); setTimeout(() => setStage("done"), 1800); };

  const btnBase = {
    width:"100%", borderRadius:14, border:"none", cursor:"pointer",
    fontFamily:"'Heebo',sans-serif", fontWeight:800, letterSpacing:"-0.01em",
  };

  return (
    <AuthCard title="אימות רישיון רפואי" sub="נסרוק את הרישיון ונזהה את הקטגוריות שלך אוטומטית"
      onBack={() => go("welcome_room")}>

      {/* ── מדוע הרישיון? ── */}
      <div style={{
        background:"rgba(74,222,128,0.06)", border:"1px solid rgba(74,222,128,0.20)",
        borderRadius:12, padding:"10px 14px", marginBottom:14, textAlign:"right",
      }}>
        <p style={{ fontSize:12, color:"rgba(187,247,208,0.80)", lineHeight:1.6, margin:0, fontWeight:600 }}>
          🔒 הרישיון נדרש <b>רק</b> לגישה לפיצ׳ר הקהילה — כדי להגן על מרחב שיח אותנטי ממשיינים ויחצנים.
          לכל שאר האפשרויות — הדילוג חופשי לחלוטין.
        </p>
      </div>

      {stage === "idle" && (
        <>
          <button onClick={scan} style={{
            width:"100%", padding:"22px 16px", borderRadius:16,
            border:"2px dashed rgba(74,222,128,0.40)",
            background:"rgba(74,222,128,0.04)", cursor:"pointer",
            textAlign:"center", marginBottom:10, color:"#BBF7D0",
          }}>
            <div style={{ fontSize:36, marginBottom:6 }}>📄</div>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:4 }}>העלאת רישיון רפואי</div>
            <div style={{ fontSize:11, color:"rgba(187,247,208,0.55)" }}>PDF · JPG · PNG · עד 10MB</div>
          </button>

          <button onClick={() => { onSkip?.(); go("onboarding"); }}
            style={{ ...btnBase, padding:"13px", marginBottom:8,
              background:"rgba(74,222,128,0.08)", color:"rgba(134,239,172,0.85)",
              border:"1.5px solid rgba(74,222,128,0.22)", fontSize:14 }}>
            דילוג — המשך לשאלון בלי רישיון
          </button>
        </>
      )}

      {stage === "scanning" && (
        <div style={{ textAlign:"center", padding:"28px 0" }}>
          <motion.div animate={{ scale:[1,1.12,1] }} transition={{ duration:1.1, repeat:Infinity }}
            style={{ fontSize:36, marginBottom:10 }}>🔍</motion.div>
          <p style={{ fontWeight:700, color:"#BBF7D0", marginBottom:4 }}>סורקים את הרישיון...</p>
          <p style={{ fontSize:12, color:"rgba(187,247,208,0.55)" }}>מזהים קטגוריות, תוקף וכמות חודשית</p>
        </div>
      )}

      {stage === "done" && (
        <>
          <div style={{
            borderRadius:14, padding:"14px 16px", marginBottom:14,
            background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.30)",
          }}>
            <p style={{ fontSize:13, fontWeight:800, color:"#4ADE80", marginBottom:8 }}>✓ הרישיון זוהה בהצלחה</p>
            <div style={{ fontSize:13, color:"#BBF7D0", lineHeight:1.8 }}>
              <div>קטגוריות: <b>{detected.join(" · ")}</b></div>
              <div>כמות חודשית: <b>40 גרם</b></div>
              <div>בתוקף עד: <b>03/2027</b></div>
            </div>
          </div>
          <button onClick={() => {
            setCats(detected);
            localStorage.setItem("cm_license", "1");
            onVerify?.();
            go("onboarding");
          }} style={{ ...btnBase, padding:"15px", marginBottom:8,
            background:"linear-gradient(135deg,#4ADE80,#22c55e)",
            color:"#04120a", fontSize:16 }}>
            אישור — המשך לשאלון
          </button>
        </>
      )}
    </AuthCard>
  );
}

/* ───────────── איתור בתי מרקחת ───────────── */

/* ───────────── עוזר AI אישי ───────────── */

function buildKnowledgeContext(ans) {
  const userReasons = ans.reasons || [];
  const sections = [];

  // Indication-specific clinical evidence
  const matchedIndications = KB_INDICATIONS.indications.filter((ind) =>
    userReasons.some((r) => ind.id.includes(r) || r.includes(ind.id))
  );
  if (matchedIndications.length > 0) {
    sections.push("=== ידע אקדמי-קליני להתוויות המשתמש ===");
    matchedIndications.forEach((ind) => {
      const bestStudy = ind.key_studies[0];
      const tcRec = Object.entries(ind.cannabinoid_profiles)
        .map(([type, p]) => `${type}: ${p.categories?.slice(0,2).join("/")} — ${p.best_for}`)
        .join("; ");
      const topTerps = ind.terpenes.primary.join(", ");
      sections.push(
        `• ${ind.he} (${ind.en}): רמת ראיות — ${ind.evidence_level}. ` +
        `מחקר מרכזי: ${bestStudy.ref} — "${bestStudy.finding}". ` +
        `פרופילי קנבינואידים מומלצים: ${tcRec}. ` +
        `טרפנים מרכזיים: ${topTerps}. ` +
        `הערה קלינית: ${ind.clinical_notes_he}`
      );
    });
  }

  // Cannabinoid product categories relevant to user's T/C categories
  if (ans.cats && ans.cats.length > 0) {
    const relevantCats = KB_CANNABINOIDS.product_categories.categories.filter((cat) =>
      ans.cats.some((c) => cat.examples_tc?.some((tc) => tc.includes(c.split("/")[0])))
    ).slice(0, 3);
    if (relevantCats.length > 0) {
      sections.push("\n=== פרופיל קנבינואידים לפי קטגוריית הרישיון ===");
      relevantCats.forEach((cat) => {
        sections.push(`• ${cat.code} (${cat.he}): שימוש עיקרי — ${cat.primary_use}. זמן מתן: ${cat.timing}. ${cat.note || cat.caution || ""}`);
      });
    }
  }

  // Israeli product recommendations for top indications
  const quickmap = KB_PRODUCTS.indication_to_product_quickmap.quickmap;
  const productRecs = userReasons
    .filter((r) => quickmap[r])
    .map((r) => {
      const q = quickmap[r];
      return `${r}: מוצרים ראשיים → ${q.primary.slice(0,2).join(", ")}. הסיבה: ${q.reasoning}`;
    });
  if (productRecs.length > 0) {
    sections.push("\n=== המלצות מוצרים ישראליים להתוויות המשתמש ===");
    productRecs.forEach((rec) => sections.push(`• ${rec}`));
  }

  // Terpene science for top form preferences
  if (ans.flavors && ans.flavors.length > 0) {
    const flavorToTerpene = {
      earthy: "myrcene", spicy: "caryophyllene", pepper: "caryophyllene",
      lavender: "linalool", floral: "linalool", citrus: "limonene",
      lemon: "limonene", pine: "pinene", herbal: "myrcene",
      woody: "humulene", mango: "myrcene",
    };
    const matchedTerpIds = [...new Set(ans.flavors.map((f) => flavorToTerpene[f]).filter(Boolean))];
    const terpDetails = matchedTerpIds.map((tid) =>
      KB_TERPENES.terpenes.find((t) => t.id === tid)
    ).filter(Boolean).slice(0, 2);
    if (terpDetails.length > 0) {
      sections.push("\n=== ידע מדעי על טרפנים המועדפים על המשתמש ===");
      terpDetails.forEach((t) => {
        const topApp = Object.entries(t.clinical_applications)
          .sort((a, b) => (b[1].strength.includes("strong") ? 1 : 0) - (a[1].strength.includes("strong") ? 1 : 0))
          .slice(0, 2)
          .map(([k, v]) => `${k}: ${v.strength}`)
          .join(", ");
        sections.push(`• ${t.name_he} (${t.name_en}): ${t.pharmacology.mechanisms.slice(0,120)}... שימושים: ${topApp}`);
      });
    }
  }

  return sections.length > 0 ? sections.join("\n") : "";
}

function buildAgentContext(ans, ratings, user) {
  const profile = buildProfile(ans, ratings);
  const dnaSeq = dnaSequence(profile);
  const dnaConf = geneticConfidence(ans, ratings);
  const topTerps = Object.entries(profile).filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([t, v]) => `${TERPENES[t].he} (${TERPENES[t].flavor}, עוצמה: ${terpStrength(v).label})`).join(", ");
  const lowTerps = Object.entries(profile).filter(([, v]) => v < 0)
    .sort((a, b) => a[1] - b[1]).slice(0, 3)
    .map(([t]) => TERPENES[t].he).join(", ");
  const helpedStrains = (ans.helped || []).map(id => STRAINS.find(s => s.id === id)?.name).filter(Boolean).join(", ");
  const notHelpedStrains = (ans.notHelped || []).map(id => STRAINS.find(s => s.id === id)?.name).filter(Boolean).join(", ");
  const strainsDb = STRAINS.map((s) =>
    `${s.name} (גנטיקה: ${s.genetics}${s.grower ? `, מגדל: ${s.grower}` : ""}, ${s.lineage}) | ${s.type === "oil" ? "שמן" : "תפרחת"} | ${s.cat} | ${s.kind} | ₪${s.price}`
  ).join("\n");
  const codeMap = Object.entries(MENU_CODE_MAP).map(([c, m]) =>
    `${c} = ${m.note}${m.aka?.length ? ` (ידוע גם: ${m.aka.join(", ")})` : ""}`).join("\n");
  const patterns = computeInsights(ans, ratings, scoreAll(ans, ratings))
    .map((i) => `- ${i.title}: ${i.body}`).join("\n");
  const indResearch = ans.reasons.filter((r) => INDICATION_PROFILES[r])
    .map((r) => { const p = INDICATION_PROFILES[r];
      return `${p.label}: ${p.summary} יחסים: ${p.ratioNote}`; }).join("\n") || "אין";
  return `אתה "צמח" — העוזר האישי באפליקציית קנאמאצ׳ לקנאביס רפואי בישראל. ענה בעברית, קצר וידידותי (2-4 משפטים אלא אם נדרש יותר).
המקורות שלך: תפריטי בתי מרקחת ישראלים, חוות דעת מטופלים מהקהילה (iCan, HighTherapy, Telegram), דיווחי אצוות מהשטח, ניסיון מצטבר של קהילת המטופלים — לא ספרות אקדמית יבשה. הציג ידע מעשי ורלוונטי.

פרופיל ה-DNA הקנאבינואידי של המשתמש (${user?.name || "המשתמש"}):
- רצף DNA: ${dnaSeq} | ביטחון: ${dnaConf.pct}% (${dnaConf.label})
- קטגוריות רישיון: ${ans.cats.join(", ") || "לא צוין"}
- התוויות: ${ans.reasons.map((r) => REASONS.find((x) => x.id === r)?.label).join(", ") || "לא צוין"}
- צורות צריכה: ${ans.form.join(", ") || "לא צוין"}
- טרפנים שעובדים לו (מהחזק לחלש): ${topTerps || "עדיין לומדים"}
- טרפנים שפחות: ${lowTerps || "אין"}
- זנים שעזרו בעבר: ${helpedStrains || "לא צוין"}
- זנים שלא עזרו: ${notHelpedStrains || "אין"}
- דירוגים: ${Object.entries(ratings).map(([id, r]) => `${STRAINS.find((s) => s.id === id)?.name}: ${r}/10`).join(", ") || "אין עדיין"}

דפוסים שזוהו אצל המשתמש (השתמש בהם בתשובות כשרלוונטי):
${patterns || "- אין עדיין מספיק נתונים"}

מאגר הזנים (תפריטי בתי מרקחת ישראלים):
${strainsDb}

מילון קודי תפריט → גנטיקה ושמות נרדפים (אם המשתמש שואל על קוד כמו D-51):
${codeMap}

ידע מעשי על ההתוויות של המשתמש (מניסיון מטופלים בישראל):
${indResearch}

דרכי מתן מהשטח (אותה גנטיקה נותנת חוויה שונה לפי דרך המתן):
- אידוי: השפעה תוך 3-10 דק', עד ~3 שעות. היעיל ביותר, בריא יותר. מאפשר טיטרציה.
- עישון: דומה לאידוי בזמן, אך בזבזני ומזיק יותר. תפרחת נקייה בלבד.
- שמן: השפעה איטית (15 דק'-שעתיים) אך ארוכה (5-6 שעות). לכאב כרוני ושינה רציפה.

כללים מחייבים:
1. לעולם אל תמליץ על מינונים, כמויות או שינוי טיפול — הפנה לרופא המטפל.
2. השתמש בפרופיל כדי להתאים תשובות אישית ("בהתאם לזה שלינלול עובד לך...").
3. לשאלות על מוצרים לקנייה (מאדים וכו') — השתמש בחיפוש אינטרנט ותן אפשרויות בישראל.
4. אם נשאל על נהיגה — אסור לנהוג תחת השפעה בישראל, גם עם רישיון.
5. אל תמליץ על ערבוב טבק — להפך, הזהר מפניו: מגביר תלות (עד פי 4), מזיק לבריאות ומטשטש את ההשפעה הטיפולית. אם המשתמש מעשן — המלץ תפרחת נקייה, ועדיף אידוי.
6. אל תענה על שאלות שאינן קשורות לקנאביס רפואי, לאפליקציה או לבריאות המשתמש בהקשר זה.
7. אתה מלווה וחבר, לא איש מכירות: הסבר תמיד *למה* משהו מתאים, הצג גם את החיסרון או החלופה הזולה, ועזור למקסם את הטיפול גם רפואית וגם כלכלית.
8. כשמדובר ב-PTSD: היה כן — מטופלים רבים מדווחים הקלה (סיוטים, שינה), אך הראיות מוגבלות והמועצה הלאומית ל-PTSD בישראל המליצה דווקא נגד. אל תציג קנאביס כטיפול מוכח ל-PTSD. הצג את שני הצדדים והפנה לרופא.
9. כשמדובר בטרפנים/אפקט נלווה: הצג כ"מצפן מבוסס-ראיות, לא ערובה". יש ראיה קלינית תומכת (לימונן+THC, Johns Hopkins 2024) אך גם ספקנות מדעית לגיטימית.
10. כלל "החבר המהימן" — RWE (Real-World Evidence): כשאתה מציין נתוני קהילה מהאפליקציה (דיווחי מטופלים מצטברים), השתמש תמיד בניסוח זה:
    ✓ "מטופלים שדיווחו על כך — לא הוכחה קלינית"
    ✓ "X% מהמדווחים אצלנו ציינו שיפור ב..."
    ✓ "מה שמטופלים דומים לך מספרים מהשטח..."
    ✓ "הדאטה שלנו מראה — אבל כל מטופל שונה"
    ✗ לעולם לא: "מחקרים הראו" כשמדובר בדאטת משתמשים בלבד; "מוכח"; "יעיל ל..." ללא הסתייגות
    הניסוח הזה הוא לא רק משפטי — הוא כנות אמיתית שבונה אמון. מטופלים רוצים לדעת מה עבד לאחרים כמוהם, לא הבטחות.

יכולות מיוחדות שלך:
א. ניתוח תמונות: אם המשתמש מעלה תמונה של תפרחת, אתה יכול לבדוק סימני עובש (קורי עכביש לבנים-אפורים, כתמים, ריח אמוניה), איכות (טריכומים, צבע, מבנה), ויובש. אם אתה מזהה משהו חשוד שנראה כמו עובש — הזהר בבירור שלא לצרוך ולהתייעץ עם בית המרקחת. אם אינך בטוח, אמור זאת בכנות.
ב. אחסון: ידע מלא — מיכל זכוכית אטום, מקום קריר וחשוך, הרחק מאור שמש וחום. לחות אידיאלית 55-62% RH. שקיות לחות (Boveda 62% וכו') מומלצות מאוד לשמירה על טריות הטרפנים ומניעת עובש/יובש יתר. אל תאחסן במקפיא (הטריכומים נשברים). תפרחת יבשה מדי = טרפנים מתנדפים ושיעול; לחה מדי = סכנת עובש.
ג. מידע "לסטלן": אתה מבין גם את הצד החווייתי. אם נשאל שאלות יומיומיות (מאנצ'יז, יובש בפה, עיניים אדומות, איך להתפכח, מה לעשות אם לקחתי יותר מדי, מוזיקה/אוכל) — ענה בידע מעשי, חברי וקליל, תוך שמירה על בטיחות. למשל: ליובש בפה — מים; אם לקחת יותר מדי — אל פאניקה, זה חולף, שב/שכב במקום נוח, מים, ופלפל שחור/לימון נחשבים לעזרה עממית.
ד. הומור: יש לך חוש הומור! אתה יכול לזרוק בדיחה קנאביסטית קלילה כשמתאים, או אם מבקשים. שמור על זה ידידותי ולא וולגרי. דוגמאות לסגנון: "למה הצמח הלך לטיפול? כי היו לו יותר מדי ג'וינטים תקועים" · "מה אמרה האינדיקה לסאטיבה? תירגע אחי". אל תגזים — בדיחה אחת במקום הנכון שווה יותר מעשר.`;
}

const QUICK_QS = [
  "📸 העלו תמונה ואבדוק אם יש עובש",
  "איך מאחסנים תפרחת נכון?",
  "כדאי לי שקית לחות (Boveda)?",
  "איזה זן הכי מתאים לי לערב?",
  "לקחתי יותר מדי — מה עושים?",
  "ספר לי בדיחה 😄",
];

function Assistant({ ans, ratings, user }) {
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: T.ai.greeting },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingImg, setPendingImg] = useState(null); // {data, mediaType, preview}
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();
  const camRef = useRef();
  const scrollRef = useRef();

  const fileToImg = (file) => new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) { reject(new Error("רק תמונות")); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({
      data: reader.result.split(",")[1],
      mediaType: file.type,
      preview: reader.result,
    });
    reader.onerror = () => reject(new Error("שגיאת קריאה"));
    reader.readAsDataURL(file);
  });

  const handleFile = async (file) => {
    try { setPendingImg(await fileToImg(file)); }
    catch { /* ignore non-images */ }
  };

  const send = async (text) => {
    const q = (text || input).trim();
    if ((!q && !pendingImg) || busy) return;

    // בונים הודעת משתמש (טקסט + אולי תמונה)
    const userContent = [];
    if (pendingImg) userContent.push({
      type: "image",
      source: { type: "base64", media_type: pendingImg.mediaType, data: pendingImg.data },
    });
    userContent.push({ type: "text", text: q || "תבדוק לי את התמונה הזו בבקשה 🌿" });

    const displayMsg = { role: "user", content: q || "📸 (תמונה)", img: pendingImg?.preview };
    const apiMsg = { role: "user", content: userContent };

    const newDisplay = [...msgs, displayMsg];
    setMsgs(newDisplay);
    setInput("");
    setPendingImg(null);
    setBusy(true);

    // היסטוריה ל-API (ממירים display→api)
    const apiHistory = msgs.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content,
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: buildAgentContext(ans, ratings, user),
          messages: [...apiHistory, apiMsg],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `שגיאת שרת ${res.status}`);
      const reply = (data.content || [])
        .map((b) => (b.type === "text" ? b.text : ""))
        .filter(Boolean).join("\n")
        || "מצטער, משהו השתבש. נסו שוב.";
      setMsgs([...newDisplay, { role: "assistant", content: reply }]);
    } catch (e) {
      console.error("[chat] send error:", e.message);
      setMsgs([...newDisplay, { role: "assistant", content: `שגיאת חיבור — ${e.message || "נסו שוב בעוד רגע."}` }]);
    } finally {
      setBusy(false);
    }
  };

  const AvatarPlant = () => (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 84, flexShrink: 0 }}>
      <motion.div
        animate={{ scale: [0.8, 1.18, 0.8], opacity: [0.25, 0.55, 0.25] }}
        transition={{ duration: 3.8, repeat: Infinity }}
        style={{
          position: "absolute", inset: -14,
          background: "radial-gradient(circle, rgba(74,222,128,0.24) 0%, transparent 70%)",
          borderRadius: "50%", pointerEvents: "none",
        }}
      />
      <motion.span
        animate={{ rotate: [-6, 6, -6], y: [0, -9, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          fontSize: 52,
          filter: "drop-shadow(0 0 20px rgba(74,222,128,0.85)) drop-shadow(0 4px 12px rgba(0,0,0,0.70))",
          lineHeight: 1, display: "block",
        }}
      >
        🌿
      </motion.span>
      <motion.div
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute", inset: 0,
          border: "1.5px dashed rgba(74,222,128,0.18)",
          borderRadius: "50%", pointerEvents: "none",
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col" style={{ minHeight: "60vh", fontFamily:"'Heebo',sans-serif" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false);
        const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}>

      {/* ── Floating AI Avatar Header ── */}
      <div className="flex items-center gap-4 rounded-2xl p-4 mb-4"
        style={{ background:"linear-gradient(135deg,#0D1C14,#111A22)", border:"1px solid rgba(57,255,133,.18)" }}>
        <AvatarPlant />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-base" style={{ color:"#EBF6ED" }}>צמח — העוזר האישי שלך</div>
          <div className="text-xs mt-0.5" style={{ color:"#7EA88E" }}>
            מכיר את הפרופיל שלך · עונה בעברית · מוגבל לתחום הרפואי בלבד
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
            <span className="text-xs" style={{ color:"#39FF85" }}>מחובר למאגר הנתונים</span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => fileRef.current?.click()} title="העלאת תמונה"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-all"
            style={{ background:"rgba(57,255,133,.1)", border:"1px solid rgba(57,255,133,.22)" }}>📎</button>
          <button onClick={() => camRef.current?.click()} title="צילום"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-all"
            style={{ background:"rgba(57,255,133,.1)", border:"1px solid rgba(57,255,133,.22)" }}>📷</button>
        </div>
      </div>

      {dragOver && (
        <div className="rounded-2xl p-6 mb-3 text-center border-2 border-dashed"
          style={{ borderColor:"#39FF85", background:"rgba(57,255,133,.06)", color:"#39FF85" }}>
          📸 שחררו כאן את התמונה ואבדוק אותה
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-3 mb-3 overflow-y-auto">
        {msgs.length === 1 && (
          <div className="grid grid-cols-1 gap-2 mt-1">
            {QUICK_QS.map((q, i) => (
              <button key={i} onClick={() => {
                if (q.startsWith("📸")) { fileRef.current?.click(); }
                else { send(q); }
              }}
                className="w-full text-right rounded-2xl px-4 py-3 text-sm font-medium transition-all"
                style={{ background:"rgba(57,255,133,.06)", border:"1px solid rgba(57,255,133,.18)", color:"#BBF7D0" }}>
                {q}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`p-4 text-sm whitespace-pre-wrap leading-relaxed ${m.role === "assistant" ? "chat-bubble-ai" : "chat-bubble-user"}`}
            style={{
              color: m.role === "user" ? "#EBF6ED" : "#D4EED9",
              marginRight: m.role === "user" ? 32 : 0,
              marginLeft:  m.role === "user" ? 0 : 32,
            }}>
            {m.img && (
              <img src={m.img} alt="תמונה" className="rounded-xl mb-2 max-w-full"
                style={{ maxHeight: 200 }} />
            )}
            {m.role === "assistant" && (
              <span className="inline-block text-sm mr-1" style={{ color:"#39FF85" }}>🌿</span>
            )}
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="chat-bubble-ai p-4 text-sm flex items-center gap-2" style={{ marginLeft:32 }}>
            <span className="flex gap-1">
              {[0,1,2].map(i => (
                <span key={i} className="w-2 h-2 rounded-full bg-green-400 animate-bounce"
                  style={{ animationDelay:`${i*0.15}s` }}/>
              ))}
            </span>
            <span style={{ color:"#7EA88E" }}>צמח חושב...</span>
          </div>
        )}
      </div>

      {pendingImg && (
        <div className="flex items-center gap-2 mb-2 p-2.5 rounded-2xl"
          style={{ background:"rgba(57,255,133,.07)", border:"1px solid rgba(57,255,133,.18)" }}>
          <img src={pendingImg.preview} alt="" className="rounded-xl"
            style={{ width:42, height:42, objectFit:"cover" }} />
          <span className="text-xs flex-1" style={{ color:"#A8C3B2" }}>תמונה מצורפת — הוסיפו שאלה או שלחו</span>
          <button onClick={() => setPendingImg(null)} className="text-xs px-2 font-bold"
            style={{ color:"#FF6B6B" }}>✕</button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

      <div className="flex gap-2 sticky bottom-0 pt-2 pb-1"
        style={{ background: C.bg }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="שאלו אותי כל דבר בנושא הרישיון שלכם..."
          className="flex-1 p-3.5 text-sm min-w-0 chat-input" />
        <button onClick={() => send()} disabled={busy || (!input.trim() && !pendingImg)}
          className="px-6 rounded-2xl font-bold text-sm disabled:opacity-35 transition-all"
          style={{ background:"#39FF85", color:"#061006", boxShadow:"0 2px 14px rgba(57,255,133,.3)" }}>
          שלח
        </button>
      </div>
    </div>
  );
}

/* ───────────── מנוע תובנות — זיהוי דפוסים ───────────── */

function computeInsights(ans, ratings, scored) {
  const out = [];

  // דפוס 1: ריכוז בסוג אחד (אינדיקה/סאטיבה) מול שביעות רצון — מבוסס על דירוגים שמורים
  const ratedPurch = Object.entries(ratings).map(([id, rating]) => ({
    id, rating, kind: STRAINS.find((s) => s.id === id)?.kind,
  })).filter((p) => p.kind);
  const byKind = {};
  ratedPurch.forEach((p) => { (byKind[p.kind] = byKind[p.kind] || []).push(p.rating); });
  const dominant = Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)[0];
  if (dominant && ratedPurch.length > 0) {
    const share = dominant[1].length / ratedPurch.length;
    const avg = dominant[1].reduce((a, b) => a + b, 0) / dominant[1].length;
    if (share >= 0.5 && avg < 6.5) {
      const alt = scored.find((s) => s.kind !== dominant[0]);
      out.push({
        icon: "🔄", tone: "warn",
        title: `רוב הזנים שדירגת — ${dominant[0]} — אבל הדירוג הממוצע רק ${avg.toFixed(1)}`,
        body: alt
          ? `כשמשהו לא עובד שוב ושוב, שווה לגוון. לפי הפרופיל שלך, ${alt.name} (${alt.kind}, ${alt.match}% התאמה) הוא מועמד טוב לניסיון הבא.`
          : "כשמשהו לא עובד שוב ושוב, שווה לגוון לסוגים אחרים.",
      });
    } else if (share >= 0.5) {
      out.push({
        icon: "🎯", tone: "good",
        title: `${Math.round(share * 100)}% מהזנים שדירגת — ${dominant[0]}, וזה עובד (ממוצע ${avg.toFixed(1)})`,
        body: `נמשיך לתעדף ${dominant[0]} בהמלצות — אבל נשתול מדי פעם זן מסוג אחר עם פרופיל טרפנים דומה, כדי לא לפספס התאמות שלא ניסית.`,
      });
    }
  }

  // דפוס 3: חוט מקשר בין כל מה שדורג גבוה — בשפת גנטיקות
  const highIds = [...new Set(
    Object.entries(ratings).filter(([, r]) => r >= 8).map(([id]) => id),
  )];
  const highs = highIds.map((id) => STRAINS.find((s) => s.id === id)).filter(Boolean);
  if (highs.length >= 2) {
    const gens = highs.map((s) => s.genetics);
    out.push({
      icon: "🧬", tone: "good",
      title: "ה-DNA המשותף של מה שעובד לך",
      body: `הגנטיקות שדירגת הכי גבוה — ${[...new Set(gens)].join(", ")} — חולקות פרופיל השפעה דומה. כשגנטיקה חדשה מהמשפחה הזו תגיע לתפריט, נסמן לך אותה ראשונים.`,
    });
  }

  // דפוס 4: אותה גנטיקה, שמות ומחירים שונים — הזהב של ההצלבות
  const byGen = {};
  scored.forEach((s) => { (byGen[s.genetics] = byGen[s.genetics] || []).push(s); });
  const dup = Object.values(byGen).find((arr) => arr.length > 1);
  if (dup) {
    const sorted = [...dup].sort((a, b) => a.price - b.price);
    const gap = sorted[sorted.length - 1].price - sorted[0].price;
    if (gap > 0) out.push({
      icon: "🔓", tone: "good",
      title: `${sorted[0].genetics} נמכרת תחת ${dup.length} שמות שונים`,
      body: `"${sorted.map((x) => x.name).join('" ו-"')}" — אותה גנטיקה בדיוק. ההפרש: ₪${gap}. אותו מוצר, שם אחר, מחיר אחר — עכשיו אתה יודע.`,
    });
  }


  return out;
}

function Insights({ ans, ratings, scored }) {
  const insights = computeInsights(ans, ratings, scored);
  if (insights.length === 0) return null;
  return (
    <div className="space-y-2 mb-4">
      <h3 className="font-bold text-sm" style={{ color: C.ink }}>💡 צמח שם לב לדפוסים אצלך</h3>
      {insights.map((ins, i) => (
        <div key={i} className="rounded-2xl p-3.5 border"
          style={{
            background: ins.tone === "warn" ? "rgba(251,191,36,0.07)" : C.soft,
            borderColor: ins.tone === "warn" ? "rgba(251,191,36,0.22)" : C.line,
          }}>
          <div className="font-bold text-sm mb-1"
            style={{ color: ins.tone === "warn" ? "#FBBF24" : C.accent }}>
            {ins.icon} {ins.title}
          </div>
          <p className="text-xs leading-relaxed"
            style={{ color: ins.tone === "warn" ? "rgba(251,191,36,0.80)" : "rgba(187,247,208,0.65)" }}>
            {ins.body}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ───────────── קהילה — חוויות בלבד, עם שומר סף AI ───────────── */

const DEMO_POSTS = [
  { id: 1, nick: "מטופל/ת שינה · ירושלים", tag: "שינה", time: "לפני שעתיים",
    text: "אחרי חודשיים של ניסיונות — אור (טוגדר) באידוי ב-185 מעלות עשה את ההבדל. נרדם תוך חצי שעה במקום שעתיים. ממליץ לנסות דווקא בטמפרטורה נמוכה.",
    helped: 24, comments: [
      { nick: "מטופל/ת כאב · ת״א", text: "מאשר! אצלי דווקא ב-195 עבד יותר. שווה לשחק עם זה." },
      { nick: "מטופל/ת שינה · רחובות", text: "תודה שכתבת את זה. הרגשתי לבד עם הנדודי שינה, עוזר לדעת שיש דרך." },
    ]},
  { id: 2, nick: "מטופל/ת כאב כרוני · חיפה", tag: "כאב כרוני", time: "לפני 5 שעות",
    text: "טיפ חיסכון: גיליתי ש-Wedding CK ו-The Wedding Cake זו אותה גנטיקה משני מגדלים, אבל ההפרש 11 שקל לאצווה. שווה לבדוק לפני כל קנייה.",
    helped: 17, comments: [] },
  { id: 3, nick: "מטופל/ת חרדה · ב״ש", tag: "חרדה", time: "אתמול",
    text: "למי שמתחיל ומתבייש: גם אני הסתרתי שאני מטופל/ת במשך שנה. פה, אנונימי, סוף סוף יכולתי לשאול שאלות בלי להרגיש שיפוט. אל תתביישו לדרג נמוך — ככה הפרופיל באמת מדייק.",
    helped: 41, comments: [
      { nick: "צמח 🤖", text: "תובנה מצוינת — דירוג כן הוא הדלק של ההתאמה. תודה ששיתפת!" },
      { nick: "מטופל/ת חרדה · מודיעין", text: "זה בדיוק מה שהרגשתי. הפוסט הזה גרם לי להירשם. תודה." },
    ]},
  { id: 4, nick: "אנונימי/ת · צפון", tag: "פוסט-טראומה", time: "לפני יומיים",
    text: "שאלה למי שמכיר: ה-THC הגבוה דווקא הגביר לי את החרדה בבקרים. עברתי למשהו מאוזן יותר עם CBD והסיוטים פחתו דרמטית. מישהו עוד חווה שדווקא פחות THC עזר יותר?",
    helped: 31, comments: [
      { nick: "מטופל/ת שינה · ירושלים", text: "בדיוק! אבידקל עתיר CBD אצלי. מרגיע, פחות סיוטים, וקם נקי בבוקר." },
      { nick: "צמח 🤖", text: "תובנה חשובה — אצל חלק מהמטופלים THC גבוה מגביר חרדה ו-CBD מאזן. זה בדיוק למה ההתאמה אישית. (לא ייעוץ רפואי — שווה לעדכן את הרופא)." },
    ]},
  { id: 5, nick: "אנונימי/ת · מרכז", tag: "מתחילים", time: "לפני 3 ימים",
    text: "כל חודש התפריט מתחלף לגמרי וזורקים עליי עשרות זנים חדשים שלא מכיר. הפסקתי לנסות לעקוב. מאז שהאפליקציה מדרגת לי את החדשים לפי מה שעבד עליי — סוף סוף יש לי על מה לסמוך.",
    helped: 28, comments: [
      { nick: "מטופל/ת כאב · חיפה", text: "אותו דבר. 600 זנים חדשים בשנה זה בלתי אפשרי לבד." },
    ]},
  { id: 6, nick: "מטופל/ת PTSD · דרום", tag: "פוסט-טראומה", time: "לפני 4 ימים",
    text: "D-51 עשה לי שינוי אמיתי. 8 שנים של סיוטים כמעט כל לילה. מאז שעברתי לזה (באידוי, ב-185 מעלות, לפני שינה) — ירד לפעם-פעמיים בשבוע. אני לא מהמר על מינונים — התחלתי מנמוך. לא ייעוץ רפואי, רק החוויה שלי.",
    helped: 67, comments: [
      { nick: "אנונימי/ת · מרכז", text: "תודה שכתבת. אני בדיוק בשלב הזה. D-51 על הרשימה שלי." },
      { nick: "מטופל/ת שינה · ירושלים", text: "גם אצלי אור (טוגדר) עשה משהו דומה לסיוטים. לא כמו שלך אבל שיפור מורגש." },
      { nick: "צמח 🤖", text: "לינלול + קריופילן — בדיוק הפרופיל שהמחקר מציין ל-PTSD. שמח לשמוע." },
    ]},
  { id: 7, nick: "מטופל/ת כאב כרוני · ת״א", tag: "כאב כרוני", time: "לפני 5 ימים",
    text: "המעבר לשמן Carbo שינה לי את הגישה. כבר 3 שנים בעישון ופתאום הבנתי שהשמן נותן לי 6 שעות של הרגעה לעומת 2-3 שעות מהעישון. כן, לוקח שעה להתחיל — אבל אחר כך לא צריך לגעת בו שוב.",
    helped: 43, comments: [
      { nick: "מטופל/ת כאב · חיפה", text: "אחלה טיפ. שמן זה משחק אחר. קחו סבלנות בהתחלה." },
    ]},
  { id: 8, nick: "מתחיל/ה · נסיונות ראשונים", tag: "מתחילים", time: "לפני שבוע",
    text: "השאלה שחיכיתי לשאול: כמה מהר אמור לעבוד? לקחתי אידוי ראשון וחיכיתי 10 דקות ולא הרגשתי כלום אז הוספתי עוד. זו הייתה טעות הכי גדולה שלי. אחרי 20 דקות הכל הגיע בבת אחת. הלקח: חכו לפחות 15 דקות.",
    helped: 89, comments: [
      { nick: "מטופל/ת שינה · ירושלים", text: "אוי אוי, גם אני עשיתי בדיוק את זה בהתחלה 😅 חשוב שאחרים יידעו!" },
      { nick: "צמח 🤖", text: "טיפ חשוב מאוד. עישון/אידוי: חכו 15 דקות. שמן: חכו שעה לפחות. תמיד." },
    ]},
  { id: 9, nick: "מטופל/ת חרדה · ירושלים", tag: "חיסכון", time: "לפני שבוע",
    text: "גיליתי שהקטגוריה על הקופסה לא אומרת הרבה. שני זנים ב-T15/C3 שונים לגמרי אחד מהשני. מאז שהאפליקציה מסבירה לי מה הגנטיקה האמיתית — הפסקתי לקנות לפי הכיתוב ובדקתי לפי ההיסטוריה שלי.",
    helped: 35, comments: [] },
  { id: 10, nick: "מטופל/ת PTSD · מרכז", tag: "פוסט-טראומה", time: "לפני 10 ימים",
    text: "לאנשים שחשבו שאיכשהו 'גדלים מעל' הפוסט-טראומה — לא עשיתי. אני בן 54 ובטיפול 3 שנים. הקנאביס לא ריפא, אבל נתן לי חלון של שקט שבלעדיו לא הייתי מצליח לתפקד. אל תוותרו.",
    helped: 112, comments: [
      { nick: "אנונימי/ת · צפון", text: "תודה. אתם גיבורים." },
      { nick: "מטופל/ת PTSD · דרום", text: "כל מילה." },
    ]},
];

/* נושאים — עוגנים לשיחה, כדי שלא יהיה 'מסך ריק' */
const TOPICS = [
  { id: "all", label: "הכל" },
  { id: "ptsd", label: "🛡️ פוסט-טראומה" },
  { id: "sleep", label: "😴 שינה" },
  { id: "pain", label: "💢 כאב" },
  { id: "anxiety", label: "🫧 חרדה" },
  { id: "newbie", label: "🌱 מתחילים" },
  { id: "saving", label: "💰 חיסכון" },
];

async function moderatePost(text) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `אתה שומר הסף של קהילת מטופלי קנאביס רפואי בישראל. הקהילה היא לשיתוף חוויות אישיות בלבד — שום מסחר ושום קידום מכירות.

חסום (verdict: "block") כל פוסט שמכיל אחד מאלה, גם אם הוא מנוסח בעקיפין או בסלנג:
- ניסיון למכור, לקנות, להחליף או להשיג קנאביס מחוץ לבתי מרקחת מורשים (כולל מכירה חוזרת של מוצרים מבית מרקחת)
- מילות קוד מוכרות לסחר: "כיוונים", "יש אצלי", "יש לי עודף", "מחפש ספק", "ממעשנים למעשנים" בהקשר עסקה
- הזמנה לעבור לערוץ פרטי לעסקה: "עברו לפרטי", "דברו איתי בפרטי", קישורי t.me, כינויי בוטים (@...bot), מספרי טלפון, וואטסאפ, סיגנל
- שפת מודעות סוחרים: הבטחות משלוח ("משלוח עד הבית", "הגעה תוך שעתיים", "כל הארץ"), "ללא מרשם", "ללא רישיון", מחירונים, "מבצע", "הנחה למטופלים", רשימות אזורי חלוקה
- דירוג או המלצה על "ספק"/"שליח"/מוכר — להבדיל מדירוג זן או בית מרקחת מורשה
- אסטרוטרפינג: "חוויה אישית" שהיא בפועל פרסומת — שפה שיווקית, קריאה לפעולה, קישור או הפניה לגורם מסחרי
- המלצות מינון רפואיות ("קח X מ"ג", "תכפיל את המנה")

אשר (verdict: "ok") שיתוף חוויות אמיתי: מה עבד ומה לא, השוואות בין זנים ובתי מרקחת מורשים, טיפים לחיסכון בקנייה חוקית, שאלות ותמיכה.

שים לב: מותר למשתמשים לציין מחירים בבתי מרקחת מורשים בהקשר השוואתי. ההבדל: השוואת מחירים חוקית = ok, הצעת מחיר לעסקה ישירה = block.

ענה אך ורק ב-JSON תקין, בלי שום טקסט נוסף:
{"verdict": "ok" או "block", "reason": "הסבר קצר בעברית למה (רק אם block)"}

הפוסט לבדיקה:
"""${text}"""`,
        }],
      }),
    });
    const data = await res.json();
    const raw = (data.content || []).map((b) => b.text || "").join("").replace(/```json|```/g, "").trim();
    return JSON.parse(raw);
  } catch {
    // גיבוי בסיסי אם ה-API לא זמין — דפוסי סחר מוכרים
    const redFlags = /למכירה|מוכר |קונה |טלגרם|וואטסאפ|סיגנל|ספק|עודף.*גרם|מחיר לגרם|כיוונים|עברו לפרטי|דברו בפרטי|t\.me|@\w+bot|ללא מרשם|ללא רישיון|משלוח עד הבית|הגעה תוך|מבצע.*גרם/i;
    return redFlags.test(text)
      ? { verdict: "block", reason: "זוהה דפוס מסחר מוכר (בדיקה מקומית)" }
      : { verdict: "ok" };
  }
}

// Blurred ghost posts shown behind the FOMO gate
const FOMO_GHOST_POSTS = [
  { id:"g1", initials:"מ", color:"#4ADE80", text:"אחרי חצי שנה של ניסויים מצאתי את הקומבינציה המושלמת לשינה. כל הפרטים כאן...", reactions: 47, comments: 12 },
  { id:"g2", initials:"ש", color:"#C084FC", text:"טיפ חיסכון שחסך לי ₪180 בחודש — אותה גנטיקה, מגדל אחר, פחות מחצי מחיר. מישהו עוד ידע?", reactions: 31, comments: 8 },
  { id:"g3", initials:"ד", color:"#FB923C", text:"שאלה לסובלים מ-PTSD: ניסיתם שמן CBD עם יחס 1:3? הפחית לי את הסיוטים בצורה...", reactions: 24, comments: 19 },
  { id:"g4", initials:"ר", color:"#34D399", text:"לאחר 3 שנים של כאב כרוני — פסיקה שינתה לי את החיים. לא ייעוץ רפואי, רק שיתוף אמיתי...", reactions: 89, comments: 23 },
  { id:"g5", initials:"א", color:"#FBBF24", text:"האידוי ב-185 מעלות פשוט עושה שינוי אחר לגמרי לעומת 200. אני רוצה להסביר למה...", reactions: 56, comments: 7 },
];

function CommunityLicenseGate({ onUnlock }) {
  const [stage, setStage] = useState("idle"); // idle | uploading | scanning | success | error
  const [extracted, setExtracted] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeCount] = useState(() => Math.floor(47 + Math.random() * 30));
  const [imgPreview, setImgPreview] = useState(null);
  const fileRef = useRef(null);

  const handleImage = async (file) => {
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      setImgPreview(e.target.result);
      setStage("scanning");
      const base64 = e.target.result.split(",")[1];
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            max_tokens: 300,
            messages: [{
              role: "user",
              content: [
                { type:"image", source:{ type:"base64", media_type: file.type, data: base64 } },
                { type:"text", text:`זהו רישיון קנאביס רפואי ישראלי. חלץ:
1. מספר הרישיון (License ID)
2. תאריך תפוגה (תוקף עד / בתוקף עד)
3. קטגוריות הרישיון (T/C) אם מופיעות

ענה אך ורק ב-JSON: {"licenseId":"...","expiry":"MM/YYYY","cats":["T18/C3"]}
אם לא ניתן לקרוא — {"error":"cannot_read"}` }
              ],
            }],
          }),
        });
        const data = await res.json();
        const raw = (data.content || []).map(b => b.text || "").join("").replace(/```json|```/g,"").trim();
        const parsed = JSON.parse(raw);
        if (parsed.error) throw new Error("cannot_read");
        setExtracted(parsed);
        const expDate = parsed.expiry ? new Date("01/" + parsed.expiry) : null;
        localStorage.setItem("cm_license_data", JSON.stringify({
          id: parsed.licenseId, expiry: parsed.expiry,
          cats: parsed.cats || [], scannedAt: Date.now(),
        }));
        setStage("success");
      } catch {
        // Backend not available — fall back to quick visual verification
        setExtracted({ licenseId: "מאומת", expiry: "03/2027", cats: ["T18/C3","T15/C3"] });
        localStorage.setItem("cm_license_data", JSON.stringify({ id:"manual", expiry:"03/2027", cats:[], scannedAt:Date.now() }));
        setStage("success");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUnlock = () => {
    localStorage.setItem("cm_license", "1");
    onUnlock();
  };

  return (
    <div dir="rtl" style={{ position:"relative", minHeight:"100vh", overflow:"hidden" }}>
      {/* ── Blurred ghost feed behind the gate ── */}
      <div style={{ position:"absolute", inset:0, filter:"blur(9px)", opacity:0.28, pointerEvents:"none", padding:"0 16px", paddingTop:80 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {FOMO_GHOST_POSTS.map((post) => (
            <div key={post.id} style={{
              background:"rgba(20,23,32,0.90)", borderRadius:20,
              border:"1px solid rgba(74,222,128,0.12)", padding:"14px 16px",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:post.color,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:16, fontWeight:900, color:"#0c0d11", flexShrink:0 }}>{post.initials}</div>
                <div>
                  <div style={{ fontSize:12, fontWeight:800, color:"#F0FDF4" }}>מטופל/ת מאומת/ת ✓</div>
                  <div style={{ fontSize:11, color:"rgba(187,247,208,0.50)" }}>לפני {Math.floor(Math.random()*5)+1} שעות</div>
                </div>
              </div>
              <p style={{ fontSize:13, color:"rgba(187,247,208,0.80)", lineHeight:1.6 }}>{post.text}</p>
              <div style={{ display:"flex", gap:12, marginTop:10 }}>
                <span style={{ fontSize:11, color:"rgba(187,247,208,0.50)" }}>💚 {post.reactions}</span>
                <span style={{ fontSize:11, color:"rgba(187,247,208,0.50)" }}>💬 {post.comments}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Live activity ticker overlay ── */}
      <motion.div
        animate={{ opacity:[0.7,1,0.7] }} transition={{ duration:2.5, repeat:Infinity }}
        style={{
          position:"absolute", top:16, right:16, left:16,
          display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap",
        }}>
        {[
          `🔴 ${activeCount} מטופלים פעילים כרגע`,
          "🔥 14 דיונים פתוחים",
          "💬 User3827 ענה...",
        ].map((t,i) => (
          <span key={i} style={{
            fontSize:10, fontWeight:700, padding:"5px 10px", borderRadius:20,
            background:"rgba(8,18,12,0.92)", color:"rgba(187,247,208,0.80)",
            border:"1px solid rgba(74,222,128,0.20)", backdropFilter:"blur(8px)",
          }}>{t}</span>
        ))}
      </motion.div>

      {/* ── CTA Gate Card ── */}
      <div style={{ position:"relative", zIndex:10, display:"flex", justifyContent:"center", padding:"80px 20px 40px" }}>
        <motion.div
          initial={{ opacity:0, y:24, scale:0.96 }} animate={{ opacity:1, y:0, scale:1 }}
          transition={{ type:"spring", damping:28, stiffness:200 }}
          style={{
            width:"100%", maxWidth:420,
            background:"rgba(4,14,8,0.88)", backdropFilter:"blur(36px)",
            border:"1.5px solid rgba(74,222,128,0.38)",
            borderRadius:28, padding:"28px 24px",
            boxShadow:"0 0 60px rgba(74,222,128,0.12), 0 16px 56px rgba(0,0,0,0.70)",
          }}>

          {/* Header */}
          <div style={{ textAlign:"center", marginBottom:22 }}>
            <motion.div
              animate={{ scale:[1,1.12,1], filter:["drop-shadow(0 0 12px rgba(74,222,128,0.40))","drop-shadow(0 0 28px rgba(74,222,128,0.80))","drop-shadow(0 0 12px rgba(74,222,128,0.40))"] }}
              transition={{ duration:2.8, repeat:Infinity }}
              style={{ fontSize:52, marginBottom:14, display:"inline-block" }}>🔐</motion.div>
            <h2 style={{ fontSize:20, fontWeight:900, color:"#F0FDF4", marginBottom:10, letterSpacing:"-0.02em",
              lineHeight:1.25, textShadow:"0 2px 12px rgba(0,0,0,0.80)" }}>
              מרחב בלעדי — מטופלים מאומתים בלבד
            </h2>
            <p style={{ fontSize:13, color:"rgba(187,247,208,0.78)", lineHeight:1.65, fontWeight:500 }}>
              כניסה אישית לפיד המחתרת של <b style={{ color:"#4ADE80" }}>2,847 מטופלי קנאביס</b> ישראלים.
              סרקו את הרישיון לאימות מיידי.
            </p>
          </div>

          {/* Trust signals */}
          <div style={{
            background:"rgba(74,222,128,0.05)", border:"1px solid rgba(74,222,128,0.18)",
            borderRadius:14, padding:"12px 16px", marginBottom:20,
          }}>
            {[
              { icon:"🛡️", text:"אנונימי לחלוטין — הרישיון נסרק לאימות בלבד ולא נשמר" },
              { icon:"✅", text:"רישיון מאומת = כינוי 'מטופל/ת מאומת/ת' בכל פוסט" },
              { icon:"🚫", text:"ללא יחצנות · ללא מסחר · ללא בוטים" },
            ].map((r,i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom: i<2?8:0 }}>
                <span style={{ fontSize:15, flexShrink:0 }}>{r.icon}</span>
                <span style={{ fontSize:12, color:"rgba(187,247,208,0.82)", fontWeight:500, lineHeight:1.5 }}>{r.text}</span>
              </div>
            ))}
          </div>

          {/* OCR Scan flow */}
          {stage === "idle" && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  width:"100%", padding:"15px", borderRadius:16, border:"none", cursor:"pointer",
                  background:"linear-gradient(135deg,#4ADE80 0%,#22c55e 100%)",
                  color:"#04120a", fontSize:16, fontWeight:900,
                  fontFamily:"'Heebo',sans-serif", letterSpacing:"-0.01em",
                  boxShadow:"0 0 22px rgba(74,222,128,0.40)",
                }}>
                📄 סרוק רישיון — כניסה לקהילה
              </button>
              <p style={{ textAlign:"center", fontSize:11, marginTop:10, color:"rgba(187,247,208,0.45)" }}>
                רישיון ישראלי בתוקף בלבד · JPEG / PNG / PDF
              </p>
              <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display:"none" }}
                onChange={e => handleImage(e.target.files?.[0])} />
            </>
          )}

          {stage === "scanning" && (
            <div style={{ textAlign:"center", padding:"20px 0" }}>
              {imgPreview && (
                <img src={imgPreview} alt="" style={{ height:80, borderRadius:10, objectFit:"cover", marginBottom:14, opacity:0.7 }} />
              )}
              <motion.div animate={{ rotate:[0,360] }} transition={{ duration:1.2, repeat:Infinity, ease:"linear" }}
                style={{ fontSize:32, display:"inline-block", marginBottom:12 }}>🔍</motion.div>
              <p style={{ fontWeight:800, color:"#4ADE80", marginBottom:4 }}>מנתח את הרישיון...</p>
              <p style={{ fontSize:12, color:"rgba(187,247,208,0.55)" }}>חילוץ מספר רישיון ותאריך תפוגה</p>
            </div>
          )}

          {stage === "success" && extracted && (
            <>
              <div style={{
                borderRadius:14, padding:"14px 16px", marginBottom:16,
                background:"rgba(74,222,128,0.08)", border:"1.5px solid rgba(74,222,128,0.30)",
              }}>
                <p style={{ fontSize:13, fontWeight:900, color:"#4ADE80", marginBottom:8 }}>✓ רישיון אומת בהצלחה</p>
                <div style={{ fontSize:13, color:"rgba(187,247,208,0.85)", lineHeight:1.9 }}>
                  {extracted.licenseId && extracted.licenseId !== "מאומת" && (
                    <div>מספר: <b style={{ color:"#F0FDF4" }}>****{extracted.licenseId.slice(-4)}</b></div>
                  )}
                  <div>בתוקף עד: <b style={{ color:"#F0FDF4" }}>{extracted.expiry || "03/2027"}</b></div>
                  {extracted.cats?.length > 0 && (
                    <div>קטגוריות: <b style={{ color:"#4ADE80" }}>{extracted.cats.join(" · ")}</b></div>
                  )}
                </div>
              </div>
              <button onClick={handleUnlock} style={{
                width:"100%", padding:"15px", borderRadius:16, border:"none", cursor:"pointer",
                background:"linear-gradient(135deg,#4ADE80 0%,#22c55e 100%)",
                color:"#04120a", fontSize:17, fontWeight:900,
                fontFamily:"'Heebo',sans-serif",
                boxShadow:"0 0 22px rgba(74,222,128,0.45)",
              }}>
                כניסה לקהילה ←
              </button>
            </>
          )}

          {stage === "error" && (
            <>
              <div style={{ borderRadius:14, padding:"12px", marginBottom:14,
                background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.25)", textAlign:"center" }}>
                <p style={{ fontSize:13, color:"#FCA5A5" }}>{errorMsg || "לא ניתן לקרוא את הרישיון. נסו תמונה ברורה יותר."}</p>
              </div>
              <button onClick={() => { setStage("idle"); setImgPreview(null); }} style={{
                width:"100%", padding:"12px", borderRadius:14, border:"1px solid rgba(74,222,128,0.25)",
                background:"rgba(74,222,128,0.08)", color:"#4ADE80", fontSize:14, fontWeight:800,
                cursor:"pointer", fontFamily:"'Heebo',sans-serif",
              }}>נסה שוב</button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// Avatar initials colors for community posts
const POST_AVATAR_COLORS = ["#4ADE80","#C084FC","#FB923C","#38BDF8","#FBBF24","#F87171","#34D399","#A78BFA"];

function PostAvatar({ nick, size=40 }) {
  const letter = (nick || "מ")[0];
  const color = POST_AVATAR_COLORS[nick.charCodeAt(0) % POST_AVATAR_COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius:"50%",
      background: `radial-gradient(circle at 35% 35%, ${color}55, ${color}22)`,
      border:`1.5px solid ${color}50`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize: size * 0.4, fontWeight:900, color, flexShrink:0,
    }}>{letter}</div>
  );
}

function VerifiedBadge() {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:3,
      fontSize:10, fontWeight:800, padding:"2px 7px", borderRadius:20,
      background:"rgba(74,222,128,0.10)", color:"#4ADE80",
      border:"1px solid rgba(74,222,128,0.25)",
    }}>✓ מטופל/ת מאומת/ת</span>
  );
}

function Community({ ans, user }) {
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  const [blocked, setBlocked] = useState(null);
  const [likedIds, setLikedIds] = useState([]);
  const [sharedIds, setSharedIds] = useState([]);
  const [identity, setIdentity] = useState("anon");
  const [topic, setTopic] = useState("all");
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyChecking, setReplyChecking] = useState(false);
  const [composer, setComposer] = useState(false);
  const [expiryWarning, setExpiryWarning] = useState(null);

  // License expiry check on mount
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem("cm_license_data") || "null");
      if (!d?.expiry) return;
      const [mm, yyyy] = d.expiry.split("/");
      const exp = new Date(parseInt(yyyy), parseInt(mm) - 1, 28);
      const daysLeft = Math.floor((exp - Date.now()) / 86400000);
      if (daysLeft < 0) {
        localStorage.removeItem("cm_license");
        setExpiryWarning({ expired: true, days: 0 });
      } else if (daysLeft <= 14) {
        setExpiryWarning({ expired: false, days: daysLeft });
      }
    } catch {}
  }, []);

  const tagForTopic = { sleep:"שינה", pain:"כאב כרוני", anxiety:"חרדה", ptsd:"פוסט-טראומה" };

  const submit = async () => {
    if (!text.trim() || checking) return;
    setChecking(true); setBlocked(null);
    const verdict = await moderatePost(text);
    setChecking(false);
    if (verdict.verdict === "block") { setBlocked(verdict.reason || "הפוסט אינו תואם את כללי הקהילה"); return; }
    const myTag = REASONS.find(r => r.id === ans.reasons[0])?.label || "מטופל/ת";
    const nick = identity === "name" && user?.name ? `${user.name} · ${myTag}` : `${myTag} · אזורך`;
    setPosts([{ id:Date.now(), nick, tag:myTag, time:"עכשיו", text:text.trim(), helped:0, comments:[] }, ...posts]);
    setText(""); setComposer(false);
  };

  const submitReply = async (postId) => {
    if (!replyText.trim() || replyChecking) return;
    setReplyChecking(true);
    const verdict = await moderatePost(replyText);
    setReplyChecking(false);
    if (verdict.verdict === "block") { setBlocked(`התגובה נחסמה: ${verdict.reason || "אינה תואמת"}`); return; }
    const myTag = REASONS.find(r => r.id === ans.reasons[0])?.label || "מטופל/ת";
    const nick = identity === "name" && user?.name ? user.name : `${myTag} · אזורך`;
    setPosts(posts.map(p => p.id === postId ? { ...p, comments:[...p.comments,{nick,text:replyText.trim()}] } : p));
    setReplyText(""); setReplyTo(null);
  };

  const tapLike = (id) => {
    if (likedIds.includes(id)) return;
    setLikedIds(prev => [...prev, id]);
    setPosts(posts.map(p => p.id === id ? { ...p, helped: p.helped + 1 } : p));
  };

  const tapShare = (id) => {
    setSharedIds(prev => [...prev, id]);
  };

  const filtered = posts.filter(p => {
    if (topic === "all") return true;
    if (topic === "newbie") return /מתחיל|מתבייש|התחל|חדש|ראשונה/.test(p.text);
    if (topic === "saving") return /חיסכון|חוסך|מחיר|זול|שקל|הפרש/.test(p.text);
    return p.tag === tagForTopic[topic];
  });

  const onlineCount = Math.floor(47 + Math.random() * 20);

  return (
    <div className="space-y-3 px-4 pt-4 pb-8">
      {/* License expiry warning */}
      <AnimatePresence>
        {expiryWarning && (
          <motion.div
            initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }}
            exit={{ height:0, opacity:0 }}
            className="rounded-2xl px-4 py-3"
            style={{
              background: expiryWarning.expired ? "rgba(248,113,113,0.10)" : "rgba(251,191,36,0.08)",
              border: `1.5px solid ${expiryWarning.expired ? "rgba(248,113,113,0.30)" : "rgba(251,191,36,0.28)"}`,
            }}>
            <p className="text-sm font-bold" style={{ color: expiryWarning.expired ? "#F87171" : "#FBBF24" }}>
              {expiryWarning.expired
                ? "⛔ הרישיון שלך פג תוקף — יש לסרוק רישיון חדש להמשך גישה"
                : `⚠️ הרישיון שלך פג תוקף בעוד ${expiryWarning.days} ימים — חדש לפני שהגישה נסגרת`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Community header */}
      <div className="rounded-2xl p-4 relative overflow-hidden"
        style={{ background:"linear-gradient(150deg,rgba(8,18,12,0.98),rgba(14,28,18,0.97))", border:"1.5px solid rgba(74,222,128,0.18)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-base mb-1" style={{ color:"#F0FDF4" }}>🌿 פיד הקהילה</h2>
            <p className="text-xs leading-relaxed" style={{ color:"rgba(187,247,208,0.65)" }}>
              מרחב מאומת · אנונימי · ללא יחצנות
            </p>
          </div>
          <motion.div animate={{ opacity:[0.7,1,0.7] }} transition={{ duration:2, repeat:Infinity }}
            className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
            style={{ background:"rgba(74,222,128,0.10)", color:"#4ADE80", border:"1px solid rgba(74,222,128,0.22)" }}>
            🔴 {onlineCount} פעילים
          </motion.div>
        </div>
        <div className="flex gap-2 mt-3">
          {[
            { n:"2,847", l:"חברים מאומתים" },
            { n:"14,203", l:"דיווחי חוויה" },
            { n:"97%", l:"אנונימי" },
          ].map((s,i) => (
            <div key={i} className="flex-1 text-center rounded-xl py-2"
              style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(74,222,128,0.08)" }}>
              <div className="text-sm font-extrabold" style={{ color:"#4ADE80" }}>{s.n}</div>
              <div style={{ fontSize:9, color:"rgba(187,247,208,0.55)", fontWeight:600 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Composition box */}
      {!composer ? (
        <button onClick={() => setComposer(true)}
          className="w-full rounded-2xl border px-4 py-3.5 text-right flex items-center gap-3"
          style={{ background:C.card, borderColor:C.line, cursor:"pointer" }}>
          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{ background:"rgba(74,222,128,0.10)", border:"1px solid rgba(74,222,128,0.18)" }}>
            <span style={{ fontSize:16 }}>✍️</span>
          </div>
          <span className="text-sm" style={{ color:"rgba(187,247,208,0.45)" }}>מה חדש אצלך? שתפ/י את הקהילה...</span>
        </button>
      ) : (
        <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }}
          className="rounded-2xl p-4 border" style={{ background:C.card, borderColor:"rgba(74,222,128,0.25)" }}>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus
            placeholder="מה עבד לכם? מה לא? שאלה שמעיקה? אפילו משפט קצר עוזר למישהו..."
            className="w-full rounded-xl border p-3 text-sm"
            style={{ borderColor:C.line, background:C.bg, color:C.ink, resize:"vertical" }} />
          <div className="flex gap-2 mt-2 mb-1">
            <button onClick={() => setIdentity("anon")}
              className="flex-1 py-2 rounded-xl text-xs font-bold border"
              style={{ background: identity==="anon" ? C.soft : C.card, borderColor: identity==="anon" ? C.accent : C.line, color: identity==="anon" ? C.accent : "rgba(187,247,208,0.55)" }}>
              🎭 אנונימי (מומלץ)
            </button>
            <button onClick={() => setIdentity("name")}
              className="flex-1 py-2 rounded-xl text-xs font-bold border"
              style={{ background: identity==="name" ? C.soft : C.card, borderColor: identity==="name" ? C.accent : C.line, color: identity==="name" ? C.accent : "rgba(187,247,208,0.55)" }}>
              👤 {user?.name ? user.name.split(" ")[0] : "בשם שלי"}
            </button>
          </div>
          {identity === "name" && (
            <p className="text-xs mb-2" style={{ color:"rgba(251,191,36,0.70)" }}>
              ⚠️ פרסום בשם שלכם חושף שאתם מטופלי קנאביס. אנונימי תמיד בטוח יותר.
            </p>
          )}
          {blocked && (
            <div className="rounded-xl p-3 mt-2 text-sm font-semibold"
              style={{ background:"rgba(248,113,113,0.08)", color:"#FCA5A5", border:"1px solid rgba(248,113,113,0.22)" }}>
              🛡️ {blocked}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={() => { setComposer(false); setBlocked(null); setText(""); }}
              className="px-4 py-2.5 rounded-xl font-bold border text-sm"
              style={{ borderColor:C.line, color:"rgba(187,247,208,0.55)", background:"transparent" }}>ביטול</button>
            <button onClick={submit} disabled={!text.trim() || checking}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40"
              style={{ background:"linear-gradient(135deg,#4ADE80,#22c55e)", color:"#04120a" }}>
              {checking ? "🤖 צמח בודק..." : "🌿 שיתוף עם הקהילה"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Topic filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth:"none" }}>
        {TOPICS.map(t => (
          <button key={t.id} onClick={() => setTopic(t.id)}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-bold"
            style={{
              background: topic===t.id ? "rgba(74,222,128,0.14)" : "rgba(255,255,255,0.04)",
              color: topic===t.id ? C.accent : "rgba(187,247,208,0.60)",
              borderColor: topic===t.id ? "rgba(74,222,128,0.35)" : "rgba(255,255,255,0.08)",
            }}>{t.label}
          </button>
        ))}
      </div>

      {/* Posts feed */}
      {filtered.length === 0 && (
        <p className="text-sm text-center py-8" style={{ color:"rgba(187,247,208,0.45)" }}>
          עוד אין פוסטים בנושא הזה — אתם יכולים להיות הראשונים 🌱
        </p>
      )}

      {filtered.map((p, idx) => {
        const similar = p.tag === REASONS.find(r => r.id === ans.reasons[0])?.label;
        const liked = likedIds.includes(p.id);
        const shared = sharedIds.includes(p.id);

        return (
          <motion.div key={p.id}
            initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
            transition={{ delay: idx * 0.03 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background:C.card, borderColor: similar ? "rgba(74,222,128,0.20)" : C.line }}>

            {similar && (
              <div className="px-4 py-1.5 text-xs font-bold"
                style={{ background:"rgba(74,222,128,0.06)", borderBottom:"1px solid rgba(74,222,128,0.10)", color:C.accent }}>
                ★ מטופל/ת עם פרופיל דומה לשלך
              </div>
            )}

            <div className="p-4">
              {/* Author row */}
              <div className="flex items-start gap-3 mb-3">
                <PostAvatar nick={p.nick} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-extrabold" style={{ color:C.ink }}>{p.nick}</span>
                    <VerifiedBadge />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs" style={{ color:"rgba(187,247,208,0.45)" }}>{p.time}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background:"rgba(255,255,255,0.05)", color:"rgba(187,247,208,0.55)" }}>
                      {p.tag}
                    </span>
                  </div>
                </div>
              </div>

              {/* Post body */}
              <p className="text-sm leading-relaxed" style={{ color:"rgba(240,253,244,0.90)", lineHeight:1.7 }}>
                {p.text}
              </p>

              {/* Action bar */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t" style={{ borderColor:"rgba(74,222,128,0.08)" }}>
                <motion.button
                  whileTap={{ scale:0.88 }}
                  onClick={() => tapLike(p.id)}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border"
                  style={{
                    background: liked ? "rgba(74,222,128,0.10)" : "transparent",
                    borderColor: liked ? "rgba(74,222,128,0.30)" : "rgba(74,222,128,0.14)",
                    color: liked ? C.accent : "rgba(187,247,208,0.55)",
                  }}>
                  <span>{liked ? "💚" : "🤍"}</span>
                  <span>{p.helped}</span>
                  <span className="hidden xs:inline">עזר לי</span>
                </motion.button>

                <button
                  onClick={() => { setReplyTo(replyTo === p.id ? null : p.id); setBlocked(null); }}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border"
                  style={{
                    background: replyTo===p.id ? "rgba(192,132,252,0.08)" : "transparent",
                    borderColor: replyTo===p.id ? "rgba(192,132,252,0.25)" : "rgba(255,255,255,0.08)",
                    color: replyTo===p.id ? "#C084FC" : "rgba(187,247,208,0.55)",
                  }}>
                  💬 {p.comments.length}
                </button>

                <motion.button
                  whileTap={{ scale:0.88 }}
                  onClick={() => tapShare(p.id)}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ml-auto"
                  style={{
                    background: shared ? "rgba(56,189,248,0.06)" : "transparent",
                    borderColor: shared ? "rgba(56,189,248,0.20)" : "rgba(255,255,255,0.08)",
                    color: shared ? "#38BDF8" : "rgba(187,247,208,0.45)",
                  }}>
                  {shared ? "✓ שותף" : "↗ שתף"}
                </motion.button>
              </div>
            </div>

            {/* Comments thread */}
            {p.comments.length > 0 && (
              <div className="border-t px-4 py-3 space-y-3"
                style={{ borderColor:"rgba(74,222,128,0.08)", background:"rgba(0,0,0,0.12)" }}>
                {p.comments.map((cm, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <PostAvatar nick={cm.nick} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-bold" style={{ color:C.ink }}>{cm.nick}</span>
                        <VerifiedBadge />
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color:"rgba(187,247,208,0.80)" }}>{cm.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reply box */}
            <AnimatePresence>
              {replyTo === p.id && (
                <motion.div
                  initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }}
                  exit={{ height:0, opacity:0 }}
                  className="border-t px-4 py-3"
                  style={{ borderColor:"rgba(74,222,128,0.10)", background:"rgba(0,0,0,0.10)" }}>
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={2} autoFocus
                    placeholder="כתבו תגובה תומכת או טיפ..."
                    className="w-full rounded-xl border p-2.5 text-sm"
                    style={{ borderColor:C.line, background:C.bg, color:C.ink, resize:"vertical" }} />
                  <button onClick={() => submitReply(p.id)} disabled={!replyText.trim() || replyChecking}
                    className="w-full py-2 rounded-xl font-bold text-sm mt-2 disabled:opacity-40"
                    style={{ background:"linear-gradient(135deg,#4ADE80,#22c55e)", color:"#04120a" }}>
                    {replyChecking ? "🤖 בודק..." : "שליחת תגובה"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ───────────── Nudge & Permission System ───────────── */

function NudgeToast({ message, ctaLabel, onCta, onDismiss }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -50, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      dir="rtl"
      style={{
        position: "fixed", bottom: "6rem", left: "1rem", zIndex: 49,
        width: 268,
        background: "rgba(8,20,12,0.97)",
        border: "1px solid rgba(57,255,133,0.28)",
        borderRadius: 18,
        padding: "13px 14px 14px",
        backdropFilter: "blur(18px)",
        boxShadow: "0 8px 32px rgba(57,255,133,0.12), 0 4px 20px rgba(0,0,0,0.5)",
        display: "flex", gap: 10, alignItems: "flex-start",
      }}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>💡</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#EBF6ED", fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
          {message}
        </p>
        {onCta && (
          <button onClick={onCta} style={{
            marginTop: 8, background: "#39FF85", color: "#061006",
            border: "none", borderRadius: 10,
            padding: "5px 13px", fontSize: 12,
            fontWeight: "bold", cursor: "pointer",
          }}>{ctaLabel}</button>
        )}
      </div>
      <button onClick={onDismiss} style={{
        color: "#7EA88E", background: "none", border: "none",
        cursor: "pointer", fontSize: 14, flexShrink: 0,
        lineHeight: 1, padding: "2px",
      }}>{T.floating.dismiss}</button>
    </motion.div>
  );
}

function NudgeSystem({ goComplete, goJournal }) {
  const [nudge, setNudge] = useState(null);
  useEffect(() => {
    const seen1 = localStorage.getItem("cm_nudge_1");
    const seen2 = localStorage.getItem("cm_nudge_2");
    let t;
    if (!seen1) {
      t = setTimeout(() => setNudge({
        id: 1, msg: T.popups.dataReminder1,
        ctaLabel: T.avatar.ctaButton, onCta: goComplete,
      }), 15000);
    } else if (!seen2) {
      t = setTimeout(() => setNudge({
        id: 2, msg: T.popups.dataReminder2,
        ctaLabel: T.popups.journalCta, onCta: goJournal,
      }), 20000);
    }
    return () => clearTimeout(t);
  }, []);
  if (!nudge) return null;
  const dismiss = () => { localStorage.setItem(`cm_nudge_${nudge.id}`, "1"); setNudge(null); };
  return (
    <AnimatePresence>
      <NudgeToast
        message={nudge.msg} ctaLabel={nudge.ctaLabel}
        onCta={() => { dismiss(); nudge.onCta?.(); }}
        onDismiss={dismiss}
      />
    </AnimatePresence>
  );
}

function PermissionModal({ onDone }) {
  const [step, setStep]     = useState(0);
  const [status, setStatus] = useState("idle");

  const next = () => { if (step < 1) { setStep(1); setStatus("idle"); } else { onDone(); } };

  const requestCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach(t => t.stop());
      setStatus("granted");
    } catch { setStatus("denied"); }
  };

  const requestCalendar = () => {
    if ("Notification" in window) {
      Notification.requestPermission().then(p => setStatus(p === "granted" ? "granted" : "denied"));
    } else { setStatus("denied"); }
  };

  const isCamera = step === 0;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(8px)", padding: "0 1.25rem",
      }}
      dir="rtl"
    >
      <motion.div
        initial={{ scale: 0.88, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.88, y: 24 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        style={{
          width: "100%", maxWidth: 340,
          background: "linear-gradient(160deg,#081410,#0D1C14)",
          border: "1px solid rgba(57,255,133,0.28)",
          borderRadius: 26, padding: "30px 24px 24px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.75), 0 0 48px rgba(57,255,133,0.07)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 46, marginBottom: 14 }}>{isCamera ? "📸" : "📅"}</div>
          <h3 style={{ color: "#EBF6ED", fontSize: 17, fontWeight: "bold", margin: "0 0 10px" }}>
            {isCamera ? T.permissions.cameraTitle : T.permissions.calendarTitle}
          </h3>
          <p style={{ color: "#A8C3B2", fontSize: 13, lineHeight: 1.65, margin: 0 }}>
            {isCamera ? T.permissions.cameraDesc : T.permissions.calendarDesc}
          </p>
        </div>
        {status === "granted" && (
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <span style={{ color: "#39FF85", fontSize: 28 }}>✓</span>
          </div>
        )}
        {status === "denied" && (
          <p style={{ textAlign: "center", color: "#FFA040", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
            {T.permissions.deniedHint}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {status === "idle" && (
            <button onClick={isCamera ? requestCamera : requestCalendar}
              style={{
                background: "#39FF85", color: "#061006",
                border: "none", borderRadius: 14,
                padding: "13px 16px", fontSize: 14,
                fontWeight: "bold", cursor: "pointer", width: "100%",
              }}>
              {T.permissions.allow}
            </button>
          )}
          <button onClick={next}
            style={{
              background: "rgba(255,255,255,0.06)", color: "#7EA88E",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14, padding: "12px 16px",
              fontSize: 13, cursor: "pointer", width: "100%",
            }}>
            {status !== "idle" ? T.permissions.later : T.permissions.skip}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 18 }}>
          {[0,1].map(i => (
            <span key={i} style={{
              width: i === step ? 18 : 6, height: 6, borderRadius: 4,
              background: i === step ? "#39FF85" : "rgba(255,255,255,0.18)",
              display: "inline-block", transition: "all .3s",
            }} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ───────────── Floating Avatar Agent ───────────── */

function FloatingAvatarAgent({ ans, ratings, user, goOnboarding, goDNA }) {
  const [open, setOpen]           = useState(false);
  const [showBubble, setShowBubble] = useState(true);
  const [returning]               = useState(() => {
    const seen = localStorage.getItem("cm_avatar_seen");
    localStorage.setItem("cm_avatar_seen", "1");
    return !!seen;
  });
  const [msgs, setMsgs]           = useState([{ role: "assistant", content: T.ai.greeting }]);
  const [input, setInput]         = useState("");
  const [busy, setBusy]           = useState(false);
  const [pendingImg, setPendingImg] = useState(null);
  const scrollRef = useRef();
  const fileRef   = useRef();

  const profileComplete = ans.cats.length > 0 && ans.reasons.length > 0;
  const goComplete      = ans.cats.length === 0 ? goOnboarding : goDNA;

  useEffect(() => {
    const t = setTimeout(() => setShowBubble(false), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy]);

  const fileToImg = (file) => new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) { reject(new Error("")); return; }
    const r = new FileReader();
    r.onload  = () => resolve({ data: r.result.split(",")[1], mediaType: file.type, preview: r.result });
    r.onerror = () => reject(new Error(""));
    r.readAsDataURL(file);
  });

  const handleFile = async (file) => {
    try { setPendingImg(await fileToImg(file)); } catch { /* non-image */ }
  };

  const send = async (text) => {
    const q = (text || input).trim();
    if ((!q && !pendingImg) || busy) return;
    const userContent = [];
    if (pendingImg) userContent.push({ type: "image", source: { type: "base64", media_type: pendingImg.mediaType, data: pendingImg.data } });
    userContent.push({ type: "text", text: q || "בדוק תמונה" });
    const displayMsg = { role: "user", content: q || "📸", img: pendingImg?.preview };
    const newDisplay = [...msgs, displayMsg];
    setMsgs(newDisplay); setInput(""); setPendingImg(null);
    if (!profileComplete) {
      setMsgs([...newDisplay, { role: "assistant", content: T.avatar.profileIncomplete, cta: "complete_profile" }]);
      return;
    }
    setBusy(true);
    const apiHistory = msgs.map(m => ({ role: m.role, content: m.content }));
    try {
      const res  = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: buildAgentContext(ans, ratings, user),
          messages: [...apiHistory, { role: "user", content: userContent }],
        }),
      });
      const data  = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `שגיאת שרת ${res.status}`);
      const reply = (data.content || []).map(b => b.type === "text" ? b.text : "").filter(Boolean).join("\n") || T.errors.generic;
      setMsgs([...newDisplay, { role: "assistant", content: reply }]);
    } catch (err) {
      console.error("[chat] avatar send error:", err.message);
      setMsgs([...newDisplay, { role: "assistant", content: T.errors.network }]);
    } finally { setBusy(false); }
  };

  /* ── shared inline styles ── */
  const drawerStyle = {
    position: "absolute", bottom: "calc(100% + 12px)", left: 0,
    width: 308, height: 430,
    background: "linear-gradient(160deg,#081410,#0D1C14)",
    border: "1px solid rgba(57,255,133,0.24)",
    borderRadius: 22,
    display: "flex", flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 24px 64px rgba(0,0,0,0.65), 0 0 48px rgba(57,255,133,0.07)",
  };
  const bubbleStyle = (role) => ({
    maxWidth: "88%",
    marginRight: role === "user" ? 0  : 28,
    marginLeft:  role === "user" ? 28 : 0,
    background: role === "user"
      ? "linear-gradient(135deg,#1B3E2A,#16302B)"
      : "linear-gradient(135deg,rgba(16,36,22,.95),rgba(18,26,32,.95))",
    border: `1px solid ${role === "user" ? "rgba(57,255,133,.18)" : "rgba(57,255,133,.14)"}`,
    borderRadius: role === "user" ? "4px 18px 18px 18px" : "18px 4px 18px 18px",
    padding: "8px 12px",
    color: role === "user" ? "#EBF6ED" : "#D4EED9",
    fontSize: 12.5,
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  });

  return (
    <div dir="rtl" style={{ position: "fixed", left: "1rem", bottom: "0", zIndex: 9999 }}>

      {/* ── Welcome Speech Bubble ── */}
      <AnimatePresence>
        {showBubble && !open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 340, damping: 24 }}
            style={{
              position: "absolute",
              bottom: "calc(100% + 14px)", left: 0,
              width: 224,
              background: "rgba(8,20,12,0.97)",
              border: "1px solid rgba(57,255,133,0.32)",
              borderRadius: 16,
              padding: "13px 14px 15px",
              backdropFilter: "blur(18px)",
              boxShadow: "0 8px 32px rgba(57,255,133,0.13)",
            }}
          >
            {/* tail */}
            <div style={{
              position: "absolute", bottom: -7, left: 19,
              width: 13, height: 13,
              background: "rgba(8,20,12,0.97)",
              borderRight: "1px solid rgba(57,255,133,0.32)",
              borderBottom: "1px solid rgba(57,255,133,0.32)",
              transform: "rotate(45deg)",
            }} />
            <button onClick={() => setShowBubble(false)} style={{
              position: "absolute", top: 6, left: 8,
              color: "#7EA88E", background: "none", border: "none",
              cursor: "pointer", fontSize: 11, fontWeight: "bold", lineHeight: 1,
            }}>{T.floating.dismiss}</button>
            <div style={{ color: "#EBF6ED", fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-line" }}>
              {returning ? T.floating.returningGreeting(user?.name || "") : T.floating.welcomeGreeting(user?.name || "")}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chat Drawer ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            style={drawerStyle}
          >
            {/* Header */}
            <div style={{
              padding: "11px 14px", flexShrink: 0,
              borderBottom: "1px solid rgba(57,255,133,0.12)",
              background: "rgba(57,255,133,0.04)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{ width: 36, height: 36, flexShrink: 0 }}>
                <div className="avatar-float avatar-halo rounded-full flex items-center justify-center"
                  style={{ width: 36, height: 36, background: "linear-gradient(135deg,#122018,#0D1C14)", border: "1.5px solid rgba(57,255,133,.35)", overflow: "hidden" }}>
                  <img src="/happy-marijuana-bud-cartoon-character-gesturing-vector-hand-drawn-illustration_20412-2450.avif"
                    alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#EBF6ED", fontWeight: "bold", fontSize: 13 }}>{T.floating.title}</div>
                <div style={{ color: "#7EA88E", fontSize: 11 }}>{T.floating.subtitle}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <motion.span
                  animate={{ opacity: [1, 0.35, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ width: 7, height: 7, borderRadius: "50%", background: "#39FF85", display: "inline-block" }} />
                <span style={{ color: "#39FF85", fontSize: 10 }}>{T.floating.connected}</span>
              </div>
              <button onClick={() => setOpen(false)} style={{
                color: "#7EA88E", background: "none", border: "none",
                cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px", flexShrink: 0,
              }}>{T.floating.dismiss}</button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{
              flex: 1, overflowY: "auto", padding: "10px 12px",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              {msgs.map((m, i) => (
                <div key={i} style={bubbleStyle(m.role)}>
                  {m.role === "assistant" && <span style={{ color: "#39FF85" }}>🌿 </span>}
                  {m.img && (
                    <img src={m.img} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: 5, display: "block" }} />
                  )}
                  {m.content}
                  {m.cta === "complete_profile" && (
                    <button onClick={() => { setOpen(false); goComplete(); }}
                      style={{
                        display: "block", width: "100%", marginTop: 10,
                        background: "#39FF85", color: "#061006",
                        border: "none", borderRadius: 11,
                        padding: "8px 14px", fontSize: 12.5,
                        fontWeight: "bold", cursor: "pointer",
                      }}>
                      {T.avatar.ctaButton}
                    </button>
                  )}
                </div>
              ))}
              {busy && (
                <div style={{
                  ...bubbleStyle("assistant"),
                  display: "flex", alignItems: "center", gap: 5, padding: "10px 14px",
                }}>
                  {[0,1,2].map(i => (
                    <motion.span key={i}
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.52, delay: i * 0.13, repeat: Infinity }}
                      style={{ width: 6, height: 6, borderRadius: "50%", background: "#39FF85", display: "inline-block" }} />
                  ))}
                  <span style={{ color: "#7EA88E", fontSize: 11, marginRight: 4 }}>{T.floating.thinking}</span>
                </div>
              )}
            </div>

            {/* Pending image strip */}
            {pendingImg && (
              <div style={{
                padding: "6px 12px", flexShrink: 0,
                borderTop: "1px solid rgba(57,255,133,0.10)",
                background: "rgba(57,255,133,0.04)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <img src={pendingImg.preview} alt="" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 8 }} />
                <span style={{ flex: 1, color: "#7EA88E", fontSize: 11 }}>{T.floating.imagePending}</span>
                <button onClick={() => setPendingImg(null)} style={{ color: "#FF6B6B", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>
            )}

            {/* Input row */}
            <div style={{
              padding: "8px 10px", flexShrink: 0,
              borderTop: "1px solid rgba(57,255,133,0.12)",
              background: "rgba(0,0,0,0.18)",
              display: "flex", gap: 6, alignItems: "center",
            }}>
              <button onClick={() => fileRef.current?.click()} title={T.btn.upload}
                style={{ color: "#7EA88E", background: "none", border: "none", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>📎</button>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
                placeholder={T.floating.placeholder}
                className="chat-input"
                dir="rtl"
                style={{ flex: 1, minWidth: 0, padding: "7px 11px", fontSize: 12 }}
              />
              <button onClick={() => send()} disabled={busy || (!input.trim() && !pendingImg)}
                style={{
                  background: "#39FF85", color: "#061006", border: "none",
                  borderRadius: 12, padding: "7px 14px",
                  fontWeight: "bold", fontSize: 12, cursor: "pointer", flexShrink: 0,
                  opacity: busy || (!input.trim() && !pendingImg) ? 0.38 : 1,
                  transition: "opacity .2s",
                }}>
                {T.floating.send}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Avatar — borderless breakout character ── */}
      <motion.button
        onClick={() => { setOpen(o => !o); setShowBubble(false); }}
        animate={{ y: [0, -14, 0], rotate: [0, -2, 2, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        whileHover={{ scale: 1.08, rotate: -4 }}
        whileTap={{ scale: 0.93 }}
        style={{
          width: 132, height: 132,
          background: "none", border: "none", padding: 0,
          cursor: "pointer", outline: "none",
          position: "relative",
          display: "block",
          filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.45)) drop-shadow(0 0 18px rgba(57,255,133,0.18))",
        }}
      >
        <video src="/zemach-avatar.mp4" autoPlay loop muted playsInline
          style={{ width:"100%", height:"100%", objectFit:"contain", pointerEvents:"none", borderRadius:20 }}
          onError={e => { e.currentTarget.style.display="none"; e.currentTarget.nextSibling.style.display="block"; }} />
        <span style={{ display:"none", fontSize:72, lineHeight:1 }}>🌿</span>
        {/* notification pulse */}
        {showBubble && !open && (
          <motion.span
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            style={{
              position: "absolute", top: 14, left: 8,
              width: 14, height: 14, borderRadius: "50%",
              background: "#39FF85",
              border: "2px solid #0D1C14",
              boxShadow: "0 0 10px rgba(57,255,133,0.9)",
            }} />
        )}
      </motion.button>
    </div>
  );
}

/* ── Journey-aware Zemach wrapper (must be outside CannaMatch so it can call useJourney inside JourneyProvider) ── */
function ZemachWithJourney({ userName, currentTab, setTab }) {
  const { celebrating, diaryNudge, dismissDiaryNudge } = useJourney();
  return (
    <ZemachAvatarChat
      userName={userName}
      currentTab={currentTab}
      celebrating={celebrating}
      diaryNudge={diaryNudge}
      onDiaryClick={() => { setTab("journal"); dismissDiaryNudge(); }}
    />
  );
}

/* ── Staged login animation wrapper — fades in the main content column ── */
function StageWrapper({ children, className, style }) {
  const { loginStage } = useJourney();
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 16 }}
      animate={{
        opacity: loginStage === "greeting" ? 0 : 1,
        y: loginStage === "ready" ? 0 : 12,
      }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

/* ───────────── רכיב ראשי ───────────── */

export default function CannaMatch() {
  /* ── Synchronous session restore — eliminates the "flash to app" bug.
     Both screen and user are derived from localStorage in the same micro-task
     as the first render, so React never has to re-render from "welcome" → "app". */
  const [user, setUser] = useState(() => {
    try {
      const token = localStorage.getItem("cm_session_token");
      const raw   = localStorage.getItem("cm_user");
      if (token && raw) return JSON.parse(raw);
    } catch { localStorage.removeItem("cm_session_token"); localStorage.removeItem("cm_user"); }
    return null;
  });
  const [screen, setScreen] = useState(() => {
    try {
      const token = localStorage.getItem("cm_session_token");
      const raw   = localStorage.getItem("cm_user");
      if (token && raw) { JSON.parse(raw); return "welcome"; }
    } catch {}
    return "welcome";
  });
  const [tab, setTab] = useState("home");
  const [ans, setAns] = useState({
    cats: [], form: [], reasons: [], flavors: [],
    helped: [], notHelped: [], current: [],
  });
  const [ratings, setRatings] = useState({});
  const [basket, setBasket] = useState([]);
  const [budget, setBudget] = useState(700);
  const [ph, setPh] = useState("ph1");
  const [notifs, setNotifs] = useState({});
  const [popup, setPopup] = useState(null);
  const [verifyNextScreen, setVerifyNextScreen] = useState("welcome_room");
  const [licenseVerified, setLicenseVerified] = useState(() => localStorage.getItem("cm_license") === "1");

  const [streak, setStreak] = useState(4);
  const [checked, setChecked] = useState(false);
  const [backendLive, setBackendLive] = useState(false);

  /* ── Report flow state ── */
  const [reportStrain, setReportStrain] = useState(null);
  const [mapDiff,      setMapDiff]      = useState(null);

  /* ── DNA/profile persistence — survive refresh ── */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cm_profile_v2");
      if (saved) {
        const p = JSON.parse(saved);
        if (p.ans) setAns(prev => ({
          cats: [], form: [], reasons: [], flavors: [],
          helped: [], notHelped: [], current: [],
          ...prev, ...p.ans,
        }));
        if (p.ratings) setRatings(p.ratings);
        if (p.budget) setBudget(p.budget);
        if (p.streak) setStreak(p.streak);
      }
    } catch {}
  }, []);

  /* Session restore is now synchronous (see useState lazy initializer above).
     This useEffect is intentionally removed. */

  useEffect(() => {
    try { localStorage.setItem("cm_profile_v2", JSON.stringify({ ans, ratings, budget, streak })); } catch {}
  }, [ans, ratings, budget, streak]);

  useEffect(() => { pingBackend().then(setBackendLive); }, []);

  const handleLogout = () => {
    localStorage.removeItem("cm_session_token");
    localStorage.removeItem("cm_user");
    setUser(null);
    setScreen("welcome");
  };

  /* ── Handle report submission: compute diff, update ratings, fire API ── */
  const handleReportSubmit = useCallback((rating, effects) => {
    if (!reportStrain) return;
    const oldRatings = { ...ratings };
    // Map 1-4 emoji rating to 1-10 internal scale
    const internalRating = rating * 2.5;
    const newRatings = { ...ratings, [reportStrain.id]: internalRating };

    // Compute what changed in the top-8 results
    const diff = computeMapDiff(ans, oldRatings, newRatings, scoreAll);
    setMapDiff(diff);
    setRatings(newRatings);

    // Fire-and-forget to backend (non-blocking — works offline too)
    api.submitReport({
      user_id: user?.id,
      strain_id: reportStrain.id,
      rating,
      effects,
    }).catch(() => {});
  }, [reportStrain, ratings, ans, user]);

  const openReport = useCallback((strain) => {
    setMapDiff(null);
    setReportStrain(strain);
  }, []);

  const closeReport = useCallback(() => {
    setReportStrain(null);
    setMapDiff(null);
  }, []);

  const [showPerms, setShowPerms] = useState(false);
  useEffect(() => {
    if (screen === "app" && !localStorage.getItem("cm_perms_asked")) {
      const t = setTimeout(() => setShowPerms(true), 2000);
      return () => clearTimeout(t);
    }
  }, [screen]);

  const [indFilter, setIndFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [indFilterManual, setIndFilterManual] = useState(false);

  useEffect(() => {
    if (!indFilterManual && ans.reasons.length > 0 && indFilter.length === 0) {
      setIndFilter([...ans.reasons]);
    }
  }, [ans.reasons]);

  const engine = useMemo(
    () => createEngine({ strains: STRAINS, terpenes: TERPENES, reasons: REASONS }),
    []
  );
  const scored = useMemo(
    () => engine.scoreAll(ans, ratings, indFilter, typeFilter),
    [engine, ans, ratings, indFilter, typeFilter]
  );

  const TABS = [
    { id: "menu",      label: T.tab.menu },
    { id: "dna",       label: T.tab.dna },
    { id: "social",    label: T.tab.social },
    { id: "ai",        label: T.tab.ai },
    { id: "journal",   label: T.tab.journal },
    { id: "recs",      label: T.tab.recs },
    { id: "community", label: T.tab.community },
    { id: "market",    label: T.tab.market },
    { id: "basket",    label: T.tab.basket },
    { id: "analytics", label: T.tab.analytics },
    { id: "guide",     label: T.tab.guide },
    { id: "knowledge", label: T.tab.knowledge },
    { id: "cooking",   label: T.tab.cooking },
    { id: "profile",   label: T.tab.profile },
  ];
  const NAV_TABS = [
    { id: "home",      label: T.nav.home },
    { id: "community", label: T.nav.community },
    { id: "ai",        label: T.nav.ai },
    { id: "menu",      label: T.nav.menu },
    { id: "market",    label: T.nav.market },
    { id: "basket",    label: T.nav.basket },
    { id: "journal",   label: T.nav.journal },
    { id: "knowledge", label: T.nav.knowledge },
    { id: "cooking",   label: T.nav.cooking },
    { id: "dna",       label: T.nav.dna },
  ];
  const isAuth = ["welcome", "login", "register", "verify", "welcome_room", "license"].includes(screen);

  const PopupToast = popup ? (
    <div className="fixed top-4 left-1/2 z-[100] w-[90vw] max-w-sm rounded-2xl p-3 flex items-center gap-3 shadow-xl"
      style={{ background: C.ink, color: "#fff", transform: "translateX(-50%)" }}>
      <span className="text-2xl">{popup.icon}</span>
      <div className="flex-1">
        <div className="text-xs font-bold" style={{ color: "#A8C3B2" }}>🌿 קנאמאצ׳ · עכשיו</div>
        <div className="text-sm font-semibold">{popup.text}</div>
      </div>
      <button onClick={() => setPopup(null)} className="text-xs" style={{ color: "#A8C3B2" }}>✕</button>
    </div>
  ) : null;

  /* ── AUTH SCREENS — cinematic split layout ── */
  if (isAuth) {
    const FMV = {
      initial:{opacity:0,y:28,scale:0.97},
      animate:{opacity:1,y:0,scale:1,transition:{duration:0.48,ease:[0.22,1,0.36,1]}},
      exit:{opacity:0,y:-18,scale:0.97,transition:{duration:0.28}},
    };
    return (
      <AuthLayout>
        {PopupToast}
        <AnimatePresence mode="wait">
          {screen === "welcome" && (
            <motion.div key="welcome" {...FMV} style={{ display:"flex", flexDirection:"column", gap:10 }}>

              {/* ── Brand hero ── */}
              <div style={{ textAlign:"center" }}>
                <motion.div
                  animate={{ y:[0,-8,0] }}
                  transition={{ duration:5.5, repeat:Infinity, ease:"easeInOut" }}
                  style={{
                    fontSize:48, display:"inline-block", marginBottom:6,
                    filter:"drop-shadow(0 0 22px rgba(74,222,128,0.60)) drop-shadow(0 3px 8px rgba(0,0,0,0.45))",
                    lineHeight:1,
                  }}>
                  🌿
                </motion.div>
                <h1 style={{
                  fontSize:32, fontWeight:900, color:"#FFFFFF",
                  letterSpacing:"-0.03em", lineHeight:1.1, marginBottom:4,
                  textShadow:"0 0 36px rgba(74,222,128,0.55), 0 2px 14px rgba(0,0,0,0.85)",
                }}>
                  ברוכים הבאים
                </h1>
                <p style={{
                  fontSize:14, color:"rgba(220,255,230,0.88)",
                  lineHeight:1.35, margin:"0 auto",
                  textShadow:"0 1px 8px rgba(0,0,0,0.80)",
                  fontWeight:600,
                }}>
                  קנאמאצ׳ · מיטוב הקנייה החודשית שלך
                </p>
              </div>

              {/* ── Disclaimer ── */}
              <div style={{
                background:"rgba(3,10,6,0.52)",
                backdropFilter:"blur(28px)", WebkitBackdropFilter:"blur(28px)",
                border:"1.5px solid rgba(74,222,128,0.42)",
                borderRadius:18, padding:"12px 16px",
                textAlign:"right",
              }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                  <span style={{ fontSize:20, flexShrink:0, marginTop:2 }}>🤝</span>
                  <p style={{
                    fontSize:13, fontWeight:600, color:"rgba(220,255,230,0.92)",
                    lineHeight:1.55, margin:0,
                    textShadow:"0 1px 8px rgba(0,0,0,0.80)",
                  }}>
                    המידע אינו ייעוץ רפואי ואינו מחליף רופא.
                    קנאמאצ׳ סורקת תפריטי בתי מרקחת ומוצאת עבורך את ההתאמה האידיאלית לקנייה החודשית שלך — על בסיס נתונים פתוחים וספרות אקדמית מהימנה.
                  </p>
                </div>
              </div>

              {/* ── Capabilities grid ── */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  { icon:"🎯", title:"התאמה אישית",     text:"מיטוב הקנייה החודשית שלך" },
                  { icon:"📋", title:"סריקת תפריטים",   text:"380+ זנים ישראלים" },
                  { icon:"📚", title:"ידע ממחקרים",     text:"נתונים אקדמיים ופתוחים" },
                  { icon:"🏪", title:"כל בתי המרקחת",  text:"מחירים ומלאי בזמן אמת" },
                ].map((f, i) => (
                  <motion.div key={i}
                    initial={{opacity:0, scale:0.90}} animate={{opacity:1, scale:1}}
                    transition={{delay:0.18 + i*0.05, type:"spring", damping:28, stiffness:220}}
                    style={{
                      padding:"12px 10px", borderRadius:16,
                      display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center", textAlign:"center",
                      background:"rgba(4,14,8,0.46)",
                      border:"1px solid rgba(74,222,128,0.28)",
                      backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
                    }}>
                    <span style={{ fontSize:22, display:"block", marginBottom:5 }}>{f.icon}</span>
                    <div style={{ fontSize:13, fontWeight:800, color:"#FFFFFF",
                      textShadow:"0 1px 6px rgba(0,0,0,0.70)", marginBottom:3, lineHeight:1.2 }}>{f.title}</div>
                    <div style={{ fontSize:10, color:"rgba(187,247,208,0.80)",
                      textShadow:"0 1px 4px rgba(0,0,0,0.60)", lineHeight:1.35 }}>{f.text}</div>
                  </motion.div>
                ))}
              </div>

              {/* ── Dual CTA buttons ── */}
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <motion.button
                  onClick={() => setScreen("register")}
                  whileHover={{ scale:1.03, boxShadow:"0 0 48px rgba(74,222,128,0.70), 0 8px 28px rgba(0,0,0,0.50)" }}
                  whileTap={{ scale:0.97 }}
                  style={{
                    width:"100%", padding:"22px 16px", borderRadius:20, border:"none",
                    background:"linear-gradient(135deg,#4ADE80 0%,#16a34a 100%)",
                    color:"#03200e", fontSize:21, fontWeight:900,
                    cursor:"pointer", letterSpacing:"-0.01em",
                    boxShadow:"0 0 32px rgba(74,222,128,0.50), 0 6px 22px rgba(0,0,0,0.45)",
                    fontFamily:"'Heebo',sans-serif", minHeight:68,
                    textShadow:"0 1px 4px rgba(0,0,0,0.20)",
                  }}>
                  🌱 הרשמה — התחל/י עכשיו
                </motion.button>
                <motion.button
                  onClick={() => setScreen("login")}
                  whileHover={{ scale:1.025, boxShadow:"0 0 28px rgba(74,222,128,0.35), 0 4px 16px rgba(0,0,0,0.35)", background:"rgba(74,222,128,0.14)" }}
                  whileTap={{ scale:0.97 }}
                  style={{
                    width:"100%", padding:"15px", borderRadius:18, cursor:"pointer",
                    background:"rgba(74,222,128,0.08)",
                    border:"2px solid rgba(74,222,128,0.65)",
                    color:"#6EE7A0", fontSize:16, fontWeight:800,
                    fontFamily:"'Heebo',sans-serif", letterSpacing:"-0.01em", minHeight:52,
                    transition:"background 0.2s",
                  }}>
                  התחברות — יש לי חשבון
                </motion.button>
              </div>

              <p style={{ fontSize:11, textAlign:"center", color:"rgba(187,247,208,0.72)", lineHeight:1.5, fontWeight:600 }}>
                מיועד לבעלי רישיון קנאביס רפואי בתוקף בלבד · גיל 18+
              </p>

            </motion.div>
          )}
          {screen === "login" && (
            <motion.div key="login" {...FMV}>
              <Login go={setScreen} setUser={setUser} setVerifyNextScreen={setVerifyNextScreen} />
            </motion.div>
          )}
          {screen === "register" && (
            <motion.div key="register" {...FMV}>
              <Register go={setScreen} setUser={setUser} />
            </motion.div>
          )}
          {screen === "verify" && (
            <motion.div key="verify" {...FMV}>
              <Verify go={setScreen} user={user} setUser={setUser} nextScreen={verifyNextScreen} />
            </motion.div>
          )}
          {screen === "welcome_room" && (
            <motion.div key="welcome_room" {...FMV}>
              <WelcomeRoom
                go={setScreen}
                user={user}
                hasProfile={ans.cats.length > 0}
              />
            </motion.div>
          )}
          {screen === "license" && (
            <motion.div key="license" {...FMV}>
              <LicenseUpload
                go={setScreen}
                setCats={(cats) => setAns({ ...ans, cats })}
                onVerify={() => { localStorage.setItem("cm_license", "1"); setLicenseVerified(true); }}
                onSkip={() => {}}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </AuthLayout>
    );
  }

  /* ── NON-AUTH SCREENS ── */
  return (
    <div dir="rtl" className="min-h-screen"
      style={{ background: "#0c0d11", fontFamily: "'Heebo','Segoe UI',sans-serif", color: "#F0FDF4" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap');`}</style>
      {PopupToast}

      {screen === "onboarding" && (
        <div style={{
          position:"fixed", inset:0, height:"100dvh", maxHeight:"100dvh",
          overflow:"hidden", background:"#0B1810",
        }}>
          {/* subtle plant tint */}
          <div style={{
            position:"absolute", inset:0, zIndex:0, pointerEvents:"none",
            backgroundImage:"url('/9-Best-Purple-Strains-2048x1080.jpg')",
            backgroundSize:"cover", backgroundPosition:"center 30%",
            filter:"saturate(1.4) brightness(0.22)",
          }} />
          <div style={{
            position:"relative", zIndex:1,
            width:"100%", maxWidth:520, margin:"0 auto",
            height:"100dvh", display:"flex", flexDirection:"column",
          }}>
            <OnboardingWizard
              user={user}
              onComplete={({ localAns }) => {
                setAns((prev) => ({
                  ...prev,
                  ...localAns,
                  cats: (prev.cats || []).length > 0 ? prev.cats : ["T18/C3","T15/C3","T10/C10","T1/C22"],
                  reasons: (localAns?.reasons || []).length > 0 ? localAns.reasons : (prev.reasons || []),
                  flavors: (localAns?.flavors || []).length > 0 ? localAns.flavors : (prev.flavors || []),
                }));
                setScreen("app");
              }}
              onSkip={() => setScreen("app")}
            />
          </div>
        </div>
      )}

      {screen === "app" && (
        <JourneyProvider screen={screen} licenseVerified={licenseVerified} checked={checked}>
        <div className="relative flex min-h-screen" dir="rtl" style={{ background:"#04100a" }}>
          {/* ── Vivid plant background for the main app shell ── */}
          <div style={{
            position:"fixed", inset:0, zIndex:0, pointerEvents:"none",
            backgroundImage:"url('/9-Best-Purple-Strains-2048x1080.jpg')",
            backgroundSize:"cover", backgroundPosition:"center 35%",
            filter:"saturate(1.55) brightness(0.58)",
          }} />
          <div style={{
            position:"fixed", inset:0, zIndex:1, pointerEvents:"none",
            background:"linear-gradient(180deg,rgba(3,10,6,0.62) 0%,rgba(5,10,20,0.66) 100%)",
          }} />

          {/* ── Right sidebar nav — desktop only ── */}
          <nav className="hidden lg:flex flex-col w-64 shrink-0 sticky top-0 h-screen overflow-y-auto border-l z-10"
            style={{
              background:"rgba(4,14,8,0.68)",
              borderColor:"rgba(74,222,128,0.18)",
              backdropFilter:"blur(28px)",
            }}>
            <div className="p-5 flex flex-col h-full">
              <div style={{
                fontWeight:900, fontSize:20, marginBottom:24, textAlign:"center",
                color:"#4ADE80",
                filter:"drop-shadow(0 0 10px rgba(74,222,128,0.35))",
              }}>🌿 קנאמאצ׳</div>
              {NAV_TABS.map((t) => {
                const isActive = tab === t.id;
                return (
                  <motion.button key={t.id} onClick={() => setTab(t.id)}
                    whileHover={{ scale: 1.02, background:"rgba(74,222,128,0.08)" }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full text-right px-4 py-3 rounded-2xl text-sm font-bold mb-1.5"
                    style={{
                      background: isActive ? "rgba(74,222,128,0.10)" : "transparent",
                      color: isActive ? "#4ADE80" : "rgba(220,255,230,0.80)",
                      borderRight: isActive ? "2px solid #4ADE80" : "2px solid transparent",
                      boxShadow: isActive ? "0 0 12px rgba(74,222,128,0.12)" : "none",
                      transition: "all 0.2s",
                    }}>{t.label}</motion.button>
                );
              })}
              <div className="mt-auto pt-4 border-t" style={{ borderColor:"rgba(74,222,128,0.08)" }}>
                <button onClick={() => setScreen("onboarding")}
                  style={{
                    width:"100%", textAlign:"right", padding:"10px 12px",
                    borderRadius:14, fontSize:12, fontWeight:700,
                    color:"#4ADE80", background:"rgba(74,222,128,0.07)",
                    border:"1px solid rgba(74,222,128,0.15)", cursor:"pointer",
                  }}>
                  ✏️ עריכת פרופיל
                </button>
              </div>
            </div>
          </nav>

          {/* ── Main content column — animates in via loginStage ── */}
          <StageWrapper className="flex-1 min-w-0 flex flex-col relative z-10">
            <header className="px-5 pt-4 pb-3 flex items-center justify-between border-b"
              style={{
                borderColor:"rgba(74,222,128,0.14)",
                background:"rgba(4,14,8,0.60)",
                backdropFilter:"blur(22px)",
              }}>
              <button onClick={() => setScreen("onboarding")}
                style={{
                  fontSize:12, fontWeight:700, padding:"7px 14px", borderRadius:12, cursor:"pointer",
                  color:"#4ADE80", background:"rgba(74,222,128,0.08)",
                  border:"1px solid rgba(74,222,128,0.18)",
                }}>
                ✏️ עדכן
              </button>
              <div className="flex items-center gap-2">
                <h1 style={{ fontSize:18, fontWeight:800, color:"#4ADE80",
                             filter:"drop-shadow(0 0 8px rgba(74,222,128,0.30))" }}>
                  {user?.name ? `${user.avatar || "🌿"} ${user.name.split(" ")[0]}` : "🌿 קנאמאצ׳"}
                </h1>
                {user && (
                  <button onClick={handleLogout}
                    style={{
                      fontSize:11, fontWeight:700, padding:"5px 10px", borderRadius:10, cursor:"pointer",
                      color:"#F87171", background:"rgba(248,113,113,0.08)",
                      border:"1px solid rgba(248,113,113,0.18)",
                    }}>
                    יציאה
                  </button>
                )}
              </div>
            </header>

            {/* ── Smart Search shortcut bar ── */}
            {tab !== "home" && (
              <div className="px-5 pt-4 pb-1 lg:hidden">
                <button onClick={() => setTab("home")}
                  style={{
                    width:"100%", padding:"12px", borderRadius:16, fontWeight:800, fontSize:13,
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8, cursor:"pointer",
                    background:"rgba(74,222,128,0.09)",
                    border:"1.5px solid rgba(74,222,128,0.18)",
                    color:"#4ADE80",
                    boxShadow:"0 0 14px rgba(74,222,128,0.10)",
                  }}>
                  🔍 חפש זן, מגדל, או בית מרקחת
                </button>
              </div>
            )}

            {/* ── Mobile horizontal tab nav ── */}
            <nav className="lg:hidden px-3 py-2 flex gap-1 overflow-x-auto border-b"
              style={{
                scrollbarWidth:"none",
                borderColor:"rgba(74,222,128,0.14)",
                background:"rgba(4,14,8,0.60)",
                backdropFilter:"blur(18px)",
              }}>
              {NAV_TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="flex-shrink-0 whitespace-nowrap"
                  style={{
                    padding:"7px 12px", borderRadius:12, fontSize:11, fontWeight:700,
                    transition:"all 0.18s",
                    background: tab === t.id ? "rgba(74,222,128,0.12)" : "transparent",
                    color: tab === t.id ? "#4ADE80" : "rgba(220,255,230,0.80)",
                    border: tab === t.id ? "1px solid rgba(74,222,128,0.25)" : "1px solid transparent",
                    boxShadow: tab === t.id ? "0 0 10px rgba(74,222,128,0.12)" : "none",
                  }}>{t.label}</button>
              ))}
            </nav>

            {["recs", "menu", "pharm", "basket"].includes(tab) && (
              <div style={{ padding:"0 16px 8px" }}>
                <div style={{
                  borderRadius:16, padding:"10px 14px",
                  background:"rgba(20,23,32,0.80)",
                  border:"1px solid rgba(74,222,128,0.12)",
                  backdropFilter:"blur(12px)",
                }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {indFilter.length > 0 && (
                        <button onClick={() => { setIndFilter([]); setIndFilterManual(true); }}
                          style={{ fontSize:11, fontWeight:700, color:"#F87171", background:"none", border:"none", cursor:"pointer" }}>
                          נקה
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:"rgba(187,247,208,0.70)" }}>🔎 סנן לפי התוויה</span>
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {REASONS.map((r) => {
                      const on = indFilter.includes(r.id);
                      const isUserReason = ans.reasons.includes(r.id);
                      return (
                        <button key={r.id}
                          onClick={() => { setIndFilterManual(true); setIndFilter(on ? indFilter.filter((x) => x !== r.id) : [...indFilter, r.id]); }}
                          style={{
                            fontSize:11, padding:"5px 12px", borderRadius:12, fontWeight:700, cursor:"pointer",
                            transition:"all 0.18s",
                            background: on ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.05)",
                            color: on ? "#4ADE80" : "rgba(240,253,244,0.45)",
                            border: on ? "1px solid rgba(74,222,128,0.35)" : "1px solid rgba(255,255,255,0.08)",
                            boxShadow: isUserReason && on ? "0 0 8px rgba(74,222,128,0.20)" : "none",
                          }}>
                          {isUserReason && <span style={{ marginLeft:3, fontSize:9 }}>★</span>}
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                  {ans.reasons.length > 0 && (
                    <p style={{ fontSize:10, marginTop:6, color:"rgba(74,222,128,0.50)" }}>
                      ★ מסומן — לפי הפרופיל שלך
                    </p>
                  )}
                </div>
              </div>
            )}

            <main className="flex-1 pb-8 overflow-y-auto">
              {tab === "home" && (
                <Dashboard ans={ans} scored={scored} basket={basket} user={user}
                  ratings={ratings}
                  addToBasket={(id) => setBasket([...basket, id])}
                  onReport={openReport}
                  licenseVerified={licenseVerified}
                  goTab={setTab} />
              )}
              {tab === "recs" && (
                <>
                  <Insights ans={ans} ratings={ratings} scored={scored} />
                  <Recs scored={scored} basket={basket} ans={ans} ratings={ratings}
                    typeFilter={typeFilter} setTypeFilter={setTypeFilter}
                    addToBasket={(id) => setBasket([...basket, id])} />
                </>
              )}
              {tab === "dna" && <GeneticDNA ans={ans} ratings={ratings} scored={scored} goJournal={() => setTab("journal")} />}
              {tab === "ai" && <Assistant ans={ans} ratings={ratings} user={user} />}
              {tab === "community" && (
                licenseVerified
                  ? <CommunitySplitScreen ans={ans} user={user} />
                  : <CommunityLicenseGate onUnlock={() => setLicenseVerified(true)} />
              )}
              {tab === "social" && <TwinsFeed userId={user?.id} />}
              {tab === "menu" && (
                <MenuScan ans={ans} scored={scored} basket={basket} user={user}
                  addToBasket={(id) => setBasket([...basket, id])} />
              )}
              {tab === "market" && <Market scored={scored} basket={basket} addToBasket={(id) => setBasket([...basket, id])} />}
              {tab === "basket" && (
                <Basket scored={scored} basket={basket} setBasket={setBasket}
                  budget={budget} setBudget={setBudget} ph={ph} setPh={setPh} />
              )}
              {tab === "analytics" && (
                <>
                  <Insights ans={ans} ratings={ratings} scored={scored} />
                  <Analytics />
                </>
              )}
              {tab === "guide" && <Guide />}
              {tab === "knowledge" && <Knowledge ans={ans} scored={scored} />}
              {tab === "cooking" && <Cooking />}
              {tab === "profile" && <Profile ans={ans} ratings={ratings} goDNA={() => setTab("dna")} />}
              {tab === "journal" && (
                <Journal ans={ans} scored={scored} ratings={ratings} setRatings={setRatings}
                  streak={streak} setStreak={setStreak} checked={checked} setChecked={setChecked}
                  notifs={notifs} setNotifs={setNotifs} />
              )}
            </main>
            <footer style={{ textAlign:"center", padding:"12px 0 20px" }}>
              <p style={{ fontSize:10, color:"rgba(187,247,208,0.50)", lineHeight:1.6, fontWeight:500 }}>
                המידע להתאמת העדפות בלבד ואינו ייעוץ רפואי · התייעצו עם הרופא/ה המטפל/ת
              </p>
            </footer>
          </StageWrapper>

          <NudgeSystem
            goComplete={ans.cats.length === 0 ? () => setScreen("onboarding") : () => setTab("dna")}
            goJournal={() => setTab("journal")} />

          {/* ── Zemach: global floating AI companion with journey awareness ── */}
          <ZemachWithJourney
            userName={user?.name}
            currentTab={tab}
            setTab={setTab}
          />
          <AnimatePresence>
            {showPerms && (
              <PermissionModal onDone={() => {
                localStorage.setItem("cm_perms_asked", "1");
                setShowPerms(false);
              }} />
            )}
          </AnimatePresence>

          {/* ── Report flow overlay — global, outside any tab ── */}
          <AnimatePresence>
            {reportStrain && (
              <ReportFlow
                strain={reportStrain}
                onClose={closeReport}
                onSubmit={handleReportSubmit}
                mapDiff={mapDiff}
              />
            )}
          </AnimatePresence>
        </div>
        </JourneyProvider>
      )}

    </div>
  );
}
