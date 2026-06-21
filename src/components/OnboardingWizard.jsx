// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — "Dynamic DNA Laboratory" Onboarding Wizard
//  5-Stage cinematic experience. Framer Motion + Cyberpunk/Sci-Fi theme.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOnboardingStore, STAGE_NAMES } from "../hooks/useOnboardingStore.js";
// CLINICAL_MAP import removed — onboarding no longer collects medical history
import { api } from "../services/api.js";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:      "#0B1810",
  card:    "rgba(15,30,19,0.92)",
  border:  "rgba(57,255,133,0.18)",
  accent:  "#39FF85",
  purple:  "#C855FF",
  orange:  "#FFA040",
  text:    "#EBF6ED",
  muted:   "#7EA88E",
  danger:  "#FF4560",
  glow:    (col, r = 18) => `0 0 ${r}px ${col}55, 0 0 ${r * 2}px ${col}22`,
};

// ── Motion variants ───────────────────────────────────────────────────────────
const PAGE_VARIANTS = {
  enter: (dir) => ({ opacity: 0, x: dir > 0 ? 80 : -80, scale: 0.97 }),
  center: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } },
  exit:  (dir) => ({ opacity: 0, x: dir > 0 ? -80 : 80, scale: 0.97, transition: { duration: 0.28 } }),
};

const FADE_UP = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0 },
};

const STAGGER = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
};

// ── Reusable primitives ───────────────────────────────────────────────────────
function NeonButton({ children, onClick, disabled, variant = "primary", size = "md", glow = true, className = "" }) {
  const styles = {
    primary: {
      background:  T.accent,
      color:       "#061006",
      border:      `1.5px solid ${T.accent}`,
      boxShadow:   glow ? T.glow(T.accent, 14) : "none",
    },
    ghost: {
      background:  "rgba(57,255,133,0.06)",
      color:       T.text,
      border:      `1.5px solid ${T.border}`,
    },
    danger: {
      background:  "rgba(255,69,96,0.12)",
      color:       T.danger,
      border:      `1.5px solid rgba(255,69,96,0.35)`,
    },
  };
  const sizes = {
    sm: { padding: "6px 14px", fontSize: 12, borderRadius: 10 },
    md: { padding: "11px 24px", fontSize: 14, borderRadius: 14 },
    lg: { padding: "15px 32px", fontSize: 16, borderRadius: 18, fontWeight: 700 },
  };
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.04, boxShadow: glow ? T.glow(T.accent, 22) : "none" }}
      whileTap={disabled   ? {} : { scale: 0.96 }}
      style={{
        ...styles[variant],
        ...sizes[size],
        fontWeight: 600,
        cursor:   disabled ? "not-allowed" : "pointer",
        opacity:  disabled ? 0.35 : 1,
        transition: "box-shadow 0.2s",
        outline: "none",
      }}
      className={className}
    >
      {children}
    </motion.button>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ color: T.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </p>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      style={{ color: T.danger, fontSize: 11, marginTop: 5 }}>
      ⚠ {msg}
    </motion.p>
  );
}

