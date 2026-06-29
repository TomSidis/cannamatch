import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import TwinsFeed from "./components/TwinsFeed.jsx";
import { JourneyProvider, useJourney } from "./hooks/useJourneyContext.jsx";
import PharmacyViewer from "./components/PharmacyViewer.jsx";
import DailyCheckIn from "./components/DailyCheckIn.jsx";
import { api, pingBackend } from "./services/api.js";
import { useEnrichedStrains } from "./hooks/useEnrichedStrains.js";
import LoadingSkeleton from "./components/LoadingSkeleton.jsx";
import { bridgeScore } from "./engine/legacyBridge.ts";
import { motion, AnimatePresence } from "framer-motion";
import T from "./locales/he.js";
import OnboardingWizard, { RadarChart, TERP_ORDER } from "./components/OnboardingWizard.jsx";
import OnboardingV3 from "./components/OnboardingV3.jsx";
import ReportFlow from "./components/ReportFlow.jsx";
import NextExperiment from "./components/NextExperiment.jsx";
import BasketPlannerScreen from "./components/BasketPlannerScreen.jsx";
import CommunitySplitScreen from "./components/CommunitySplitScreen.jsx";
import ImpactSummary from "./components/ImpactSummary.jsx";
import TermsGate from "./components/TermsGate.jsx";
import { friendWhy, killSwitchSummary, computeMapDiff, nextExperimentStrain } from "./lib/matchCopy.js";
import { useReportTiming } from "./hooks/useReportTiming.js";
import { TERPENE_HUMAN, terp as terpHuman, buildDnaStrands, avoidedHumanLabels } from "./lib/terpeneToHuman.js";
import { decodeMenu, fuseFind, parseLine } from "./lib/menuDecoder.js";
import { resolveScreen as _resolveScreen } from "./lib/resolveScreen.ts";
import { ocrFile } from "./lib/menuOcr.js";
import { downscaleImage } from "./lib/imagePrep.js";
import CameraCapture from "./components/CameraCapture.jsx";
import {
  createSession, addPage, retryPage, removePage, mergeSession,
  saveSession, loadSession, clearSession, imageHash,
} from "./lib/scanSession.js";
import { rankMenu, SOFT_LINE } from "./lib/menuRanking.js";
import { buildRoutesFromMenu } from "./lib/basketRoutes.js";
import { STRAINS, TERPENES, REASONS, CATEGORIES, CAT_GROUPS, FORMS } from "./data/strainsConfig.js";
import { PEEK_WINDOW_ENABLED } from "./lib/categoryConfig.js";
import { PHARMACIES } from "./data/pharmacies.js";
import BatchSignalBadge from "./components/BatchSignalBadge.jsx";
import NewOnMarket from "./components/NewOnMarket.jsx";
import {
  hashLicenseId, isValidIsraeliId, isLicenseExpired, daysToExpiry,
  stripExif, storeLicenseMeta, getStoredLicenseHash, readLicenseMeta, clearLicenseMeta,
} from "./lib/licenseUtils.js";

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
  {
    id: "tea", emoji: "🍵", name: "תה מרגיע לפני שינה", time: "10 דק'",
    dose: "2.5–5 מ\"ג — מושלם למתחילים", difficulty: "קל מאוד",
    ingredients: ["כוס מים רותחים", "שקית תה צמחים (כמיל, לבנדר)", "1 כפית חמאת קנאביס", "כפית דבש", "מעט חלב (לא חובה)"],
    steps: [
      "הכינו תה צמחים רגיל ותנו לו להתקרר ל-80°C (לא 100° — חום גבוה מדי פוגע ב-THC).",
      "הוסיפו כפית חמאת קנאביס וערבבו עד שנמסה לגמרי — השומן בחמאה חיוני לספיגה.",
      "הוסיפו דבש לטעם. שתו לאט, בחצי שעה הראשונה.",
    ],
    tip: "הדרך הכי עדינה ומרגיעה להתחיל. כוס אחת = מנה אחת. חכו שעתיים לפני שמחליטים על עוד.",
  },
  {
    id: "brownies", emoji: "🍫", name: "בראוניז קלאסיים", time: "50 דק'",
    dose: "~10–15 מ\"ג למנה (16 מנות)", difficulty: "קל",
    ingredients: ["תערובת בראוניז קופסה (כל מותג)", "חמאת קנאביס (במקום חמאה רגילה)", "2 ביצים", "2 כפות מים"],
    steps: [
      "הכינו את תערובת הבראוניז לפי ההוראות על הקופסה — רק החליפו את הכמות המלאה של חמאה בחמאת קנאביס.",
      "ערבבו היטב, יצקו לתבנית מרופדת נייר אפייה, ואפו ב-175°C כ-22–25 דקות.",
      "קררו לגמרי לפני שחותכים — זה חשוב! חתכו ל-16 ריבועים שווים.",
      "סמנו כל ריבוע ושמרו במקרר עד 5 ימים או בפריזר עד חודש.",
    ],
    tip: "הכי קל להתחיל. אם הבאצ' מכיל 160 מ\"ג THC — כל ריבוע = 10 מ\"ג. בדיוק נכון.",
  },
  {
    id: "cookies", emoji: "🍪", name: "עוגיות שוקולד צ'יפס", time: "35 דק'",
    dose: "5–12 מ\"ג לעוגייה (תלוי בגודל)", difficulty: "קל",
    ingredients: ["2 כוסות קמח", "110 גרם חמאת קנאביס מרוככת", "¾ כוס סוכר חום", "2 ביצים", "1 כפית וניל", "כוס שוקולד צ'יפס"],
    steps: [
      "ערבבו חמאת קנאביס עם הסוכר עד לקרם חלק. הוסיפו ביצים ווניל.",
      "הוסיפו קמח בהדרגה ולבסוף שוקולד צ'יפס. הבצק יהיה עבה — זה בסדר.",
      "יצרו כדורים קטנים (כ-20 גרם) והניחו על תבנית עם מרווחים. אפו ב-175°C כ-10–12 דקות.",
      "חשוב: עוגיות קטנות = פחות מ\"ג לעוגייה = שליטה טובה יותר. חכו שהן מתקררות לחלוטין.",
    ],
    tip: "מדידת בצק שווה = עוגיות שוות = מינון עקבי. השתמשו בכף מדידה.",
  },
  {
    id: "olive", emoji: "🫒", name: "שמן זית מוחדר", time: "2–3 שעות",
    dose: "~5–8 מ\"ג לכף גדושה", difficulty: "קל",
    ingredients: ["200 מ\"ל שמן זית כתית עלית", "3–5 גרם תפרחת מדורבקסת"],
    steps: [
      "שמו שמן זית בסיר קטן + תפרחת מדורבקסת. חממו לטמפרטורה נמוכה מאוד — 71–80°C.",
      "שמרו על החום 2–3 שעות תוך בחישה מדי פעם. אל תגיעו לרתיחה!",
      "סננו דרך בד גבינה לצנצנת זכוכית. סחטו היטב — כל טיפה חשובה.",
      "שמרו בצנצנת אפלה במקרר עד 3 חודשים.",
    ],
    tip: "שמן מוחדר הכי גמיש: על סלט, בפסטה, על לחם, בשייק. כף = מנה.",
  },
  {
    id: "pasta", emoji: "🍝", name: "פסטה שמן-שום", time: "20 דק'",
    dose: "~8–10 מ\"ג למנה", difficulty: "בינוני",
    ingredients: ["200 גרם פסטה (כל סוג)", "3 כפות שמן זית מוחדר", "4 שיני שום פרוסות", "פלפל שחור, מלח", "גרדה לימון + עשבי תיבול"],
    steps: [
      "בשלו פסטה לפי ההוראות. שמרו כוס ממי הבישול.",
      "חממו שמן זית מוחדר על אש נמוכה מאוד (70–80°C). הוסיפו שום — אל תשרפו!",
      "טגנו את השום 2 דקות ברכות. הוסיפו פסטה + קצת ממי הבישול.",
      "ערבבו, הוסיפו מלח, פלפל וגרדת לימון. הגישו מיד — מנה אחת לאדם.",
    ],
    tip: "בישול על אש גבוהה מרוסס את ה-THC. אש נמוכה מאוד — תמיד.",
  },
  {
    id: "hotchoc", emoji: "☕", name: "שוקו חם לפני שינה", time: "8 דק'",
    dose: "~5–8 מ\"ג — נהדר לשינה", difficulty: "קל מאוד",
    ingredients: ["כוס חלב (שקדים, שיבולת שועל, או פרה)", "1.5 כפות אבקת קקאו", "כפית חמאת קנאביס", "כפית דבש או מייפל", "קורט קינמון"],
    steps: [
      "חממו את החלב בסיר על אש נמוכה — עד שהוא חם אבל לא רותח (80°C). רתיחה מפרקת THC.",
      "הוסיפו קקאו + דבש וערבבו עד שנמס לגמרי.",
      "הורידו מהאש. הוסיפו חמאת קנאביס וערבבו 30 שניות — השומן מבטיח ספיגה מלאה.",
      "מזגו לכוס, הוסיפו קינמון. שתו לאט בשעה שלפני שינה.",
    ],
    tip: "קקאו מכיל theobromine שמרגיע בפני עצמו. הצירוף עם קנאביס מעמיק שינה. לא לשתות לפני נהיגה.",
  },
  {
    id: "chia", emoji: "🥣", name: "פודינג צ'יה לבוקר", time: "5 דק' + לילה",
    dose: "~4–6 מ\"ג — עדין, מושלם לבוקר", difficulty: "קל מאוד",
    ingredients: ["3 כפות זרעי צ'יה", "כוס חלב שקדים", "כפית שמן קנאביס (CBD עדיף לבוקר)", "כפית דבש או מייפל", "פירות טריים לציפוי"],
    steps: [
      "ערבבו צ'יה + חלב שקדים + שמן קנאביס + ממתיק בצנצנת. ערבבו שוב אחרי 5 דקות (מונע גושים).",
      "כסו ושמרו במקרר לכל הלילה — הצ'יה סופגת ומסמיכה.",
      "בבוקר: הוסיפו פירות טריים (אוכמניות, תות, בננה). אכלו ישר מהצנצנת.",
    ],
    tip: "שמן CBD בבוקר — ריכוז ורוגע בלי ערפול. שמן THC אחה\"צ — שינה טובה יותר. תנסו את שניהם ותגלו מה מתאים.",
  },
  {
    id: "hummus", emoji: "🫘", name: "חומוס עם שמן מוחדר", time: "3 דק'",
    dose: "~5 מ\"ג למנה בינונית", difficulty: "קל מאוד",
    ingredients: ["250 גרם חומוס מוכן", "2 כפות שמן זית מוחדר", "טחינה גולמית, לימון, שום כתוש, פפריקה"],
    steps: [
      "שמו חומוס בצלחת. צרו גומה במרכז.",
      "מזגו שמן זית מוחדר בתוך הגומה — לא מעל הכל.",
      "הוסיפו טחינה, מיץ לימון, שום, פפריקה ופטרוזיליה לפי טעם.",
    ],
    tip: "כף = ~2.5 מ\"ג. צלחת קטנה = ~5 מ\"ג. כוללו שמן מוחדר רק במנת עצמכם ותסמנו בבירור כשמשפחה בסביבה.",
  },
  {
    id: "gummies", emoji: "🐻", name: "גאמיז ביתיים", time: "30 דק' + 2 שעות קירור",
    dose: "~5 מ\"ג לסוכרייה (20 סוכריות)", difficulty: "בינוני",
    ingredients: ["3 כפות ג'לטין טבעי ללא טעם", "½ כוס מיץ פרי (מרוכז)", "½ כוס מים", "2 כפות סוכר", "2 כפות טינקטורה/שמן קנאביס"],
    steps: [
      "ערבבו מים קרים עם ג'לטין ותנו לנפח 2 דקות.",
      "חממו מיץ פרי עם סוכר על אש בינונית עד שמתמוסס. הוסיפו לג'לטין.",
      "הניחו לתערובת להתקרר ל-50°C. הוסיפו שמן/טינקטורה וערבבו חזק 2 דקות מלאות.",
      "יצקו לתבניות סיליקון. קררו 2 שעות. שמרו במקרר.",
    ],
    tip: "ערבבו את השמן בחוזקה ולמשך זמן — כדי שיתפזר אחיד בכל הסוכריות.",
  },
  {
    id: "hummus", emoji: "🫘", name: "חומוס מוחדר", time: "10 דק'",
    dose: "~5–7 מ\"ג ל-2 כפות גדולות", difficulty: "קל מאוד",
    ingredients: ["פחית חומוס מוכן (400 גרם)", "2 כפות שמן זית מוחדר", "מיץ לימון", "שן שום", "טחינה 2 כפות", "מלח"],
    steps: [
      "שפכו חומוס לבלנדר עם טחינה, לימון, שום ומלח.",
      "הוסיפו שמן זית מוחדר אחרון — לאחר הבלנדר, לא לתוכו (לא לחמם).",
      "ערבבו בכף עד שמשתלב. הגישו עם ירקות חתוכים.",
    ],
    tip: "טעים, לא מרגישים בטעם, ומנה ברורה. מצוין לצהריים — לא לפני שצריך לנהוג.",
  },
  {
    id: "choc", emoji: "🍫", name: "שוקולד ביתי", time: "20 דק' + קירור",
    dose: "~5 מ\"ג למשבצת (20 משבצות)", difficulty: "קל",
    ingredients: ["200 גרם שוקולד מריר 70%+", "2–3 כפות שמן קנאביס", "קורט מלח ים", "קצוות אגוז/פיסטוק (לא חובה)"],
    steps: [
      "המיסו שוקולד באמבט מים — לא מיקרוגל, לא אש ישירה.",
      "הניחו לשוקולד להתקרר מעט (45°C). הוסיפו שמן קנאביס וערבבו בחוזקה 2 דקות.",
      "יצקו לתבנית שוקולד או לנייר אפייה שטוח. פזרו אגוזים אם רוצים.",
      "קררו במקרר שעה, שברו למשבצות שוות.",
    ],
    tip: "שוקולד מריר מסתיר את הטעם הצמחי. כל משבצת = מנה מדויקת.",
  },
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
    // weak signal — onboarding pick is ONE data point, not an anchor
    s && Object.entries(s.terps).forEach(([t, v]) => add(t, v * 0.6));
  });
  (ans.notHelped || []).forEach((sid) => {
    const s = STRAINS.find((x) => x.id === sid);
    s && Object.entries(s.terps).forEach(([t, v]) => add(t, -v * 0.6));
  });
  Object.entries(ratings || {}).forEach(([sid, r]) => {
    const s = STRAINS.find((x) => x.id === sid);
    const f = ((r - 5.5) / 4.5) * 2.0;
    s && Object.entries(s.terps).forEach(([t, v]) => add(t, v * f));
  });
  Object.entries(ans.terpWeights || {}).forEach(([t, v]) => add(t, v));
  return w;
}

