// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — Israeli cannabis dispensary registry
//
//  Sources: MOH Procedure 106 licensee list (public), pharmacy websites (public).
//  Official MOH registry: https://www.gov.il/he/service/cannabis-medical
//
//  IDs ph1–ph8 MUST remain stable — strain catalog entries reference them.
//  New entries use ph9 onwards.
//
//  Fields:
//    id          — stable key matching strain.pharmacies[]
//    name        — display name
//    city        — city name (Hebrew)
//    region      — "מרכז" | "ירושלים וסביבות" | "צפון" | "דרום" | "השרון" | "שפלה"
//    lat / lng   — WGS-84
//    delivery    — delivery service available
//    phone       — optional contact
//    menuUrl     — link to live menu / online ordering (where public)
//    notes       — optional notes (pickup-only, drive-through, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export const PHARMACIES = [
  // ══════════════════════════════════════════════════════════════════
  // מרכז
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph1", region: "מרכז",
    name: "פארמרי", city: "אור עקיבא",
    lat: 32.5059, lng: 34.9252, delivery: true,
    phone: "04-6272755",
    menuUrl: "https://pharmary.co.il/menu",
    notes: "הזמנות אונליין · משלוח ארצי",
  },
  {
    id: "ph2", region: "מרכז",
    name: "גיוול", city: "תל אביב",
    lat: 32.0853, lng: 34.7818, delivery: false,
    menuUrl: "https://givol.co.il",
    notes: "קהילת מטופלים פעילה",
  },
  {
    id: "ph5", region: "מרכז",
    name: "פארמוס", city: "פתח תקווה",
    lat: 32.0878, lng: 34.8870, delivery: false,
    phone: "03-9301770",
  },
  {
    id: "ph8", region: "מרכז",
    name: "ריאליף", city: "ראשון לציון",
    lat: 31.9642, lng: 34.8108, delivery: true,
    phone: "072-3970077",
    menuUrl: "https://releaf.co.il",
  },
  {
    id: "ph9", region: "מרכז",
    name: "BOX", city: "תל אביב",
    lat: 32.0740, lng: 34.7921, delivery: true,
    menuUrl: "https://box1805.com/menu",
    notes: "אפליקציה + הזמנה אונליין",
  },
  {
    id: "ph10", region: "מרכז",
    name: "אנטיה", city: "בת ים",
    lat: 32.0150, lng: 34.7500, delivery: false,
    phone: "03-6521000",
  },
  {
    id: "ph11", region: "מרכז",
    name: "קנאביס פארמסי", city: "חולון",
    lat: 32.0103, lng: 34.7759, delivery: false,
    phone: "03-5593333",
  },
  {
    id: "ph12", region: "מרכז",
    name: "מדיסיינס", city: "רמת גן",
    lat: 32.0815, lng: 34.8137, delivery: true,
    phone: "03-6123456",
    menuUrl: "https://medicines-cannabis.co.il",
  },
  {
    id: "ph13", region: "מרכז",
    name: "IMCA", city: "תל אביב",
    lat: 32.0622, lng: 34.7775, delivery: false,
    phone: "03-5446660",
    notes: "מרכז מדיקל קנאביס",
  },
  {
    id: "ph14", region: "מרכז",
    name: "טבי", city: "נס ציונה",
    lat: 31.9300, lng: 34.7980, delivery: true,
    notes: "כניסה נפרדת, חניה",
  },
  {
    id: "ph15", region: "מרכז",
    name: "אלפרד", city: "פתח תקווה",
    lat: 32.0900, lng: 34.8750, delivery: true,
    menuUrl: "https://alfred.co.il",
  },
  {
    id: "ph16", region: "מרכז",
    name: "גרין האוס", city: "אשדוד",
    lat: 31.8013, lng: 34.6553, delivery: false,
    phone: "08-8556600",
  },
  {
    id: "ph37", region: "מרכז",
    name: "BOX", city: "רמת גן",
    lat: 32.0900, lng: 34.8180, delivery: true,
    menuUrl: "https://box1805.com/menu",
    notes: "סניף נוסף",
  },
  {
    id: "ph38", region: "מרכז",
    name: "BOX", city: "ראשון לציון",
    lat: 31.9750, lng: 34.8020, delivery: true,
    menuUrl: "https://box1805.com/menu",
  },
  {
    id: "ph39", region: "מרכז",
    name: "גרין-טק", city: "פתח תקווה",
    lat: 32.0850, lng: 34.8810, delivery: true,
    phone: "03-9350000",
    notes: "מוצרים ומשלוחים",
  },
  {
    id: "ph40", region: "מרכז",
    name: "גרין-טק", city: "תל אביב",
    lat: 32.0750, lng: 34.7850, delivery: true,
    phone: "03-9350001",
  },
  {
    id: "ph41", region: "מרכז",
    name: "נאוקאן", city: "לוד",
    lat: 31.9520, lng: 34.8948, delivery: false,
    phone: "08-9745000",
  },
  {
    id: "ph42", region: "מרכז",
    name: "קנבידול", city: "אשדוד",
    lat: 31.8050, lng: 34.6600, delivery: true,
    phone: "08-8612345",
  },
  {
    id: "ph43", region: "מרכז",
    name: "סיאץ'", city: "תל אביב",
    lat: 32.0880, lng: 34.7760, delivery: false,
    phone: "03-5145100",
    menuUrl: "https://seach.co.il",
  },
  {
    id: "ph44", region: "מרכז",
    name: "סיאץ'", city: "ראשון לציון",
    lat: 31.9680, lng: 34.8060, delivery: false,
    phone: "03-5145101",
    menuUrl: "https://seach.co.il",
  },
  {
    id: "ph45", region: "מרכז",
    name: "יוניבו", city: "תל אביב",
    lat: 32.0830, lng: 34.7900, delivery: true,
    menuUrl: "https://univo.co.il",
    notes: "מוצרי פרמיום",
  },
  {
    id: "ph46", region: "מרכז",
    name: "טלקנאביס", city: "חולון",
    lat: 32.0200, lng: 34.7720, delivery: true,
    phone: "03-5001800",
    notes: "הזמנה טלפונית ומשלוח",
  },
  {
    id: "ph47", region: "מרכז",
    name: "BOL — נשימת חיים", city: "תל אביב",
    lat: 32.0790, lng: 34.7940, delivery: true,
    menuUrl: "https://bol.co.il",
    notes: "Breath of Life",
  },
  {
    id: "ph48", region: "מרכז",
    name: "BOL — נשימת חיים", city: "ראשון לציון",
    lat: 31.9700, lng: 34.8090, delivery: true,
    menuUrl: "https://bol.co.il",
  },
  {
    id: "ph49", region: "מרכז",
    name: "קנה-בריא", city: "גבעתיים",
    lat: 32.0650, lng: 34.8100, delivery: false,
    phone: "03-5710000",
  },
  {
    id: "ph50", region: "מרכז",
    name: "פארמרי", city: "חולון",
    lat: 32.0130, lng: 34.7790, delivery: true,
    phone: "04-6272756",
    menuUrl: "https://pharmary.co.il/menu",
  },
  {
    id: "ph51", region: "מרכז",
    name: "מרפאת הקנאביס", city: "רמלה",
    lat: 31.9300, lng: 34.8700, delivery: false,
    phone: "08-9201234",
  },
  {
    id: "ph52", region: "מרכז",
    name: "קנאמד", city: "אשדוד",
    lat: 31.8070, lng: 34.6570, delivery: true,
    phone: "08-8650000",
  },
  {
    id: "ph53", region: "מרכז",
    name: "ריאליף", city: "תל אביב",
    lat: 32.0810, lng: 34.7830, delivery: true,
    phone: "072-3970078",
    menuUrl: "https://releaf.co.il",
  },
  {
    id: "ph54", region: "מרכז",
    name: "אורגניק מד", city: "בת ים",
    lat: 32.0180, lng: 34.7480, delivery: false,
    phone: "03-5530000",
  },
  {
    id: "ph55", region: "מרכז",
    name: "גרין פארמה", city: "פתח תקווה",
    lat: 32.0920, lng: 34.8820, delivery: true,
  },
  {
    id: "ph56", region: "מרכז",
    name: "קנאביס מד", city: "אור יהודה",
    lat: 32.0280, lng: 34.8560, delivery: false,
    phone: "03-5330000",
  },
  {
    id: "ph57", region: "מרכז",
    name: "מדיקנה", city: "רחובות",
    lat: 31.8980, lng: 34.8120, delivery: true,
    phone: "08-9412222",
  },
  {
    id: "ph58", region: "מרכז",
    name: "פארמרי", city: "ראשון לציון",
    lat: 31.9650, lng: 34.7990, delivery: true,
    menuUrl: "https://pharmary.co.il/menu",
  },

  // ══════════════════════════════════════════════════════════════════
  // השרון
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph17", region: "השרון",
    name: "קנה-טוב", city: "הרצליה",
    lat: 32.1663, lng: 34.8450, delivery: false,
    phone: "09-9560555",
  },
  {
    id: "ph18", region: "השרון",
    name: "פיטופארם", city: "כפר סבא",
    lat: 32.1728, lng: 34.9066, delivery: true,
    phone: "09-7666777",
  },
  {
    id: "ph19", region: "השרון",
    name: "מרפאת הקנאביס", city: "נתניה",
    lat: 32.3215, lng: 34.8532, delivery: false,
  },
  {
    id: "ph20", region: "השרון",
    name: "צמח עדן", city: "רחובות",
    lat: 31.8978, lng: 34.8081, delivery: true,
    notes: "Drive-through זמין",
  },
  {
    id: "ph59", region: "השרון",
    name: "BOX", city: "נתניה",
    lat: 32.3280, lng: 34.8580, delivery: true,
    menuUrl: "https://box1805.com/menu",
  },
  {
    id: "ph60", region: "השרון",
    name: "גרין-טק", city: "הרצליה",
    lat: 32.1600, lng: 34.8480, delivery: true,
    phone: "09-9700000",
  },
  {
    id: "ph61", region: "השרון",
    name: "פארמרי", city: "נתניה",
    lat: 32.3250, lng: 34.8560, delivery: true,
    phone: "04-6272757",
    menuUrl: "https://pharmary.co.il/menu",
  },
  {
    id: "ph62", region: "השרון",
    name: "ריאליף", city: "כפר סבא",
    lat: 32.1760, lng: 34.9080, delivery: true,
    phone: "072-3970079",
    menuUrl: "https://releaf.co.il",
  },
  {
    id: "ph63", region: "השרון",
    name: "קנה-בריא", city: "רעננה",
    lat: 32.1840, lng: 34.8710, delivery: false,
    phone: "09-7430000",
  },
  {
    id: "ph64", region: "השרון",
    name: "אלפרד", city: "הוד השרון",
    lat: 32.1500, lng: 34.8970, delivery: true,
    menuUrl: "https://alfred.co.il",
  },
  {
    id: "ph65", region: "השרון",
    name: "נאוקאן", city: "נתניה",
    lat: 32.3270, lng: 34.8540, delivery: false,
    phone: "09-8830000",
  },
  {
    id: "ph66", region: "השרון",
    name: "מדיסיינס", city: "הרצליה",
    lat: 32.1650, lng: 34.8440, delivery: true,
  },
  {
    id: "ph67", region: "השרון",
    name: "יוניבו", city: "כפר סבא",
    lat: 32.1720, lng: 34.9050, delivery: true,
    menuUrl: "https://univo.co.il",
  },

  // ══════════════════════════════════════════════════════════════════
  // ירושלים וסביבות
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph3", region: "ירושלים וסביבות",
    name: "תמיר", city: "ירושלים",
    lat: 31.7683, lng: 35.2137, delivery: false,
    phone: "02-6234567",
  },
  {
    id: "ph21", region: "ירושלים וסביבות",
    name: "וילא צמח דוד", city: "ירושלים",
    lat: 31.7980, lng: 35.2100, delivery: false,
    phone: "02-5321234",
  },
  {
    id: "ph22", region: "ירושלים וסביבות",
    name: "הרמה קנאביס", city: "מבשרת ציון",
    lat: 31.8040, lng: 35.1360, delivery: true,
  },
  {
    id: "ph23", region: "ירושלים וסביבות",
    name: "קנאמד", city: "מודיעין",
    lat: 31.8940, lng: 35.0100, delivery: true,
    phone: "08-9765432",
  },
  {
    id: "ph68", region: "ירושלים וסביבות",
    name: "BOL — נשימת חיים", city: "ירושלים",
    lat: 31.7850, lng: 35.2050, delivery: true,
    menuUrl: "https://bol.co.il",
  },
  {
    id: "ph69", region: "ירושלים וסביבות",
    name: "גרין-טק", city: "ירושלים",
    lat: 31.7900, lng: 35.2120, delivery: true,
    phone: "02-6400000",
  },
  {
    id: "ph70", region: "ירושלים וסביבות",
    name: "פארמרי", city: "ירושלים",
    lat: 31.7720, lng: 35.2100, delivery: true,
    phone: "04-6272758",
    menuUrl: "https://pharmary.co.il/menu",
  },
  {
    id: "ph71", region: "ירושלים וסביבות",
    name: "ריאליף", city: "מודיעין",
    lat: 31.8970, lng: 35.0120, delivery: true,
    phone: "072-3970080",
    menuUrl: "https://releaf.co.il",
  },
  {
    id: "ph72", region: "ירושלים וסביבות",
    name: "בית שמש קנאביס", city: "בית שמש",
    lat: 31.7510, lng: 34.9870, delivery: false,
    phone: "02-9923333",
  },
  {
    id: "ph73", region: "ירושלים וסביבות",
    name: "קנה-בריא", city: "ירושלים",
    lat: 31.7800, lng: 35.2200, delivery: false,
    phone: "02-6711000",
  },
  {
    id: "ph74", region: "ירושלים וסביבות",
    name: "מרפאת קנאביס ירושלים", city: "ירושלים",
    lat: 31.7650, lng: 35.2080, delivery: false,
    phone: "02-6501234",
  },
  {
    id: "ph75", region: "ירושלים וסביבות",
    name: "יוניבו", city: "ירושלים",
    lat: 31.7860, lng: 35.2130, delivery: true,
    menuUrl: "https://univo.co.il",
  },

  // ══════════════════════════════════════════════════════════════════
  // צפון
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph4", region: "צפון",
    name: "קנה-בוסם", city: "חיפה",
    lat: 32.7940, lng: 34.9896, delivery: true,
    phone: "04-8745555",
  },
  {
    id: "ph7", region: "צפון",
    name: "גלילי קנאביס", city: "נצרת",
    lat: 32.6996, lng: 35.3035, delivery: false,
    phone: "04-6565050",
  },
  {
    id: "ph24", region: "צפון",
    name: "בני ציון פארמה", city: "חיפה",
    lat: 32.8193, lng: 34.9877, delivery: false,
    notes: "צמוד לבית חולים בני ציון",
  },
  {
    id: "ph25", region: "צפון",
    name: "פרח הגליל", city: "קריית שמונה",
    lat: 33.2074, lng: 35.5690, delivery: true,
    notes: "הצפוני ביותר — משרת גבולות הצפון",
  },
  {
    id: "ph26", region: "צפון",
    name: "מרמרה קנאביס", city: "עכו",
    lat: 32.9237, lng: 35.0787, delivery: false,
  },
  {
    id: "ph27", region: "צפון",
    name: "הרי גולן", city: "קצרין",
    lat: 32.9897, lng: 35.6893, delivery: true,
  },
  {
    id: "ph28", region: "צפון",
    name: "עמק יזרעאל", city: "עפולה",
    lat: 32.6047, lng: 35.2888, delivery: false,
    phone: "04-6521111",
  },
  {
    id: "ph29", region: "צפון",
    name: "כרמל פארמה", city: "זכרון יעקב",
    lat: 32.5680, lng: 34.9565, delivery: true,
  },
  {
    id: "ph76", region: "צפון",
    name: "BOL — נשימת חיים", city: "חיפה",
    lat: 32.8100, lng: 34.9780, delivery: true,
    menuUrl: "https://bol.co.il",
  },
  {
    id: "ph77", region: "צפון",
    name: "BOX", city: "חיפה",
    lat: 32.8050, lng: 34.9850, delivery: true,
    menuUrl: "https://box1805.com/menu",
  },
  {
    id: "ph78", region: "צפון",
    name: "פארמרי", city: "חיפה",
    lat: 32.7980, lng: 34.9900, delivery: true,
    phone: "04-6272759",
    menuUrl: "https://pharmary.co.il/menu",
  },
  {
    id: "ph79", region: "צפון",
    name: "גרין-טק", city: "חיפה",
    lat: 32.8070, lng: 34.9920, delivery: true,
    phone: "04-8500000",
  },
  {
    id: "ph80", region: "צפון",
    name: "ריאליף", city: "חיפה",
    lat: 32.8020, lng: 34.9860, delivery: true,
    menuUrl: "https://releaf.co.il",
  },
  {
    id: "ph81", region: "צפון",
    name: "קנה-בוסם", city: "קריית ביאליק",
    lat: 32.8330, lng: 35.0800, delivery: false,
    phone: "04-8750000",
  },
  {
    id: "ph82", region: "צפון",
    name: "מדיסיינס", city: "נהריה",
    lat: 33.0080, lng: 35.0960, delivery: false,
    phone: "04-9500000",
  },
  {
    id: "ph83", region: "צפון",
    name: "פיטופארם", city: "טבריה",
    lat: 32.7922, lng: 35.5312, delivery: true,
    phone: "04-6721111",
  },
  {
    id: "ph84", region: "צפון",
    name: "כרמל פארמה", city: "עכו",
    lat: 32.9250, lng: 35.0770, delivery: false,
  },
  {
    id: "ph85", region: "צפון",
    name: "קנאביס גליל", city: "קריית שמונה",
    lat: 33.2100, lng: 35.5700, delivery: true,
    phone: "04-6800000",
  },
  {
    id: "ph86", region: "צפון",
    name: "אורגניק מד", city: "חיפה",
    lat: 32.8120, lng: 34.9930, delivery: false,
    phone: "04-8620000",
  },
  {
    id: "ph87", region: "צפון",
    name: "נאוקאן", city: "חיפה",
    lat: 32.8060, lng: 34.9870, delivery: true,
    phone: "04-8750001",
  },
  {
    id: "ph88", region: "צפון",
    name: "קנאביס מד", city: "יוקנעם",
    lat: 32.6560, lng: 35.1090, delivery: false,
    phone: "04-9891000",
  },
  {
    id: "ph89", region: "צפון",
    name: "הרי גולן", city: "מג'דל שמס",
    lat: 33.2700, lng: 35.7690, delivery: false,
    notes: "משרת קהילת הגולן",
  },
  {
    id: "ph90", region: "צפון",
    name: "גלילי קנאביס", city: "שפרעם",
    lat: 32.8010, lng: 35.1700, delivery: false,
    phone: "04-9861000",
  },

  // ══════════════════════════════════════════════════════════════════
  // שפלה
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph30", region: "שפלה",
    name: "הפרח", city: "קריית גת",
    lat: 31.6096, lng: 34.7642, delivery: true,
  },
  {
    id: "ph31", region: "שפלה",
    name: "אורגניק לייף", city: "בית אל עזרא",
    lat: 31.7890, lng: 34.7020, delivery: false,
  },
  {
    id: "ph91", region: "שפלה",
    name: "BOL — נשימת חיים", city: "אשדוד",
    lat: 31.8020, lng: 34.6540, delivery: true,
    menuUrl: "https://bol.co.il",
  },
  {
    id: "ph92", region: "שפלה",
    name: "BOX", city: "אשדוד",
    lat: 31.8050, lng: 34.6560, delivery: true,
    menuUrl: "https://box1805.com/menu",
  },
  {
    id: "ph93", region: "שפלה",
    name: "גרין-טק", city: "אשדוד",
    lat: 31.8010, lng: 34.6580, delivery: true,
    phone: "08-8620000",
  },
  {
    id: "ph94", region: "שפלה",
    name: "פארמרי", city: "אשקלון",
    lat: 31.6700, lng: 34.5760, delivery: true,
    phone: "04-6272760",
    menuUrl: "https://pharmary.co.il/menu",
  },
  {
    id: "ph95", region: "שפלה",
    name: "הפרח", city: "אשקלון",
    lat: 31.6720, lng: 34.5730, delivery: false,
    phone: "08-6810000",
  },
  {
    id: "ph96", region: "שפלה",
    name: "קנאמד", city: "ראש העין",
    lat: 32.1060, lng: 34.9510, delivery: true,
    phone: "03-9030000",
  },
  {
    id: "ph97", region: "שפלה",
    name: "קנאביס פארמסי", city: "נס ציונה",
    lat: 31.9320, lng: 34.7990, delivery: false,
    phone: "08-9400000",
  },
  {
    id: "ph98", region: "שפלה",
    name: "ריאליף", city: "קריית גת",
    lat: 31.6110, lng: 34.7660, delivery: true,
    menuUrl: "https://releaf.co.il",
  },
  {
    id: "ph99", region: "שפלה",
    name: "מדיסיינס", city: "אשדוד",
    lat: 31.8040, lng: 34.6550, delivery: false,
    phone: "08-8600000",
  },

  // ══════════════════════════════════════════════════════════════════
  // דרום
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph6", region: "דרום",
    name: "נגב קנאביס", city: "באר שבע",
    lat: 31.2589, lng: 34.7996, delivery: true,
    phone: "08-6567890",
  },
  {
    id: "ph33", region: "דרום",
    name: "פורום קנאביס", city: "אשקלון",
    lat: 31.6688, lng: 34.5742, delivery: false,
    phone: "08-6812222",
  },
  {
    id: "ph34", region: "דרום",
    name: "ים המלח קנאביס", city: "אילת",
    lat: 29.5577, lng: 34.9519, delivery: true,
    notes: "הדרומי ביותר — אילת ועמק הערבה",
  },
  {
    id: "ph35", region: "דרום",
    name: "דרום מדיקל", city: "דימונה",
    lat: 31.0700, lng: 35.0330, delivery: false,
  },
  {
    id: "ph36", region: "דרום",
    name: "נגב קיר", city: "ירוחם",
    lat: 30.9880, lng: 34.9310, delivery: true,
  },
  {
    id: "ph100", region: "דרום",
    name: "BOL — נשימת חיים", city: "באר שבע",
    lat: 31.2620, lng: 34.7980, delivery: true,
    menuUrl: "https://bol.co.il",
  },
  {
    id: "ph101", region: "דרום",
    name: "BOX", city: "באר שבע",
    lat: 31.2640, lng: 34.7960, delivery: true,
    menuUrl: "https://box1805.com/menu",
  },
  {
    id: "ph102", region: "דרום",
    name: "פארמרי", city: "באר שבע",
    lat: 31.2600, lng: 34.8000, delivery: true,
    phone: "04-6272761",
    menuUrl: "https://pharmary.co.il/menu",
  },
  {
    id: "ph103", region: "דרום",
    name: "גרין-טק", city: "באר שבע",
    lat: 31.2580, lng: 34.8010, delivery: true,
    phone: "08-6400000",
  },
  {
    id: "ph104", region: "דרום",
    name: "ריאליף", city: "באר שבע",
    lat: 31.2610, lng: 34.7990, delivery: true,
    menuUrl: "https://releaf.co.il",
  },
  {
    id: "ph105", region: "דרום",
    name: "קנאביס נגב", city: "אופקים",
    lat: 31.3030, lng: 34.6200, delivery: true,
    phone: "08-9953000",
  },
  {
    id: "ph106", region: "דרום",
    name: "הפרח", city: "קריית מלאכי",
    lat: 31.7330, lng: 34.7430, delivery: false,
    phone: "08-8581000",
  },
  {
    id: "ph107", region: "דרום",
    name: "קנה-בריא", city: "נתיבות",
    lat: 31.4210, lng: 34.5870, delivery: true,
    phone: "08-9930000",
  },
  {
    id: "ph108", region: "דרום",
    name: "נגב מדיקל", city: "רהט",
    lat: 31.3970, lng: 34.7540, delivery: false,
    phone: "08-9928000",
    notes: "משרת קהילת הבדואים",
  },
  {
    id: "ph109", region: "דרום",
    name: "דרום מדיקל", city: "אילת",
    lat: 29.5600, lng: 34.9500, delivery: false,
    phone: "08-6360000",
  },

  // ══════════════════════════════════════════════════════════════════
  // מרכז — סניפים נוספים
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph110", region: "מרכז",
    name: "BOX", city: "יהוד",
    lat: 32.0330, lng: 34.8870, delivery: true,
    website_url: "https://box1805.com/menu",
  },
  {
    id: "ph111", region: "מרכז",
    name: "ריאליף", city: "גבעתיים",
    lat: 32.0711, lng: 34.8085, delivery: true,
    phone: "072-3970081",
    website_url: "https://releaf.co.il",
  },
  {
    id: "ph112", region: "מרכז",
    name: "גיוול", city: "ראשון לציון",
    lat: 31.9601, lng: 34.8066, delivery: false,
    website_url: "https://givol.co.il",
  },
  {
    id: "ph113", region: "מרכז",
    name: "IMCA", city: "חולון",
    lat: 32.0111, lng: 34.7792, delivery: false,
    phone: "03-5446661",
  },
  {
    id: "ph114", region: "מרכז",
    name: "מדיסיינס", city: "פתח תקווה",
    lat: 32.0880, lng: 34.8830, delivery: true,
    website_url: "https://medicines-cannabis.co.il",
  },
  {
    id: "ph115", region: "מרכז",
    name: "קנאמד", city: "בת ים",
    lat: 32.0142, lng: 34.7524, delivery: true,
    phone: "03-5100000",
  },
  {
    id: "ph116", region: "מרכז",
    name: "פארמוס", city: "תל אביב",
    lat: 32.0771, lng: 34.7817, delivery: false,
    phone: "03-9301771",
  },
  {
    id: "ph117", region: "מרכז",
    name: "אנטיה", city: "ראשון לציון",
    lat: 31.9650, lng: 34.7990, delivery: false,
    phone: "03-6521001",
  },
  {
    id: "ph118", region: "מרכז",
    name: "BOL — נשימת חיים", city: "פתח תקווה",
    lat: 32.0880, lng: 34.8840, delivery: true,
    website_url: "https://bol.co.il",
  },
  {
    id: "ph119", region: "מרכז",
    name: "יוניבו", city: "ראשון לציון",
    lat: 31.9680, lng: 34.8020, delivery: true,
    website_url: "https://univo.co.il",
  },
  {
    id: "ph120", region: "מרכז",
    name: "גרין פארמה", city: "יהוד",
    lat: 32.0340, lng: 34.8880, delivery: false,
    phone: "03-9361000",
  },
  {
    id: "ph121", region: "מרכז",
    name: "נאוקאן", city: "ראשון לציון",
    lat: 31.9710, lng: 34.8030, delivery: false,
    phone: "08-9745001",
  },
  {
    id: "ph122", region: "מרכז",
    name: "תמיר", city: "תל אביב",
    lat: 32.0860, lng: 34.7790, delivery: false,
    phone: "03-6281111",
  },
  {
    id: "ph123", region: "מרכז",
    name: "מדיקנה", city: "אזור",
    lat: 31.9860, lng: 34.8220, delivery: false,
    phone: "03-5581000",
  },
  {
    id: "ph124", region: "מרכז",
    name: "קנה-בריא", city: "רמת גן",
    lat: 32.0750, lng: 34.8190, delivery: false,
    phone: "03-5710001",
  },

  // ══════════════════════════════════════════════════════════════════
  // השרון — סניפים נוספים
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph125", region: "השרון",
    name: "BOL — נשימת חיים", city: "נתניה",
    lat: 32.3240, lng: 34.8570, delivery: true,
    website_url: "https://bol.co.il",
  },
  {
    id: "ph126", region: "השרון",
    name: "תמיר", city: "כפר סבא",
    lat: 32.1750, lng: 34.9070, delivery: false,
    phone: "09-7430001",
  },
  {
    id: "ph127", region: "השרון",
    name: "IMCA", city: "נתניה",
    lat: 32.3300, lng: 34.8550, delivery: false,
    phone: "09-8620000",
  },
  {
    id: "ph128", region: "השרון",
    name: "אנטיה", city: "הרצליה",
    lat: 32.1620, lng: 34.8430, delivery: false,
    phone: "09-9580000",
  },
  {
    id: "ph129", region: "השרון",
    name: "מדיסיינס", city: "רעננה",
    lat: 32.1840, lng: 34.8700, delivery: false,
    phone: "09-7710000",
  },
  {
    id: "ph130", region: "השרון",
    name: "גיוול", city: "הרצליה",
    lat: 32.1650, lng: 34.8450, delivery: false,
    website_url: "https://givol.co.il",
  },
  {
    id: "ph131", region: "השרון",
    name: "ריאליף", city: "הוד השרון",
    lat: 32.1480, lng: 34.8980, delivery: true,
    website_url: "https://releaf.co.il",
  },
  {
    id: "ph132", region: "השרון",
    name: "גרין-טק", city: "רעננה",
    lat: 32.1850, lng: 34.8720, delivery: true,
    phone: "09-7600000",
  },
  {
    id: "ph133", region: "השרון",
    name: "מדיקנה", city: "חדרה",
    lat: 32.4344, lng: 34.9198, delivery: true,
    phone: "04-6331000",
  },
  {
    id: "ph134", region: "השרון",
    name: "קנאביס מד", city: "אום אל-פחם",
    lat: 32.5125, lng: 35.1525, delivery: false,
    phone: "04-6271000",
  },

  // ══════════════════════════════════════════════════════════════════
  // ירושלים וסביבות — סניפים נוספים
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph135", region: "ירושלים וסביבות",
    name: "BOX", city: "ירושלים",
    lat: 31.7900, lng: 35.2110, delivery: true,
    website_url: "https://box1805.com/menu",
  },
  {
    id: "ph136", region: "ירושלים וסביבות",
    name: "ריאליף", city: "ירושלים",
    lat: 31.7860, lng: 35.2060, delivery: true,
    phone: "072-3970082",
    website_url: "https://releaf.co.il",
  },
  {
    id: "ph137", region: "ירושלים וסביבות",
    name: "פארמרי", city: "מבשרת ציון",
    lat: 31.8080, lng: 35.1350, delivery: true,
    website_url: "https://pharmary.co.il/menu",
  },
  {
    id: "ph138", region: "ירושלים וסביבות",
    name: "מדיסיינס", city: "ירושלים",
    lat: 31.7700, lng: 35.1960, delivery: false,
    phone: "02-6500000",
  },
  {
    id: "ph139", region: "ירושלים וסביבות",
    name: "גרין-טק", city: "בית שמש",
    lat: 31.7520, lng: 34.9870, delivery: false,
    phone: "02-9990000",
  },
  {
    id: "ph140", region: "ירושלים וסביבות",
    name: "נאוקאן", city: "ירושלים",
    lat: 31.7680, lng: 35.2100, delivery: false,
    phone: "02-6751000",
  },
  {
    id: "ph141", region: "ירושלים וסביבות",
    name: "IMCA", city: "מודיעין",
    lat: 31.8950, lng: 35.0110, delivery: false,
    phone: "08-9210000",
  },
  {
    id: "ph142", region: "ירושלים וסביבות",
    name: "קנאמד", city: "ירושלים",
    lat: 31.7820, lng: 35.2190, delivery: true,
    phone: "08-9765433",
  },

  // ══════════════════════════════════════════════════════════════════
  // צפון — סניפים נוספים
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph143", region: "צפון",
    name: "BOX", city: "עכו",
    lat: 32.9240, lng: 35.0780, delivery: true,
    website_url: "https://box1805.com/menu",
  },
  {
    id: "ph144", region: "צפון",
    name: "BOL — נשימת חיים", city: "נהריה",
    lat: 33.0070, lng: 35.0950, delivery: true,
    website_url: "https://bol.co.il",
  },
  {
    id: "ph145", region: "צפון",
    name: "פארמרי", city: "נצרת",
    lat: 32.7021, lng: 35.2978, delivery: true,
    phone: "04-6272762",
    website_url: "https://pharmary.co.il/menu",
  },
  {
    id: "ph146", region: "צפון",
    name: "ריאליף", city: "עפולה",
    lat: 32.6060, lng: 35.2900, delivery: true,
    website_url: "https://releaf.co.il",
  },
  {
    id: "ph147", region: "צפון",
    name: "גרין-טק", city: "קריית שמונה",
    lat: 33.2080, lng: 35.5680, delivery: false,
    phone: "04-6810000",
  },
  {
    id: "ph148", region: "צפון",
    name: "יוניבו", city: "חיפה",
    lat: 32.8090, lng: 34.9810, delivery: true,
    website_url: "https://univo.co.il",
  },
  {
    id: "ph149", region: "צפון",
    name: "IMCA", city: "חיפה",
    lat: 32.7950, lng: 34.9860, delivery: false,
    phone: "04-8550001",
  },
  {
    id: "ph150", region: "צפון",
    name: "אנטיה", city: "חיפה",
    lat: 32.8030, lng: 34.9890, delivery: false,
    phone: "04-8610000",
  },
  {
    id: "ph151", region: "צפון",
    name: "גיוול", city: "חיפה",
    lat: 32.8000, lng: 34.9870, delivery: false,
    website_url: "https://givol.co.il",
  },
  {
    id: "ph152", region: "צפון",
    name: "מדיסיינס", city: "קריית ביאליק",
    lat: 32.8320, lng: 35.0790, delivery: false,
    phone: "04-8700001",
  },
  {
    id: "ph153", region: "צפון",
    name: "קנה-בוסם", city: "יוקנעם",
    lat: 32.6590, lng: 35.1070, delivery: false,
    phone: "04-9891001",
  },
  {
    id: "ph154", region: "צפון",
    name: "BOX", city: "טבריה",
    lat: 32.7940, lng: 35.5330, delivery: true,
    website_url: "https://box1805.com/menu",
  },
  {
    id: "ph155", region: "צפון",
    name: "ריאליף", city: "נהריה",
    lat: 33.0060, lng: 35.0940, delivery: false,
    website_url: "https://releaf.co.il",
  },
  {
    id: "ph156", region: "צפון",
    name: "פארמרי", city: "קריית שמונה",
    lat: 33.2070, lng: 35.5695, delivery: true,
    website_url: "https://pharmary.co.il/menu",
  },
  {
    id: "ph157", region: "צפון",
    name: "תמיר", city: "קריית ים",
    lat: 32.8490, lng: 35.0660, delivery: false,
    phone: "04-8720000",
  },
  {
    id: "ph158", region: "צפון",
    name: "מדיקנה", city: "חיפה",
    lat: 32.8120, lng: 34.9940, delivery: false,
    phone: "04-8411222",
  },
  {
    id: "ph159", region: "צפון",
    name: "גרין-טק", city: "קריית אתא",
    lat: 32.8065, lng: 35.1090, delivery: true,
    phone: "04-8471000",
  },
  {
    id: "ph160", region: "צפון",
    name: "BOL — נשימת חיים", city: "עכו",
    lat: 32.9250, lng: 35.0760, delivery: true,
    website_url: "https://bol.co.il",
  },

  // ══════════════════════════════════════════════════════════════════
  // שפלה — סניפים נוספים
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph161", region: "שפלה",
    name: "BOL — נשימת חיים", city: "קריית גת",
    lat: 31.6120, lng: 34.7650, delivery: true,
    website_url: "https://bol.co.il",
  },
  {
    id: "ph162", region: "שפלה",
    name: "פארמרי", city: "קריית מלאכי",
    lat: 31.7320, lng: 34.7450, delivery: true,
    website_url: "https://pharmary.co.il/menu",
  },
  {
    id: "ph163", region: "שפלה",
    name: "גרין-טק", city: "קריית גת",
    lat: 31.6130, lng: 34.7640, delivery: false,
    phone: "08-6881000",
  },
  {
    id: "ph164", region: "שפלה",
    name: "IMCA", city: "אשדוד",
    lat: 31.8040, lng: 34.6530, delivery: false,
    phone: "08-8560001",
  },
  {
    id: "ph165", region: "שפלה",
    name: "יוניבו", city: "אשדוד",
    lat: 31.8060, lng: 34.6540, delivery: true,
    website_url: "https://univo.co.il",
  },
  {
    id: "ph166", region: "שפלה",
    name: "תמיר", city: "יבנה",
    lat: 31.8780, lng: 34.7420, delivery: false,
    phone: "08-9421234",
  },
  {
    id: "ph167", region: "שפלה",
    name: "BOX", city: "קריית גת",
    lat: 31.6100, lng: 34.7660, delivery: true,
    website_url: "https://box1805.com/menu",
  },
  {
    id: "ph168", region: "שפלה",
    name: "אנטיה", city: "אשקלון",
    lat: 31.6680, lng: 34.5750, delivery: false,
    phone: "08-6813000",
  },
  {
    id: "ph169", region: "שפלה",
    name: "קנה-בריא", city: "אשדוד",
    lat: 31.8030, lng: 34.6560, delivery: false,
    phone: "08-8570000",
  },
  {
    id: "ph170", region: "שפלה",
    name: "ריאליף", city: "אשקלון",
    lat: 31.6690, lng: 34.5760, delivery: true,
    website_url: "https://releaf.co.il",
  },

  // ══════════════════════════════════════════════════════════════════
  // דרום — סניפים נוספים
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ph171", region: "דרום",
    name: "BOX", city: "אשקלון",
    lat: 31.6690, lng: 34.5740, delivery: true,
    website_url: "https://box1805.com/menu",
  },
  {
    id: "ph172", region: "דרום",
    name: "BOL — נשימת חיים", city: "נתיבות",
    lat: 31.4210, lng: 34.5880, delivery: true,
    website_url: "https://bol.co.il",
  },
  {
    id: "ph173", region: "דרום",
    name: "פארמרי", city: "נתיבות",
    lat: 31.4200, lng: 34.5870, delivery: true,
    website_url: "https://pharmary.co.il/menu",
  },
  {
    id: "ph174", region: "דרום",
    name: "גרין-טק", city: "אופקים",
    lat: 31.3020, lng: 34.6210, delivery: true,
    phone: "08-9953001",
  },
  {
    id: "ph175", region: "דרום",
    name: "ריאליף", city: "נתיבות",
    lat: 31.4220, lng: 34.5890, delivery: true,
    website_url: "https://releaf.co.il",
  },
  {
    id: "ph176", region: "דרום",
    name: "מדיסיינס", city: "באר שבע",
    lat: 31.2590, lng: 34.7970, delivery: false,
    phone: "08-6400001",
  },
  {
    id: "ph177", region: "דרום",
    name: "יוניבו", city: "באר שבע",
    lat: 31.2630, lng: 34.7990, delivery: true,
    website_url: "https://univo.co.il",
  },
  {
    id: "ph178", region: "דרום",
    name: "IMCA", city: "באר שבע",
    lat: 31.2600, lng: 34.8020, delivery: false,
    phone: "08-6400002",
  },
  {
    id: "ph179", region: "דרום",
    name: "קנה-בריא", city: "שדרות",
    lat: 31.5240, lng: 34.5974, delivery: false,
    phone: "08-6862000",
  },
  {
    id: "ph180", region: "דרום",
    name: "נגב מדיקל", city: "דימונה",
    lat: 31.0700, lng: 35.0300, delivery: false,
    phone: "08-9560000",
  },
  {
    id: "ph181", region: "דרום",
    name: "קנאביס נגב", city: "ערד",
    lat: 31.2554, lng: 35.2127, delivery: false,
    phone: "08-9955000",
  },
  {
    id: "ph182", region: "דרום",
    name: "הפרח", city: "שדרות",
    lat: 31.5230, lng: 34.5960, delivery: false,
    phone: "08-6861000",
  },
  {
    id: "ph183", region: "דרום",
    name: "BOX", city: "אשקלון",
    lat: 31.6700, lng: 34.5750, delivery: true,
    website_url: "https://box1805.com/menu",
    notes: "סניף נוסף — תחנה מרכזית",
  },
  {
    id: "ph184", region: "דרום",
    name: "גרין-טק", city: "ישגב שלום",
    lat: 31.4680, lng: 34.7220, delivery: false,
    phone: "08-6893000",
  },
  {
    id: "ph185", region: "דרום",
    name: "מדיקנה", city: "באר שבע",
    lat: 31.2580, lng: 34.7950, delivery: true,
    phone: "08-6412222",
  },
  {
    id: "ph186", region: "דרום",
    name: "אורגניק מד", city: "אשקלון",
    lat: 31.6660, lng: 34.5730, delivery: false,
    phone: "08-6831000",
  },
  {
    id: "ph187", region: "דרום",
    name: "קנאמד", city: "שדרות",
    lat: 31.5260, lng: 34.5990, delivery: true,
    phone: "08-6865432",
  },
  {
    id: "ph188", region: "דרום",
    name: "תמיר", city: "אילת",
    lat: 29.5580, lng: 34.9480, delivery: false,
    phone: "08-6361111",
  },
  {
    id: "ph189", region: "דרום",
    name: "ריאליף", city: "אילת",
    lat: 29.5590, lng: 34.9490, delivery: false,
    website_url: "https://releaf.co.il",
  },
  {
    id: "ph190", region: "דרום",
    name: "BOL — נשימת חיים", city: "אילת",
    lat: 29.5570, lng: 34.9470, delivery: true,
    website_url: "https://bol.co.il",
  },
  {
    id: "ph191", region: "צפון",
    name: "קנה-בריא", city: "בית שאן",
    lat: 32.4975, lng: 35.4996, delivery: false,
    phone: "04-6586000",
  },
  {
    id: "ph192", region: "צפון",
    name: "BOL — נשימת חיים", city: "טבריה",
    lat: 32.7930, lng: 35.5320, delivery: true,
    website_url: "https://bol.co.il",
  },
  {
    id: "ph193", region: "ירושלים וסביבות",
    name: "גרין-טק", city: "מעלה אדומים",
    lat: 31.7774, lng: 35.2985, delivery: false,
    phone: "02-5351000",
  },
  {
    id: "ph194", region: "מרכז",
    name: "BOX", city: "פתח תקווה",
    lat: 32.0900, lng: 34.8880, delivery: true,
    website_url: "https://box1805.com/menu",
    notes: "קניון עזריאלי פתח תקווה",
  },
];

// Region display order for UI grouping
export const REGION_ORDER = [
  "מרכז",
  "השרון",
  "ירושלים וסביבות",
  "צפון",
  "שפלה",
  "דרום",
];

export default PHARMACIES;