// ── Zemach inline bubble ──────────────────────────────────────────────────────
function ZemachBubble({ message, stage }) {
  const stageColor = [T.accent, T.purple, "#FFA040", "#00E5FF", T.accent][stage] || T.accent;
  return (
    <motion.div
      key={message}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35 }}
      style={{
        display:       "flex",
        alignItems:    "flex-start",
        gap:           12,
        padding:       "14px 16px",
        borderRadius:  18,
        background:    "rgba(0,0,0,0.45)",
        border:        `1.5px solid ${stageColor}30`,
        boxShadow:     `0 0 20px ${stageColor}10`,
        marginBottom:  18,
      }}
    >
      <motion.div
        animate={{ rotate: [0, -4, 4, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ fontSize: 32, flexShrink: 0, filter: `drop-shadow(0 0 8px ${stageColor}88)` }}
      >
        🌿
      </motion.div>
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, color: stageColor, marginBottom: 3,
                    letterSpacing: "0.08em" }}>
          צמח אומר
        </p>
        <p style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>{message}</p>
      </div>
    </motion.div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ stage, total }) {
  const labels = ["מטרות", "ארומות", "שגרה", "היסטוריה", "פרופיל"];
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {Array.from({ length: total }, (_, i) => (
          <motion.div key={i}
            style={{ flex: 1, height: 3, borderRadius: 4,
                     background: i < stage ? T.accent : i === stage ? T.accent : "rgba(57,255,133,0.15)" }}
            animate={{ opacity: i <= stage ? 1 : 0.4 }}
            layoutId={`progress-${i}`}
          >
            {i === stage && (
              <motion.div
                style={{ height: "100%", background: T.accent, borderRadius: 4,
                         boxShadow: T.glow(T.accent, 4) }}
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 0.6 }}
              />
            )}
          </motion.div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {labels.map((l, i) => (
          <span key={i} style={{ fontSize: 10, color: i <= stage ? T.accent : T.muted,
                                  fontWeight: i === stage ? 700 : 400, transition: "color 0.3s" }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Stage 1: Cannabis Goals (replaces Clinical — zero medical history collected) ──
const EFFECT_GOALS = [
  { id: "sleep",    label: "שינה טובה",           icon: "🌙", color: "#C084FC" },
  { id: "pain",     label: "הקלה בכאב",           icon: "💪", color: "#F87171" },
  { id: "focus",    label: "ריכוז ופרודוקטיביות", icon: "🎯", color: "#38BDF8" },
  { id: "relax",    label: "הרפיה ורוגע",         icon: "🌊", color: "#4ADE80" },
  { id: "mood",     label: "שיפור מצב רוח",       icon: "☀️", color: "#FBBF24" },
  { id: "energy",   label: "אנרגיה וחיוניות",     icon: "⚡", color: "#FB923C" },
  { id: "appetite", label: "עידוד תיאבון",        icon: "🍽️", color: "#A3E635" },
  { id: "creative", label: "יצירתיות",             icon: "🎨", color: "#E879F9" },
];

const ZEMACH_GOALS = {
  default:   "ספר/י לי מה אתה/את מחפש/ת מהקנאביס — ככה אבנה לך את הפרופיל האישי לקנייה הבאה שלך 🌿",
  sleep:     "שינה — יש זנים שמטופלים מדווחים שהם עוזרים להירדם מהר יותר ולישון עמוק. נמצא לך כאלה 🌙",
  pain:      "הקלת כאב — הרבה מטופלים בישראל מדווחים שיפור. נבנה פרופיל שמתאים לצרכים שלך 💪",
  focus:     "ריכוז — יש זנים שמאפשרים תפקוד מלא בלי ראש מעורפל. מתאים לשעות היום 🎯",
  relax:     "רוגע — הרפיה בלי קהות. מטופלים רבים מחפשים בדיוק את זה לשעות הפנאי 🌊",
  mood:      "מצב רוח — יש זנים שמרימים ומשפרים את ההרגשה הכללית. נמצא את ההתאמה שלך ☀️",
  energy:    "אנרגיה — זנים שנחשבים למעוררים ומאפשרים תפקוד יום מלא. נבחר ביחד ⚡",
  appetite:  "תיאבון — קנאביס ידוע בעזרה בתיאבון. נמצא זנים עם דיווחי הצלחה טובים 🍽️",
  creative:  "יצירתיות — מטופלים מסוימים מוצאים זנים שפותחים להם ראש ומאפשרים זרימה 🎨",
};

function Stage1_Goals({ payload, errors, updatePayload }) {
  const selectedGoals = payload.effectGoals || [];

  const zemachMsg = useMemo(() => {
    const last = selectedGoals[selectedGoals.length - 1];
    return ZEMACH_GOALS[last] || ZEMACH_GOALS.default;
  }, [selectedGoals]);

  const toggleGoal = (id) => {
    const next = selectedGoals.includes(id)
      ? selectedGoals.filter((x) => x !== id)
      : [...selectedGoals, id];
    updatePayload({ effectGoals: next });
  };

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <AnimatePresence mode="wait">
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={0} />
        </AnimatePresence>
      </motion.div>

      {/* Effect Goals */}
      <motion.div variants={FADE_UP}>
        <SectionLabel>מה אתה/את מחפש/ת מהקנאביס שלך? (בחר/י הכל שמתאים)</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {EFFECT_GOALS.map((opt) => {
            const on = selectedGoals.includes(opt.id);
            return (
              <motion.button
                key={opt.id}
                onClick={() => toggleGoal(opt.id)}
                whileHover={{ scale: 1.03, boxShadow: `0 0 16px ${opt.color}44` }}
                whileTap={{ scale: 0.94 }}
                style={{
                  padding:      "10px 10px",
                  borderRadius: 14,
                  textAlign:    "right",
                  background:   on ? `${opt.color}16` : "rgba(255,255,255,0.04)",
                  border:       `1.5px solid ${on ? opt.color : T.border}`,
                  boxShadow:    on ? `0 0 12px ${opt.color}28` : "none",
                  cursor:       "pointer",
                  transition:   "all 0.18s",
                  minHeight:    54,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                  <span style={{ fontSize: 18, filter: on ? `drop-shadow(0 0 5px ${opt.color})` : "none", flexShrink: 0 }}>
                    {opt.icon}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: on ? 800 : 600, color: on ? opt.color : T.text, lineHeight: 1.2 }}>
                    {opt.label}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
        <FieldError msg={errors.effectGoals} />
      </motion.div>

      {/* Cannabis experience level */}
      <motion.div variants={FADE_UP} style={{ marginTop: 12 }}>
        <SectionLabel>כמה זמן אתה/את משתמש/ת בקנאביס רפואי?</SectionLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { id: "new",     label: "מתחיל/ה 🌱", sub: "עד 3 חודשים" },
            { id: "medium",  label: "מנוסה 🌿",   sub: "3 חודשים–שנה" },
            { id: "veteran", label: "ותיק/ה 🧬",  sub: "שנה +" },
          ].map((opt) => {
            const on = payload.thcTolerance === opt.id;
            return (
              <motion.button
                key={opt.id}
                onClick={() => updatePayload({ thcTolerance: opt.id })}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  flex: 1, padding: "14px 8px", borderRadius: 16, textAlign: "center",
                  background:  on ? `${T.accent}18` : "rgba(255,255,255,0.04)",
                  border:      `1.5px solid ${on ? T.accent : T.border}`,
                  boxShadow:   on ? T.glow(T.accent, 10) : "none",
                  cursor: "pointer",
                }}
              >
                <p style={{ fontSize: 15, fontWeight: 700, color: on ? T.accent : T.text, marginBottom: 4 }}>
                  {opt.label}
                </p>
                <p style={{ fontSize: 11, color: T.muted }}>{opt.sub}</p>
              </motion.button>
            );
          })}
        </div>
        <FieldError msg={errors.thcTolerance} />
      </motion.div>
    </motion.div>
  );
}

// ── Stage 2: Scent & Terpene Gamified Profiler ────────────────────────────────
const FLAVOR_TILES = [
  { id: "gas_fuel",        label: "גז / דלק",    icon: "⛽", color: "#FFA040",
    sub: "כבד ופאנקי",    terps: "קריופילן · מירצן" },
  { id: "citrus_sharp",    label: "הדרים / חד",  icon: "🍋", color: "#FFE040",
    sub: "מרענן וחד",     terps: "לימונן · פינן" },
  { id: "earthy_musky",   label: "אדמתי / מוסקי", icon: "🌍", color: "#8B6914",
    sub: "עמוק ואדמתי",  terps: "מירצן · הומולן" },
  { id: "sweet_berry",     label: "מתוק / פירות יער", icon: "🍓", color: "#FF6B8A",
    sub: "פירותי ומתוק", terps: "לינלול · לימונן" },
  { id: "pine_fresh",      label: "אורן / רענן",  icon: "🌲", color: "#39FF85",
    sub: "יערי וצלול",   terps: "פינן · טרפינולן" },
  { id: "floral_lavender", label: "פרחוני / לבנדר", icon: "💜", color: "#C855FF",
    sub: "עדין ורגוע",   terps: "לינלול · אוסימן" },
  { id: "spicy_pepper",    label: "תבלוני / פלפלי", icon: "🌶️", color: "#FF4560",
    sub: "נגד-דלקת",    terps: "קריופילן · הומולן" },
  { id: "tropical_mango",  label: "טרופי / מנגו",  icon: "🥭", color: "#40CFFF",
    sub: "אקזוטי ורענן", terps: "מירצן · אוסימן" },
];

const ZEMACH_SENSORY = {
  default:      "בחר/י את הריחות שאתה/את אוהב/ת — ולא אוהב/ת. זה עוזר לנו לדייק עבורך בסריקת התפריט 👃",
  gas_fuel:     "ריח כבד וחריף — הרבה מטופלים עם זנים כאלה מדווחים על הקלה בכאב. Diesel, Chemdawg ועוד 🤌",
  citrus_sharp: "הדרים וחד — ריח מרענן שמרבה מטופלים מקשרים לשיפור מצב רוח ואנרגיה 🍋",
  earthy_musky: "אדמתי ועמוק — ריח שמרבה מטופלים מקשרים להרפיה ולהקלת כאב 🌿",
  sweet_berry:  "מתוק ופירותי — ריח עדין שמרבה מטופלים אוהבים לפנאי ולרוגע 💜",
  pine_fresh:   "יערי ואורן — ריח צלול שמרבה מטופלים מקשרים לריכוז ועירנות 🌲",
  floral_lavender: "פרחוני ולבנדר — ריח מרגיע ועדין, נפוץ אצל מטופלים שמחפשים שינה ורוגע 💆",
  spicy_pepper: "תבלוני ופלפלי — ריח נועז שמרבה מטופלים מקשרים להקלה בדלקות ובכאב 🌶️",
  tropical_mango: "טרופי ומנגו — ריח מתוק ואקזוטי, מועדף על מטופלים שמחפשים הרפיה נעימה 🥭",
};

function Stage2_Sensory({ payload, errors, updatePayload }) {
  const scentSels = payload.scentSelections || {};

  const cycle = (id) => {
    const cur = scentSels[id];
    let next;
    if (!cur)           next = "liked";
    else if (cur === "liked")  next = "loved";
    else if (cur === "loved")  next = "disliked";
    else                next = undefined; // remove
    const updated = { ...scentSels };
    if (next) updated[id] = next;
    else delete updated[id];
    updatePayload({ scentSelections: updated });
  };

  const lastSelected = useMemo(() => {
    const keys = Object.keys(scentSels);
    return keys[keys.length - 1] || null;
  }, [scentSels]);

  const zemachMsg = lastSelected
    ? (ZEMACH_SENSORY[lastSelected] || ZEMACH_SENSORY.default)
    : ZEMACH_SENSORY.default;

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <AnimatePresence mode="wait">
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={1} />
        </AnimatePresence>
      </motion.div>

      <motion.div variants={FADE_UP}>
        <SectionLabel>הגלגל החושי — לחץ פעם אחת ❤️ פעמיים 💜 שלוש פעמים ✕</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {FLAVOR_TILES.map((tile, idx) => {
            const state  = scentSels[tile.id];
            const isOn   = !!state;
            const isLove = state === "loved";
            const isDis  = state === "disliked";
            const col    = isDis ? T.danger : tile.color;
            return (
              <motion.button
                key={tile.id}
                onClick={() => cycle(tile.id)}
                variants={FADE_UP}
                custom={idx}
                whileHover={{ scale: 1.03, boxShadow: `0 0 16px ${col}44` }}
                whileTap={{ scale: 0.93 }}
                style={{
                  padding:       "10px 10px",
                  borderRadius:  13,
                  textAlign:     "center",
                  background:    isOn ? `${col}14` : "rgba(255,255,255,0.03)",
                  border:        `1.5px solid ${isOn ? col : T.border}`,
                  boxShadow:     isOn ? `0 0 12px ${col}28` : "none",
                  cursor:        "pointer",
                  position:      "relative",
                  transition:    "all 0.18s",
                  minHeight:     62,
                }}
              >
                {isOn && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{
                      position: "absolute", top: 6, left: 6,
                      fontSize: 9, fontWeight: 800,
                      color:     col,
                      background: `${col}22`,
                      borderRadius: "50%",
                      width: 18, height: 18,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {isDis ? "✕" : isLove ? "💜" : "❤️"}
                  </motion.div>
                )}
                <span style={{ fontSize: 22, display: "block", marginBottom: 3,
                               filter: isOn ? `drop-shadow(0 0 6px ${col})` : "none" }}>
                  {tile.icon}
                </span>
                <p style={{ fontSize: 12, fontWeight: 700, color: isOn ? col : T.text, marginBottom: 1, lineHeight: 1.2 }}>
                  {tile.label}
                </p>
                <p style={{ fontSize: 9, color: T.muted, margin: 0 }}>{tile.sub}</p>
              </motion.button>
            );
          })}
        </div>
        <FieldError msg={errors.scents} />
      </motion.div>
    </motion.div>
  );
}

// ── Stage 3: Circadian & Biomechanical Context ────────────────────────────────
const ZEMACH_CIRCADIAN = {
  default:    "ספר/י לי מתי ואיך אתה/את משתמש/ת — ככה נוכל להמליץ על הזנים הנכונים לשעה הנכונה ⏰",
  daytime:    "שימוש יום — נמצא לך זנים שמאפשרים תפקוד מלא ועירנות בלי קהות ☀️",
  nighttime:  "שימוש לילה — נמצא לך זנים מרגיעים ומיישנים שמתאימים לשעות הערב 🌙",
  both:       "כל היום — נבנה לך פרופיל גמיש: זנים לתפקוד ביום וזנים לרוגע בלילה 🔄",
  vaping:     "אידוי — השפעה מהירה ומדויקת שניתן לכוון בקלות לפי הצורך ✨",
  oil:        "שמן — השפעה ארוכה ויציבה, מצוין לכאב כרוני ולשמירה על שינה לאורך הלילה 💧",
};

const GOALS = [
  { id: "focus",       label: "ריכוז ואנרגיה", icon: "🎯", sub: "מפוקד ועירני" },
  { id: "relax",       label: "הרגעה",          icon: "😌", sub: "ריגוע ללא קהות" },
  { id: "sleep",       label: "שינה",            icon: "💤", sub: "שינה עמוקה" },
  { id: "pain_relief", label: "הקלת כאב",       icon: "💊", sub: "כאב כרוני" },
  { id: "mood",        label: "מצב רוח",         icon: "🌈", sub: "מרומם ושמח" },
];

const DELIVERIES = [
  { id: "vaping", icon: "💨", label: "אידוי",     pk: "3–10 דק׳ • 3 שעות",  note: "הכי יעיל" },
  { id: "smoke",  icon: "🔥", label: "עישון",    pk: "3–10 דק׳ • 3 שעות",  note: "מוכר אך פחות יעיל" },
  { id: "oil",    icon: "💧", label: "שמן",       pk: "30–120 דק׳ • 6 שעות", note: "ארוך ויציב" },
];

function Stage3_Circadian({ payload, errors, updatePayload }) {
  const timing = payload.usageTiming;

  const toggleTiming = (id) => {
    const next = timing.includes(id) ? timing.filter((x) => x !== id) : [...timing, id];
    updatePayload({ usageTiming: next });
  };
  const toggleDelivery = (id) => {
    const cur = payload.deliveryMethods;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    updatePayload({ deliveryMethods: next });
  };

  const zemachMsg = useMemo(() => {
    if (payload.deliveryMethods.includes("oil"))   return ZEMACH_CIRCADIAN.oil;
    if (payload.deliveryMethods.includes("vaping")) return ZEMACH_CIRCADIAN.vaping;
    if (timing.includes("daytime") && timing.includes("nighttime")) return ZEMACH_CIRCADIAN.both;
    if (timing.includes("nighttime")) return ZEMACH_CIRCADIAN.nighttime;
    if (timing.includes("daytime"))   return ZEMACH_CIRCADIAN.daytime;
    return ZEMACH_CIRCADIAN.default;
  }, [timing, payload.deliveryMethods]);

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <AnimatePresence mode="wait">
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={2} />
        </AnimatePresence>
      </motion.div>

      {/* Usage timing */}
      <motion.div variants={FADE_UP}>
        <SectionLabel>מתי בעיקר אתה/את צורכ/ת?</SectionLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { id: "daytime",  label: "🌅 יום",  sub: "בוקר / צהריים" },
            { id: "nighttime", label: "🌙 לילה", sub: "ערב / שינה" },
          ].map((opt) => {
            const on  = timing.includes(opt.id);
            return (
              <motion.button
                key={opt.id}
                onClick={() => toggleTiming(opt.id)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  flex: 1, padding: "12px 10px", borderRadius: 14, textAlign: "center",
                  background:  on ? "rgba(57,255,133,0.1)" : "rgba(255,255,255,0.04)",
                  border:      `1.5px solid ${on ? T.accent : T.border}`,
                  cursor:      "pointer",
                  boxShadow:   on ? T.glow(T.accent, 8) : "none", minHeight: 60,
                }}
              >
                <p style={{ fontSize: 18, marginBottom: 2 }}>{opt.label}</p>
                <p style={{ fontSize: 10, color: on ? T.accent : T.muted }}>{opt.sub}</p>
              </motion.button>
            );
          })}
        </div>
        <FieldError msg={errors.timing} />
      </motion.div>

      {/* Primary goal */}
      <motion.div variants={FADE_UP} style={{ marginTop: 12 }}>
        <SectionLabel>מה המטרה העיקרית?</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
          {GOALS.map((g) => {
            const on  = payload.primaryGoal === g.id;
            return (
              <motion.button
                key={g.id}
                onClick={() => updatePayload({ primaryGoal: g.id })}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding:     "9px 6px",
                  borderRadius: 12,
                  textAlign:   "center",
                  background:  on ? "rgba(57,255,133,0.1)" : "rgba(255,255,255,0.04)",
                  border:      `1.5px solid ${on ? T.accent : T.border}`,
                  cursor:      "pointer",
                  boxShadow:   on ? T.glow(T.accent, 6) : "none",
                  minHeight:   50,
                }}
              >
                <span style={{ fontSize: 17, display: "block", marginBottom: 2 }}>{g.icon}</span>
                <p style={{ fontSize: 10, fontWeight: on ? 700 : 500, color: on ? T.accent : T.text, margin: 0, lineHeight: 1.2 }}>
                  {g.label}
                </p>
              </motion.button>
            );
          })}
        </div>
        <FieldError msg={errors.goal} />
      </motion.div>

      {/* Delivery method */}
      <motion.div variants={FADE_UP} style={{ marginTop: 12 }}>
        <SectionLabel>דרך צריכה (ניתן לבחור מספר)</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {DELIVERIES.map((d) => {
            const on = payload.deliveryMethods.includes(d.id);
            return (
              <motion.button
                key={d.id}
                onClick={() => toggleDelivery(d.id)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  display:     "flex",
                  alignItems:  "center",
                  gap:         10,
                  padding:     "9px 12px",
                  borderRadius: 12,
                  textAlign:   "right",
                  background:  on ? "rgba(57,255,133,0.08)" : "rgba(255,255,255,0.03)",
                  border:      `1.5px solid ${on ? T.accent : T.border}`,
                  cursor:      "pointer",
                  minHeight:   48,
                }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>{d.icon}</span>
                <div style={{ flex: 1, textAlign: "right" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: on ? T.accent : T.text, margin: 0 }}>
                    {d.label}
                    {d.note && (
                      <span style={{ fontSize: 9, fontWeight: 400, color: T.muted, marginRight: 6 }}>
                        · {d.note}
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: 9, color: T.muted, margin: 0 }}>⏱ {d.pk}</p>
                </div>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                  border:     `2px solid ${on ? T.accent : T.border}`,
                  background: on ? T.accent : "transparent",
                  display:    "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {on && <span style={{ color: "#061006", fontSize: 10, fontWeight: 800 }}>✓</span>}
                </div>
              </motion.button>
            );
          })}
        </div>
        <FieldError msg={errors.delivery} />
      </motion.div>
    </motion.div>
  );
}

