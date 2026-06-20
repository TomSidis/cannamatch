// ─────────────────────────────────────────────
//  קנאמאצ׳ — סטטוס פתוח/סגור חי לבתי מרקחת
//  שעון: Asia/Jerusalem (לא תלוי באזור הזמן של השרת)
// ─────────────────────────────────────────────

// בתי מרקחת מובילים לקנאביס רפואי בישראל — fallback אם ה-DB לא זמין/ריק
const ISRAELI_PHARMACY_FALLBACK = [
  {
    id: "fallback-yarkonim",
    name: "סופר-פארם הירקונים",
    city: "תל אביב",
    delivery: true,
    address: "רחוב הירקון, תל אביב",
    phone: "03-6900000",
    website_url: null,
    maps_url: null,
    hours_weekdays: "08:00-22:00",
    hours_friday: "08:00-15:00",
    hours_saturday: "19:00-22:00",
  },
  {
    id: "fallback-givat-shaul",
    name: "סופר-פארם גבעת שאול",
    city: "ירושלים",
    delivery: true,
    address: "גבעת שאול, ירושלים",
    phone: "02-6500000",
    website_url: null,
    maps_url: null,
    hours_weekdays: "08:00-21:00",
    hours_friday: "08:00-14:00",
    hours_saturday: null,
  },
  {
    id: "fallback-shor-tabachnik",
    name: "שור טבצ'ניק",
    city: "תל אביב",
    delivery: false,
    address: "רחוב אבן גבירול, תל אביב",
    phone: "03-5200000",
    website_url: null,
    maps_url: null,
    hours_weekdays: "09:00-20:00",
    hours_friday: "09:00-14:00",
    hours_saturday: null,
  },
];

const HOURS_RE = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

// מחזיר { weekday, nowMinutes } לפי השעון בישראל — לא תלוי באזור הזמן של השרת
function getIsraelCurrentTime() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    weekday: get("weekday"), // "Sun".."Sat"
    nowMinutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

// pharmacy = { hours_weekdays, hours_friday, hours_saturday }
function computeOpenStatus(pharmacy) {
  const { weekday, nowMinutes } = getIsraelCurrentTime();
  const hoursToday =
    weekday === "Fri" ? pharmacy.hours_friday :
    weekday === "Sat" ? pharmacy.hours_saturday :
    pharmacy.hours_weekdays;

  if (!hoursToday) return { is_open: false, hours_today: null };

  const m = HOURS_RE.exec(hoursToday.trim());
  if (!m) return { is_open: false, hours_today: hoursToday };

  const openMin = Number(m[1]) * 60 + Number(m[2]);
  const closeMin = Number(m[3]) * 60 + Number(m[4]);
  const is_open = closeMin > openMin
    ? nowMinutes >= openMin && nowMinutes < closeMin
    : nowMinutes >= openMin || nowMinutes < closeMin; // חצות-חיתוך, ליתר בטיחות

  return { is_open, hours_today: hoursToday };
}

export { computeOpenStatus, ISRAELI_PHARMACY_FALLBACK };