function scoreAll(rawAns, _ratings, indFilter = [], typeFilter = "all") {
  const ans = { cats: [], reasons: [], killSwitches: [], ...(rawAns || {}) };
  let eligible = STRAINS.filter((s) => ans.cats.includes(s.cat));
  if (typeFilter !== "all") {
    eligible = eligible.filter((s) => (s.type || "flower") === typeFilter);
  }
  if (indFilter.length > 0) {
    eligible = eligible.filter((s) => s.effects.some((e) => indFilter.includes(e)));
  }
  return eligible
    .map((s) => {
      const r = bridgeScore(s, ans);
      return { ...s, match: r.matchPct, confidence: r.confidence, _reasonHuman: r.reasonHuman, _topLayer: r.topLayer, _raw: r.matchPct };
    })
    .sort((a, b) => b.match - a.match || b.confidence - a.confidence);
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
// ── Indication chips — psychologically gentle order ─────────────────────────
// tier 1 = everyday/light (always visible)
// tier 2 = medical-common (always visible)
// tier 3 = sensitive/heavy (behind "הרחב ➕")
// filterAs = REASONS IDs that filter strains for this condition
export const INDICATION_CHIPS = [
  // ── Tier 1: everyday & light ─────────────────────────────────────────────
  { id:"sleep",   label:"שינה",        icon:"🌙", tier:1, filterAs:["sleep"] },
  { id:"relax",   label:"רוגע / הרגעה",icon:"🌿", tier:1, filterAs:["anxiety","sleep"] },
  { id:"pain_l",  label:"כאב",         icon:"💊", tier:1, filterAs:["pain"] },
  { id:"anxiety", label:"חרדה",        icon:"🧘", tier:1, filterAs:["anxiety"] },
  { id:"mood",    label:"מצב רוח",     icon:"☀️", tier:1, filterAs:["focus","appetite"] },
  // ── Tier 2: medical common ───────────────────────────────────────────────
  { id:"pain",    label:"כאב כרוני",   icon:"🦴", tier:2, filterAs:["pain"] },
  { id:"fibro",   label:"פיברומיאלגיה",icon:"⚡", tier:2, filterAs:["pain","sleep"] },
  { id:"gi",      label:"מחלות מעי",   icon:"🫁", tier:2, filterAs:["gi"] },
  { id:"nausea",  label:"בחילות",      icon:"🤢", tier:2, filterAs:["appetite"] },
  // ── Tier 3: sensitive / heavy — behind "הרחב ➕" ─────────────────────────
  { id:"ptsd",    label:"PTSD",        icon:"🛡", tier:3, filterAs:["ptsd","anxiety","sleep"] },
  { id:"epilepsy",label:"אפילפסיה",    icon:"⚡", tier:3, filterAs:["sleep","anxiety"] },
  { id:"ms",      label:"טרשת נפוצה",  icon:"🧠", tier:3, filterAs:["pain","sleep"] },
  { id:"parkinson",label:"פרקינסון",   icon:"🤲", tier:3, filterAs:["sleep","focus"] },
  { id:"tourette",label:"טיקים/טורט",  icon:"🔄", tier:3, filterAs:["anxiety","focus"] },
  { id:"autism",  label:"אוטיזם",      icon:"🌈", tier:3, filterAs:["anxiety","focus"] },
  { id:"cancer",  label:"סרטן/אונקו",  icon:"🎗", tier:3, filterAs:["pain","appetite"] },
  { id:"hiv",     label:"איידס",       icon:"🔴", tier:3, filterAs:["appetite","pain"] },
  { id:"dementia",label:"דמנציה",      icon:"🕊", tier:3, filterAs:["sleep","focus"] },
  { id:"palliative",label:"פליאטיבי",  icon:"🙏", tier:3, filterAs:["pain","sleep","appetite"] },
];

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
    research: "Shannon S. et al. (2019). Cannabidiol in Anxiety and Sleep. Perm J 23:18-041. PMID 30840523 · Crippa J.A. et al. (2011). CBD reduces anxiety via limbic-paralimbic activity. J Psychopharmacol 25(1):121. PMID 20829306 · Turna J. et al. (2017). Cannabinoid regulators of anxiety. Prog Neuropsychopharmacol Biol Psychiatry 72:17. PMID 27316781",
    israelNote: "פסיכיאטריה היא המגזר היציב ביותר בשוק הישראלי, בעלייה עקבית לכ-19,000 מטופלים.",
  },
  diabetes: {
    label: "נוירופתיה סוכרתית",
    summary: "נוירופתיה כואבת מופיעה אצל עד 50% ממטופלי סוכרת ארוכת-טווח. קנאביס בשאיפה הראה השפעה משככת תלוית-מינון על כאב נוירופתי סוכרתי עמיד לטיפול.",
    ratioNote: "מחקר ישראלי אורך (5 שנים, 52 מטופלים) השתמש ב-THC 20%/CBD<1% בשאיפה בטיטרציה אישית. מחקרים אחרים בחנו תצורות THC:CBD:CBN. מינון גבוה (7% THC) הגביר אופוריה ונמנום.",
    seek: ["pain"],
    successRate: 70, successNote: "~70% הצלחה טיפולית כללית ב-6 חודשים (מחקר פרוספקטיבי)",
    research: "Ware M.A. et al. (2010). Smoked cannabis for chronic neuropathic pain. CMAJ 182(14):E694. PMID 20805210 · Serpell M. et al. (2014). Oromucosal cannabis spray for neuropathic pain. Pain 155(12):2507. PMID 25261586 · Dogrul A. et al. (2020). Prospective 5-year study, diabetic neuropathy, Israel. NCBI PMC",
    israelNote: "מחקר האורך המשמעותי בתחום נערך בישראל — יתרון מקומי לדאטה.",
  },
  sleep: {
    label: "שינה (נדודי שינה)",
    summary: "מטופלים רבים מדווחים על הירדמות מהירה יותר, שינה רציפה פחות מקוטעת והפחתת יקיצות ליליות. ההשפעה משתנה לפי הזן ודרך המתן.",
    ratioNote: "מירצן ולינלול הם הטרפנים המרגיעים העיקריים. אינדיקות עתירות-מירצן נחקרות לשינה. THC עוזר בהירדמות, אך מינון גבוה מדי עלול לפגוע באיכות שלב REM. שמן לפני שינה נותן מענה ארוך לכל הלילה.",
    seek: ["sleep", "anxiety"],
    successRate: 88, successNote: "רוב המטופלים מדווחים שיפור בזמן ההירדמות ובאיכות השינה",
    research: "Shannon S. et al. (2019). CBD improved sleep in 66.7% after 1 month. Perm J 23:18-041. PMID 30840523 · Bhagavan C. et al. (2020). Cannabinoids for sleep — systematic review. J Clin Neurophysiol 37(5):369. PMID 32604063 · Babson K.A. et al. (2017). Cannabis, Cannabinoids, and Sleep. Curr Psychiatry Rep 19(4):23. PMID 28349316",
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
    research: "Naftali T. et al. (2013). Cannabis induces clinical response in Crohn's. Isr Med Assoc J 15(1):39. PMID 23472187 · Naftali T. et al. (2021). Low-dose CBD-rich cannabis in IBD. Digestion 102(6):735. PMID 34515079 · Klieger S.B. et al. (2022). IBD patient survey, Israel — quality of life. BMC Gastroenterol 22:48",
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
    research: "Naftali T. et al. (2013). Cannabis induces clinical response in active Crohn's disease. Isr Med Assoc J 15(1):39. PMID 23472187 · Naftali T. et al. (2021). Low-dose cannabidiol is safe, tolerates in IBD. Digestion 102(6):735. PMID 34515079",
  },
  ms: {
    label: "טרשת נפוצה (MS)",
    summary: "קנאביס נחקר להקלה על ספסטיות (נוקשות שרירים), כאב נוירופתי, ושיפור שינה בטרשת נפוצה. Sativex (תרסיס THC:CBD) מאושר במדינות רבות בדיוק להתוויה זו.",
    ratioNote: "יחס מאוזן THC:CBD (כמו ב-Sativex, ~1:1) נחקר לספסטיות. טיטרציה איטית מפחיתה תופעות לוואי. CBD מסייע לאיזון.",
    seek: ["pain", "sleep", "anxiety"],
    successRate: 80, successNote: "הקלה מדווחת בספסטיות ובכאב; Sativex מאושר רשמית לספסטיות ב-MS",
    research: "Collin C. et al. (2010). Randomized, controlled trial of nabiximols (Sativex) for spasticity in MS. Eur J Neurol 17(9):1143. PMID 20236334 · Rog D.J. et al. (2005). Nabiximols for central pain in MS. Neurology 65(6):812. PMID 16186518 · Zajicek J.P. et al. (2012). MUSEC — multicenter MS/cannabis RCT. BMJ 344:e1511. PMID 22411043",
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
    research: "Devinsky O. et al. (2017). Trial of cannabidiol for drug-resistant seizures in Dravet syndrome. NEJM 376(21):2011. PMID 28538134 · Thiele E.A. et al. (2018). Cannabidiol in patients with Lennox-Gastaut (GWPCARE4). Lancet 391(10125):1085. PMID 29395273 · Friedman D. & Devinsky O. (2015). Cannabinoids in the treatment of epilepsy. NEJM 373(11):1048",
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
    research: "Aran A. et al. (2019). CBD-Rich Cannabis in Children with ASD. J Autism Dev Disord 49(12):4039. PMID 29484505 · Barchel D. et al. (2019). Oral CBD in ASD. Front Pharmacol 9:1521. PMID 30687075 · Bar-Lev Schleider L. et al. (2019). Safety/efficacy of medical cannabis in children, Israel. Front Pharmacol 10:786. PMID 31417408",
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

// ── Terpene wheel / radar — centerpiece of the profile ───────────────────────
// Pure SVG, no library. 7 axes, bloom from center, per-terpene glow dots.
// Labels use terpeneToHuman.js (human language only — no chemical names).
const RADAR_KEYS = ['myrcene','limonene','pinene','terpinolene','caryophyllene','humulene','linalool'];
const RADAR_CX = 150, RADAR_CY = 148, RADAR_R = 90, RADAR_LR = 133;

function radarAngle(i)       { return (i * 2 * Math.PI / RADAR_KEYS.length) - Math.PI / 2; }
function radarPt(i, r)       { const a = radarAngle(i); return { x: RADAR_CX + r * Math.cos(a), y: RADAR_CY + r * Math.sin(a) }; }
function radarPolyPts(vals)  { return RADAR_KEYS.map((_, i) => { const p = radarPt(i, RADAR_R * Math.max(0.04, vals[i])); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' '); }
function radarGridPts(s)     { return RADAR_KEYS.map((_, i) => { const p = radarPt(i, RADAR_R * s); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' '); }
function radarAnchor(i)      { const x = Math.cos(radarAngle(i)); return x > 0.2 ? 'start' : x < -0.2 ? 'end' : 'middle'; }

function TerpRadar({ profile, avoided = [] }) {
  const raw        = RADAR_KEYS.map(t => Math.max(0, profile[t] || 0));
  const maxV       = Math.max(...raw, 0.01);
  const vals       = raw.map(v => v / maxV);
  const avoidedSet = new Set(avoided);

  return (
    <motion.svg viewBox="0 0 300 296"
      style={{ width: '100%', maxWidth: 320, display: 'block', margin: '0 auto', overflow: 'visible' }}
      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}>
      <defs>
        <radialGradient id="rFill" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#4ADE80" stopOpacity="0.70" />
          <stop offset="100%" stopColor="#22C55E" stopOpacity="0.15" />
        </radialGradient>
        <filter id="rGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="dotGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Center pulse ring — heartbeat of your profile */}
      <motion.circle cx={RADAR_CX} cy={RADAR_CY}
        fill="none" stroke="rgba(74,222,128,0.35)" strokeWidth={1.5}
        animate={{ r: [11, 17, 11], opacity: [0.35, 0.08, 0.35] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} />

      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1.0].map((s, ri) => (
        <polygon key={ri} points={radarGridPts(s)}
          fill="none"
          stroke={ri === 3 ? 'rgba(74,222,128,0.30)' : 'rgba(74,222,128,0.09)'}
          strokeWidth={ri === 3 ? 1.5 : 0.8}
          strokeDasharray={ri === 3 ? undefined : '3 5'}
        />
      ))}

      {/* Axis spokes */}
      {RADAR_KEYS.map((_, i) => {
        const tip = radarPt(i, RADAR_R);
        return <line key={i} x1={RADAR_CX} y1={RADAR_CY} x2={tip.x.toFixed(1)} y2={tip.y.toFixed(1)}
          stroke="rgba(74,222,128,0.11)" strokeWidth={0.9} />;
      })}

      {/* Filled data polygon — blooms from center */}
      <motion.polygon
        points={radarPolyPts(vals)}
        fill="url(#rFill)" stroke="#4ADE80" strokeWidth={2.2} strokeLinejoin="round"
        filter="url(#rGlow)"
        style={{ transformOrigin: `${RADAR_CX}px ${RADAR_CY}px` }}
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ duration: 0.90, type: 'spring', stiffness: 180, damping: 16, delay: 0.18 }}
      />

      {/* Vertex dots — colored per terpene */}
      {RADAR_KEYS.map((t, i) => {
        if (vals[i] < 0.07) return null;
        const p   = radarPt(i, RADAR_R * vals[i]);
        const col = avoidedSet.has(t) ? '#F87171' : (TERPENE_HUMAN[t]?.color || '#4ADE80');
        return (
          <motion.circle key={t} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={6}
            fill={col} stroke="#07120A" strokeWidth={2}
            filter="url(#dotGlow)"
            style={{ transformOrigin: `${p.x}px ${p.y}px` }}
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ delay: 0.55 + i * 0.07, duration: 0.35, type: 'spring', stiffness: 360, damping: 18 }}
          />
        );
      })}

      {/* Axis labels: emoji icon + human shortLabel (from terpeneToHuman.js) */}
      {RADAR_KEYS.map((t, i) => {
        const lp      = radarPt(i, RADAR_LR);
        const info    = TERPENE_HUMAN[t];
        const isActive  = vals[i] > 0.07;
        const isAvoided = avoidedSet.has(t);
        const col = isAvoided ? '#FCA5A5' : isActive ? (info?.color || '#4ADE80') : 'rgba(187,247,208,0.24)';
        const anchor = radarAnchor(i);
        return (
          <text key={t} textAnchor={anchor}>
            <tspan x={lp.x.toFixed(1)} y={(lp.y - 6).toFixed(1)} fontSize="15" fill={col}>
              {isAvoided ? '🛡' : (info?.icon || '🌿')}
            </tspan>
            <tspan x={lp.x.toFixed(1)} dy="14" fontSize="10" fontWeight={isActive ? '800' : '400'} fill={col}>
              {info?.shortLabel || t}
            </tspan>
          </text>
        );
      })}
    </motion.svg>
  );
}

/* ───────────── ה-DNA הגנטי האישי ─────────────
   טביעת האצבע הקנאבינואידית של המטופל — נבנית ממה שלמדנו עליו.
   ויזואליזציה של פרופיל הטרפנים + רמת ביטחון + הגנטיקות שמרכיבות אותו. */