// ── Stage 4: Legacy Genetics Alignment ───────────────────────────────────────
const PARENT_STRAINS = [
  { id: "kush",     name: "Kush",     icon: "🏔️",  origin: "אפגניסטן",      mood: "מרגיע עמוק",       color: "#7B4FFF" },
  { id: "haze",     name: "Haze",     icon: "☁️",  origin: "קליפורניה",     mood: "סאטיבה מרוממת",    color: "#FFE040" },
  { id: "diesel",   name: "Diesel",   icon: "⛽",  origin: "ניו יורק",      mood: "אנרגטי ופאנקי",    color: "#FFA040" },
  { id: "cookies",  name: "Cookies",  icon: "🍪",  origin: "קליפורניה",     mood: "שמח ומאוזן",       color: "#FF8C6B" },
  { id: "purple",   name: "Purple",   icon: "💜",  origin: "קליפורניה",     mood: "ישנוני ומרגיע",    color: "#C855FF" },
  { id: "og",       name: "OG",       icon: "🌊",  origin: "פלורידה",       mood: "קלאסי ועוצמתי",   color: "#39FF85" },
  { id: "gelato",   name: "Gelato",   icon: "🍨",  origin: "קליפורניה",     mood: "מתוק ומרומם",      color: "#FF6B8A" },
  { id: "runtz",    name: "Runtz",    icon: "🍬",  origin: "קליפורניה",     mood: "פירותי ועליז",     color: "#40CFFF" },
  { id: "chemdawg", name: "Chemdawg", icon: "🧪",  origin: "קולורדו",       mood: "כימי ועוצמתי",    color: "#A0FF40" },
  { id: "zkittlez", name: "Zkittlez", icon: "🌈",  origin: "קליפורניה",     mood: "מגוון וצבעוני",   color: "#FF40CF" },
];

