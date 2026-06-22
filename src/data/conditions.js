// Israeli MOH (Procedure 106 / נוהל 106) approved medical indications for cannabis.
// Single source of truth — update here to add / remove conditions.

export const MEDICAL_CONDITIONS = [
  { id: "chronic_pain",    label: "כאב כרוני",              icon: "🩹", sub: "כאב שנמשך מעל 3 חודשים" },
  { id: "neuropathic",     label: "כאב עצבי",               icon: "⚡", sub: "נוירופתיה, עצב פגוע" },
  { id: "oncology",        label: "סרטן / אונקולוגיה",       icon: "🎗️", sub: "סרטן, כולל בחילות מכימותרפיה" },
  { id: "nausea_vomiting", label: "בחילות והקאות",           icon: "🤢", sub: "כתוצאה מטיפולים רפואיים" },
  { id: "ibd",             label: "מחלות מעי – קרוהן / קוליטיס", icon: "🫁", sub: "מחלות מעי דלקתיות" },
  { id: "ms",              label: "טרשת נפוצה",              icon: "🧠", sub: "טרשת נפוצה" },
  { id: "parkinsons",      label: "פרקינסון",                icon: "🤲", sub: "מחלת פרקינסון" },
  { id: "epilepsy",        label: "אפילפסיה",                icon: "💫", sub: "התקפות, עמידות לתרופות" },
  { id: "tourette",        label: "טיקים / תסמונת טורט",     icon: "🔄", sub: "תסמונת טורט, טיקים" },
  { id: "ptsd",            label: "PTSD / פוסט-טראומה",      icon: "🛡️", sub: "הפרעת דחק פוסט-טראומטית" },
  { id: "autism",          label: "אוטיזם",                  icon: "🌈", sub: "הפרעת ספקטרום אוטיסטי" },
  { id: "fibromyalgia",    label: "פיברומיאלגיה",            icon: "🌡️", sub: "כאב גוף מפושט, עייפות" },
  { id: "aids",            label: "איידס / HIV",             icon: "🔴", sub: "HIV / AIDS" },
  { id: "glaucoma",        label: "גלאוקומה",                icon: "👁️", sub: "לחץ תוך-עיני גבוה" },
  { id: "dementia",        label: "דמנציה",                  icon: "🧩", sub: "עם הפרעות התנהגות" },
  { id: "palliative",      label: "טיפול פליאטיבי / סופני",  icon: "🕊️", sub: "הקלה בסוף חיים" },
  { id: "heart_failure",   label: "אי-ספיקת לב קשה",        icon: "💗", sub: "אי-ספיקת לב מתקדמת" },
  { id: "other",           label: "אחר",                    icon: "📝", sub: "מצב שאינו ברשימה (מסגרת חריגים)" },
];

export default MEDICAL_CONDITIONS;