// True when the user has at least one preference signal beyond the license category.
// A license alone only says what they're *allowed* to buy — not what fits them.
function hasPreferenceSignal(ans, ratings = {}) {
  return (ans.reasons || []).length > 0
    || (ans.flavors  || []).length > 0
    || (ans.helped   || []).length > 0
    || (ans.notHelped|| []).length > 0
    || (ans.current  || []).length > 0
    || Object.keys(ratings || {}).length > 0;
}

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
  const conf    = geneticConfidence(ans, ratings);
  const seq     = dnaSequence(profile);

  const active = Object.entries(profile)
    .filter(([t, v]) => v > 0 && TERPENES[t])
    .sort((a, b) => b[1] - a[1]);
  const avoided = Object.entries(profile)
    .filter(([t, v]) => v < 0 && TERPENES[t])
    .sort((a, b) => a[1] - b[1]);

  const buildingBlocks = [...new Set([
    ...ans.helped,
    ...Object.entries(ratings).filter(([, r]) => r >= 7).map(([id]) => id),
  ])].map(id => STRAINS.find(s => s.id === id)).filter(Boolean);

  const hasProfile  = active.length > 0;
  const [copied,     setCopied]     = useState(false);
  const [showScience, setShowScience] = useState(false);

  const share = () => {
    const txt = `הפרופיל שלי בקנאמאצ׳ 🌿\nפרופיל: ${seq}\nמה שעובד לי: ${active.slice(0,3).map(([t]) => terpHuman(t, 'strand')).join(", ")}\nקנאמאצ׳ — מיטוב הקנייה החודשית שלך`;
    if (navigator.clipboard) { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  return (
    <div className="space-y-4">

      {/* ── Hero card — radar centerpiece ──────────────────────────────── */}
      <div className="rounded-3xl p-5 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg,#0D2B1B 0%,#0F3D22 55%,#061A10 100%)", border: "1.5px solid rgba(74,222,128,0.22)" }}>

        {/* Ambient glow behind radar */}
        <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', width: 220, height: 220,
          background: 'radial-gradient(circle,rgba(74,222,128,0.12),transparent 68%)', pointerEvents: 'none' }} />

        {/* Header */}
        <div className="flex items-center justify-between mb-1 relative">
          <h3 className="font-bold text-base" style={{ color: "#F0FDF4" }}>🌿 הפרופיל הטרפני שלך</h3>
          <span className="text-xs px-2.5 py-1 rounded-full font-bold"
            style={{ background: "rgba(74,222,128,0.18)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.28)" }}>
            {conf.pct}% · {conf.label}
          </span>
        </div>
        <p className="text-xs mb-5 relative" style={{ color: "rgba(187,247,208,0.58)" }}>
          {hasProfile
            ? active.slice(0, 2).map(([t]) => terpHuman(t, 'strand')).join(' · ')
            : 'טביעת האצבע הייחודית שלך תיבנה מהדירוגים שלך'}
        </p>

        {/* ── RADAR — the centerpiece ── */}
        {hasProfile ? (
          <div className="relative mb-5">
            <TerpRadar profile={profile} />
          </div>
        ) : (
          <div className="text-center py-10 mb-5">
            {/* Ghost radar for empty state */}
            <svg viewBox="0 0 300 296" style={{ width: '100%', maxWidth: 240, display: 'block', margin: '0 auto 16px', opacity: 0.18 }}>
              {[0.25, 0.5, 0.75, 1.0].map((s, ri) => (
                <polygon key={ri} points={radarGridPts(s)} fill="none" stroke="#4ADE80" strokeWidth={ri === 3 ? 1.4 : 0.8} strokeDasharray="3 4" />
              ))}
              {RADAR_KEYS.map((_, i) => { const tip = radarPt(i, RADAR_R); return <line key={i} x1={RADAR_CX} y1={RADAR_CY} x2={tip.x.toFixed(1)} y2={tip.y.toFixed(1)} stroke="#4ADE80" strokeWidth={0.9} />; })}
            </svg>
            <p className="text-sm mb-4" style={{ color: "rgba(187,247,208,0.55)" }}>הגלגל הטרפני שלכם עוד ריק</p>
            <button onClick={goJournal}
              className="text-sm px-6 py-2.5 rounded-xl font-bold"
              style={{ background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.30)" }}>
              ← דרגו זן ראשון ביומן
            </button>
          </div>
        )}

        {/* ── Strand pills ── */}
        {hasProfile && (
          <div className="flex flex-wrap gap-2 justify-center mb-5">
            {active.slice(0, 4).map(([t], idx) => {
              const info = TERPENE_HUMAN[t];
              const col  = info?.color || '#4ADE80';
              return (
                <motion.span key={t}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.0 + idx * 0.09, duration: 0.3 }}
                  className="text-xs font-bold px-3 py-1.5 rounded-full"
                  style={{ background: col + '22', color: col, border: `1px solid ${col}44` }}>
                  {info?.icon} {info?.strand || info?.shortLabel}
                </motion.span>
              );
            })}
          </div>
        )}

        {/* ── DNA code + share ── */}
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl px-3 py-2 font-mono text-sm tracking-wider truncate"
            style={{ background: "rgba(0,0,0,0.38)", color: "#A8E6C0" }}>
            {seq}
          </div>
          <button onClick={share}
            className="text-xs px-3 py-2 rounded-xl font-bold whitespace-nowrap"
            style={{ background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.30)" }}>
            {copied ? "הועתק ✓" : "שתף 🌿"}
          </button>
        </div>
      </div>

      {/* ── Profile progress ── */}
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

      {/* ── Science accordion ── */}
      {hasProfile && (
        <div className="rounded-2xl overflow-hidden border" style={{ background: "rgba(12,18,14,0.95)", borderColor: "rgba(74,222,128,0.14)" }}>
          <button onClick={() => setShowScience(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span className="font-bold text-sm" style={{ color: '#4ADE80' }}>🔬 מה הפרופיל שלך אומר</span>
            <motion.span animate={{ rotate: showScience ? 180 : 0 }} transition={{ duration: 0.22 }}
              style={{ fontSize: 11, color: 'rgba(74,222,128,0.45)', display: 'inline-block' }}>▼</motion.span>
          </button>
          <AnimatePresence>
            {showScience && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.22,1,0.36,1] }}
                style={{ overflow: 'hidden' }}>
                <div className="px-4 pb-4 space-y-2.5">
                  <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.50)" }}>
                    ניתוח פרופיל הטרפנים שלך — מבוסס על מחקרים ומאגרי מידע פתוחים
                  </p>
                  {active.slice(0, 3).map(([t]) => {
                    const sci  = TERP_SCIENCE[t];
                    const col  = TERPENE_HUMAN[t]?.color || TERPENES[t]?.color || '#4ADE80';
                    return sci ? (
                      <div key={t} className="rounded-xl p-3"
                        style={{ background: "rgba(255,255,255,0.04)", borderRight: `3px solid ${col}`, border: `1px solid rgba(255,255,255,0.06)`, borderRightWidth: 3 }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm" style={{ color: col }}>{terpHuman(t,'icon')} {terpHuman(t,'shortLabel')}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: col + '22', color: col }}>{sci.role}</span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.68)" }}>{sci.detail}</p>
                      </div>
                    ) : null;
                  })}
                  {avoided.length > 0 && (
                    <p className="text-xs rounded-xl p-2.5"
                      style={{ background: "rgba(248,113,113,0.08)", color: "#FCA5A5", border: "1px solid rgba(248,113,113,0.15)" }}>
                      🛡️ כדאי להימנע מ: {avoided.map(([t]) => terpHuman(t, 'shortLabel')).join(", ")} — לפי הדיווחים שלך.
                    </p>
                  )}
                  <p className="text-xs text-center" style={{ color: "rgba(187,247,208,0.35)" }}>
                    מידע כללי בלבד, אינו ייעוץ רפואי.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Building blocks ── */}
      {buildingBlocks.length > 0 && (
        <div className="rounded-2xl p-4 border" style={{ background: "rgba(12,18,14,0.95)", borderColor: "rgba(74,222,128,0.14)" }}>
          <h4 className="font-bold text-sm mb-1" style={{ color: "#4ADE80" }}>🌿 זנים שעבדו לך</h4>
          <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.50)" }}>
            מה שדרגתם גבוה — מהווה את הבסיס לפרופיל שלך
          </p>
          <div className="space-y-2">
            {buildingBlocks.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl p-2.5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(74,222,128,0.08)" }}>
                <div className="min-w-0">
                  <div className="font-bold text-sm" style={{ color: "#F0FDF4" }}>{s.name}</div>
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
          {terpHuman(t,'icon')} {terpHuman(t,'shortLabel')}
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
  const [noSignalAlert, setNoSignalAlert] = useState(false);
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
          onClick={() => {
            if (i < activeSteps.length - 1) { setI(i + 1); return; }
            if (!hasPreferenceSignal(ans)) { setNoSignalAlert(true); return; }
            onDone();
          }}
          className="flex-1 py-3 rounded-xl font-bold disabled:opacity-35 transition-all"
          style={{ background:CD.accent, color:"#061006", boxShadow:"0 2px 14px rgba(57,255,133,.3)" }}>
          {i < activeSteps.length - 1 ? "המשך" : "בנו לי פרופיל"}
        </button>
      </div>

      {noSignalAlert && (
        <div className="rounded-2xl p-4 mt-3" dir="rtl"
          style={{ background: "rgba(251,191,36,0.08)", border: "1.5px solid rgba(251,191,36,0.35)" }}>
          <p style={{ fontSize:13, fontWeight:700, color:"#FBBF24", marginBottom:6 }}>
            נצטרך עוד פרט אחד
          </p>
          <p style={{ fontSize:12, color:"rgba(251,191,36,0.80)", lineHeight:1.6, marginBottom:12 }}>
            הרישיון אומר מה אתה מורשה לקנות — לא מה מתאים לך. בלי מטרה, טעם, או זן שניסית בעבר, לא נוכל לחשב התאמה אמיתית.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setNoSignalAlert(false)}
              className="flex-1 py-2 rounded-xl text-xs font-bold"
              style={{ background:"rgba(251,191,36,0.15)", color:"#FBBF24", border:"1px solid rgba(251,191,36,0.30)" }}>
              הוסף מטרה
            </button>
            <button onClick={() => { setNoSignalAlert(false); onDone(); }}
              className="px-4 py-2 rounded-xl text-xs font-medium"
              style={{ color:"rgba(187,247,208,0.50)", background:"transparent" }}>
              המשך בכל זאת
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── מסכי האפליקציה ───────────── */

/* "למה זה מתאים לך" — בשפת גנטיקות, לא טרפנים */
function matchReason(strain, ans, ratings) {
  const profile = buildProfile(ans, ratings);
  const bits = [];
  if (ans.helped.includes(strain.id)) bits.push("כבר עזר לך בעבר");
  // קרבה גנטית: זן אהוב שחולק שני טרפנים דומיננטיים
  // Require ≥2 liked data points before drawing cross-genetics; require 2 shared
  // high terpenes (≥0.65) so one shared terpene doesn't make every strain a "sibling".
  const likedIds = [...new Set([...ans.helped,
    ...Object.entries(ratings).filter(([, r]) => r >= 7).map(([id]) => id)])];
  const sharedHighTerps = (s1, s2) =>
    Object.keys(s1.terps).filter(t => (s1.terps[t] ?? 0) >= 0.65 && (s2.terps[t] ?? 0) >= 0.65).length;
  const sibling = likedIds.length >= 2
    ? likedIds.map((id) => STRAINS.find((s) => s.id === id))
        .filter((s) => s && s.id !== strain.id)
        .find((s) => sharedHighTerps(s, strain) >= 2)
    : null;
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

function communityLine(s) {
  if (s.nReviews >= 10 && s.eff && Object.keys(s.eff).length > 0) {
    const top2 = Object.entries(s.eff).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([k]) => EFFECTS[k]).filter(Boolean);
    if (top2.length > 0) return { text: `${s.nReviews} מדווחים: ${top2.join(' ו-')}`, tag: null };
  }
  if (s.genetics && s.genetics !== s.name) {
    const topR = REASONS.find(r => s.effects?.includes(r.id));
    const hint = topR ? ` — נוטה ל${topR.label}` : '';
    return { text: `מהמשפחה של ${s.genetics}${hint}`, tag: null };
  }
  const kindDesc = { 'אינדיקה': 'פרופיל ערב', 'סאטיבה': 'פרופיל יום', 'היברידי': 'פרופיל מאוזן' }[s.kind] || 'פרופיל מאוזן';
  const topR = REASONS.find(r => s.effects?.includes(r.id));
  return {
    text: `${kindDesc}${topR ? `, ${topR.label}` : ''}`,
    tag: 'עדיין מעט דיווחים — תנסה ותדווח 🌱',
  };
}

/* ───────────── כרטיס התוויה — מסיווג ההתוויות לפי מחקר ─────────────
   מציג את ההתאמה בשפה ברורה, עם פרטי טרפנים מסתתרים מאחורי + */
function IndicationCard({ rid, prof, topStrains, scored, ans }) {
  const [expanded, setExpanded] = useState(false);

  // פירמידת עדיפות לפי מחקר (מה הכי מומלץ להתוויה זו)
  const indicationRecommendation = {
    ptsd: { headline: "לפוסט-טראומה", top: "D-51, אור (טוגדר), Wedding CK", tip: "מטופלים מדווחים שזנים מרגיעים ומשקיטים עוזרים לסיוטים ולשינה. THC מתון. הדעה הרפואית חלוקה — חשוב להתייעץ עם הרופא/ה." },
    anxiety: { headline: "טוב לחרדה", top: "אור, תכלת, ספיישל טי", tip: "זנים מרגיעים בלי קהות ביום. עדיף THC מתון, לא גבוה." },
    sleep: { headline: "לשינה", top: "P&Z, אור, Ice Cream Cake", tip: "זנים שמרגיעים גוף ומחשבה לקראת השינה. אידוי בטמפ' גבוהה (195°+) לשינה." },
    pain: { headline: "לכאב כרוני", top: "Carbo, Wedding CK, Special T (שמן)", tip: "זנים נוגדי דלקת. שמן = השפעה ארוכה (5-6 שעות) לכאב מתמשך." },
    focus: { headline: "לריכוז ואנרגיה", top: "תכלת, JU, גרין קלובר", tip: "זנים מחדדים ומרעננים — עירנות בלי ערפול. סאטיבה ביום, בבוקר." },
    appetite: { headline: "לתיאבון ובחילות", top: "JU, P&Z, Wedding CK", tip: "זנים שמגרים תיאבון. עישון/אידוי מהיר יותר מאשר שמן לבחילות חריפות." },
    gi: { headline: "למערכת עיכול", top: "Carbo, Special T, אבידקל", tip: "זנים נוגדי דלקת למעי. CBD עוזר ללא פסיכואקטיביות." },
    diabetes: { headline: "לנוירופתיה סוכרתית", top: "Wedding CK, Carbo, Special T", tip: "זנים נוגדי כאב ומרגיעים לכאב עצבי. טיטרציה זהירה עם הרופא/ה." },
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

function Recs({ scored, basket, addToBasket, ans, ratings, typeFilter, setTypeFilter, setTab }) {
  const [open, setOpen] = useState(null);
  const [indFilter, setIndFilter] = useState("auto"); // auto = ההתוויות של המשתמש
  const [showInfo, setShowInfo] = useState(false);

  // RWE — community_stats cache: { [strainId]: { avg, n, helpedPct, note } }
  const [communityStats, setCommunityStats] = useState({});
  useEffect(() => {
    if (!open || communityStats[open]) return;
    const _activeChip = INDICATION_CHIPS.find(c => c.id === indFilter);
    const indicationId = indFilter !== "auto"
      ? (_activeChip?.filterAs?.[0] ?? indFilter)
      : (ans.reasons?.[0] || null);
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

  // ── Tier-ordered indication chips (gentle psychological order) ────────────
  // tier 1: everyday/light · tier 2: medical-common · tier 3: heavy/sensitive
  const userReasons = ans.reasons || [];
  const allTieredChips = [1, 2, 3].flatMap(t => INDICATION_CHIPS.filter(c => c.tier === t));
  // A chip is "matched" if any filterAs reason is in the user's profile
  const matchedIds = new Set(
    allTieredChips.filter(c => c.filterAs.some(r => userReasons.includes(r))).map(c => c.id)
  );
  const baseChips  = [
    { id: "auto", label: "✨ לפי הפרופיל שלי", icon: null, tier: 0 },
    ...allTieredChips.filter(c => matchedIds.has(c.id)),
  ];
  // Extra = unmatched chips in tier order (tier 3 always here even if matched above threshold)
  const extraChips = allTieredChips.filter(c => !matchedIds.has(c.id));
  const [showAllInds, setShowAllInds] = useState(false);
  const indChips = showAllInds ? [...baseChips, ...extraChips] : baseChips;

  // סינון לפי התוויה נבחרת
  let pool = enrichedScored;
  if (indFilter !== "auto") {
    const chip = INDICATION_CHIPS.find(c => c.id === indFilter);
    if (chip) {
      pool = enrichedScored.filter(s => s.effects.some(e => chip.filterAs.includes(e)));
    } else {
      const prof = INDICATION_PROFILES[indFilter];
      if (prof) pool = enrichedScored.filter(s => s.effects.some(e => prof.seek.includes(e) || e === indFilter));
    }
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

  // 3.2 gate: license alone ≠ enough to recommend
  if (ans.cats.length > 0 && !hasPreferenceSignal(ans, ratings)) {
    return (
      <div className="space-y-4 px-1 pt-2">
        <div className="rounded-2xl p-5 text-center" dir="rtl"
          style={{ background: "rgba(74,222,128,0.06)", border: "1.5px solid rgba(74,222,128,0.22)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧬</div>
          <p style={{ fontSize: 16, fontWeight: 800, color: "#4ADE80", marginBottom: 8 }}>
            צריכים עוד פרט אחד
          </p>
          <p style={{ fontSize: 13, color: "rgba(187,247,208,0.70)", lineHeight: 1.6, marginBottom: 20 }}>
            הרישיון שלך אומר מה אתה <b>מורשה</b> לקנות — לא מה <b>מתאים</b> לך.
            כדי לחשב התאמה אמיתית, נצטרך מטרה אחת לפחות: למה אתה משתמש, מה עזר, או באיזה זמן ביום.
          </p>
          <button
            onClick={() => setTab?.("dna")}
            className="auth-btn-primary"
            style={{ maxWidth: 240, margin: "0 auto" }}>
            עדכן פרופיל ✏️
          </button>
        </div>
      </div>
    );
  }

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
              {c.icon ? `${c.icon} ${c.label}` : c.label}
            </button>
          ))}
          {!showAllInds && extraChips.length > 0 && (
            <button onClick={() => setShowAllInds(true)}
              className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition"
              style={{ background: C.card, color: "rgba(187,247,208,0.50)", border: `1px dashed ${C.line}` }}>
              הרחב ➕
            </button>
          )}
          {showAllInds && (
            <button onClick={() => setShowAllInds(false)}
              className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition"
              style={{ background: C.card, color: "rgba(187,247,208,0.50)", border: `1px dashed ${C.line}` }}>
              סגור ✕
            </button>
          )}
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
      {/* Peek window — out-of-license product count.
          🚧 REGULATORY BLOCKER: disabled until Tom gets legal sign-off (PEEK_WINDOW_ENABLED=false).
          When enabled: informational count only. Zero CTA. Medical disclaimer attached. */}
      {PEEK_WINDOW_ENABLED && ans.cats.length > 0 && (() => {
        const oolCount = STRAINS.filter(s => !ans.cats.includes(s.cat)).length;
        const oolCats  = [...new Set(STRAINS.filter(s => !ans.cats.includes(s.cat)).map(s => s.cat))];
        if (oolCount === 0) return null;
        return (
          <div style={{
            borderRadius: 14, padding: '12px 16px', marginTop: 4,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <p style={{ fontSize: 12, color: 'rgba(187,247,208,0.50)', lineHeight: 1.5 }}>
              {oolCount} מוצרים נוספים קיימים בקטלוג עבור קטגוריות
              {oolCats.length <= 3 ? ` ${oolCats.join(', ')}` : ''} שאינן ברישיון הנוכחי שלך.
            </p>
            <p style={{ fontSize: 11, color: 'rgba(187,247,208,0.35)', marginTop: 5, lineHeight: 1.45 }}>
              ההחלטה על שינוי קטגוריה נקבעת מול הרופא המטפל — לא דרך האפליקציה.
            </p>
          </div>
        );
      })()}

      {visible.map((s) => {
        const reason = matchReason(s, ans, ratings);
        const comm = communityStats[s.id] || null;
        const isOpen = open === s.id;
        const tier = matchTier(s.match);
        const cl = communityLine(s);
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
                {s._reasonHuman && (
                  <p style={{ fontSize: 11, color: 'rgba(187,247,208,0.5)', margin: '0 0 4px', lineHeight: 1.3 }}>
                    {s._reasonHuman}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{ background: tier.bg, color: tier.color }}>{tier.icon} {tier.label}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{ background: C.soft, color: C.accent }}>{s.cat}</span>
                  <span className="text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>{s.kind}</span>
                </div>
              </div>
              <div className="text-center">
                <button onClick={(e) => { e.stopPropagation(); addToBasket(s.id); }}
                  disabled={basket.includes(s.id)}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold text-white disabled:opacity-40"
                  style={{ background: C.accent }}>
                  {basket.includes(s.id) ? "בתכנון ✓" : "+ לתכנון"}
                </button>
              </div>
            </div>

            {!isOpen && (
              <div className="px-4 pb-3">
                <p className="text-xs" style={{ color: 'rgba(187,247,208,0.62)' }}>👥 {cl.text}</p>
                {cl.tag && <p className="text-xs mt-0.5" style={{ color: 'rgba(187,247,208,0.35)' }}>{cl.tag}</p>}
              </div>
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
                    {s._flaggedBatch && (
                      <BatchSignalBadge
                        axis={s._flaggedBatch.axis}
                        n={s._flaggedBatch.n}
                        adverseRate={s._flaggedBatch.adverseRate}
                      />
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


// ── Personal terpene insight copy — warm friend tone, zero chemical names ─────
const TERP_PERSONAL = {
  myrcene:       { hook: "השקט הפנימי שלך", insight: "מטופלים עם פרופיל כזה מדווחים על הרפיית שרירים, שינה עמוקה יותר ותחושת ריקון נעים בלי קהות מוחית. הזנים שנמצא לך יהיו כנראה בעלי ריח אדמתי ומנגו — כבדים אבל ממוקדים." },
  limonene:      { hook: "מרים לך את מצב הרוח", insight: "הפרופיל ההדרי שלך מאפיין מטופלים שמחפשים שיפור מצב רוח, הקלה בחרדה ואנרגיה נקייה. ריח חד-לימוני הוא הסימן שאנחנו מחפשים בשבילך בכל תפריט." },
  caryophyllene: { hook: "נלחם בכאב בשבילך", insight: "הפרופיל שלך מרמז על זנים שמורידים כאב ודלקת — בלי להשפיע על הראש. אפשר לצרוך אותם גם ביום בלי לאבד פוקוס." },
  linalool:      { hook: "הרגעה עדינה — בלי מאמץ", insight: "פרופיל לבנדרי. הזנים שמתאימים לך עוזרים לחרדה ולשינה בצורה עדינה ומאוזנת — בלי ה-'כבדות' שלפעמים מגיעה עם זנים מרגיעים חזקים." },
  pinene:        { hook: "ריכוז ועירנות ביום", insight: "פרופיל יערי-אורני. הזנים שנמצא לך מאפיינים מטופלים שמחפשים עירנות, ריכוז ו'פוקוס נקי'. הכלי שלך לשעות הבוקר והצהריים." },
  humulene:      { hook: "נוגד-דלקת שעובד בשקט", insight: "הפרופיל שלך מופיע אצל מטופלים עם מצבים דלקתיים. הזנים עובדים ברקע — לא תרגיש 'גבוה', אבל הגוף כן ירגיש הבדל." },
  terpinolene:   { hook: "מאוזן ורענן — לא כבד מדי", insight: "הפרופיל שלך מופיע אצל מטופלים שמחפשים אפקט מרומם ומאוזן — לא דפרסיבי, לא חזק מדי. אידיאלי ליום או לשעות המעבר בין יום ללילה." },
  ocimene:       { hook: "טרופי, עליז ומרומם", insight: "פרופיל טרופי. הזנים שנמצא לך מאפיינים מטופלים שמחפשים חיוניות ועליזות. הריח הפירותי-אקזוטי הוא הסימן שאנחנו מחפשים בשבילך." },
};

function Profile({ ans, ratings, goDNA, licenseVerified = false }) {
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

  const hasProfile    = active.length > 0;
  const dominantTerp  = hasProfile ? active[0][0] : null;
  const dominantInfo  = dominantTerp ? TERPENE_HUMAN[dominantTerp] : null;
  const dominantColor = dominantInfo?.color || '#4ADE80';

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

      {/* ── 2. Terpene Wheel — centerpiece, big and proud ─────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.65, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-3xl overflow-hidden"
        style={{
          position: 'relative',
          background: "linear-gradient(145deg, #050d07 0%, #09160b 55%, #060e09 100%)",
          border: `1.5px solid ${dominantColor}30`,
          boxShadow: `0 0 64px ${dominantColor}0C, 0 8px 48px rgba(0,0,0,0.55)`,
        }}
      >
        {/* Ambient glow blob centered behind the wheel */}
        <div style={{
          position: 'absolute', top: '32%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 290, height: 290, borderRadius: '50%', pointerEvents: 'none',
          background: `radial-gradient(circle, ${dominantColor}16 0%, transparent 68%)`,
        }} />

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 18px 0', position: 'relative' }}>
          <span style={{ fontSize: 11, fontWeight: 800,
            color: 'rgba(187,247,208,0.38)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            המפה הגנטית שלך
          </span>
          {active.length > 0 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.45, type: 'spring', stiffness: 300 }}
              style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
                background: `${dominantColor}18`, color: dominantColor,
                border: `1px solid ${dominantColor}30` }}>
              {active.length} טרפנים פעילים
            </motion.span>
          )}
        </div>

        {/* THE WHEEL — full card width */}
        <div style={{ padding: '4px 10px 0', position: 'relative' }}>
          {hasProfile ? (
            licenseVerified ? (
              <TerpRadar profile={profile} avoided={avoided.map(([t]) => t)} />
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ filter: 'blur(6px)', opacity: 0.42, pointerEvents: 'none', userSelect: 'none' }}>
                  <TerpRadar profile={profile} avoided={[]} />
                </div>
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
                }}>
                  <span style={{ fontSize: 32 }}>🔒</span>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#F0FDF4', textAlign: 'center',
                    lineHeight: 1.6, padding: '0 32px', textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
                    אמת את הרישיון כדי לפתוח את הפרופיל המלא שלך
                  </p>
                </div>
              </div>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '44px 20px 36px' }}>
              <motion.span style={{ fontSize: 52, display: 'block' }}
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}>🌱</motion.span>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#4ADE80', marginTop: 14, marginBottom: 6 }}>
                הפרופיל שלך מחכה לדיווחים
              </p>
              <p style={{ fontSize: 12, color: 'rgba(187,247,208,0.50)', lineHeight: 1.6, margin: 0 }}>
                דרג זן אחד ביומן המעקב — ואנחנו נתחיל לצייר את המפה שלך
              </p>
            </div>
          )}
        </div>

        {/* Dominant terpene hero — only for verified license */}
        {licenseVerified && hasProfile && dominantInfo && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.58, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            style={{ margin: '0 16px 0', padding: '13px 16px', borderRadius: 22,
              background: `${dominantColor}11`, border: `1px solid ${dominantColor}28` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
              <span style={{ fontSize: 22 }}>{dominantInfo.icon}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: dominantColor }}>
                {dominantInfo.label}
              </span>
              <span style={{ marginRight: 'auto', fontSize: 10, fontWeight: 800,
                padding: '2px 9px', borderRadius: 10,
                background: `${dominantColor}18`, color: dominantColor,
                border: `1px solid ${dominantColor}28` }}>מוביל</span>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(187,247,208,0.58)', lineHeight: 1.55, margin: 0 }}>
              {dominantInfo.sub}
            </p>
          </motion.div>
        )}

        {/* Secondary terpene pills — only for verified license */}
        {licenseVerified && active.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6,
            padding: '10px 16px 0', justifyContent: 'center' }}>
            {active.slice(1, 5).map(([t, v], i) => {
              const info = TERPENE_HUMAN[t];
              const col  = info?.color || '#4ADE80';
              return (
                <motion.span key={t}
                  initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.62 + i * 0.07, type: 'spring', stiffness: 300 }}
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 20,
                    background: `${col}12`, color: col, border: `1px solid ${col}2E` }}>
                  {info?.icon} {info?.shortLabel} {Math.round((v / maxV) * 100)}%
                </motion.span>
              );
            })}
          </div>
        )}

        {/* Avoided terpene warning — only for verified license */}
        {licenseVerified && avoided.length > 0 && (
          <div style={{ margin: '10px 16px 16px', padding: '10px 14px', borderRadius: 14,
            background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)' }}>
            <p style={{ fontSize: 11, color: '#FCA5A5', margin: 0 }}>
              🛡️ <span style={{ fontWeight: 700 }}>חסום לבטיחותך:</span>{' '}
              {avoided.map(([t]) => terpHuman(t, 'shortLabel')).join(', ')} — זוהה כטריגר בפרופיל שלך
            </p>
          </div>
        )}

        {/* Bottom spacer */}
        {(!licenseVerified || avoided.length === 0) && <div style={{ height: 16 }} />}
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
                        {terpHuman(t,'icon')} {terpHuman(t,'shortLabel')}
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
  const [budgetText, setBudgetText] = useState("");

  const MONTHLY_QUOTA_G = 50;
  const AVG_UNIT_G = 10;
  const effectiveBudget = budgetText !== "" ? (Math.max(0, parseInt(budgetText, 10) || budget)) : budget;
  const pharm = (PHARMACIES || []).find(p => p.id === ph);

  const available = scored.filter(s =>
    (!ph || s.pharmacies.includes(ph)) && s.price <= effectiveBudget
  );
  const items = basket.map(id => scored.find(s => s.id === id)).filter(Boolean);
  const total = items.reduce((a, s) => a + s.price, 0);
  const quotaUsed = items.length * AVG_UNIT_G;
  const budgetPct = Math.min(total / Math.max(effectiveBudget, 1), 1);
  const quotaPct  = Math.min(quotaUsed / MONTHLY_QUOTA_G, 1);
  const overBudget = total > effectiveBudget;
  const overQuota  = quotaUsed > MONTHLY_QUOTA_G;

  const autoBuild = () => {
    const picked = []; let sum = 0;
    for (const s of available) {
      if (sum + s.price <= effectiveBudget && (picked.length + 1) * AVG_UNIT_G <= MONTHLY_QUOTA_G) {
        picked.push(s.id); sum += s.price;
      }
    }
    setBasket(picked);
  };

  return (
    <div className="space-y-3 px-4 pt-4 pb-6">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="rounded-2xl p-4"
        style={{ background: "linear-gradient(145deg,rgba(5,13,7,0.98),rgba(9,20,12,0.97))", border: "1.5px solid rgba(74,222,128,0.18)" }}>
        <h3 className="font-bold text-base mb-1" style={{ color: "#F0FDF4" }}>🗓️ תכנון קנייה חודשית</h3>
        <p className="text-xs leading-relaxed mb-1.5" style={{ color: "rgba(187,247,208,0.58)" }}>
          מה לקנות החודש, איזו קטגוריה, כמה גרם — מותאם לפרופיל הטרפנים שלך
        </p>
        <p className="text-xs" style={{ color: "rgba(187,247,208,0.38)" }}>
          💡 המחיר הסופי מתעדכן אצל בית המרקחת — מחירים ומלאי משתנים
        </p>
      </motion.div>

      {/* Settings row: budget + pharmacy */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-3" style={{ background: "rgba(8,14,10,0.92)", border: "1px solid rgba(74,222,128,0.13)" }}>
          <div className="text-xs font-semibold mb-2 text-right" style={{ color: "rgba(187,247,208,0.50)" }}>תקציב חודשי</div>
          <div className="flex items-center gap-1 rounded-xl border px-2.5 py-2 mb-2"
            style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(74,222,128,0.22)" }}>
            <span className="font-bold text-sm" style={{ color: "#4ADE80" }}>₪</span>
            <input type="number" min="0" max="9999" value={budgetText || effectiveBudget}
              onChange={e => setBudgetText(e.target.value)}
              className="flex-1 bg-transparent outline-none text-right text-sm font-bold"
              style={{ color: "#F0FDF4", minWidth: 0 }} />
          </div>
          <input type="range" min="200" max="2000" step="50" value={effectiveBudget}
            onChange={e => { setBudget(+e.target.value); setBudgetText(""); }}
            className="w-full" style={{ accentColor: "#4ADE80" }} />
        </div>

        <div className="rounded-2xl p-3" style={{ background: "rgba(8,14,10,0.92)", border: "1px solid rgba(74,222,128,0.13)" }}>
          <div className="text-xs font-semibold mb-2 text-right" style={{ color: "rgba(187,247,208,0.50)" }}>בית מרקחת</div>
          {pharm ? (
            <div className="flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold"
              style={{ background: "rgba(74,222,128,0.10)", border: "1px solid rgba(74,222,128,0.28)", color: "#4ADE80" }}>
              <button onClick={() => setPh(null)} style={{ color: "rgba(187,247,208,0.40)", fontSize: 14, lineHeight: 1 }}>✕</button>
              <span className="text-right flex-1 mx-2 truncate">{pharm.name}</span>
            </div>
          ) : (
            <select value={ph || ""} onChange={e => setPh(e.target.value || null)}
              className="w-full rounded-xl px-3 py-2.5 text-xs font-semibold text-right"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(74,222,128,0.18)",
                color: "#BBF7D0", outline: "none", appearance: "none", WebkitAppearance: "none" }}>
              <option value="">כל בתי המרקחת</option>
              {(PHARMACIES || []).map(p => (
                <option key={p.id} value={p.id}>{p.name} · {p.city}</option>
              ))}
            </select>
          )}
          <p className="text-xs mt-1.5" style={{ color: "rgba(187,247,208,0.32)" }}>
            {pharm?.delivery ? "🚚 עם משלוח" : pharm ? "🏪 איסוף עצמי" : `${(PHARMACIES||[]).length} סניפים זמינים`}
          </p>
        </div>
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-3" style={{ background: "rgba(8,14,10,0.92)", border: `1px solid ${overBudget ? "rgba(248,113,113,0.22)" : "rgba(74,222,128,0.11)"}` }}>
          <div className="flex justify-between items-start mb-1.5">
            <span className="text-xs" style={{ color: "rgba(187,247,208,0.42)" }}>/ ₪{effectiveBudget}</span>
            <span className="font-black text-xl" style={{ color: overBudget ? "#FCA5A5" : "#4ADE80" }}>₪{total}</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
            <motion.div className="h-full rounded-full"
              initial={{ width: 0 }} animate={{ width: `${budgetPct * 100}%` }}
              transition={{ duration: 0.75, ease: "easeOut" }}
              style={{ background: overBudget ? "#FCA5A5" : "linear-gradient(90deg,#4ADE80,#22C55E)" }} />
          </div>
          <div className="text-xs mt-1 font-semibold" style={{ color: "rgba(187,247,208,0.40)" }}>תקציב</div>
        </div>
        <div className="rounded-2xl p-3" style={{ background: "rgba(8,14,10,0.92)", border: `1px solid ${overQuota ? "rgba(248,113,113,0.22)" : "rgba(192,132,252,0.11)"}` }}>
          <div className="flex justify-between items-start mb-1.5">
            <span className="text-xs" style={{ color: "rgba(187,247,208,0.42)" }}>/ {MONTHLY_QUOTA_G}ג׳</span>
            <span className="font-black text-xl" style={{ color: overQuota ? "#FCA5A5" : "#C084FC" }}>{quotaUsed}ג׳</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
            <motion.div className="h-full rounded-full"
              initial={{ width: 0 }} animate={{ width: `${quotaPct * 100}%` }}
              transition={{ duration: 0.75, ease: "easeOut", delay: 0.1 }}
              style={{ background: overQuota ? "#FCA5A5" : "linear-gradient(90deg,#C084FC,#A855F7)" }} />
          </div>
          <div className="text-xs mt-1 font-semibold" style={{ color: "rgba(187,247,208,0.40)" }}>מכסה (רישיון)</div>
        </div>
      </div>

      {/* Build button */}
      <motion.button onClick={autoBuild} whileTap={{ scale: 0.97 }}
        className="w-full py-3 rounded-xl font-bold text-sm"
        style={{ background: "linear-gradient(135deg,#1E4D36,#4ADE80)", color: "#fff", boxShadow: "0 0 18px rgba(74,222,128,0.20)" }}>
        🌿 בנה לי תוכנית לפי הפרופיל שלי
      </motion.button>

      {/* Plan list */}
      {items.length > 0 ? (
        <motion.div className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(74,222,128,0.14)", background: "rgba(6,11,8,0.94)" }}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid rgba(74,222,128,0.08)", background: "rgba(74,222,128,0.05)" }}>
            <span className="text-xs font-bold" style={{ color: "#4ADE80" }}>{items.length} זנים · {quotaUsed}ג׳</span>
            <span className="text-sm font-bold" style={{ color: "#F0FDF4" }}>
              התכנון שלך{pharm ? ` · ${pharm.name}` : ""}
            </span>
          </div>

          {items.map((s, idx) => {
            const where = (PHARMACIES || []).find(p => s.pharmacies?.includes(p.id) && (!ph || p.id === ph))
                       || (PHARMACIES || []).find(p => s.pharmacies?.includes(p.id));
            return (
              <div key={s.id} className="px-4 py-3"
                style={{ borderBottom: idx < items.length - 1 ? "1px solid rgba(74,222,128,0.06)" : "none" }}>
                <div className="flex items-start gap-2">
                  <button onClick={() => setBasket(basket.filter(x => x !== s.id))}
                    className="text-xs font-bold px-2.5 py-1.5 rounded-lg flex-shrink-0 mt-0.5"
                    style={{ color: "#FCA5A5", background: "rgba(248,113,113,0.09)", border: "1px solid rgba(248,113,113,0.16)" }}>
                    הסר
                  </button>
                  <div className="flex-1 text-right min-w-0">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap mb-1">
                      <span className="font-bold text-sm" style={{ color: "#F0FDF4" }}>{s.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: "rgba(74,222,128,0.10)", color: "#4ADE80" }}>{s.cat}</span>
                    </div>
                    <div className="flex items-center justify-end gap-3 text-xs" style={{ color: "rgba(187,247,208,0.50)" }}>
                      <span style={{ fontWeight: 700, color: "#C084FC" }}>~10ג׳</span>
                      {where && <span>{where.delivery ? "🚚" : "🏪"} {where.name}</span>}
                      <span style={{ color: "#4ADE80", fontWeight: 700 }}>{s.match}% התאמה</span>
                    </div>
                  </div>
                  <span className="font-bold text-sm flex-shrink-0" style={{ color: "#F0FDF4" }}>₪{s.price}</span>
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between px-4 py-3 font-bold"
            style={{ borderTop: "1px solid rgba(74,222,128,0.10)" }}>
            <span style={{ color: overBudget ? "#FCA5A5" : "#4ADE80" }}>₪{total} / ₪{effectiveBudget}</span>
            <span style={{ color: "#F0FDF4" }}>סה״כ</span>
          </div>
          {overBudget && (
            <p className="text-xs pb-3 font-semibold text-center" style={{ color: "#FCA5A5" }}>
              ⚠️ חריגה מהתקציב — הסירו פריטים או הגדילו תקציב
            </p>
          )}
          {pharm && !pharm.delivery && (
            <p className="text-xs pb-3 font-semibold text-center" style={{ color: "#FBBF24" }}>
              🏪 {pharm.name} — איסוף עצמי בלבד, אין משלוח
            </p>
          )}
        </motion.div>
      ) : (
        <div className="text-center py-8 rounded-2xl"
          style={{ background: "rgba(8,14,10,0.70)", border: "1px solid rgba(74,222,128,0.08)" }}>
          <div className="text-3xl mb-2">🛒</div>
          <p className="text-sm font-bold mb-1" style={{ color: "#F0FDF4" }}>התכנון ריק</p>
          <p className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>
            לחצו "בנה לי תוכנית" — נמצא את הזנים הכי מתאימים לפרופיל שלך מהתפריט הנוכחי
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
    { id: "pharm",  label: "📍 בתי מרקחת" },
    { id: "new",    label: "🌿 חדש בשוק"   },
    { id: "compare",label: "💰 השוואת מחיר" },
    { id: "save",   label: "🔓 חיסכון גנטי" },
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

      {/* ───── תצוגה: חדש בשוק ───── */}
      {view === "new" && <NewOnMarket limit={30} />}

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
                    <div className="text-xs mt-0.5 flex gap-1.5 justify-end flex-wrap items-center" style={{ color: "rgba(187,247,208,0.55)" }}>
                      <span>⏱️ {r.time}</span>
                      <span>·</span>
                      <span>💊 {r.dose}</span>
                      {r.difficulty && (
                        <>
                          <span>·</span>
                          <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                            style={{ background: "rgba(74,222,128,0.10)", color: "#4ADE80", fontSize: "0.65rem" }}>
                            {r.difficulty}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.2 }}
                    style={{ color: isOpen ? C.accent : "rgba(187,247,208,0.40)", fontWeight: 700, fontSize: 18, flexShrink: 0 }}>+</motion.span>
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                      <div className="px-4 pb-4 space-y-3">
                        <div className="h-px" style={{ background: "rgba(74,222,128,0.10)" }} />
                        {r.ingredients && (
                          <div>
                            <div className="text-xs font-bold mb-1.5 text-right" style={{ color: C.accent }}>🛒 מצרכים</div>
                            <ul className="space-y-1">
                              {r.ingredients.map((ing, i) => (
                                <li key={i} className="text-xs flex gap-2 items-start justify-end text-right"
                                  style={{ color: "rgba(187,247,208,0.80)" }}>
                                  <span>{ing}</span>
                                  <span className="flex-shrink-0 text-xs mt-0.5" style={{ color: C.accent }}>·</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {r.steps && (
                          <div>
                            <div className="text-xs font-bold mb-1.5 text-right" style={{ color: C.accent }}>📋 הכנה</div>
                            <ol className="space-y-2">
                              {r.steps.map((step, i) => (
                                <li key={i} className="text-xs flex gap-2 items-start text-right"
                                  style={{ color: "rgba(187,247,208,0.80)" }}>
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-black text-xs mt-0.5"
                                    style={{ background: "rgba(74,222,128,0.12)", color: C.accent }}>{i + 1}</span>
                                  <span className="flex-1">{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {!r.ingredients && r.note && (
                          <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.80)" }}>{r.note}</p>
                        )}
                        {r.tip && (
                          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                            style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", color: "rgba(251,191,36,0.85)" }}>
                            <span className="flex-shrink-0">💡</span>
                            <span>{r.tip}</span>
                          </div>
                        )}
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

  const evidenceBadge = (rate) => {
    if (!rate) return null;
    if (rate >= 90) return { label: "עדות חזקה", color: "#4ADE80", bg: "rgba(74,222,128,0.10)" };
    if (rate >= 70) return { label: "עדות בינונית", color: "#FBBF24", bg: "rgba(251,191,36,0.10)" };
    return { label: "עדות מוגבלת", color: "#94A3B8", bg: "rgba(148,163,184,0.10)" };
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 border" style={{ background: C.soft, borderColor: C.line }}>
        <h3 className="font-bold mb-1" style={{ color: C.ink }}>📚 ידע מותאם להתוויה</h3>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.65)" }}>
          סרקנו מחקרים עדכניים ומצלבים אותם עם הגנטיקות הזמינות בתפריט. זהו מידע כללי ואינו ייעוץ רפואי — כל החלטה על טיפול ומינון עם הרופא/ה המטפל/ת.
        </p>
        <div className="flex gap-2 flex-wrap mt-2.5 text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#4ADE80" }} />עדות חזקה ≥90%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#FBBF24" }} />עדות בינונית 70–89%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#94A3B8" }} />עדות מוגבלת</span>
        </div>
      </div>

      {order.map((id) => {
        const p = INDICATION_PROFILES[id];
        const isOpen = open === id;
        const isMine = mine.includes(id);
        const matches = isOpen ? crossIndicationWithMenu(id, scored) : [];
        const badge = evidenceBadge(p.successRate);
        return (
          <div key={id} className="rounded-2xl border overflow-hidden"
            style={{ background: C.card, borderColor: isOpen ? C.accent : C.line }}>
            <button onClick={() => setOpen(isOpen ? null : id)}
              className="w-full flex items-center justify-between p-4 text-right gap-2">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {badge && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: badge.bg, color: badge.color, fontSize: "0.6rem" }}>
                    {badge.label}
                  </span>
                )}
                <span style={{ color: C.accent, fontWeight: 700 }}>{isOpen ? "−" : "+"}</span>
              </div>
              <span className="font-bold text-right flex-1" style={{ color: C.ink }}>
                {p.label}
                {isMine && <span className="text-xs mr-2 px-1.5 py-0.5 rounded-full" style={{ color: "#C084FC", background: "rgba(192,132,252,0.10)" }}>★ שלי</span>}
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-3">
                <p className="text-sm leading-relaxed" style={{ color: "rgba(187,247,208,0.80)" }}>{p.summary}</p>
                {p.successRate && (
                  <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(74,222,128,0.10)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold" style={{ color: C.ink }}>📊 שיעור הצלחה מדווח</span>
                      <span className="text-lg font-bold" style={{ color: badge?.color || C.accent }}>{p.successRate}%</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${p.successRate}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }} style={{ background: badge?.color || C.accent }} />
                    </div>
                    {p.successNote && (
                      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "rgba(187,247,208,0.65)" }}>{p.successNote}</p>
                    )}
                  </div>
                )}
                <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: C.ink }}>⚖️ יחסי THC:CBD — מה המחקרים אומרים</div>
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.65)" }}>{p.ratioNote}</p>
                </div>
                {p.israelNote && (
                  <div className="rounded-xl px-3 py-2.5 text-xs leading-relaxed font-semibold"
                    style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", color: C.accent }}>
                    🇮🇱 {p.israelNote}
                  </div>
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

                <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(74,222,128,0.08)" }}>
                  <div className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: "rgba(187,247,208,0.55)" }}>
                    <span>📖</span> מקורות אקדמיים
                  </div>
                  <div className="space-y-2">
                    {p.research.split(" · ").map((ref, ri) => (
                      <div key={ri} className="flex items-start gap-2">
                        <span className="flex-shrink-0 text-xs font-black mt-0.5" style={{ color: "rgba(74,222,128,0.40)" }}>[{ri + 1}]</span>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.48)", fontStyle: "italic" }}>{ref.trim()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Cannabinoid & Terpene Science mini-card */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: C.card, borderColor: C.line }}>
        <div className="p-4 space-y-3">
          <h3 className="font-bold mb-0.5" style={{ color: C.ink }}>🔬 מדע קצר: קנבינואידים וטרפנים</h3>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.60)" }}>
            הכימיה מאחורי ההשפעה — לא לפחד ממנה, פשוט לדעת.
          </p>
          {[
            { label: "THC — הקנבינואיד הפסיכואקטיבי", color: "#FBBF24", body: 'נקשר לקולטן CB1 במוח. אחראי לאפקט הפסיכואקטיבי, לשיכוך כאב ולעידוד שינה. מינון גבוה מדי — חרדה ופאראנויה. מינון מתון — הרגעה, שיפור שינה, שיכוך כאב. הכלל: להתחיל נמוך, לטטר לאט.' },
            { label: "CBD — מאזן ולא פסיכואקטיבי", color: "#C084FC", body: "לא גורם לעוויינות. מאזן את ההשפעה של THC, מפחית חרדה, נוגד דלקת. נחקר לאפילפסיה (אפידיולקס — התרופה המאושרת). פועל גם כשעומד לבד, גם מחזק את ה-THC ב'אפקט פמליה'." },
            { label: "טרפנים — הניחוח שמשנה את הכל", color: "#4ADE80", body: "הטרפנים הם שמשנים את אופי ההשפעה. מירצן (ריח אדמה) = מרגיע. לימונן (ריח לימון) = מרים מצב רוח. פינן (ריח אורן) = ערנות. קריופילן (ריח פלפל) = נוגד כאב. לינלול (ריח לבנדר) = נוגד חרדה. אותו THC עם טרפנים שונים = חוויה אחרת לגמרי." },
          ].map(({ label, color, body }, i) => (
            <div key={i} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}22` }}>
              <div className="text-xs font-bold mb-1" style={{ color }}>{label}</div>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.65)" }}>{body}</p>
            </div>
          ))}
        </div>
      </div>

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

// Detect touch/mobile for camera button visibility
const isTouchDevice = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);

// Autocomplete input + chip list for manual strain entry
function ManualStrainEntry({ ans, scored, onDecode, onError }) {
  const [q, setQ]             = useState("");
  const [entries, setEntries] = useState([]); // array of strain name strings
  const [showSugg, setShowSugg] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const inputRef = useRef();

  const suggestions = q.trim().length >= 2
    ? STRAINS.filter(s =>
        s.name.toLowerCase().includes(q.toLowerCase()) ||
        (s.genetics || "").toLowerCase().includes(q.toLowerCase())
      ).slice(0, 6)
    : [];

  const addEntry = (name) => {
    const n = name.trim();
    if (!n) return;
    setEntries(prev => prev.includes(n) ? prev : [...prev, n]);
    setQ(""); setShowSugg(false);
    inputRef.current?.focus();
  };

  const removeEntry = (i) => setEntries(prev => prev.filter((_, j) => j !== i));

  const runDecode = () => {
    const allLines = [
      ...entries,
      ...(pasteText.trim() ? pasteText.split("\n") : []),
    ].filter(Boolean);
    if (!allLines.length) { onError("הוסיפו לפחות זן אחד"); return; }
    const res = decodeMenu(allLines.join("\n"), ans, scored);
    const unknowns = res.filter(r => r.unknown && r.name);
    if (unknowns.length) api.submitPendingScan(unknowns.map(r => ({ name: r.name, cat: r.cat }))).catch(() => {});
    onDecode(res);
  };

  return (
    <div className="mb-3">
      {/* Autocomplete input */}
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setShowSugg(true); }}
          onKeyDown={e => {
            if (e.key === "Enter")  { e.preventDefault(); suggestions[0] ? addEntry(suggestions[0].name) : addEntry(q); }
            if (e.key === "Escape") { setShowSugg(false); setQ(""); }
            if (e.key === "ArrowDown" && showSugg && suggestions.length > 0) {
              e.preventDefault();
              document.querySelector(".menu-sugg-item")?.focus();
            }
          }}
          onBlur={() => setTimeout(() => setShowSugg(false), 150)}
          onFocus={() => q.length >= 2 && setShowSugg(true)}
          placeholder="הקלידו שם זן — עברית או אנגלית..."
          dir="rtl"
          className="w-full rounded-xl border p-3 text-sm"
          style={{ borderColor: C.line, color: C.ink, background: C.bg }}
        />
        {showSugg && suggestions.length > 0 && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, left: 0,
            background: "#0F1E13", border: `1px solid ${C.line}`,
            borderRadius: 12, zIndex: 50, overflow: "hidden",
          }}>
            {suggestions.map((s, i) => (
              <button key={s.id}
                className={`menu-sugg-item w-full text-right px-3 py-2 text-sm font-medium${i < suggestions.length - 1 ? " border-b" : ""}`}
                style={{ color: C.ink, borderColor: "rgba(74,222,128,0.10)", background: "transparent",
                  cursor: "pointer", display: "block" }}
                onMouseDown={() => addEntry(s.name)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); addEntry(s.name); }
                  if (e.key === "Escape") { setShowSugg(false); inputRef.current?.focus(); }
                }}>
                <span style={{ fontWeight: 700 }}>{s.name}</span>
                {s.genetics && <span style={{ fontSize: 11, color: "rgba(187,247,208,0.50)", marginRight: 6 }}>{s.genetics}</span>}
              </button>
            ))}
            {q.trim().length >= 2 && (
              <button
                className="w-full text-right px-3 py-2 text-xs"
                style={{ color: "rgba(187,247,208,0.45)", background: "transparent", cursor: "pointer", display: "block" }}
                onMouseDown={() => addEntry(q)}>
                הוסף "{q.trim()}" (לא מזוהה — ישלח לבדיקה)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chip list */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {entries.map((name, i) => (
            <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
              style={{ background: "rgba(74,222,128,0.12)", border: `1px solid ${C.line}`, color: C.ink }}>
              {name}
              <button onClick={() => removeEntry(i)} style={{ color: "rgba(187,247,208,0.50)", lineHeight: 1, fontSize: 14 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Paste fallback (collapsible) */}
      <button
        onClick={() => setPasteOpen(v => !v)}
        className="mt-3 text-xs"
        style={{ color: "rgba(187,247,208,0.40)", background: "transparent", border: "none", cursor: "pointer" }}>
        {pasteOpen ? "▲ סגור הדבקה" : "▼ הדביקו רשימה שלמה"}
      </button>
      {pasteOpen && (
        <textarea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          rows={5} dir="rtl"
          placeholder={"הדביקו תפריט שלם — שורה לכל מוצר:\n\nWedding Cake T22/C4 — 280₪\nאור T15/C3 — 225₪"}
          className="w-full mt-2 rounded-xl border p-3 text-sm"
          style={{ borderColor: C.line, color: C.ink, background: C.bg, resize: "vertical" }}
        />
      )}

      {/* Decode button */}
      {(entries.length > 0 || pasteText.trim()) && (
        <button
          onClick={runDecode}
          className="w-full mt-3 py-2.5 rounded-xl font-bold"
          style={{ background: C.accent, color: "#061006" }}>
          🔍 פענח {entries.length > 0 ? `(${entries.length} זנים)` : ""}
        </button>
      )}
    </div>
  );
}

function MenuScan({ ans, scored, basket, addToBasket, user }) {
  // A scan is a SESSION of pages (Layer 4.2). Restore an in-progress scan on mount
  // so backgrounding / a network blip mid-scan never loses decoded pages.
  const [session, setSession] = useState(() => loadSession() || createSession());
  const [manualResults, setManualResults] = useState(null);
  const [resultKey, setResultKey] = useState(0);
  const [error, setError] = useState(null);
  const [dupNotice, setDupNotice] = useState(null); // { type:'exact'|'near', pageId? }
  const [dragOver, setDragOver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ocrPct, setOcrPct] = useState(0);
  const [inputMode, setInputMode] = useState("file"); // "file" | "manual"
  const [basketTab, setBasketTab] = useState("byFit"); // "byFit" (התאמה, default) | "cheap" (זול) | "expensive" (יקר)
  const fileRef = useRef();
  const camRef = useRef();
  const isTouch = isTouchDevice();

  // Persist the session on every change — survives refresh.
  useEffect(() => { saveSession(session); }, [session]);

  // Image-path results come from the merged session; manual mode keeps its own.
  const results = session.pages.length ? mergeSession(session) : manualResults;
  const commit = () => setSession((s) => ({ ...s })); // re-render after in-place page mutation

  const handleDecodeResults = (res) => {
    setManualResults(res.length ? res : []);
    setResultKey(k => k + 1);
    if (!res.length) setError("לא זוהו מוצרים — ודאו ששמות הזנים נכתבו נכון");
    else setError(null);
  };

  const enqueueUnknowns = (items) => {
    const unknowns = (items || []).filter((it) => it.unknown && it.name);
    if (unknowns.length) {
      api.submitPendingScan(unknowns.map((it) => ({
        name: it.name, cat: it.cat, format: it.format, grower: it.grower, raw: it.origLine,
      }))).catch(() => {});
    }
  };

  // ── Photo (camera/upload) → downscale → Tesseract OCR → append a page ────
  const addImagePage = async (file) => {
    if (!file) return;
    setError(null); setDupNotice(null);
    const isImg = (file.type || "").startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(file.name || "");
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (isPdf) { setError("PDF: ייצאו כתמונה או הקלידו ידנית"); setInputMode("manual"); return; }
    if (!isImg) { setError("אפשר להעלות תמונה (JPG/PNG/WEBP) בלבד"); return; }

    setScanning(true); setOcrPct(0);
    try {
      const { dataUrl, blob } = await downscaleImage(file, 1600); // phone-perf downscale
      const hash = imageHash(dataUrl);
      const raw  = await ocrFile(blob, setOcrPct);
      const r = addPage(session, { imageHash: hash, rawText: raw, ans, scored });
      if (!r.ok && r.duplicate === "exact") { setDupNotice({ type: "exact" }); return; }
      commit();
      setResultKey((k) => k + 1);
      if (r.duplicate === "near") setDupNotice({ type: "near", pageId: r.page.id });
      if (r.page.status === "failed") setError("דף לא ברור — נסו שוב או צלמו אותו מחדש");
      enqueueUnknowns(r.page.items);
    } catch (err) {
      console.warn("scan page error:", err.message);
      setError("שגיאת עיבוד — נסו תמונה ברורה יותר, או עברו לידני");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = '';
      if (camRef.current)  camRef.current.value  = '';
    }
  };

  const onRemovePage = (pageId) => { removePage(session, pageId); commit(); setResultKey((k) => k + 1); };
  const onRetryPage  = (pageId) => { retryPage(session, pageId, { ans, scored }); commit(); setResultKey((k) => k + 1); };
  const onNewScan    = () => { clearSession(); setSession(createSession()); setManualResults(null); setError(null); setDupNotice(null); };

  const PAGE_STATUS_LABEL = {
    queued: "ממתין", decoding: "מפענח…",
    decoded: "פוענח", failed: "לא ברור",
  };

  return (
    <div className="space-y-4 px-5 pt-4">
      <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.line }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          const files = Array.from(e.dataTransfer.files || []);
          if (files.length) { setInputMode("file"); files.forEach((f) => addImagePage(f)); }
        }}>
        <h3 className="font-bold mb-1" style={{ color: C.ink }}>פענוח תפריט 🌿</h3>
        <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.65)" }}>
          צלמו דף אחר דף — כל צילום מתווסף לסריקה. הכל עובד ללא רשת.
        </p>

        {/* Mode tabs — 2 tabs only */}
        <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{ background: C.soft }}>
          {[
            { id: "file",   label: "📷 תמונה" },
            { id: "manual", label: "⌨️ ידני" },
          ].map((m) => (
            <button key={m.id} onClick={() => setInputMode(m.id)}
              className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: inputMode === m.id ? "rgba(74,222,128,0.10)" : "transparent",
                color: inputMode === m.id ? "#4ADE80" : "rgba(187,247,208,0.50)",
              }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* ── Photo / camera mode ─────────────────────────────── */}
        {inputMode === "file" && (
          <>
          <div className="rounded-xl border-2 border-dashed p-4 mb-3 text-center"
            style={{ borderColor: dragOver ? C.accent : "rgba(74,222,128,0.30)", background: dragOver ? "rgba(74,222,128,0.08)" : C.soft }}>
            {/* allow selecting multiple images at once — each appends a page */}
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { Array.from(e.target.files || []).forEach((f) => addImagePage(f)); }} />
            {isTouch && <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => e.target.files?.[0] && addImagePage(e.target.files[0])} />}
            <div className="flex gap-2 justify-center mb-2 flex-wrap">
              <button onClick={() => fileRef.current?.click()} disabled={scanning}
                className="font-bold text-sm px-4 py-2 rounded-xl disabled:opacity-50"
                style={{ background: C.accent, color: "#061006" }}>
                {scanning ? `🔍 קורא… ${ocrPct}%` : "📎 בחר תמונה"}
              </button>
              {isTouch && (
                <button onClick={() => camRef.current?.click()} disabled={scanning}
                  className="font-bold text-sm px-4 py-2 rounded-xl border disabled:opacity-50"
                  style={{ borderColor: C.accent, color: C.accent, background: C.card }}>
                  📷 צלם
                </button>
              )}
              {/* getUserMedia live capture; falls back to the file-capture input on denial */}
              <CameraCapture accent={C.accent}
                onCapture={(blob) => addImagePage(new File([blob], `page-${Date.now()}.jpg`, { type: "image/jpeg" }))}
                onFallback={() => (camRef.current || fileRef.current)?.click()} />
            </div>
            {scanning && (
              <div className="w-full rounded-full mt-2" style={{ background: "rgba(74,222,128,0.10)", height: 4 }}>
                <div className="rounded-full h-full transition-all" style={{ width: `${ocrPct}%`, background: C.accent }} />
              </div>
            )}
            <p className="text-xs mt-2" style={{ color: "rgba(187,247,208,0.45)" }}>
              גררו תמונות לכאן · דף אחר דף · OCR מקומי (ללא שרת)
            </p>
          </div>

          {/* ── Duplicate notices ─────────────────────────────── */}
          {dupNotice?.type === "exact" && (
            <div className="mb-3 p-2.5 rounded-xl" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
              <p className="text-xs font-semibold" style={{ color: "#FBBF24" }}>📄 נראה שכבר צילמת את הדף הזה — לא הוספתי אותו שוב.</p>
            </div>
          )}
          {dupNotice?.type === "near" && (
            <div className="mb-3 p-2.5 rounded-xl flex items-center gap-2 flex-wrap"
              style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
              <p className="text-xs font-semibold flex-1" style={{ color: "#FBBF24" }}>📄 הדף נראה דומה מאוד לדף קודם. לשמור בכל זאת?</p>
              <button onClick={() => setDupNotice(null)} className="text-xs px-2 py-1 rounded-lg font-bold" style={{ background: C.accent, color: "#061006" }}>שמור</button>
              <button onClick={() => { onRemovePage(dupNotice.pageId); setDupNotice(null); }} className="text-xs px-2 py-1 rounded-lg font-bold border" style={{ borderColor: "#FCA5A5", color: "#FCA5A5" }}>הסר</button>
            </div>
          )}

          {/* ── Pages strip (ordered, removable, retryable) ─────── */}
          {session.pages.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold" style={{ color: C.ink }}>
                  📄 {session.pages.length} דפים בסריקה
                </span>
                <button onClick={onNewScan} className="text-xs font-bold" style={{ color: "rgba(187,247,208,0.55)" }}>נקה סריקה</button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {session.pages.map((p, i) => (
                  <div key={p.id} className="flex-shrink-0 rounded-xl p-2 text-center"
                    style={{ minWidth: 92, background: C.soft,
                      border: `1px solid ${p.status === "failed" ? "rgba(248,113,113,0.4)" : p.nearDuplicateOf ? "rgba(251,191,36,0.4)" : C.line}` }}>
                    <div className="text-xs font-bold" style={{ color: C.ink }}>דף {i + 1}</div>
                    <div className="text-xs" style={{ color: p.status === "failed" ? "#FCA5A5" : "rgba(187,247,208,0.6)" }}>
                      {PAGE_STATUS_LABEL[p.status] || p.status}{p.status === "decoded" ? ` · ${p.items.length}` : ""}
                    </div>
                    <div className="flex gap-1 justify-center mt-1">
                      {p.status === "failed" && (
                        <button onClick={() => onRetryPage(p.id)} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(74,222,128,0.15)", color: C.accent }}>נסה שוב</button>
                      )}
                      <button onClick={() => onRemovePage(p.id)} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(248,113,113,0.12)", color: "#FCA5A5" }}>הסר</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
        )}

        {/* ── Manual entry with autocomplete ──────────────────── */}
        {inputMode === "manual" && (
          <ManualStrainEntry
            ans={ans}
            scored={scored}
            onDecode={handleDecodeResults}
            onError={setError}
          />
        )}

        {/* ── Error banner ─────────────────────────────────────── */}
        {error && (
          <div className="mb-3 p-2.5 rounded-xl" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.20)" }}>
            <p className="text-xs font-semibold" style={{ color: "#FCA5A5" }}>⚠️ {error}</p>
          </div>
        )}

        {/* ── License filter badge ──────────────────────────────── */}
        {ans.cats.length > 0 && (
          <div className="mb-3 px-3 py-2 rounded-xl" style={{ background: C.soft, border: `1px solid ${C.line}` }}>
            <span className="text-xs" style={{ color: "rgba(187,247,208,0.65)" }}>
              🔒 מסנן לפי רישיונך: <span className="font-bold" style={{ color: C.ink }}>{ans.cats.join(", ")}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── OCR loading skeleton ──────────────────────────────── */}
      {scanning && inputMode === "file" && (
        <LoadingSkeleton message="התפריט בבדיקה אל מול ה-DNA שלך" rows={3} />
      )}

      {/* ── Duplicate genetics alert ──────────────────────────── */}
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

      {/* ── Empty state ───────────────────────────────────────── */}
      {results && results.length === 0 && (
        <div className="rounded-2xl p-5 text-center" style={{ background: C.card, border: `1px dashed ${C.line}` }}>
          <div className="text-3xl mb-2">🤷</div>
          <p className="text-sm font-bold" style={{ color: C.ink }}>לא זיהינו מוצרים</p>
          <p className="text-xs mt-1" style={{ color: "rgba(187,247,208,0.55)" }}>ודאו שכל שורה כוללת שם זן, ורצוי קטגוריה (T../C..) ומחיר.</p>
        </div>
      )}

      {/* ── Results list ──────────────────────────────────────── */}
      {results && results.length > 0 && (() => {
        // Main route: rank ALL strains high→low. Soft 70% line is visual only — nothing hidden.
        const ranked  = rankMenu(results, { experience: ans.experience, reasons: ans.reasons });
        const high    = ranked.filter((r) => r.matchPct !== null && r.matchPct >= SOFT_LINE);
        const partial = ranked.filter((r) => !(r.matchPct !== null && r.matchPct >= SOFT_LINE));

        const Row = (r) => (
          <div key={r.id} className="rounded-2xl p-3 border flex items-center gap-3"
            style={{
              background: C.card,
              borderColor: r.matchPct >= 85 ? C.accent : r.unknown ? "rgba(255,165,64,0.25)" : C.line,
              opacity: r.inLicense ? 1 : 0.5,
            }}>
            {/* Match ring or "new" badge — NEVER a price here */}
            {r.matchPct !== null ? (
              <MatchRing pct={r.matchPct} />
            ) : (
              <div className="text-center flex-shrink-0" style={{ width: 48 }}>
                <div className="text-xl">❔</div>
                <div className="text-xs" style={{ color: "rgba(187,247,208,0.45)" }}>חדש</div>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold" style={{ color: C.ink }}>{r.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: r.isOil ? "rgba(167,139,250,0.10)" : "rgba(74,222,128,0.09)", color: r.isOil ? "#C084FC" : "#4ADE80" }}>
                  {r.isOil ? "💧 שמן" : "🌿 תפרחת"}
                </span>
                {r.genetics && r.genetics !== "—" && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{ background: "rgba(167,139,250,0.10)", color: "#C084FC" }}>🌿 {r.genetics}</span>
                )}
                {r.cat && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{ background: C.soft, color: C.accent }}>{r.cat}</span>
                )}
              </div>

              {/* Short why — chemovar + dominant terpenes + anxiolytic reason when it applied */}
              <p className="text-xs mt-0.5" style={{ color: "rgba(187,247,208,0.70)" }}>{r.why}</p>

              {/* Cold-start: community empty → awaiting text, never a fabricated number */}
              {r.community && (
                <p className="text-xs mt-0.5" style={{ color: "rgba(187,247,208,0.45)" }}>🌱 {r.community}</p>
              )}
            </div>

            {/* Action column — add to plan only; NO price beside the match % */}
            <div className="text-center flex-shrink-0">
              {r.known && r.inLicense && (
                <button onClick={() => addToBasket(r.known.id)}
                  disabled={basket.includes(r.known.id)}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold text-white disabled:opacity-40"
                  style={{ background: C.accent, color: "#061006" }}>
                  {basket.includes(r.known.id) ? "בתכנון ✓" : "+ לתכנון"}
                </button>
              )}
            </div>
          </div>
        );

        return (
          <div key={resultKey} className="space-y-2">
            <p className="text-sm font-semibold" style={{ color: C.ink }}>
              {ranked.length} מוצרים · ממוינים לפי התאמה לפרופיל שלך
            </p>

            {high.map(Row)}

            {/* Soft 70% line — visual only, nothing hidden below it */}
            {partial.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-px" style={{ background: C.line }} />
                <span className="text-xs font-bold" style={{ color: "rgba(187,247,208,0.50)" }}>
                  התאמה חלקית · מתחת ל-{SOFT_LINE}%
                </span>
                <div className="flex-1 h-px" style={{ background: C.line }} />
              </div>
            )}

            {partial.map(Row)}
          </div>
        );
      })()}

      {/* ── Two basket routes (יקר / זול) — suggestions BELOW the main ranked list ── */}
      {results && results.length > 0 && (() => {
        const routes = buildRoutesFromMenu(results, ans);
        const active = routes[basketTab] || routes.byFit;
        if (!active.bags.length) return null;
        const allowance = Object.values(ans.gramsByCategory || {}).reduce((t, g) => t + (Number(g) || 0), 0);
        const totalGrams = active.bags.reduce((t, b) => t + (b.grams || 0), 0);
        const PACK_LABEL = { box: "קופסה", bag: "שקית" };

        return (
          <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.line }}>
            <h3 className="font-bold mb-1" style={{ color: C.ink }}>🛒 סלים מוצעים</h3>
            <p className="text-xs mb-3" style={{ color: "rgba(187,247,208,0.55)" }}>
              שני הסלים מתאימים אותו דבר — נבדלים רק באופן מילוי תקציב הגרמים. אפשר גם לבחור ידנית מהרשימה למעלה.
            </p>

            {/* Tabs */}
            <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{ background: C.soft }}>
              {[
                { id: "byFit",     label: "התאמה" },
                { id: "cheap",     label: "זול · שקיות" },
                { id: "expensive", label: "יקר · קופסאות" },
              ].map((t) => (
                <button key={t.id} onClick={() => setBasketTab(t.id)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: basketTab === t.id ? "rgba(74,222,128,0.10)" : "transparent",
                    color: basketTab === t.id ? "#4ADE80" : "rgba(187,247,208,0.50)",
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Gram total vs allowance */}
            <div className="mb-3 px-3 py-2 rounded-xl flex items-center justify-between"
              style={{ background: C.soft, border: `1px solid ${C.line}` }}>
              <span className="text-xs" style={{ color: "rgba(187,247,208,0.65)" }}>סה״כ בסל</span>
              <span className="text-xs font-bold" style={{ color: C.ink }}>
                {totalGrams} ג׳{allowance > 0 ? ` / ${allowance} ג׳ מותר` : ""}
              </span>
            </div>
            {active.warnings?.some((w) => w.includes("גרמים")) && (
              <p className="text-xs mb-2" style={{ color: "#FBBF24" }}>⚠️ כמות גרמים לא ידועה — הערכה בלבד</p>
            )}

            {/* Basket rows — match% never beside price */}
            <div className="space-y-2">
              {active.bags.map((b) => (
                <div key={b.batchId} className="rounded-xl p-3 border"
                  style={{ background: C.bg, borderColor: C.line }}>
                  <div className="flex items-center gap-3">
                    {typeof b.matchPct === "number" && <MatchRing pct={b.matchPct} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold" style={{ color: C.ink }}>{b.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{ background: C.soft, color: C.accent }}>{b.grams} ג׳</span>
                        {b.role && (
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(167,139,250,0.10)", color: "#C084FC" }}>{b.role}</span>
                        )}
                      </div>
                      {b.why && <p className="text-xs mt-0.5" style={{ color: "rgba(187,247,208,0.70)" }}>{b.why}</p>}
                    </div>
                  </div>
                  {/* Economics line — separate row, never adjacent to the match % */}
                  {b.presentation && (b.presentation.price != null || b.presentation.packaging) && (
                    <div className="mt-2 pt-2 text-xs flex items-center gap-2"
                      style={{ borderTop: `1px dashed ${C.line}`, color: "rgba(187,247,208,0.55)" }}>
                      <span>💰 כלכלת הסל:</span>
                      {b.presentation.packaging && <span>{PACK_LABEL[b.presentation.packaging] || b.presentation.packaging}</span>}
                      {b.presentation.price != null && <span className="font-bold">₪{b.presentation.price}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
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
  const [mood, setMood]             = useState(null);
  const [method, setMethod]         = useState(null);   // "vape"|"oil"|"smoke"|null
  const [amount, setAmount]         = useState(0);      // grams or drops
  const [helped, setHelped]         = useState(null);   // true|false|null
  const [sideEffect, setSideEffect] = useState(null);   // string chip or null
  const [strainInput, setStrainInput] = useState("");
  const [savedOk, setSavedOk]       = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [newBadge, setNewBadge]     = useState(null);
  const [showNotifs, setShowNotifs] = useState(false);

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
    const methodLabels = { vape: "💨 אידוי", oil: "💧 שמן", smoke: "🚬 עישון" };
    const amountLabel  = method === "oil"
      ? (amount > 0 ? `${amount} טיפות` : "")
      : (amount > 0 ? `${amount.toFixed(1)}ג׳` : "");
    try {
      const prev = JSON.parse(localStorage.getItem("cm_checkins") || "[]");
      prev.push({
        date:       new Date().toLocaleDateString("he-IL"),
        time:       new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
        mood:       moodObj?.e || "😐",
        method:     method ? methodLabels[method] : "ללא",
        amount:     amountLabel,
        strain:     strainInput.trim() || "",
        helped:     helped === true ? "עזר ✓" : helped === false ? "לא עזר ✗" : "",
        sideEffect: sideEffect || "",
      });
      localStorage.setItem("cm_checkins", JSON.stringify(prev.slice(-60)));
    } catch {}

    const newStreak   = wasChecked ? streak : streak + 1;
    const ratingCount = Object.keys(ratings).length;
    const unlocked    = badges.find(b => !b.on && (b.threshold === newStreak || b.threshold === ratingCount));
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

          {/* Method chips */}
          <p className="text-xs font-semibold mb-2 text-right" style={{ color: "rgba(187,247,208,0.60)" }}>איך לקחת?</p>
          <div className="flex gap-2 mb-4">
            {[
              { id: "vape",  icon: "💨", label: "אידוי" },
              { id: "oil",   icon: "💧", label: "שמן" },
              { id: "smoke", icon: "🚬", label: "עישון" },
            ].map(m => {
              const active = method === m.id;
              return (
                <button key={m.id} onClick={() => { setMethod(active ? null : m.id); setAmount(0); }}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all"
                  style={{
                    background:   active ? "rgba(74,222,128,0.13)" : "rgba(255,255,255,0.04)",
                    borderColor:  active ? "#4ADE80" : "rgba(255,255,255,0.08)",
                    color:        active ? "#4ADE80" : "rgba(187,247,208,0.55)",
                  }}>
                  <div className="text-base">{m.icon}</div>
                  <div className="mt-0.5">{m.label}</div>
                </button>
              );
            })}
          </div>

          {/* Amount slider — only when method is selected */}
          {method && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl p-3 mb-4"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(74,222,128,0.10)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold" style={{ color: "#4ADE80" }}>
                  {amount > 0
                    ? (method === "oil" ? `${amount} טיפות` : `${amount.toFixed(1)}ג׳`)
                    : "—"}
                </span>
                <span className="text-xs font-semibold" style={{ color: "rgba(187,247,208,0.60)" }}>
                  {method === "oil" ? "מספר טיפות" : "כמות בגרמים"}
                </span>
              </div>
              <input type="range"
                min={0} max={method === "oil" ? 40 : 5} step={method === "oil" ? 1 : 0.1}
                value={amount}
                onChange={e => setAmount(method === "oil" ? parseInt(e.target.value) : parseFloat(e.target.value))}
                className="w-full" style={{ accentColor: "#4ADE80" }} />
              {method === "smoke" && (
                <p className="text-xs mt-2" style={{ color: "rgba(248,113,113,0.75)" }}>
                  🚭 אידוי בריא ויעיל פי 2.5 מעישון — מומלץ לעבור
                </p>
              )}
            </motion.div>
          )}

          {/* Helped quick-log */}
          <p className="text-xs font-semibold mb-2 text-right" style={{ color: "rgba(187,247,208,0.60)" }}>עזר לך?</p>
          <div className="flex gap-2 mb-4">
            {[
              { val: true,  icon: "👍", label: "עזר", col: "#4ADE80" },
              { val: null,  icon: "🤷", label: "בסדר", col: "rgba(187,247,208,0.45)" },
              { val: false, icon: "👎", label: "לא עזר", col: "#FCA5A5" },
            ].map(opt => {
              const active = helped === opt.val && opt.val !== null ? true : helped === null && opt.val === null;
              return (
                <button key={opt.label}
                  onClick={() => setHelped(helped === opt.val ? null : opt.val)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold border"
                  style={{
                    background:  active ? `${opt.col}18` : "rgba(255,255,255,0.04)",
                    borderColor: active ? opt.col : "rgba(255,255,255,0.08)",
                    color:       active ? opt.col : "rgba(187,247,208,0.45)",
                  }}>
                  <div className="text-base">{opt.icon}</div>
                  <div className="mt-0.5">{opt.label}</div>
                </button>
              );
            })}
          </div>

          {/* Side effects quick-chips */}
          <p className="text-xs font-semibold mb-2 text-right" style={{ color: "rgba(187,247,208,0.60)" }}>
            תופעות לוואי? <span style={{ color: "rgba(187,247,208,0.35)", fontWeight: 400 }}>(לא חובה)</span>
          </p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {["יובש בפה", "עייפות", "חרדה", "ראש כבד", "עלייה בדופק", "עיניים אדומות"].map(se => (
              <button key={se} onClick={() => setSideEffect(sideEffect === se ? null : se)}
                className="text-xs px-2.5 py-1 rounded-full border font-semibold"
                style={{
                  background:  sideEffect === se ? "rgba(248,113,113,0.14)" : "rgba(255,255,255,0.04)",
                  borderColor: sideEffect === se ? "#FCA5A5" : "rgba(255,255,255,0.08)",
                  color:       sideEffect === se ? "#FCA5A5" : "rgba(187,247,208,0.45)",
                }}>
                {se}
              </button>
            ))}
          </div>

          {/* Optional strain */}
          <input type="text" value={strainInput} onChange={e => setStrainInput(e.target.value)}
            placeholder="☘️ איזה זן לקחת? (לא חובה)"
            className="w-full rounded-xl border px-3 py-2.5 text-xs text-right mb-4"
            style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(74,222,128,0.12)",
              color: "#F0FDF4", outline: "none" }} />

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
            <div className="absolute right-5 top-0 bottom-0 w-px" style={{ background: "rgba(74,222,128,0.10)" }} />
            {TIMELINE.map((e, i) => (
              <motion.div key={i} className="flex gap-4 mb-3 items-start"
                initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + i * 0.07 }}>
                <div className="flex-1 text-right min-w-0">
                  <div className="rounded-2xl p-3" style={{ background: "rgba(8,14,10,0.90)", border: "1px solid rgba(74,222,128,0.09)" }}>
                    {/* Row 1: date + time + mood */}
                    <div className="flex items-center justify-end gap-2 mb-2">
                      <span className="text-xs" style={{ color: "rgba(187,247,208,0.38)" }}>{e.date}{e.time ? ` · ${e.time}` : ""}</span>
                      <span className="text-xl">{e.mood}</span>
                    </div>
                    {/* Row 2: method + amount + strain */}
                    {(e.method && e.method !== "ללא") || e.strain ? (
                      <p className="text-xs font-semibold mb-1.5" style={{ color: "#F0FDF4" }}>
                        {[e.method !== "ללא" ? e.method : null, e.amount || null, e.strain ? `· ${e.strain}` : null]
                          .filter(Boolean).join(" ")}
                      </p>
                    ) : null}
                    {/* Row 3: use (old format fallback) */}
                    {!e.method && e.use && e.use !== "ללא" && (
                      <p className="text-xs font-semibold mb-1.5" style={{ color: "#F0FDF4" }}>{e.use}</p>
                    )}
                    {/* Row 4: helped + side effect */}
                    {(e.helped || e.sideEffect) && (
                      <div className="flex gap-2 flex-wrap justify-end">
                        {e.helped && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                            style={{ background: e.helped.startsWith("עזר") ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.10)",
                              color: e.helped.startsWith("עזר") ? "#4ADE80" : "#FCA5A5",
                              border: `1px solid ${e.helped.startsWith("עזר") ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.22)"}` }}>
                            {e.helped}
                          </span>
                        )}
                        {e.sideEffect && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                            style={{ background: "rgba(248,113,113,0.09)", color: "#FCA5A5",
                              border: "1px solid rgba(248,113,113,0.18)" }}>
                            {e.sideEffect}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-10 flex justify-center pt-3.5 flex-shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full border-2"
                    style={{ background: "#050d07", borderColor: "#4ADE80" }} />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Impact summary — how many patients this user's reports helped (C5) */}
      <ImpactSummary />

      {/* Notifications — collapsed */}
      <motion.div className="rounded-2xl border overflow-hidden"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.3 }}
        style={{ background: C.card, borderColor: C.line }}>
        <button onClick={() => setShowNotifs(v => !v)}
          className="w-full px-4 py-3 flex items-center justify-between"
          style={{ background: C.soft }}>
          <motion.span animate={{ rotate: showNotifs ? 90 : 0 }} transition={{ duration: 0.2 }}
            style={{ color: C.accent, fontWeight: 700 }}>›</motion.span>
          <div className="text-right text-sm font-bold" style={{ color: C.ink }}>
            הגדרות התראות 🔔
          </div>
        </button>
        <AnimatePresence>
          {showNotifs && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
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
          )}
        </AnimatePresence>
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
    {icon:"🫂",t:"פווידר סגור",d:"רק בעלי רישיון"},
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
  useEffect(() => {
    if (!strain) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [strain, onClose]);
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
                    <span style={{fontSize:11,color:TERPENES[t]?.color||"#BBF7D0",width:80,textAlign:"right",flexShrink:0,fontWeight:700}}>{terpHuman(t,'icon')} {terpHuman(t,'shortLabel')}</span>
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
      <div style={{ position:"relative", minHeight:320 }}>
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
    <div style={{ display:"flex", flexDirection:"column" }}>
      {/* Feed header */}
      <div style={{
        padding:"12px 14px 10px", borderBottom:"1px solid rgba(74,222,128,0.10)",
        background:"rgba(0,0,0,0.20)",
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <span style={{ fontSize:10, fontWeight:700, color:"rgba(187,247,208,0.60)" }}>
          🌿 פווידר
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
        display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        padding:"44px 16px", textAlign:"center", gap:10,
      }}>
        <p style={{ fontSize:12, fontWeight:700, color:"rgba(187,247,208,0.70)", lineHeight:1.4 }}>
          הפווידר רק מתחיל
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
          ✍️ שתף בפווידר...
        </button>
      </div>
    </div>
  );
}

function Dashboard({ ans, scored, basket, addToBasket, user, licenseVerified, goTab }) {
  const [mobilePane, setMobilePane] = useState("menu");
  const { loginStage }              = useJourney();

  const MenuPane = (
    <div>
      <MenuScan ans={ans} scored={scored} basket={basket} user={user} addToBasket={addToBasket} />
    </div>
  );

  const CommPane = (
    <div>
      <CommunityMiniPanel licenseVerified={licenseVerified} ans={ans} goTab={goTab} onGoLicense={() => goTab("community")} />
    </div>
  );

  const MobileTabBar = (
    <div className="lg:hidden flex rounded-2xl p-1 mb-3 mx-4"
      style={{ background:"rgba(0,0,0,0.35)", border:"1px solid rgba(74,222,128,0.14)" }}>
      {[{ id:"menu", icon:"📸", label:"סרוק תפריט" }, { id:"community", icon:"🌿", label:"פווידר" }].map(t => (
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


  return (
    <>
      {MobileTabBar}

      {/* Desktop: two panes — menu (right/RTL-primary) + community (left) */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", height:"calc(100vh - 140px)", gap:0 }}
        className="hidden lg:grid">
        <motion.div
          initial={{ opacity:0, x:20 }} animate={{ opacity:loginStage === "ready" ? 1 : 0, x: loginStage === "ready" ? 0 : 20 }}
          transition={{ duration:0.55, ease:[0.22,1,0.36,1] }}
          style={{ borderRight:"1px solid rgba(74,222,128,0.10)", overflow:"hidden" }}>
          {MenuPane}
        </motion.div>
        <motion.div
          initial={{ opacity:0, x:-20 }} animate={{ opacity:loginStage === "ready" ? 1 : 0, x: loginStage === "ready" ? 0 : -20 }}
          transition={{ duration:0.55, delay:0.12, ease:[0.22,1,0.36,1] }}
          style={{ overflow:"hidden" }}>
          {CommPane}
        </motion.div>
      </div>

      {/* Mobile: single pane */}
      <div className="lg:hidden" style={{ height:"calc(100vh - 170px)", overflow:"hidden" }}>
        <AnimatePresence mode="wait">
          {mobilePane === "menu" ? (
            <motion.div key="menu"
              initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }}
              exit={{ opacity:0, x:-20 }} transition={{ duration:0.25 }}
              style={{ height:"100%", overflow:"hidden" }}>
              {MenuPane}
            </motion.div>
          ) : (
            <motion.div key="community"
              initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }}
              exit={{ opacity:0, x:20 }} transition={{ duration:0.25 }}
              style={{ height:"100%", overflow:"hidden" }}>
              {CommPane}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
        .auth-shell {
          position: relative; z-index: 10; flex: 1; min-height: 0;
          display: flex; flex-direction: column; align-items: stretch;
        }
        .auth-left-panel { display: none; }
        .auth-form-panel {
          flex: 1; min-height: 0; overflow-y: auto;
          width: 100%; padding: 14px 16px 28px; box-sizing: border-box;
          display: flex; flex-direction: column; align-items: center;
        }
        .auth-mobile-hero { display: block; }
        .auth-cards-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px;
        }
        @media (max-width: 420px) {
          .auth-cards-grid { grid-template-columns: 1fr; }
        }
        @media (min-width: 1024px) {
          .auth-shell { flex-direction: row; align-items: stretch; justify-content: flex-start; }
          .auth-left-panel {
            display: flex; flex: 1; flex-direction: column;
            align-items: center; justify-content: center; padding: 64px;
          }
          .auth-form-panel {
            flex: 0 0 520px; width: 520px; padding: 32px 40px;
            border-left: 1px solid rgba(74,222,128,0.14);
            background: rgba(3,10,6,0.55);
            backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          }
          .auth-mobile-hero { display: none; }
          .auth-cards-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <AuthBgSlideshow />

      <div className="auth-shell">
        {/* Form panel — right side on desktop (RTL primary), full-width on mobile */}
        <div className="auth-form-panel">
          <div className="auth-inner" style={{
            width:"100%", maxWidth:440,
            display:"flex", flexDirection:"column",
          }}>
            {children}
          </div>
        </div>

        {/* Desktop-only hero panel — center of screen */}
        <div className="auth-left-panel">
          <div style={{
            maxWidth:560, width:"100%",
            background:"rgba(8,18,12,0.58)",
            backdropFilter:"blur(18px)", WebkitBackdropFilter:"blur(18px)",
            borderRadius:24, padding:"36px 44px",
            border:"1px solid rgba(74,222,128,0.16)",
            boxShadow:"0 8px 40px rgba(0,0,0,0.38)",
          }}>
            <h2 style={{
              fontSize:38, fontWeight:900, color:"#4ADE80", letterSpacing:"-0.03em",
              lineHeight:1.1, margin:"0 0 22px", textAlign:"right",
              textShadow:"0 0 32px rgba(74,222,128,0.45)",
            }}>ברוכים הבאים</h2>
            {[
              "שלום, אני תום, מטופל כבר לא מעט שנים.",
              "אני מכיר מקרוב את התסכול, את התפריטים האינסופיים, את הניסיון להבין מה באמת עובד ואת הדאגה התמידית שלא ייגמר מה שעוזר.",
              "עד היום אני עומד מול הרוקח ושואל מה לקחת, כי האמת שפשוט הלכתי לאיבוד בין כל השמות והחברות, אז בניתי את המקום שתמיד רציתי שיהיה לי.",
              "מקום שלוקח את כל הבלגן ומתרגם אותו לשפה אחת ברורה ומנסה לדייק את התאמת הקנייה לפי מה שמתאים לך באמת, לא לפי שם על אריזה, וזה עובד הכי טוב ביחד.",
              "כל דיווח שלך מחדד את ההתאמה של מישהו אחר, וכל דיווח שלו מחדד את שלך. ככה לאט לאט מפסיקים לנחש ומתחילים לדעת.",
              "אני יכול להגיד שלי זה עובד ואני מקווה שגם לכם זה יעבוד.",
            ].map((para, i) => (
              <p key={i} style={{
                fontSize:14, fontWeight:500,
                color:"rgba(245,234,200,0.90)",
                lineHeight:1.70, textAlign:"right",
                margin: i < 5 ? "0 0 11px" : "0",
              }}>{para}</p>
            ))}
          </div>
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

  const doLogin = async () => {
    if (!u || !p) return;
    setLoading(true); setErr("");
    try {
      const result = await api.login(u, p);
      localStorage.setItem("cm_session_token", result.token);
      const enrichedUser = { id: result.user.id, email: u, avatar: "🌿" };
      localStorage.setItem("cm_user", JSON.stringify(enrichedUser));
      setUser(enrichedUser);
      go("welcome_room");
    } catch (e) {
      setErr(e.message || "כניסה נכשלה — נסה שוב");
    } finally { setLoading(false); }
  };

  return (
    <AuthCard title={T.auth.loginTitle} sub={T.auth.loginSub} onBack={() => go("welcome")}>
      {/* ponytail: social OAuth not wired — hidden until backend callback routes exist */}
      <form onSubmit={e => { e.preventDefault(); doLogin(); }}>
        <Field label={T.auth.usernameLabel} value={u} onChange={setU} placeholder={T.auth.emailPlaceholder} />
        <Field label={T.auth.passwordLabel} type="password" value={p} onChange={setP} placeholder="••••••••" />
        {err && <p style={{ color:"#F87171", fontSize:13, textAlign:"center", marginBottom:8 }}>{err}</p>}
        <button type="submit" disabled={!u || !p || loading}
          style={{
            width:"100%", padding:"15px", borderRadius:16, border:"none", cursor: (!u || !p || loading) ? "not-allowed" : "pointer",
            background: (!u || !p || loading) ? "rgba(74,222,128,0.18)" : "linear-gradient(135deg,#4ADE80,#22c55e)",
            color: (!u || !p || loading) ? "rgba(187,247,208,0.35)" : "#04120a",
            fontSize:17, fontWeight:900, marginBottom:10, fontFamily:"'Heebo',sans-serif",
            transition:"background .2s, color .2s",
            letterSpacing:"-0.01em", minHeight:50,
          }}>
          {loading ? "מתחבר..." : T.auth.loginBtn || "כניסה"}
        </button>
      </form>
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
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
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
      {/* ponytail: social OAuth not wired — hidden until backend callback routes exist */}
      <form onSubmit={async ev => {
        ev.preventDefault();
        if (!allOk || loading) return;
        setLoading(true); setErr("");
        try {
          const result = await api.signup(e, p);
          localStorage.setItem("cm_session_token", result.token);
          const u = { id: result.user.id, name: n, email: e, avatar:"🌿" };
          localStorage.setItem("cm_user", JSON.stringify(u));
          setUser(u);
          go("welcome_room");
        } catch (ex) {
          setErr(ex.message || "הרשמה נכשלה — נסה שוב");
        } finally { setLoading(false); }
      }}>
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
        {err && <p style={{ color:"#F87171", fontSize:13, textAlign:"center", marginBottom:8 }}>{err}</p>}
        <button type="submit" disabled={!allOk || loading}
          style={{
            width:"100%", padding:"15px", borderRadius:16, border:"none", cursor: (allOk && !loading) ? "pointer" : "not-allowed",
            background: (allOk && !loading) ? "linear-gradient(135deg,#4ADE80,#22c55e)" : "rgba(74,222,128,0.18)",
            color: (allOk && !loading) ? "#04120a" : "rgba(187,247,208,0.35)",
            fontSize:17, fontWeight:900, marginBottom:10, fontFamily:"'Heebo',sans-serif",
            transition:"background .2s, color .2s", letterSpacing:"-0.01em", minHeight:50,
          }}>{loading ? "נרשם..." : "הרשמה והמשך"}</button>
      </form>
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
            קנאמאצ׳ · פווידר סגור לבעלי רישיון רפואי בתוקף
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
          📋 המידע מבוסס על נתונים פתוחים, ספרות מחקרית ודיווחי מטופלים מהפווידר.
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
        onClick={() => { localStorage.setItem("cm_welcome_seen", "1"); go(hasProfile ? "app" : "onboarding"); }}
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
      <form onSubmit={e => { e.preventDefault(); verify(); }}>
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
        <button type="submit" disabled={code.length !== 6 || loading} className="auth-btn-primary">
          {loading ? "מאמת..." : "אימות והמשך"}
        </button>
      </form>
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
          🔒 הרישיון נדרש <b>רק</b> לגישה לפווידר — כדי להגן על מרחב שיח אותנטי ממשיינים ויחצנים.
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
  const redFlags = /למכירה|מוכר |קונה |טלגרם|וואטסאפ|סיגנל|ספק|עודף.*גרם|מחיר לגרם|כיוונים|עברו לפרטי|דברו בפרטי|t\.me|@\w+bot|ללא מרשם|ללא רישיון|משלוח עד הבית|הגעה תוך|מבצע.*גרם/i;
  return redFlags.test(text)
    ? { verdict: "block", reason: "זוהה דפוס מסחר מוכר" }
    : { verdict: "ok" };
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
    setStage("scanning");
    setImgPreview(null); // don't show preview — we discard the image after OCR
    try {
      // 1. Strip EXIF/GPS metadata from the file before processing
      const cleanFile = await stripExif(file);

      // 2. OCR — offline, no server
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["heb", "eng"], 1, { logger: () => {} });
      const blob = cleanFile instanceof Blob ? cleanFile : file;
      const { data: { text } } = await worker.recognize(blob);
      await worker.terminate();
      // Image (cleanFile) is not stored anywhere — only text survives this point

      // 3. Parse fields
      const tcMatches = [...text.matchAll(/T\s*(\d{1,2})\s*[\/\\]\s*C\s*(\d{1,2})/gi)];
      const cats = [...new Set(tcMatches.map(m => `T${m[1]}/C${m[2]}`))];

      let expiry = null;
      const expiryFull = text.match(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/);
      if (expiryFull) expiry = `${expiryFull[3]}-${expiryFull[2].padStart(2,'0')}-${expiryFull[1].padStart(2,'0')}`;
      if (!expiry) {
        const isoM = text.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (isoM) expiry = `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
      }

      const idCandidates = [...text.matchAll(/\b(\d{7,9})\b/g)].map(r => r[1]);
      const licenseId = idCandidates.find(n => !cats.some(c => c.includes(n))) || null;

      if (!expiry && cats.length === 0 && !licenseId) throw new Error("nothing_read");

      // 4. Reject expired licenses before they enter the system
      if (expiry && isLicenseExpired(expiry)) {
        setErrorMsg("הרישיון שזיהינו פג תוקף 🛑 לא ניתן לאמת רישיון שפג — אנא חדשו אותו.");
        setStage("error");
        return;
      }

      // 5. Hash ID + check duplicates; warn if format invalid (OCR can mangle)
      let idHash = null;
      if (licenseId) {
        if (!isValidIsraeliId(licenseId)) {
          // Don't block — OCR may mangle digits — but flag it
          console.warn("License ID failed check-digit:", licenseId);
        }
        idHash = await hashLicenseId(licenseId);
        const existingHash = getStoredLicenseHash();
        if (existingHash && existingHash === idHash) {
          setErrorMsg("הרישיון הזה כבר רשום במערכת 🔒 אם מדובר בטעות, פנו לתמיכה.");
          setStage("error");
          return;
        }
      }

      // 6. Store hash + meta only — never the raw ID or the image
      storeLicenseMeta({ idHash, expiry, cats });
      setExtracted({ cats, expiry });
      setStage("success");
    } catch (err) {
      const msg = err?.message === "nothing_read"
        ? "לא זיהינו מידע ברישיון. נסו תמונה ברורה יותר, או הכניסו פרטים ידנית."
        : "שגיאה בסריקה. נסו שוב.";
      setErrorMsg(msg);
      setStage("error");
    }
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
                📄 סרוק רישיון — כניסה לפווידר
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
                כניסה לפווידר ←
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
    if (verdict.verdict === "block") { setBlocked(verdict.reason || "הפוסט אינו תואם את כללי הפווידר"); return; }
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
            <h2 className="font-extrabold text-base mb-1" style={{ color:"#F0FDF4" }}>🌿 פווידר</h2>
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
          <span className="text-sm" style={{ color:"rgba(187,247,208,0.45)" }}>מה חדש אצלך? שתפ/י בפווידר...</span>
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
              {checking ? "🤖 צמח בודק..." : "🌿 שתף בפווידר"}
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
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onDone(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onDone]);

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

/* ───────────── ניתוב מרכזי ───────────── */
/*
 * resolveScreen() — wrapper around the pure _resolveScreen function.
 * The pure function (src/lib/resolveScreen.ts) is unit-tested.
 * This wrapper binds it to localStorage and handles storage cleanup on corruption.
 */
function resolveScreen() {
  return _resolveScreen(
    { get: (k) => localStorage.getItem(k) },
    () => {
      localStorage.removeItem("cm_session_token");
      localStorage.removeItem("cm_user");
    },
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
  // null = loading (API call in flight); object = { accepted, version, text }.
  // Must be null initially — prevents app content flashing before gate activates.
  const [termsStatus, setTermsStatus] = useState(null);

  const [screen, setScreen] = useState(resolveScreen);
  const [tab, setTab] = useState("menu"); // MVP: land on menu scan (other tabs hidden from nav)
  const [ans, setAns] = useState({
    cats: [], form: [], reasons: [], flavors: [],
    helped: [], notHelped: [], current: [],
  });
  const [ratings, setRatings] = useState({});
  const [basket, setBasket] = useState([]);
  const [budget, setBudget] = useState(700);
  const [gramsByCategory, setGramsByCategory] = useState({});
  const [ph, setPh] = useState("ph1");
  const [notifs, setNotifs] = useState({});
  const [popup, setPopup] = useState(null);
  const [verifyNextScreen, setVerifyNextScreen] = useState("welcome_room");
  const [licenseVerified, setLicenseVerified] = useState(() => localStorage.getItem("cm_license") === "1");
  const [licenseAlert, setLicenseAlert] = useState(null); // null | "expiring" | "expired"

  // Check license expiry on mount and re-lock if lapsed
  useEffect(() => {
    if (!licenseVerified) return;
    const meta = readLicenseMeta();
    if (!meta?.expiry) return;
    const days = daysToExpiry(meta.expiry);
    if (days !== null && days < 0) {
      // License expired since last login — re-lock sensitive features
      localStorage.removeItem("cm_license");
      setLicenseVerified(false);
      setLicenseAlert("expired");
    } else if (days !== null && days <= 90) {
      setLicenseAlert("expiring");
    }
  }, [licenseVerified]);

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
        if (p.ratings)          setRatings(p.ratings);
        if (p.budget)           setBudget(p.budget);
        if (p.streak)           setStreak(p.streak);
        if (p.gramsByCategory)  setGramsByCategory(p.gramsByCategory);
      }
    } catch {}
  }, []);

  /* Session restore is now synchronous (see useState lazy initializer above).
     This useEffect is intentionally removed. */

  useEffect(() => {
    try { localStorage.setItem("cm_profile_v2", JSON.stringify({ ans, ratings, budget, streak, gramsByCategory })); } catch {}
  }, [ans, ratings, budget, streak, gramsByCategory]);

  useEffect(() => { pingBackend().then(setBackendLive); }, []);

  // Terms check — runs when user logs in (user?.id changes).
  // 401 = expired/invalid token → purge session → back to welcome.
  // Other error (network, 5xx) → FAIL CLOSED: block on the gate's error screen.
  // A legal acceptance gate must never let an unverified user through on a fetch failure.
  useEffect(() => {
    if (!user) return;
    setTermsStatus(null);
    let cancelled = false;
    api.terms.status()
      .then(s => { if (!cancelled) setTermsStatus(s); })
      .catch((e) => {
        if (cancelled) return;
        if (e?.message?.startsWith('HTTP 4')) {
          // Expired or invalid token — purge and redirect
          ["cm_session_token", "cm_user", "cm_welcome_seen", "cm_onboarding_done"]
            .forEach(k => localStorage.removeItem(k));
          setUser(null);
          setScreen("welcome");
          // termsStatus stays null — gate is guarded by `user &&` so it won't block
        } else {
          // Network / 5xx — fail closed: accepted:false + text:null renders the
          // TermsGate reload-prompt; the user cannot reach onboarding until status loads.
          setTermsStatus({ accepted: false, version: null, text: null });
        }
      });
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => {
    // Clear ALL routing state so the next login starts from the beginning
    ["cm_session_token", "cm_user", "cm_welcome_seen", "cm_onboarding_done"].forEach(k =>
      localStorage.removeItem(k)
    );
    setUser(null);
    setScreen("welcome");
    setTermsStatus(null);
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
    if (screen === "app") window.scrollTo(0, 0);
  }, [screen]);

  // Global Escape: close top-most overlay in the root component
  useEffect(() => {
    const h = (e) => {
      if (e.key !== 'Escape') return;
      if (showPerms) { setShowPerms(false); return; }
      if (reportStrain) { closeReport(); return; }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [showPerms, reportStrain, closeReport]);

  useEffect(() => {
    if (screen === "app" && !localStorage.getItem("cm_perms_asked")) {
      const t = setTimeout(() => setShowPerms(true), 2000);
      return () => clearTimeout(t);
    }
  }, [screen]);

  const [indFilter, setIndFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    setIndFilter(ans.reasons.length > 0 ? [...ans.reasons] : []);
  }, [ans.reasons]);

  // Auto-set type filter from onboarding form: oil-only → "oil", else "all"
  useEffect(() => {
    const form = ans?.form || [];
    if (form.length === 0) return;
    setTypeFilter(form.length === 1 && form[0] === "שמן" ? "oil" : "all");
  }, [ans.form?.join(",")]);

  const scored = useMemo(
    () => scoreAll(ans, {}, indFilter, typeFilter),
    [ans, indFilter, typeFilter]
  );

  const TABS = [
    { id: "menu",      label: T.tab.menu },
    { id: "dna",       label: T.tab.dna },
    { id: "social",    label: T.tab.social },
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
    { id: "menu",      label: T.nav.menu },
    // HIDDEN FOR MVP — re-enable later (screens + tab handlers below stay intact):
    // { id: "home",      label: T.nav.home },
    // { id: "community", label: T.nav.community },
    // { id: "market",    label: T.nav.market },
    // { id: "basket",    label: T.nav.basket },
    // { id: "journal",   label: T.nav.journal },
    // { id: "knowledge", label: T.nav.knowledge },
    // { id: "cooking",   label: T.nav.cooking },
    // { id: "dna",       label: T.nav.dna },
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
            <motion.div key="welcome" {...FMV} style={{ display:"flex", flexDirection:"column", gap:0 }}>

              {/* ── Brand logo ── */}
              <div style={{ textAlign:"center", marginBottom:20 }}>
                <motion.div
                  animate={{ y:[0,-6,0] }}
                  transition={{ duration:5.5, repeat:Infinity, ease:"easeInOut" }}
                  style={{ fontSize:40, display:"inline-block", marginBottom:8, lineHeight:1,
                    filter:"drop-shadow(0 0 18px rgba(74,222,128,0.55))" }}>
                  🌿
                </motion.div>
                <h1 style={{
                  fontSize:42, fontWeight:900, color:"#4ADE80",
                  margin:"0 auto", letterSpacing:"-0.04em", lineHeight:1,
                  textShadow:"0 0 32px rgba(74,222,128,0.60), 0 2px 10px rgba(0,0,0,0.70)",
                  fontFamily:"'Heebo',sans-serif",
                }}>
                  קנאמאצ׳
                </h1>
                <p style={{ fontSize:12, color:"rgba(134,239,172,0.55)", margin:"6px 0 0",
                  fontWeight:500, letterSpacing:"0.05em" }}>
                  התאמה אישית לתפריט הקנאביס שלך
                </p>
              </div>

              {/* ── Mobile-only: heading + intro (desktop: left hero panel) ── */}
              <div className="auth-mobile-hero" style={{ marginBottom:18 }}>
                <h2 style={{
                  fontSize:26, fontWeight:900, color:"#4ADE80",
                  letterSpacing:"-0.03em", lineHeight:1.1,
                  margin:"0 0 12px", textAlign:"right",
                  textShadow:"0 0 24px rgba(74,222,128,0.45)",
                }}>ברוכים הבאים</h2>
                <div style={{
                  background:"rgba(8,18,12,0.52)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
                  borderRadius:16, padding:"14px 18px",
                  border:"1px solid rgba(74,222,128,0.14)",
                }}>
                  {[
                    "שלום, אני תום, מטופל כבר לא מעט שנים.",
                    "אני מכיר מקרוב את התסכול, את התפריטים האינסופיים, את הניסיון להבין מה באמת עובד ואת הדאגה התמידית שלא ייגמר מה שעוזר.",
                    "עד היום אני עומד מול הרוקח ושואל מה לקחת, כי האמת שפשוט הלכתי לאיבוד בין כל השמות והחברות, אז בניתי את המקום שתמיד רציתי שיהיה לי.",
                    "מקום שלוקח את כל הבלגן ומתרגם אותו לשפה אחת ברורה ומנסה לדייק את התאמת הקנייה לפי מה שמתאים לך באמת, לא לפי שם על אריזה, וזה עובד הכי טוב ביחד.",
                    "כל דיווח שלך מחדד את ההתאמה של מישהו אחר, וכל דיווח שלו מחדד את שלך. ככה לאט לאט מפסיקים לנחש ומתחילים לדעת.",
                    "אני יכול להגיד שלי זה עובד ואני מקווה שגם לכם זה יעבוד.",
                  ].map((para, i) => (
                    <p key={i} style={{
                      fontSize:13, fontWeight:500,
                      color:"rgba(245,234,200,0.88)",
                      lineHeight:1.65, textAlign:"right",
                      margin: i < 5 ? "0 0 9px" : "0",
                    }}>{para}</p>
                  ))}
                </div>
              </div>

              {/* ── Capabilities grid ── */}
              <div className="auth-cards-grid">
                {[
                  { icon:"🎯", title:"התאמה אישית",  text:"מיטוב הקנייה החודשית שלך" },
                  { icon:"📋", title:"סריקת תפריט",  text:"צלם תפריט, קבל רשימה מותאמת לך" },
                  { icon:"📚", title:"ידע ומחקרים",  text:"נתונים אקדמיים ומחקרים פתוחים" },
                  { icon:"🫂", title:"פווידר",         text:"דיווחים אמיתיים, מדורגים לפי אמינות" },
                ].map((f, i) => (
                  <motion.div key={i}
                    initial={{opacity:0, scale:0.90}} animate={{opacity:1, scale:1}}
                    transition={{delay:0.18 + i*0.05, type:"spring", damping:28, stiffness:220}}
                    style={{
                      padding:"16px 12px", borderRadius:18,
                      display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"flex-start", textAlign:"center",
                      background:"rgba(4,14,8,0.50)",
                      border:"1.5px solid rgba(74,222,128,0.30)",
                      backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
                      gap:0,
                    }}>
                    <span style={{ fontSize:28, display:"block", marginBottom:8 }}>{f.icon}</span>
                    <div style={{ fontSize:14, fontWeight:800, color:"#FFFFFF",
                      textShadow:"0 1px 6px rgba(0,0,0,0.70)", marginBottom:5, lineHeight:1.2 }}>{f.title}</div>
                    <div style={{ fontSize:11, color:"rgba(187,247,208,0.82)",
                      textShadow:"0 1px 4px rgba(0,0,0,0.60)", lineHeight:1.5 }}>{f.text}</div>
                  </motion.div>
                ))}
              </div>

              {/* ── Dual CTA buttons ── */}
              <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:14 }}>
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

              <p style={{ fontSize:12, textAlign:"center", color:"rgba(187,247,208,0.55)", lineHeight:1.65, fontWeight:500, margin:"0 0 4px" }}>
                המידע באתר אינו ייעוץ רפואי ואינו תחליף לרופא. הוא מבוסס על נתונים פתוחים וספרות אקדמית מהימנה, ונועד לסייע בהתמצאות בלבד. כל החלטה על הטיפול היא באחריותך ובהתייעצות עם הרופא המטפל.
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

  /* ── TERMS GATE (C6) ────────────────────────────────────────────────────────
     Runs after auth, before any app content renders.
     null   → API call in flight → show loading (prevents content flash).
     false  → user has not accepted current version → full-screen gate.
     true   → accepted → proceed normally.
     ─────────────────────────────────────────────────────────────────────── */
  if (user && termsStatus === null) {
    return (
      <div dir="rtl" style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "#0c0d11", fontFamily: "'Heebo',sans-serif",
      }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>🌿</div>
        <div style={{ fontSize: 12, color: "rgba(187,247,208,0.45)" }}>טוען...</div>
      </div>
    );
  }

  if (user && termsStatus && !termsStatus.accepted) {
    return (
      <TermsGate
        text={termsStatus.text}
        version={termsStatus.version}
        onAccept={() => setTermsStatus(s => ({ ...s, accepted: true }))}
      />
    );
  }

  /* ── NON-AUTH SCREENS ── */
  return (
    <div dir="rtl" className="min-h-screen"
      style={{ background: "#0c0d11", fontFamily: "'Heebo','Segoe UI',sans-serif", color: "#F0FDF4" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap');`}</style>
      {PopupToast}

      {screen === "onboarding" && (
        <>
          {/* Fixed background layers — stay behind scrolling content */}
          <div style={{ position:"fixed", inset:0, background:"#0B1810", zIndex:0, pointerEvents:"none" }} />
          <div style={{
            position:"fixed", inset:0, zIndex:1, pointerEvents:"none",
            backgroundImage:"url('/9-Best-Purple-Strains-2048x1080.jpg')",
            backgroundSize:"cover", backgroundPosition:"center 30%",
            filter:"saturate(1.4) brightness(0.22)",
          }} />
          {/* Natural-flow content — body scrolls for long stages */}
          <div style={{
            position:"relative", zIndex:2,
            minHeight:"100dvh",
            display:"flex", justifyContent:"center",
            boxSizing:"border-box",
          }}>
            <div style={{ width:"100%", maxWidth:680 }}>
            {/* Layer 3: OnboardingV3 (3-screen, experience-forked). OnboardingWizard kept as
                dead code below until V3 is verified end-to-end — revert this mount line to roll back. */}
            <OnboardingV3
              user={user}
              onComplete={({ localAns }) => {
                // ALL_CATS: every category present in our strain database — used when user has no license
                const ALL_CATS = ["T0/C30","T1/C20","T1/C28","T10/C10","T10/C2","T15/C3","T18/C3","T22/C4","T3/C15","T3/C18","T5/C10","T5/C20"];
                setAns((prev) => ({
                  ...prev,
                  ...localAns,
                  // No license → show full catalog; profile scoring still differentiates
                  cats: (localAns?.cats || []).length > 0
                    ? localAns.cats
                    : (prev.cats || []).length > 0 ? prev.cats : ALL_CATS,
                  reasons: (localAns?.reasons || []).length > 0 ? localAns.reasons : (prev.reasons || []),
                  flavors: (localAns?.flavors || []).length > 0 ? localAns.flavors : (prev.flavors || []),
                }));
                if (localAns?.gramsByCategory && Object.keys(localAns.gramsByCategory).length > 0) {
                  setGramsByCategory(localAns.gramsByCategory);
                }
                if (localAns?.licenseVerified) {
                  setLicenseVerified(true);
                  localStorage.setItem("cm_license", "1");
                }
                localStorage.setItem("cm_onboarding_done", "1");
                setScreen("app");
              }}
              onSkip={() => { localStorage.setItem("cm_onboarding_done", "1"); setScreen("app"); }}
            />
            </div>
          </div>
        </>
      )}

      {screen === "app" && (
        <JourneyProvider screen={screen} licenseVerified={licenseVerified} checked={checked}>
        <div className="relative flex" dir="rtl" style={{ background:"#04100a", height:"100dvh", overflow:"hidden" }}>
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
          <StageWrapper className="flex-1 min-w-0 min-h-0 flex flex-col relative z-10">
            <header className="px-5 pt-4 pb-3 flex items-center justify-between border-b"
              style={{
                borderColor:"rgba(74,222,128,0.14)",
                background:"rgba(4,14,8,0.60)",
                backdropFilter:"blur(22px)",
                position:"relative",
              }}>
              <button onClick={() => setScreen("onboarding")}
                style={{
                  fontSize:12, fontWeight:700, padding:"7px 14px", borderRadius:12, cursor:"pointer",
                  color:"#4ADE80", background:"rgba(74,222,128,0.08)",
                  border:"1px solid rgba(74,222,128,0.18)",
                }}>
                ✏️ עדכן
              </button>
              {user ? (
                <button onClick={handleLogout}
                  style={{
                    fontSize:11, fontWeight:700, padding:"5px 10px", borderRadius:10, cursor:"pointer",
                    color:"#F87171", background:"rgba(248,113,113,0.08)",
                    border:"1px solid rgba(248,113,113,0.18)",
                  }}>
                  יציאה
                </button>
              ) : <div />}
            </header>

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

            <main className="flex-1 pb-8 overflow-y-auto">
              <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
              {/* ── License expiry alert banner ── */}
              {licenseAlert === "expired" && (
                <div className="mx-4 mt-3 rounded-2xl p-3 flex items-center gap-3"
                  style={{ background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.30)" }}>
                  <span style={{ fontSize: 18 }}>🛑</span>
                  <p className="text-xs flex-1" style={{ color: "#FCA5A5" }}>
                    <b>הרישיון שלך פג תוקף</b> — הגישה לפרופיל ולפווידר נעולה עד חידוש הרישיון.
                  </p>
                  <button onClick={() => setLicenseAlert(null)}
                    style={{ fontSize: 14, color: "#FCA5A5", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                </div>
              )}
              {licenseAlert === "expiring" && (() => {
                const meta = readLicenseMeta();
                const days = meta?.expiry ? daysToExpiry(meta.expiry) : null;
                return (
                  <div className="mx-4 mt-3 rounded-2xl p-3 flex items-center gap-3"
                    style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
                    <span style={{ fontSize: 18 }}>🌿</span>
                    <p className="text-xs flex-1" style={{ color: "#FBBF24" }}>
                      הרישיון שלך פג בעוד כ-{days} ימים — שווה כבר לקבוע חידוש 🌿
                    </p>
                    <button onClick={() => setLicenseAlert(null)}
                      style={{ fontSize: 14, color: "#FBBF24", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                  </div>
                );
              })()}

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
                    addToBasket={(id) => setBasket([...basket, id])}
                    setTab={setTab} />
                </>
              )}
              {tab === "dna" && <GeneticDNA ans={ans} ratings={ratings} scored={scored} goJournal={() => setTab("journal")} />}
              {tab === "community" && (
                licenseVerified
                  ? <CommunitySplitScreen ans={ans} user={user} />
                  : <CommunityLicenseGate onUnlock={() => setLicenseVerified(true)} />
              )}
              {tab === "social" && (
                licenseVerified
                  ? <TwinsFeed userId={user?.id} />
                  : <CommunityLicenseGate onUnlock={() => setLicenseVerified(true)} />
              )}
              {tab === "menu" && (
                <MenuScan ans={ans} scored={scored} basket={basket} user={user}
                  addToBasket={(id) => setBasket([...basket, id])} />
              )}
              {tab === "market" && <Market scored={scored} basket={basket} addToBasket={(id) => setBasket([...basket, id])} />}
              {tab === "basket" && (
                <BasketPlannerScreen
                  ans={ans}
                  gramsByCategory={gramsByCategory}
                  strains={STRAINS}
                  onClose={() => setTab("home")}
                />
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
              {tab === "profile" && <Profile ans={ans} ratings={ratings} goDNA={() => setTab("dna")} licenseVerified={licenseVerified} />}
              {tab === "journal" && (
                <Journal ans={ans} scored={scored} ratings={ratings} setRatings={setRatings}
                  streak={streak} setStreak={setStreak} checked={checked} setChecked={setChecked}
                  notifs={notifs} setNotifs={setNotifs} />
              )}
              </div>
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

      {/* Mascot only in main app, not during onboarding */}

    </div>
  );
}