const ZEMACH_GENETICS = {
  default: "הגנטיקה היא הזיכרון של הצמח 🧬 מה שעבד בעבר — ינחה אותנו לעתיד. תייג מה שאתה מכיר.",
  loved:   "מצוין! הגנטיקה האהובה שלך נרשמה ✅ אנחנו נחפש קרובי משפחה שיעשו את אותה עבודה.",
  hated:   "הבנתי, גנטיקה שנתנה חוויה רעה 🚫 חסמתי אותה ואת הטרפנים שמאפיינים אותה.",
};

function Stage4_Genetics({ payload, updatePayload }) {
  const [q, setQ] = useState("");
  const loved  = payload.lovedStrains  || [];
  const hated  = payload.hatedStrains  || [];

  const zemachMsg = useMemo(() => {
    if (hated.length > 0)  return ZEMACH_GENETICS.hated;
    if (loved.length > 0)  return ZEMACH_GENETICS.loved;
    return ZEMACH_GENETICS.default;
  }, [loved, hated]);

  const setLoved = (id) => {
    if (loved.includes(id)) {
      updatePayload({ lovedStrains: loved.filter((x) => x !== id) });
    } else {
      updatePayload({
        lovedStrains: [...loved, id],
        hatedStrains: hated.filter((x) => x !== id),
      });
    }
  };
  const setHated = (id) => {
    if (hated.includes(id)) {
      updatePayload({ hatedStrains: hated.filter((x) => x !== id) });
    } else {
      updatePayload({
        hatedStrains: [...hated, id],
        lovedStrains: loved.filter((x) => x !== id),
      });
    }
  };

  const filtered = PARENT_STRAINS.filter(
    (s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.mood.includes(q),
  );

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <AnimatePresence mode="wait">
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={3} />
        </AnimatePresence>
      </motion.div>

      <motion.div variants={FADE_UP}>
        <SectionLabel>זנים שכבר ניסית — מה עבד ומה לא?</SectionLabel>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש זן..."
          style={{
            width: "100%", marginBottom: 12, padding: "9px 14px", borderRadius: 12,
            background: "rgba(255,255,255,0.05)", border: `1.5px solid ${T.border}`,
            color: T.text, fontSize: 13, outline: "none",
          }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {filtered.map((s) => {
            const isLoved = loved.includes(s.id);
            const isHated = hated.includes(s.id);
            const col     = isLoved ? T.accent : isHated ? T.danger : T.border;
            return (
              <motion.div
                key={s.id}
                variants={FADE_UP}
                style={{
                  padding:     "9px",
                  borderRadius: 12,
                  background:  isLoved ? "rgba(57,255,133,0.08)"
                              : isHated ? "rgba(255,69,96,0.08)"
                              : "rgba(255,255,255,0.03)",
                  border:      `1.5px solid ${col}`,
                  boxShadow:   (isLoved || isHated) ? `0 0 10px ${col}33` : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 18, filter: `drop-shadow(0 0 5px ${s.color}88)`, flexShrink: 0 }}>{s.icon}</span>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: isLoved ? T.accent : isHated ? T.danger : T.text, margin: 0 }}>
                      {s.name}
                    </p>
                    <p style={{ fontSize: 9, color: T.muted, margin: 0 }}>{s.origin}</p>
                  </div>
                </div>
                <p style={{ fontSize: 9, color: T.muted, marginBottom: 6 }}>{s.mood}</p>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => setLoved(s.id)}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background:  isLoved ? T.accent : "rgba(57,255,133,0.08)",
                      color:       isLoved ? "#061006" : T.accent,
                      border:      `1px solid ${isLoved ? T.accent : "rgba(57,255,133,0.3)"}`,
                      cursor:      "pointer",
                    }}
                  >
                    {isLoved ? "✓ אהבתי" : "❤️ אהבתי"}
                  </button>
                  <button
                    onClick={() => setHated(s.id)}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background:  isHated ? T.danger : "rgba(255,69,96,0.08)",
                      color:       isHated ? "#fff" : T.danger,
                      border:      `1px solid ${isHated ? T.danger : "rgba(255,69,96,0.3)"}`,
                      cursor:      "pointer",
                    }}
                  >
                    {isHated ? "✕ לא עבד" : "💔 לא עבד"}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {(loved.length > 0 || hated.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12,
                   background: "rgba(57,255,133,0.06)", border: `1px solid ${T.border}` }}
        >
          {loved.length > 0 && (
            <p style={{ fontSize: 12, color: T.accent, marginBottom: 2 }}>
              ❤️ אהבתי: {loved.map((id) => PARENT_STRAINS.find((s) => s.id === id)?.name).join(", ")}
            </p>
          )}
          {hated.length > 0 && (
            <p style={{ fontSize: 12, color: T.danger }}>
              💔 לא עבד: {hated.map((id) => PARENT_STRAINS.find((s) => s.id === id)?.name).join(", ")}
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Stage 5: Live Vector Preview — the "Aha!" moment ─────────────────────────
const TERP_ORDER = [
  { key: "myrcene",      label: "מירצן",      color: "#39FF85", angle: 0   },
  { key: "limonene",     label: "לימונן",      color: "#FFE040", angle: 45  },
  { key: "caryophyllene",label: "קריופילן",    color: "#FF6B6B", angle: 90  },
  { key: "linalool",     label: "לינלול",      color: "#C855FF", angle: 135 },
  { key: "pinene",       label: "פינן",        color: "#40CFFF", angle: 180 },
  { key: "humulene",     label: "הומולן",      color: "#A0FF40", angle: 225 },
  { key: "terpinolene",  label: "טרפינולן",   color: "#FFA040", angle: 270 },
  { key: "ocimene",      label: "אוסימן",      color: "#FF40CF", angle: 315 },
];

function RadarChart({ liveVector, killSwitches, size = 220 }) {
  const cx = size / 2, cy = size / 2, maxR = size / 2 - 30;
  const n = TERP_ORDER.length;

  const points = TERP_ORDER.map((t, i) => {
    const angle  = (i / n) * 2 * Math.PI - Math.PI / 2;
    const val    = Math.max(0, liveVector[t.key] || 0);
    const isKill = killSwitches[t.key] >= 0.6;
    const r      = isKill ? 0 : val * maxR;
    return {
      x:    cx + r * Math.cos(angle),
      y:    cy + r * Math.sin(angle),
      lx:   cx + (maxR + 22) * Math.cos(angle),
      ly:   cy + (maxR + 22) * Math.sin(angle),
      full: { x: cx + maxR * Math.cos(angle), y: cy + maxR * Math.sin(angle) },
      val,
      isKill,
      ...t,
    };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const outline  = points.map((p) => `${p.full.x},${p.full.y}`).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={points.map((p) => {
            const angle  = (TERP_ORDER.indexOf(p) / n) * 2 * Math.PI - Math.PI / 2;
            const r = f * maxR;
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
          }).join(" ")}
          fill="none"
          stroke="rgba(57,255,133,0.12)"
          strokeWidth={1}
        />
      ))}
      {/* Spoke lines */}
      {points.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p.full.x} y2={p.full.y}
          stroke="rgba(57,255,133,0.10)" strokeWidth={1} />
      ))}
      {/* Outline ghost */}
      <polygon points={outline} fill="none" stroke="rgba(57,255,133,0.08)" strokeWidth={1} />
      {/* Filled area */}
      <motion.polygon
        points={polyline}
        fill="rgba(57,255,133,0.12)"
        stroke={T.accent}
        strokeWidth={2}
        strokeLinejoin="round"
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        style={{ filter: `drop-shadow(0 0 8px ${T.accent}88)` }}
      />
      {/* Vertex dots */}
      {points.map((p, i) => (
        <motion.circle
          key={i}
          cx={p.x} cy={p.y} r={p.isKill ? 5 : 4}
          fill={p.isKill ? T.danger : p.color}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
          style={{ filter: `drop-shadow(0 0 5px ${p.isKill ? T.danger : p.color})` }}
        />
      ))}
      {/* Labels */}
      {points.map((p, i) => (
        <text
          key={i}
          x={p.lx} y={p.ly}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={p.isKill ? T.danger : p.val > 0.3 ? p.color : T.muted}
          fontSize={9}
          fontWeight={700}
        >
          {p.isKill ? "🚫" : ""}{p.label}
        </text>
      ))}
    </svg>
  );
}

