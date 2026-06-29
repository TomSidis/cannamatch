// ─────────────────────────────────────────────────────────────────────────────
//  copy.he.js — The single source of truth for all Hebrew microcopy.
//
//  TONE BIBLE (enforced here):
//    ✅ "יאללה, מה הכי הרגיז אותך בזן האחרון?"
//    ✅ "ינוח לך בלילה, נקי ממה שמערפל"
//    ✅ "קיבלתי 🙏 עדכנתי לך את המפה"
//    ❌ "במסגרת" / "חשוב לציין" / "מומלץ להתייעץ"
//    ❌ כל שם כימי (myrcene, limonene) — אסור בממשק
//    ❌ Medical jargon, banking tone, stoner cliché
// ─────────────────────────────────────────────────────────────────────────────

export const C = {

  // ── App-level ─────────────────────────────────────────────────────────────
  appName:  'CannaMatch',
  tagline:  'הזן הנכון, בזמן הנכון, עבורך',
  disclaimer: 'זה כלי לניווט אישי, לא ייעוץ רפואי. פרטי העדפות שלך — נשמרים אנונימית ומוצפנים.',

  // ── Onboarding ────────────────────────────────────────────────────────────
  onboarding: {
    // Step 0 — License
    licenseTitle:       'בוא נוודא שאתה מורשה 🪪',
    licenseSub:         'רישיון תקף נדרש לגישה לפווידר ולדיווחים. הנתונים שמרנו: תאריך תפוגה בלבד — שאר הפרטים נמחקים.',
    licenseUpload:      'העלאת רישיון / צילום',
    licenseSkip:        'אמשיך בלי פווידר — רק מוצרים',
    licenseScanning:    'בודק... 🔍',
    licenseOk:          'רישיון תקף ✅',
    licenseExpired:     'נראה שהרישיון פג תוקף. ניתן להמשיך בכל זאת — אבל הפווידר יהיה נעול.',
    licenseError:       'לא הצלחתי לקרוא. אפשר לצלם שוב, או לדלג.',

    // Step 1 — Form
    formTitle:          'איך אתה/את משתמש/ת? 🌿',
    formSub:            'זה עוזר לנו לסנן מה רלוונטי עבורך',
    formFlower:         'תפרחת',
    formOil:            'שמן',
    formVape:           'אידוי / ואפורייזר',
    formMixed:          'משולב',

    // Step 2A — Tried before → YES branch
    triedTitle:         'יאללה — מה ניסית עד כה? 👇',
    triedSub:           'תייג מה שלקחת. לא חייב לדעת מה שמו — מה שאתה מזהה, יעזור לנו להבין אותך.',
    triedHelped:        'עזר ✅',
    triedMeh:           'ככה ככה',
    triedNope:          'לא עבד ❌',
    triedSearchPlaceholder: 'לא מצאת? חפש מתוך 380 מוצרים...',
    triedWhyFoggy:      'ערפל אותי',
    triedWhySedated:    'הרדים יופי',
    triedWhyDidNothing: 'לא עשה כלום',
    triedWhyAnxious:    'הלחיץ אותי',
    triedWhyLiftedMood: 'שיפר מצב רוח',
    triedWhyPainRelief: 'הקל על הכאב',

    // Step 2B — No tried → Goal branch
    goalsTitle:         'מה אתה/את מחפש/ת? 🎯',
    goalsSub:           'בחר/י עד 3 יעדים עיקריים. ניתן לשנות אחר כך.',

    // Step 3 — Time of day
    timeTitle:          'מתי אתה/את הכי צריך/ה אותו? ⏰',
    timeSub:            'בחר/י כמה שצריך',
    timeMorning:        'בוקר',
    timeMidDay:         'צהריים',
    timeAfternoon:      'אחה"צ',
    timeEvening:        'ערב',
    timeNight:          'לילה',

    // Step 4 — Context
    contextTitle:       'איפה אתה/את בדרך כלל משתמש/ת? 🏡',
    contextSub:         'זה עוזר לנו להתאים את עוצמת ההשפעה',
    contextHome:        'ברוגע בבית',
    contextSocial:      'באירועים חברתיים',
    contextWork:        'בתפקוד יומיומי / עבודה',
    contextSleep:       'בלילה לשינה בלבד',

    // Step 5 — Flavor (optional, flower only)
    flavorTitle:        'יש טעמים שאתה/את אוהב/ת? 🍋',
    flavorSub:          'לא חובה — אבל זה עוזר לנו לסנן יותר טוב',
    flavorSkip:         'לא משנה לי — דלג',
    flavorCitrus:       'לימוני 🍋',
    flavorSweet:        'מתוק 🍬',
    flavorEarthy:       'אדמתי 🌲',
    flavorSpicy:        'חריף-פלפלי 🌶️',
    flavorFloral:       'פרחוני 🌸',
    flavorGas:          'חריף-פאנקי',

    // Step 6 — DNA reveal
    dnaTitle:           'זה אתה 🧬',
    dnaSub:             'בנינו לך פרופיל אישי — ייחודי לך',
    dnaCallout:         'כל המלצה שנותן לך עוברת דרך הפרופיל הזה.',
    dnaScience:         'רוצה את המדע? 🔬',
    dnaCtaStart:        'יאללה — תראה לי מה מתאים לי',
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: {
    greeting:           'שלום 👋',
    greetingDefault:    'שלום! אני צמח 👋',
    greetingSub:        'חפש זן, סרוק תפריט, או שאל אותי כל שאלה',
    yourPicks:          '✨ מומלץ עבורך',
    byProfile:          'לפי הפרופיל שלך',
    nextExperiment:     '🧪 הניסוי הבא שכדאי לנסות',
    nextExperimentSub:  'בהתבסס על מה שעבד לך',
    noResults:          'אין לנו עדיין מידע מספיק — ספר לנו יותר ונשפר',
  },

  // ── Report flow ───────────────────────────────────────────────────────────
  report: {
    howWasIt:           'איך זה הלך? 👇',
    whatDidYouNotice:   'שמת לב למשהו?',
    submitCta:          'קיבלתי 🙏 — עדכן את המפה שלי',
    skip:               'דלג',
    mapUpdated:         'עדכנתי את המפה שלך',
    mapUpdatedSub:      'קיבלתי — הדיווח שלך שיפר את ההתאמות',
    filteredOut:        'זנים סוננו',
    raisedUp:           'זנים עלו',
    mapAccurate:        '✓ המפה מדויקת יותר עכשיו',
    anonymous:          '💜 הדיווח שלך אנונימי לחלוטין — ועוזר למטופלים אחרים עם פרופיל דומה לשלך',
    altruistic:         (n) => `הדיווח שלך עזר ל-${n} אנשים השבוע`,
    reportingAbout:     'מדווח על',
    close:              'סגור',

    // Side-effect chips
    foggy:              'מעורפל',
    anxious:            'הלחיץ אותי',
    sleepy:             'הרדים',
    hungry:             'רעב',
    focused:            'ממוקד',
    calm:               'רגוע',
    nothing:            'כלום מיוחד',

    // Rating labels
    ratingBad:          'לא עזר',
    ratingMeh:          'בינוני',
    ratingGood:         'עזר',
    ratingGreat:        'מצוין!',
  },

  // ── Community ─────────────────────────────────────────────────────────────
  community: {
    title:              'פווידר',
    tabLike:            'אנשים כמוני',
    tabAll:             'כל הפווידר',
    likeEmpty:          'עוד אין מספיק דיווחים עם פרופיל דומה לשלך.\nהיה הראשון לדווח — תעזור לאחרים.',
    allEmpty:           'הפווידר רק מתחיל 🌱\nהיה הראשון לשתף — כולנו נרוויח.',
    lockedTitle:        'הפווידר מחכה לך 👥',
    lockedSub:          'כדי לגשת לפווידר יש צורך ברישיון תקף.\nהפרטים שלך — אנונימיים לחלוטין.',
    lockedCta:          'אמת רישיון',
    socialProof:        (n) => `${n} אנשים עם פרופיל דומה לשלך דירגו את זה גבוה`,
    reportedThisWeek:   (n) => `${n} דיווחים השבוע`,
    liveLabel:          '🟢 פיד חי',

    // Anonymity
    anonymousNote:      'לגמרי אנונימי — אפשר לדווח בחופשיות',
  },

  // ── Menu Decoder ─────────────────────────────────────────────────────────
  menu: {
    title:              'מפענח תפריט 📸',
    sub:                'צלם תפריט ואני אגיד לך מה לקחת',
    uploadCta:          'צלם / העלה תפריט',
    scanning:           'אני קורא את התפריט... 🔍',
    ranked:             'זה הסדר שלי עבורך:',
    unknown:            'את זה אני עוד לא מכיר. תנסה ותדווח — תעזור למישהו כמוך.',
    noMatch:            'לא הצלחתי להתאים מוצר זה — אולי שם חדש? דווח לנו.',
    empty:              'לא מצאתי מוצרים. נסה תמונה ברורה יותר.',
  },

  // ── DNA Profile ───────────────────────────────────────────────────────────
  dna: {
    title:              'הפרופיל שלך 🧬',
    sub:                'הזהות שלך בקנאמאצ׳',
    noProfile:          'עדיין לא בנינו לך פרופיל — עבור על השאלון',
    strands:            'החוטים שמרכיבים אותך',
    scienceReveal:      'רוצה את המדע? 🔬',
  },

  // ── Notifications / nudges ────────────────────────────────────────────────
  nudge: {
    sleepStrain:        'איך ישנת? 30 שניות לדווח — מדייק את ההמלצות שלך 🌙',
    anyStrain:          'ניסית משהו לאחרונה? דווח — תקבל מפה מדויקת יותר 🌿',
    restockAlert:       (strain, pharmacy) => `הזן שעבד לך — ${strain} — חזר למלאי ב${pharmacy} 👀`,
  },

  // ── Kill-switch callout ────────────────────────────────────────────────────
  killSwitch: {
    filtered:           (n, terp) => `🛡️ סיננתי ${n} זנים עם ${terp} גבוה — זוהה כטריגר בפרופיל שלך`,
    filteredSimple:     (n) => `🛡️ הסרתי ${n} זנים שלא מתאימים לפרופיל שלך`,
  },

  // ── Errors & loading ──────────────────────────────────────────────────────
  loading:  'רגע... 🌿',
  error:    'משהו לא עבד. נסה שוב.',
  offline:  'אין חיבור לרשת — עובד במצב מקומי',

  // ── Batch signals ─────────────────────────────────────────────────────────
  batch: {
    flagSignal: (axisHuman) => `מטופלים דיווחו על ${axisHuman} באצווה זו — כדאי לשים לב 🔍`,
    sameStrain: 'אותו זן, אצווה שונה',
  },

  // ── Legal / privacy ───────────────────────────────────────────────────────
  legal: {
    matchIsNotPrescription: 'ההתאמה היא המלצה לניווט, לא מרשם. פרטייך — אנונימיים ומוצפנים.',
    neverMedical:           'זה לא ייעוץ רפואי — התייעצו עם הרופא המטפל לגבי שינויים בטיפול.',
  },
};