function dnaSequence(liveVector) {
  const codes = {
    myrcene: "MY", limonene: "LM", caryophyllene: "CY", linalool: "LN",
    pinene: "PN", humulene: "HM", terpinolene: "TP", ocimene: "OC",
  };
  return Object.entries(liveVector)
    .filter(([, v]) => v > 0.1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, v]) => `${codes[t] || t.slice(0, 2).toUpperCase()}${Math.round(v * 9)}`)
    .join("-") || "—";
}

function Stage5_Preview({ liveVector, killSwitches, payload }) {
  const seq          = useMemo(() => dnaSequence(liveVector), [liveVector]);
  const activeTerps  = TERP_ORDER.filter((t) => (liveVector[t.key] || 0) > 0.2);
  const blockedTerps = Object.keys(killSwitches);
  const [copied, setCopied] = useState(false);

  const share = () => {
    const txt = `🧬 ה-DNA הקנאבינואידי שלי\nרצף: ${seq}\nטרפנים מובילים: ${activeTerps.slice(0, 3).map((t) => t.label).join(", ")}\nנבנה עם קנאמאצ׳`;
    navigator.clipboard?.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const goalLabels = { sleep:"שינה", pain:"כאב", focus:"ריכוז", relax:"רוגע", mood:"מצב רוח", energy:"אנרגיה", appetite:"תיאבון", creative:"יצירתיות" };
  const goalText = (payload.effectGoals || []).slice(0, 3).map((g) => goalLabels[g] || g).join(", ");
  const zemachMsg = `הפרופיל שלך מוכן!` +
    (goalText ? ` ממוקד ל: ${goalText}.` : "") +
    " עכשיו נסרוק את התפריט ונמצא לך את ההתאמה הטובה ביותר לקנייה הבאה שלך 🎉";

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <AnimatePresence mode="wait">
          <ZemachBubble key="preview" message={zemachMsg} stage={4} />
        </AnimatePresence>
      </motion.div>

      {/* Radar chart */}
      <motion.div
        variants={FADE_UP}
        style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}
      >
        <div style={{ position: "relative" }}>
          <RadarChart liveVector={liveVector} killSwitches={killSwitches} size={220} />
          {/* Center label */}
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            textAlign: "center", pointerEvents: "none",
          }}>
            <p style={{ fontSize: 9, color: T.muted, letterSpacing: "0.1em" }}>DNA</p>
          </div>
        </div>
      </motion.div>

      {/* DNA sequence */}
      <motion.div variants={FADE_UP} style={{
        padding:     "14px 18px",
        borderRadius: 14,
        background:  "rgba(0,0,0,0.5)",
        border:      `1.5px solid ${T.border}`,
        display:     "flex",
        alignItems:  "center",
        justifyContent: "space-between",
        marginBottom: 14,
        gap: 12,
      }}>
        <div>
          <p style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>רצף DNA קנאבינואידי</p>
          <p style={{ fontSize: 14, fontFamily: "monospace", color: T.accent,
                      letterSpacing: "0.15em", fontWeight: 700 }}>
            {seq}
          </p>
        </div>
        <button onClick={share} style={{
          padding: "8px 14px", borderRadius: 10,
          background: "rgba(57,255,133,0.1)", color: T.accent,
          border: `1.5px solid ${T.border}`, fontSize: 12, fontWeight: 700,
          cursor: "pointer", flexShrink: 0,
        }}>
          {copied ? "✓ הועתק" : "🧬 שתף"}
        </button>
      </motion.div>

      {/* Active terpenes */}
      {activeTerps.length > 0 && (
        <motion.div variants={FADE_UP}>
          <SectionLabel>טרפנים מובילים שלך</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {activeTerps.slice(0, 5).map((t) => (
              <motion.span
                key={t.key}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  fontSize: 12, fontWeight: 700,
                  background: `${t.color}18`,
                  color:      t.color,
                  border:     `1.5px solid ${t.color}44`,
                  boxShadow:  `0 0 10px ${t.color}22`,
                }}
              >
                {t.label} {Math.round((liveVector[t.key] || 0) * 100)}%
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Kill-switch badges */}
      {blockedTerps.length > 0 && (
        <motion.div variants={FADE_UP} style={{
          padding: "10px 14px", borderRadius: 12, marginBottom: 12,
          background: "rgba(255,69,96,0.08)", border: "1.5px solid rgba(255,69,96,0.25)",
        }}>
          <p style={{ fontSize: 11, color: T.danger, fontWeight: 700, marginBottom: 4 }}>
            🛡️ חסום לבטיחותך
          </p>
          <p style={{ fontSize: 11, color: T.muted }}>
            {blockedTerps.join(", ")} — זוהה כטריגר בפרופיל שלך ונחסם מהחיפוש.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

// Clinical Map ID → local scoringEngine REASONS ids
// (INDICATION_PROFILES in CannaMatch uses the latter as keys)
const CLINICAL_TO_REASON = {
  anxiety:       "anxiety",
  ptsd:          "ptsd",
  chronic_pain:  "pain",
  fibromyalgia:  "pain",
  endometriosis: "pain",
  oncology:      "appetite",
  palliative:    "sleep",
  crohns:        "gi",
  colitis:       "gi",
  ms:            "pain",
  parkinsons:    "sleep",
  tourette:      "anxiety",
  epilepsy:      "anxiety",
  autism:        "anxiety",
  hiv_wasting:   "appetite",
  glaucoma:      "pain",
};

// ── Named exports so Profile screen can reuse the same diagram ───────────────
export { RadarChart, TERP_ORDER };

// ── Main Wizard ───────────────────────────────────────────────────────────────
export default function OnboardingWizard({ user, onComplete, onSkip }) {
  const store = useOnboardingStore();
  const { stage, totalStages, payload, errors, liveVector, killSwitches,
          updatePayload, goNext, skipStage, goPrev } = store;

  const [direction, setDirection] = useState(1);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState(null);

  const handleNext = useCallback(() => {
    setDirection(1);
    goNext();
  }, [goNext]);

  const handlePrev = useCallback(() => {
    setDirection(-1);
    goPrev();
  }, [goPrev]);

  const handleComplete = useCallback(async () => {
    setSaving(true);
    setSaveError(null);

    const FLAVOR_TO_LOCAL = {
      gas_fuel: "diesel", citrus_sharp: "citrus",
      earthy_musky: "earthy", sweet_berry: "berry",
      pine_fresh: "pine", floral_lavender: "lavender",
      spicy_pepper: "spicy", tropical_mango: "mango",
    };
    const EFFECT_GOAL_TO_REASON = {
      sleep: "sleep", pain: "pain", focus: "focus",
      relax: "relax", mood: "mood", energy: "energy",
      appetite: "appetite", creative: "focus",
    };
    const localReasons = [
      ...new Set(
        (payload.effectGoals || []).map((g) => EFFECT_GOAL_TO_REASON[g]).filter(Boolean),
      ),
    ];
    const localAns = {
      cats:      [],
      form:      (payload.deliveryMethods || []).map(
                   (m) => m === "vaping" ? "אידוי" : m === "oil" ? "שמן" : "עישון"),
      reasons:   localReasons,
      flavors:   Object.entries(payload.scentSelections || {})
                  .filter(([, v]) => v !== "disliked")
                  .map(([id]) => FLAVOR_TO_LOCAL[id] || id),
      helped:    payload.lovedStrains  || [],
      notHelped: payload.hatedStrains  || [],
      current:   [],
    };

    // Best-effort backend sync — token errors or network failures never block completion
    let dna = null;
    try {
      const data = await api.submitOnboarding(payload);
      dna = data.dna;
    } catch (err) {
      console.warn("Onboarding backend sync skipped:", err.message);
    }

    setSaving(false);
    onComplete({ localAns, dna });
  }, [payload, onComplete]);

  const isLastStage    = stage === totalStages - 1;
  const stageTitle     = ["מטרות ויעדים", "ארומות ותחושות", "שגרת השימוש", "זנים מהעבר", "הפרופיל שלך"][stage];
  const stageSubtitle  = [
    "מה אתה/את מחפש/ת מהקנאביס שלך",
    "אילו ריחות אתה/את אוהב/ת ולא אוהב/ת",
    "מתי ואיך אתה/את משתמש/ת",
    "זנים שכבר ניסית — מה עבד ומה לא",
    "הפרופיל שלך מוכן לסריקת התפריט",
  ][stage];

  return (
    <div
      dir="rtl"
      style={{
        minHeight:  "100%",
        background: T.bg,
        color:      T.text,
        fontFamily: "'Heebo','Segoe UI',sans-serif",
        display:    "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ padding: "14px 20px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: 0 }}>
              בניית הפרופיל שלך 🌿
            </h1>
            <p style={{ fontSize: 10, color: T.accent, margin: 0, letterSpacing: "0.06em" }}>
              שלב {stage + 1} מתוך {totalStages} — {stageTitle}
            </p>
          </div>
          {onSkip && (
            <button
              onClick={onSkip}
              style={{ fontSize: 12, color: T.muted, background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
                cursor: "pointer", padding: "5px 12px", fontFamily: "'Heebo',sans-serif",
                fontWeight: 700 }}
            >
              דילוג →
            </button>
          )}
        </div>
        <p style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>{stageSubtitle}</p>
        <ProgressBar stage={stage} total={totalStages} />
      </div>

      {/* Stage content — internal scroll while header+nav stay pinned */}
      <div style={{ flex: 1, padding: "0 18px", overflowY: "auto", paddingBottom: 4,
        scrollbarWidth: "none", msOverflowStyle: "none" }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={stage}
            custom={direction}
            variants={PAGE_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {stage === 0 && (
              <Stage1_Goals payload={payload} errors={errors} updatePayload={updatePayload} />
            )}
            {stage === 1 && (
              <Stage2_Sensory payload={payload} errors={errors} updatePayload={updatePayload} />
            )}
            {stage === 2 && (
              <Stage3_Circadian payload={payload} errors={errors} updatePayload={updatePayload} />
            )}
            {stage === 3 && (
              <Stage4_Genetics payload={payload} updatePayload={updatePayload} />
            )}
            {stage === 4 && (
              <Stage5_Preview
                liveVector={liveVector}
                killSwitches={killSwitches}
                payload={payload}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Per-stage skip with disclaimer — shown on stages 0-3 only */}
      {stage < totalStages - 1 && (
        <div style={{
          padding: "6px 18px 0", flexShrink: 0, textAlign: "center",
        }}>
          <button
            onClick={skipStage}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(57,255,133,0.18)",
              borderRadius: 20, padding: "5px 14px",
              color: T.muted, fontSize: 11, fontWeight: 700,
              cursor: "pointer", fontFamily: "'Heebo',sans-serif",
              transition: "border-color .15s, color .15s",
              letterSpacing: "0.01em",
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "rgba(57,255,133,0.45)"; e.currentTarget.style.color = T.accent; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "rgba(57,255,133,0.18)"; e.currentTarget.style.color = T.muted; }}
          >
            <span style={{ fontSize: 10 }}>→</span>
            דילוג על שלב זה
          </button>
          <p style={{
            fontSize: 9, color: "rgba(126,168,142,0.60)",
            lineHeight: 1.55, margin: "5px 0 0",
            fontWeight: 500, maxWidth: 320, marginInline: "auto",
          }}>
            אפשר לדלג, אבל ככל שנדע יותר עליך — כך ההתאמה לתפריט תהיה מדויקת יותר.
          </p>
        </div>
      )}

      {/* Navigation — always visible, never scrolled away */}
      <div style={{
        padding:     "10px 18px 16px",
        borderTop:   `1px solid ${T.border}`,
        background:  "rgba(0,0,0,0.3)",
        backdropFilter: "blur(10px)",
        display:     "flex",
        gap:         10,
        flexShrink:  0,
      }}>
        {stage > 0 && (
          <NeonButton onClick={handlePrev} variant="ghost" size="md">
            ← חזרה
          </NeonButton>
        )}
        {!isLastStage ? (
          <NeonButton onClick={handleNext} size="lg" className="flex-1" style={{ flex: 1 }}>
            המשך →
          </NeonButton>
        ) : (
          <motion.button
            onClick={handleComplete}
            disabled={saving}
            whileHover={saving ? {} : { scale: 1.03, boxShadow: T.glow(T.accent, 20) }}
            whileTap={saving ? {} : { scale: 0.97 }}
            style={{
              flex: 1, padding: "15px 0", borderRadius: 18,
              background:  saving ? "rgba(57,255,133,0.4)" : T.accent,
              color:       "#061006",
              fontWeight:  800,
              fontSize:    16,
              border:      "none",
              cursor:      saving ? "not-allowed" : "pointer",
              boxShadow:   saving ? "none" : T.glow(T.accent, 16),
              letterSpacing: "0.04em",
            }}
          >
            {saving ? "שומר את ה-DNA שלך..." : "🧬 בנה את הפרופיל שלי"}
          </motion.button>
        )}
      </div>

      {saveError && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            margin: "0 24px 16px",
            padding: "10px 14px",
            borderRadius: 12,
            background: "rgba(255,69,96,0.12)",
            border: "1px solid rgba(255,69,96,0.3)",
            color: T.danger, fontSize: 12,
          }}
        >
          {saveError}
          <button
            onClick={handleComplete}
            style={{ marginRight: 10, fontWeight: 700, color: T.danger,
                     background: "none", border: "none", cursor: "pointer" }}
          >
            נסה שוב
          </button>
        </motion.div>
      )}
    </div>
  );
}
