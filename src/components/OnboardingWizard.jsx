// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — "Dynamic DNA Laboratory" Onboarding Wizard
//  7-Stage cinematic experience. Framer Motion + Cyberpunk/Sci-Fi theme.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOnboardingStore, STAGE_NAMES } from "../hooks/useOnboardingStore.js";
import { api } from "../services/api.js";
import {
  PHARMARY_STRAINS,
  PHARMARY_STRAINS_2,
  PHARMARY_STRAINS_3,
  PHARMARY_STRAINS_4,
} from "../data/israeli-pharmacy-catalog.js";
import MEDICAL_CONDITIONS from "../data/conditions.js";

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
  const stageColor = [T.accent, T.orange, T.accent, T.purple, "#FFA040", "#00E5FF", T.accent][stage] || T.accent;
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
  const labels = ["רישיון", "צריכה", "מטרות", "טעם", "שגרה", "מוצרים", "פרופיל"];
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
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
          <span key={i} style={{ fontSize: 9, color: i <= stage ? T.accent : T.muted,
                                  fontWeight: i === stage ? 700 : 400, transition: "color 0.3s" }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Helper: file → base64 ─────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Stage 0: License ──────────────────────────────────────────────────────────
const LICENSE_CATEGORIES = [
  "T22/C4","T20/C4","T18/C3","T15/C3","T12/C12",
  "T10/C10","T10/C2","T5/C15","T3/C15","T1/C22",
];

function Stage0_License({ payload, errors, updatePayload }) {
  const [mode, setMode]           = useState(null); // null | "manual" | "ocr-confirm"
  const [scanning, setScanning]   = useState(false);
  const [detectedCats, setDetectedCats] = useState([]);
  const fileRef                   = useRef(null);

  const selectedCats = payload.licenseCategories || [];

  const toggleCat = (cat) => {
    const next = selectedCats.includes(cat)
      ? selectedCats.filter((c) => c !== cat)
      : [...selectedCats, cat];
    updatePayload({ licenseCategories: next });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 300,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
              { type: "text", text: `זהו רישיון קנאביס רפואי ישראלי. חלץ תאריך תפוגה וקטגוריות (כגון T22/C4, T15/C3).
השב ב-JSON בלבד: {"expiry":"YYYY-MM-DD","categories":["T22/C4"]}
אם לא זיהית — החזר: {"expiry":null,"categories":[]}` },
            ],
          }],
        }),
      });
      const data = await res.json();
      const text = ((data.content || []).map((b) => b.text || "").join("")).trim();
      const m = text.match(/\{[\s\S]*?\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        const expiry = parsed.expiry || null;
        const cats   = (parsed.categories || []).filter((c) => LICENSE_CATEGORIES.includes(c));
        if (cats.length > 0) {
          setDetectedCats(cats);
          updatePayload({ licenseVerified: true, licenseExpiry: expiry, licenseCategories: cats });
          setMode("ocr-confirm");
        } else {
          setMode("manual");
          if (expiry) updatePayload({ licenseExpiry: expiry });
        }
      } else {
        setMode("manual");
      }
    } catch {
      setMode("manual");
    } finally {
      setScanning(false);
    }
  };

  // OCR confirmation screen
  if (mode === "ocr-confirm") {
    return (
      <motion.div variants={STAGGER} initial="hidden" animate="show">
        <motion.div variants={FADE_UP}>
          <ZemachBubble message="זיהיתי את הרישיון שלך! נראה מה מצאתי 🪪" stage={0} />
        </motion.div>
        <motion.div variants={FADE_UP} style={{
          padding: "16px", borderRadius: 16,
          background: "rgba(57,255,133,0.06)", border: `1.5px solid ${T.border}`,
          marginBottom: 12,
        }}>
          <p style={{ fontSize: 13, color: T.accent, fontWeight: 700, marginBottom: 8 }}>
            זיהיתי ברישיון: {detectedCats.join(", ")} — נכון?
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <NeonButton
              size="md"
              onClick={() => { updatePayload({ licenseCategories: detectedCats, licenseVerified: true }); setMode(null); }}
            >
              כן, נכון ✓
            </NeonButton>
            <NeonButton
              variant="ghost"
              size="md"
              onClick={() => { updatePayload({ licenseCategories: detectedCats }); setMode("manual"); }}
            >
              אני אתקן
            </NeonButton>
          </div>
        </motion.div>
        {payload.licenseExpiry && (
          <motion.p variants={FADE_UP} style={{ fontSize: 11, color: T.muted }}>
            📅 תוקף הרישיון: {payload.licenseExpiry}
          </motion.p>
        )}
      </motion.div>
    );
  }

  // Manual category picker
  if (mode === "manual") {
    return (
      <motion.div variants={STAGGER} initial="hidden" animate="show">
        <motion.div variants={FADE_UP}>
          <ZemachBubble message="אין בעיה! בחר/י את הקטגוריות שמופיעות על הרישיון שלך 📋" stage={0} />
        </motion.div>
        <motion.div variants={FADE_UP}>
          <SectionLabel>קטגוריות מאושרות ברישיון שלך</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {LICENSE_CATEGORIES.map((cat) => {
              const on = selectedCats.includes(cat);
              return (
                <motion.button
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  whileHover={{ scale: 1.03, boxShadow: `0 0 14px ${T.accent}33` }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: "10px 12px", borderRadius: 12, textAlign: "center",
                    background: on ? `${T.accent}14` : "rgba(255,255,255,0.04)",
                    border:     `1.5px solid ${on ? T.accent : T.border}`,
                    boxShadow:  on ? T.glow(T.accent, 8) : "none",
                    cursor:     "pointer", transition: "all 0.18s",
                  }}
                >
                  <p style={{ fontSize: 14, fontWeight: 700, color: on ? T.accent : T.text, margin: 0 }}>
                    {cat}
                  </p>
                </motion.button>
              );
            })}
          </div>
          {selectedCats.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12,
                       background: "rgba(57,255,133,0.06)", border: `1px solid ${T.border}` }}
            >
              <p style={{ fontSize: 12, color: T.accent }}>
                ✓ בחרת: {selectedCats.join(", ")}
              </p>
            </motion.div>
          )}
        </motion.div>
        <motion.p variants={FADE_UP} style={{ fontSize: 11, color: T.muted, marginTop: 12, textAlign: "center" }}>
          לא מצאת? אפשר להמשיך בלי — תוכל/י להוסיף מאוחר יותר
        </motion.p>
      </motion.div>
    );
  }

  // Default: three path cards
  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <ZemachBubble
          message="בוא נוודא שאתה מורשה 🪪 הרישיון עוזר לנו לסנן מוצרים שמותרים לך. אפשר גם להמשיך בלי עכשיו."
          stage={0}
        />
      </motion.div>

      <motion.div variants={FADE_UP}>
        <SectionLabel>בחר/י איך להמשיך</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Scan */}
          <motion.button
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            whileHover={{ scale: 1.02, boxShadow: T.glow(T.accent, 12) }}
            whileTap={{ scale: 0.97 }}
            style={{
              padding: "16px 18px", borderRadius: 16, textAlign: "right",
              background: "rgba(57,255,133,0.06)", border: `1.5px solid ${T.accent}55`,
              cursor: scanning ? "wait" : "pointer", transition: "all 0.18s",
              display: "flex", alignItems: "center", gap: 12,
            }}
          >
            <span style={{ fontSize: 28 }}>🪪</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: T.accent, margin: 0 }}>
                {scanning ? "סורק..." : "סריקת רישיון"}
              </p>
              <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>
                צלם או העלה תמונה — נחלץ את הקטגוריות אוטומטית
              </p>
            </div>
          </motion.button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {/* Manual */}
          <motion.button
            onClick={() => setMode("manual")}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              padding: "16px 18px", borderRadius: 16, textAlign: "right",
              background: "rgba(255,255,255,0.04)", border: `1.5px solid ${T.border}`,
              cursor: "pointer", transition: "all 0.18s",
              display: "flex", alignItems: "center", gap: 12,
            }}
          >
            <span style={{ fontSize: 28 }}>✍️</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0 }}>הזנה ידנית</p>
              <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>בחר/י את הקטגוריות מהרשימה</p>
            </div>
          </motion.button>

          {/* Skip */}
          <motion.button
            onClick={() => updatePayload({ licenseVerified: false, licenseCategories: [] })}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            style={{
              padding: "12px 18px", borderRadius: 14, textAlign: "right",
              background: "transparent", border: `1px solid rgba(126,168,142,0.3)`,
              cursor: "pointer", transition: "all 0.18s",
              display: "flex", alignItems: "center", gap: 12,
            }}
          >
            <span style={{ fontSize: 22, color: T.muted }}>→</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: T.muted, margin: 0 }}>דלג</p>
              <p style={{ fontSize: 10, color: T.muted, opacity: 0.7, margin: 0 }}>
                גלישה פתוחה — קהילה ודיווחים ידרשו רישיון
              </p>
            </div>
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Stage 1: Consumption Form ──────────────────────────────────────────────────
const CONSUMPTION_FORMS = [
  { id: "flower", icon: "🌿", label: "תפרחת",  sub: "פרחים לעישון או אידוי",   color: T.accent },
  { id: "oil",    icon: "💧", label: "שמן",     sub: "שמן מתחת ללשון",          color: "#40CFFF" },
  { id: "vape",   icon: "💨", label: "מאדה",    sub: "קרטרידג' ואפורייזר",      color: T.purple },
  { id: "mixed",  icon: "🔀", label: "מעורב",   sub: "שילוב של מספר דרכים",     color: T.orange },
];

function Stage1_ConsumptionForm({ payload, errors, updatePayload }) {
  const selected = payload.consumptionForm;

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <ZemachBubble
          message="איך אתה/את צורכ/ת בדרך כלל? זה עוזר לנו לסנן את המוצרים הנכונים ולהתאים את השאלות הבאות 💊"
          stage={1}
        />
      </motion.div>

      <motion.div variants={FADE_UP}>
        <SectionLabel>דרך הצריכה שלך</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {CONSUMPTION_FORMS.map((form) => {
            const on = selected === form.id;
            return (
              <motion.button
                key={form.id}
                onClick={() => updatePayload({ consumptionForm: form.id })}
                whileHover={{ scale: 1.04, boxShadow: `0 0 18px ${form.color}44` }}
                whileTap={{ scale: 0.94 }}
                style={{
                  padding:      "18px 12px",
                  borderRadius: 16,
                  textAlign:    "center",
                  background:   on ? `${form.color}16` : "rgba(255,255,255,0.04)",
                  border:       `1.5px solid ${on ? form.color : T.border}`,
                  boxShadow:    on ? T.glow(form.color, 12) : "none",
                  cursor:       "pointer",
                  transition:   "all 0.18s",
                  minHeight:    90,
                }}
              >
                <span style={{ fontSize: 28, display: "block", marginBottom: 6,
                               filter: on ? `drop-shadow(0 0 8px ${form.color})` : "none" }}>
                  {form.icon}
                </span>
                <p style={{ fontSize: 14, fontWeight: on ? 800 : 600, color: on ? form.color : T.text, margin: 0 }}>
                  {form.label}
                </p>
                <p style={{ fontSize: 10, color: T.muted, margin: "3px 0 0" }}>{form.sub}</p>
              </motion.button>
            );
          })}
        </div>
        <FieldError msg={errors.form} />
      </motion.div>
    </motion.div>
  );
}

// ── Stage 2: Cannabis Goals (unchanged from original Stage 1) ─────────────────
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

// ── Stage 2: Medical Conditions ───────────────────────────────────────────────
const ZEMACH_CONDITIONS = {
  default:       "לאיזה מצב רפואי קיבלת אישור? זה עוזר לנו למצוא את הפרופיל הנכון לך. 🩺",
  selected_one:  "קיבלתי! המפה שלך כבר מתחילה להתגבש — ממשיכים 🌿",
  selected_many: "כמה מצבים — אתאם בין כולם את הפרופיל הכי מתאים לך 🧩",
};

function Stage2_Conditions({ payload, updatePayload }) {
  const selected = payload.medicalConditions || [];
  const toggle = (id) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    updatePayload({ medicalConditions: next });
  };

  const zemachMsg = useMemo(() => {
    if (selected.length > 1) return ZEMACH_CONDITIONS.selected_many;
    if (selected.length === 1) return ZEMACH_CONDITIONS.selected_one;
    return ZEMACH_CONDITIONS.default;
  }, [selected]);

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <AnimatePresence mode="wait">
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={2} />
        </AnimatePresence>
      </motion.div>

      <motion.div variants={FADE_UP}>
        <SectionLabel>לאיזה מצב קיבלת אישור? (ניתן לבחור כמה — ואפשרי גם לדלג)</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {MEDICAL_CONDITIONS.map((cond) => {
            const on = selected.includes(cond.id);
            return (
              <motion.button
                key={cond.id}
                onClick={() => toggle(cond.id)}
                whileHover={{ scale: 1.03, boxShadow: `0 0 14px ${T.accent}33` }}
                whileTap={{ scale: 0.94 }}
                style={{
                  padding:       "9px 10px",
                  borderRadius:  13,
                  textAlign:     "right",
                  background:    on ? "rgba(57,255,133,0.08)" : "rgba(255,255,255,0.03)",
                  border:        `1.5px solid ${on ? T.accent : T.border}`,
                  boxShadow:     on ? T.glow(T.accent, 7) : "none",
                  cursor:        "pointer",
                  transition:    "all 0.18s",
                  minHeight:     52,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 1 }}>
                  <span style={{ fontSize: 17, flexShrink: 0,
                                 filter: on ? `drop-shadow(0 0 5px ${T.accent})` : "none" }}>
                    {cond.icon}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: on ? 800 : 600,
                                 color: on ? T.accent : T.text, lineHeight: 1.3 }}>
                    {cond.label}
                  </span>
                </div>
                <p style={{ fontSize: 9, color: T.muted, margin: 0, paddingRight: 24 }}>
                  {cond.sub}
                </p>
              </motion.button>
            );
          })}
        </div>
        <motion.p variants={FADE_UP} style={{
          textAlign: "center", marginTop: 12, fontSize: 12,
          color: "rgba(187,247,208,0.45)",
        }}>
          לא רוצה לציין — לחץ ״המשך״ למטה, זה אופציונלי לחלוטין 🌿
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

function Stage3_Goals({ payload, errors, updatePayload }) {
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
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={2} />
        </AnimatePresence>
      </motion.div>

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

// ── Stage 3a: Scent (flower / vape users) ─────────────────────────────────────
const FLAVOR_TILES = [
  { id: "citrus_sharp",    label: "הדרים",             icon: "🍋", color: "#FFE040",
    sub: "כמו לימון, תפוז, אשכולית" },
  { id: "earthy_musky",    label: "אדמתי / יערי",      icon: "🌍", color: "#8BC34A",
    sub: "כמו אחרי גשם, פטריות, יער" },
  { id: "sweet_berry",     label: "מתוק / פירותי",     icon: "🍓", color: "#FF6B8A",
    sub: "כמו תות שדה, ענבים, פירות" },
  { id: "pine_fresh",      label: "אורן / רענן",       icon: "🌲", color: "#39FF85",
    sub: "כמו יער אורנים, נענע" },
  { id: "floral_lavender", label: "פרחוני / לבנדר",   icon: "💜", color: "#C855FF",
    sub: "כמו לבנדר, ורדים, ג'סמין" },
  { id: "spicy_pepper",    label: "תבלוני / פלפלי",    icon: "🌶️", color: "#FF4560",
    sub: "כמו פלפל שחור, קינמון, ציפורן" },
  { id: "tropical_mango",  label: "טרופי / מנגו",      icon: "🥭", color: "#40CFFF",
    sub: "כמו מנגו, אננס, גויאבה" },
  { id: "gas_fuel",        label: "עמוק ועשיר",        icon: "🫙", color: "#FFA040",
    sub: "כמו גבינה מיושנת, קפה שרוף" },
];

const ZEMACH_SENSORY = {
  default:         "סמנ/י ריחות שאתה/את אוהב/ת, ואם יש כאלה שממש לא — גם זה חשוב. משפיע על מה שנמליץ 👃",
  gas_fuel:        "ריח עמוק ועשיר — מטופלים רבים עם פרופיל כזה מדווחים על הקלה בכאב 🫙",
  citrus_sharp:    "הדרים ורענן — הרבה מטופלים מקשרים את זה לשיפור מצב רוח ואנרגיה 🍋",
  earthy_musky:    "ריח אדמה ויער — מקושר לרוגע ולהרפיה 🌿",
  sweet_berry:     "מתוק ופירותי — עדין ולרוב מתאים לשעות ניטרליות ולרוגע 🍓",
  pine_fresh:      "ריח יער ואורנים — מקושר לריכוז ועירנות 🌲",
  floral_lavender: "פרחוני ולבנדר — מרגיע, מוכר בשינה ובהפגת חרדה 💜",
  spicy_pepper:    "תבלוני — מקושר להקלה בדלקות ובכאב כרוני 🌶️",
  tropical_mango:  "טרופי — עדין ורגוע, נפוץ בקרב מטופלים שמחפשים הרפיה 🥭",
};

// ── Stage 3b: Oil Effects (oil users — replaces flavor screen) ─────────────────
const OIL_EFFECT_TILES = [
  { id: "calm_body",    label: "רוגע בגוף",      icon: "🛋️", color: "#39FF85",
    sub: "הרפיה גופנית ושחרור מתח" },
  { id: "clear_head",   label: "ראש צלול",        icon: "🧠", color: "#40CFFF",
    sub: "פוקוס ובהירות מחשבתית" },
  { id: "deep_sleep",   label: "שינה עמוקה",      icon: "🌙", color: "#C084FC",
    sub: "להירדם ולהישאר ישנ/ה" },
  { id: "pain_relief",  label: "נגד כאב",         icon: "🩹", color: "#F87171",
    sub: "הקלה בכאב כרוני ודלקתי" },
  { id: "appetite",     label: "תיאבון",           icon: "🍽️", color: "#A3E635",
    sub: "עידוד אכילה ועיכול" },
  { id: "anxiety_calm", label: "רגיעה מחרדה",    icon: "💚", color: "#4ADE80",
    sub: "הרגעת חרדה ומתח נפשי" },
];

function Stage4_Sensory({ payload, errors, updatePayload }) {
  const isOilUser = payload.consumptionForm === "oil";

  // ── Oil: effects-based screen ─────────────────────────────────────────────
  if (isOilUser) {
    const selected = payload.oilEffects || [];
    const toggle   = (id) => {
      const next = selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id];
      updatePayload({ oilEffects: next });
    };
    const zemachMsg = selected.length > 0
      ? "מצוין! אנחנו לומדים מה עוזר לך — המפה שלך כבר מתעדכנת 🗺️"
      : "אין טעם בשמן? בוא נלך לפי מה שזה עושה לך 🌿 בחר/י מה עוזר או מה אתה/את מחפש/ת:";

    return (
      <motion.div variants={STAGGER} initial="hidden" animate="show">
        <motion.div variants={FADE_UP}>
          <AnimatePresence mode="wait">
            <ZemachBubble key={zemachMsg} message={zemachMsg} stage={3} />
          </AnimatePresence>
        </motion.div>
        <motion.div variants={FADE_UP}>
          <SectionLabel>מה עוזר לך? (בחר/י הכל שמתאים)</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {OIL_EFFECT_TILES.map((tile) => {
              const on = selected.includes(tile.id);
              return (
                <motion.button
                  key={tile.id}
                  onClick={() => toggle(tile.id)}
                  whileHover={{ scale: 1.03, boxShadow: `0 0 16px ${tile.color}44` }}
                  whileTap={{ scale: 0.93 }}
                  style={{
                    padding:       "10px 10px",
                    borderRadius:  14,
                    textAlign:     "right",
                    background:    on ? `${tile.color}16` : "rgba(255,255,255,0.04)",
                    border:        `1.5px solid ${on ? tile.color : T.border}`,
                    boxShadow:     on ? `0 0 12px ${tile.color}28` : "none",
                    cursor:        "pointer",
                    transition:    "all 0.18s",
                    minHeight:     64,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <span style={{ fontSize: 20, filter: on ? `drop-shadow(0 0 6px ${tile.color})` : "none", flexShrink: 0 }}>
                      {tile.icon}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: on ? 800 : 600, color: on ? tile.color : T.text, lineHeight: 1.2 }}>
                      {tile.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 9, color: T.muted, margin: 0 }}>{tile.sub}</p>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
        <motion.p variants={FADE_UP} style={{
          textAlign: "center", marginTop: 12, fontSize: 12,
          color: "rgba(187,247,208,0.45)",
        }}>
          לא בטוח? לחץ ״המשך״ למטה — אפשרי גם בלי לבחור 🌿
        </motion.p>
      </motion.div>
    );
  }

  // ── Flower / Vape / Mixed: taste screen — clear אהבתי / לא אהבתי per tile ───
  const scentSels = payload.scentSelections || {};

  const setLiked    = (id) => {
    const cur = scentSels[id];
    const updated = { ...scentSels };
    // second tap on the same button → clear it
    if (cur === "loved") delete updated[id];
    else updated[id] = "loved";
    updatePayload({ scentSelections: updated });
  };
  const setDisliked = (id) => {
    const cur = scentSels[id];
    const updated = { ...scentSels };
    if (cur === "disliked") delete updated[id];
    else updated[id] = "disliked";
    updatePayload({ scentSelections: updated });
  };

  const lastSelected = useMemo(() => {
    const entry = Object.entries(scentSels).findLast(([, v]) => v === "loved" || v === "disliked");
    return entry ? entry[0] : null;
  }, [scentSels]);

  const zemachMsg = lastSelected
    ? (ZEMACH_SENSORY[lastSelected] || ZEMACH_SENSORY.default)
    : ZEMACH_SENSORY.default;

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <AnimatePresence mode="wait">
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={4} />
        </AnimatePresence>
      </motion.div>

      <motion.div variants={FADE_UP}>
        <SectionLabel>אילו ריחות אתה/את אוהב/ת? (לא חייבים לבחור)</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {FLAVOR_TILES.map((tile) => {
            const state  = scentSels[tile.id];
            const isLove = state === "loved";
            const isDis  = state === "disliked";
            return (
              <motion.div
                key={tile.id}
                variants={FADE_UP}
                style={{
                  padding:       "9px 10px",
                  borderRadius:  13,
                  background:    isLove ? `${tile.color}12`
                               : isDis  ? "rgba(255,69,96,0.07)"
                               : "rgba(255,255,255,0.03)",
                  border:        `1.5px solid ${isLove ? tile.color : isDis ? T.danger : T.border}`,
                  transition:    "all 0.18s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                  <span style={{ fontSize: 20, flexShrink: 0,
                                 filter: (isLove || isDis) ? `drop-shadow(0 0 5px ${isLove ? tile.color : T.danger})` : "none" }}>
                    {tile.icon}
                  </span>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, margin: 0, lineHeight: 1.2,
                                color: isLove ? tile.color : isDis ? T.danger : T.text }}>
                      {tile.label}
                    </p>
                    <p style={{ fontSize: 9, color: T.muted, margin: 0 }}>{tile.sub}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    onClick={() => setLiked(tile.id)}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 8, fontSize: 10, fontWeight: 700,
                      background: isLove ? tile.color : `${tile.color}14`,
                      color:      isLove ? "#061006" : tile.color,
                      border:     `1px solid ${isLove ? tile.color : `${tile.color}44`}`,
                      cursor:     "pointer",
                    }}
                  >
                    {isLove ? "✓ אהבתי" : "❤️ אהבתי"}
                  </button>
                  <button
                    onClick={() => setDisliked(tile.id)}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 8, fontSize: 10, fontWeight: 700,
                      background: isDis ? T.danger : "rgba(255,69,96,0.1)",
                      color:      isDis ? "#fff" : T.danger,
                      border:     `1px solid ${isDis ? T.danger : "rgba(255,69,96,0.3)"}`,
                      cursor:     "pointer",
                    }}
                  >
                    {isDis ? "✕ לא אהבתי" : "🚫 לא אהבתי"}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* לא יודע / לא מבחין בטעם */}
        <motion.button
          variants={FADE_UP}
          onClick={() => updatePayload({ scentSelections: {} })}
          style={{
            width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 12,
            background: Object.keys(scentSels).length === 0 ? "rgba(57,255,133,0.08)" : "rgba(255,255,255,0.04)",
            border: `1.5px solid ${Object.keys(scentSels).length === 0 ? T.accent : T.border}`,
            color:      Object.keys(scentSels).length === 0 ? T.accent : T.muted,
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Heebo',sans-serif",
          }}
        >
          🤷 לא יודע / לא מבחין בריחות
        </motion.button>

        <motion.p variants={FADE_UP} style={{
          textAlign: "center", marginTop: 8, fontSize: 11,
          color: "rgba(187,247,208,0.45)",
        }}>
          לחץ ״המשך״ למטה — טעם הוא אופציונלי לחלוטין 🌿
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

// ── Stage 4: Circadian — 5-part day + primary goal ───────────────────────────
const TIME_SLOTS = [
  { id: "morning",   label: "בוקר",   icon: "🌅" },
  { id: "noon",      label: "צהריים", icon: "☀️" },
  { id: "afternoon", label: "אחה\"צ", icon: "🌤️" },
  { id: "evening",   label: "ערב",    icon: "🌆" },
  { id: "night",     label: "לילה",   icon: "🌙" },
];

const GOALS = [
  { id: "focus",       label: "ריכוז ואנרגיה", icon: "🎯", sub: "מפוקד ועירני" },
  { id: "relax",       label: "הרגעה",          icon: "😌", sub: "ריגוע ללא קהות" },
  { id: "sleep",       label: "שינה",            icon: "💤", sub: "שינה עמוקה" },
  { id: "pain_relief", label: "הקלת כאב",       icon: "💊", sub: "כאב כרוני" },
  { id: "mood",        label: "מצב רוח",         icon: "🌈", sub: "מרומם ושמח" },
];

const ZEMACH_CIRCADIAN = {
  default:   "ספר/י לי מתי בעיקר אתה/את משתמש/ת — ככה נוכל להמליץ על הזנים הנכונים לשעה הנכונה ⏰",
  morning:   "בוקר — נמצא לך זנים שמאפשרים תפקוד מלא ועירנות בלי ערפול ☀️",
  night:     "לילה — נמצא לך זנים מרגיעים ומיישנים שמתאימים לשעות הערב המאוחרות 🌙",
  both:      "כל שעות היום — נבנה לך פרופיל גמיש: זנים לתפקוד ביום וזנים לרוגע בלילה 🔄",
};

function Stage5_Circadian({ payload, errors, updatePayload }) {
  const timing      = payload.usageTiming  || [];
  const selGoals    = payload.primaryGoals || [];

  const toggleTiming = (id) => {
    const next = timing.includes(id) ? timing.filter((x) => x !== id) : [...timing, id];
    updatePayload({ usageTiming: next });
  };
  const toggleGoal = (id) => {
    const next = selGoals.includes(id) ? selGoals.filter((x) => x !== id) : [...selGoals, id];
    updatePayload({ primaryGoals: next });
  };

  const hasNight   = timing.some((t) => t === "night" || t === "evening");
  const hasMorning = timing.some((t) => t === "morning" || t === "noon" || t === "afternoon");

  const zemachMsg = useMemo(() => {
    if (hasMorning && hasNight) return ZEMACH_CIRCADIAN.both;
    if (hasNight)               return ZEMACH_CIRCADIAN.night;
    if (hasMorning)             return ZEMACH_CIRCADIAN.morning;
    return ZEMACH_CIRCADIAN.default;
  }, [hasMorning, hasNight]);

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <AnimatePresence mode="wait">
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={4} />
        </AnimatePresence>
      </motion.div>

      {/* 5-part time picker — no hour ranges */}
      <motion.div variants={FADE_UP}>
        <SectionLabel>מתי בעיקר אתה/את צורכ/ת? (ניתן לבחור כמה)</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {TIME_SLOTS.map((slot) => {
            const on = timing.includes(slot.id);
            return (
              <motion.button
                key={slot.id}
                onClick={() => toggleTiming(slot.id)}
                whileHover={{ scale: 1.05, boxShadow: `0 0 12px ${T.accent}33` }}
                whileTap={{ scale: 0.94 }}
                style={{
                  padding: "12px 4px", borderRadius: 12, textAlign: "center",
                  background: on ? "rgba(57,255,133,0.1)" : "rgba(255,255,255,0.04)",
                  border:     `1.5px solid ${on ? T.accent : T.border}`,
                  cursor:     "pointer",
                  boxShadow:  on ? T.glow(T.accent, 8) : "none",
                  minHeight:  60,
                  transition: "all 0.18s",
                }}
              >
                <p style={{ fontSize: 20, marginBottom: 4 }}>{slot.icon}</p>
                <p style={{ fontSize: 10, fontWeight: on ? 700 : 500, color: on ? T.accent : T.text, margin: 0 }}>
                  {slot.label}
                </p>
              </motion.button>
            );
          })}
        </div>
        <FieldError msg={errors.timing} />
      </motion.div>

      {/* Goals — now multi-select */}
      <motion.div variants={FADE_UP} style={{ marginTop: 12 }}>
        <SectionLabel>מה הכי חשוב לך? (ניתן לבחור כמה)</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
          {GOALS.map((g) => {
            const on = selGoals.includes(g.id);
            return (
              <motion.button
                key={g.id}
                onClick={() => toggleGoal(g.id)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding:      "9px 6px",
                  borderRadius: 12,
                  textAlign:    "center",
                  background:   on ? "rgba(57,255,133,0.1)" : "rgba(255,255,255,0.04)",
                  border:       `1.5px solid ${on ? T.accent : T.border}`,
                  cursor:       "pointer",
                  boxShadow:    on ? T.glow(T.accent, 6) : "none",
                  minHeight:    50,
                  transition:   "all 0.18s",
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
      </motion.div>
    </motion.div>
  );
}

// ── Stage 5: Full Catalog Products ────────────────────────────────────────────
// 300+ real Israeli pharmacy products: quick-picks + instant search + kind filter.

const ALL_CATALOG = [
  ...(PHARMARY_STRAINS   || []),
  ...(PHARMARY_STRAINS_2 || []),
  ...(PHARMARY_STRAINS_3 || []),
  ...(PHARMARY_STRAINS_4 || []),
];

// Icon by kind — no per-product icon needed
const KIND_ICON = { "אינדיקה": "🌙", "סאטיבה": "☀️", "היברידי": "🔀" };

const ZEMACH_PRODUCTS = {
  default: "איזה קופסאות מכירים מהמדף? מה שעזר — מחזק את המפה. מה שלא — נסנן. 🗺️",
  loved:   "מצוין! ✅ אנחנו נחפש מוצרים בעלי פרופיל דומה לך.",
  hated:   "קיבלתי 🚫 סיננתי את הפרופיל הזה מהמלצות שלך.",
};

function ProductCard({ s, isLoved, isHated, onLove, onHate }) {
  const col  = isLoved ? T.accent : isHated ? T.danger : T.border;
  const icon = KIND_ICON[s.kind] || "🌿";
  return (
    <motion.div
      variants={FADE_UP}
      style={{
        padding:     "9px",
        borderRadius: 12,
        background:  isLoved ? "rgba(57,255,133,0.08)"
                    : isHated ? "rgba(255,69,96,0.08)"
                    : "rgba(255,255,255,0.03)",
        border:      `1.5px solid ${col}`,
        boxShadow:   (isLoved || isHated) ? `0 0 10px ${col}33` : "none",
        transition:  "all 0.18s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1,
                       filter: (isLoved || isHated) ? `drop-shadow(0 0 4px ${col})` : "none" }}>
          {icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 11, fontWeight: 700, margin: 0, lineHeight: 1.3,
            color: isLoved ? T.accent : isHated ? T.danger : T.text,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {s.name}
          </p>
          <p style={{ fontSize: 9, color: T.muted, margin: 0 }}>
            {s.cat} · {s.kind}{s.grower ? ` · ${s.grower}` : ""}
          </p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <button
          onClick={onLove}
          style={{
            flex: 1, padding: "5px 0", borderRadius: 8, fontSize: 10, fontWeight: 700,
            background: isLoved ? T.accent : "rgba(57,255,133,0.08)",
            color:      isLoved ? "#061006" : T.accent,
            border:     `1px solid ${isLoved ? T.accent : "rgba(57,255,133,0.3)"}`,
            cursor:     "pointer",
          }}
        >
          {isLoved ? "✓ עזר" : "❤️ עזר"}
        </button>
        <button
          onClick={onHate}
          style={{
            flex: 1, padding: "5px 0", borderRadius: 8, fontSize: 10, fontWeight: 700,
            background: isHated ? T.danger : "rgba(255,69,96,0.08)",
            color:      isHated ? "#fff" : T.danger,
            border:     `1px solid ${isHated ? T.danger : "rgba(255,69,96,0.3)"}`,
            cursor:     "pointer",
          }}
        >
          {isHated ? "✕ לא עזר" : "💔 לא עזר"}
        </button>
      </div>
    </motion.div>
  );
}

function Stage6_Products({ payload, updatePayload }) {
  const [q, setQ]           = useState("");
  const [kindFilter, setKindFilter] = useState(null); // null | "אינדיקה" | "סאטיבה" | "היברידי"

  const loved = payload.lovedStrains || [];
  const hated = payload.hatedStrains || [];
  const licCats = payload.licenseCategories || [];

  // Filter catalog by license categories if the user provided them
  const eligibleCatalog = useMemo(() => {
    if (licCats.length === 0) return ALL_CATALOG;
    return ALL_CATALOG.filter((s) => licCats.includes(s.cat));
  }, [licCats]);

  // Quick picks: top 12 by nReviews (most-recognised at the pharmacy)
  const quickPicks = useMemo(() =>
    [...eligibleCatalog]
      .sort((a, b) => (b.nReviews || 0) - (a.nReviews || 0))
      .slice(0, 12),
  [eligibleCatalog]);

  // Search results — client-side across all eligible products
  const searchResults = useMemo(() => {
    if (!q.trim()) return [];
    const lq = q.trim().toLowerCase();
    return eligibleCatalog.filter((s) =>
      s.name.toLowerCase().includes(lq) ||
      (s.en || "").toLowerCase().includes(lq) ||
      (s.grower || "").toLowerCase().includes(lq) ||
      (s.cat || "").toLowerCase().includes(lq),
    ).slice(0, 20);
  }, [q, eligibleCatalog]);

  // Decide what to show in the grid
  const displayProducts = useMemo(() => {
    let list = q.trim() ? searchResults : quickPicks;
    if (kindFilter) list = list.filter((s) => s.kind === kindFilter);
    return list;
  }, [q, searchResults, quickPicks, kindFilter]);

  const zemachMsg = useMemo(() => {
    if (hated.length > 0) return ZEMACH_PRODUCTS.hated;
    if (loved.length > 0) return ZEMACH_PRODUCTS.loved;
    return ZEMACH_PRODUCTS.default;
  }, [loved, hated]);

  const setLoved = (id) => {
    if (loved.includes(id)) updatePayload({ lovedStrains: loved.filter((x) => x !== id) });
    else updatePayload({ lovedStrains: [...loved, id], hatedStrains: hated.filter((x) => x !== id) });
  };
  const setHated = (id) => {
    if (hated.includes(id)) updatePayload({ hatedStrains: hated.filter((x) => x !== id) });
    else updatePayload({ hatedStrains: [...hated, id], lovedStrains: loved.filter((x) => x !== id) });
  };

  const KINDS = ["אינדיקה", "סאטיבה", "היברידי"];

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <AnimatePresence mode="wait">
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={5} />
        </AnimatePresence>
      </motion.div>

      <motion.div variants={FADE_UP}>
        {/* Search */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חפש מתוך 300+ מוצרים — שם, מגדל, קטגוריה..."
            style={{
              width: "100%", padding: "10px 14px 10px 36px", borderRadius: 12,
              background: "rgba(255,255,255,0.06)", border: `1.5px solid ${q ? T.accent : T.border}`,
              color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box",
              transition: "border-color 0.18s",
            }}
          />
          <span style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: 14, pointerEvents: "none", color: T.muted,
          }}>🔍</span>
          {q && (
            <button
              onClick={() => setQ("")}
              style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                fontSize: 12, color: T.muted, background: "none", border: "none",
                cursor: "pointer", padding: "2px 6px",
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Kind filter chips */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button
            onClick={() => setKindFilter(null)}
            style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700,
              background: !kindFilter ? T.accent : "rgba(255,255,255,0.06)",
              color:      !kindFilter ? "#061006" : T.muted,
              border:     `1px solid ${!kindFilter ? T.accent : T.border}`,
              cursor:     "pointer",
            }}
          >הכל</button>
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(kindFilter === k ? null : k)}
              style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: kindFilter === k ? T.accent : "rgba(255,255,255,0.06)",
                color:      kindFilter === k ? "#061006" : T.muted,
                border:     `1px solid ${kindFilter === k ? T.accent : T.border}`,
                cursor:     "pointer",
              }}
            >
              {KIND_ICON[k]} {k}
            </button>
          ))}
        </div>

        {/* Section label */}
        <SectionLabel>
          {q.trim()
            ? `${displayProducts.length} תוצאות עבור "${q}"`
            : `הנפוצים ביותר${kindFilter ? ` · ${kindFilter}` : ""}${licCats.length > 0 ? ` (מסונן לקטגוריות שלך)` : ""}`}
        </SectionLabel>

        {/* Product grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {displayProducts.length === 0 ? (
            <motion.p
              variants={FADE_UP}
              style={{ gridColumn: "1/-1", textAlign: "center", color: T.muted, fontSize: 12, padding: "24px 0" }}
            >
              לא מצאנו מוצר בשם זה 🤷 נסה לחפש בשם אחר
            </motion.p>
          ) : (
            displayProducts.map((s) => (
              <ProductCard
                key={s.id}
                s={s}
                isLoved={loved.includes(s.id)}
                isHated={hated.includes(s.id)}
                onLove={() => setLoved(s.id)}
                onHate={() => setHated(s.id)}
              />
            ))
          )}
        </div>

        {/* Summary of selections */}
        {(loved.length > 0 || hated.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12,
                     background: "rgba(57,255,133,0.06)", border: `1px solid ${T.border}` }}
          >
            {loved.length > 0 && (
              <p style={{ fontSize: 11, color: T.accent, marginBottom: 2 }}>
                ❤️ עזר ({loved.length}): {loved.map((id) => ALL_CATALOG.find((s) => s.id === id)?.name).filter(Boolean).join(", ")}
              </p>
            )}
            {hated.length > 0 && (
              <p style={{ fontSize: 11, color: T.danger }}>
                💔 לא עזר ({hated.length}): {hated.map((id) => ALL_CATALOG.find((s) => s.id === id)?.name).filter(Boolean).join(", ")}
              </p>
            )}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Stage 6: Live Vector Preview — the "Aha!" moment ─────────────────────────
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
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={points.map((p) => {
            const angle = (TERP_ORDER.indexOf(p) / n) * 2 * Math.PI - Math.PI / 2;
            const r = f * maxR;
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
          }).join(" ")}
          fill="none"
          stroke="rgba(57,255,133,0.12)"
          strokeWidth={1}
        />
      ))}
      {points.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p.full.x} y2={p.full.y}
          stroke="rgba(57,255,133,0.10)" strokeWidth={1} />
      ))}
      <polygon points={outline} fill="none" stroke="rgba(57,255,133,0.08)" strokeWidth={1} />
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

function Stage7_Preview({ liveVector, killSwitches, payload }) {
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
          <ZemachBubble key="preview" message={zemachMsg} stage={7} />
        </AnimatePresence>
      </motion.div>

      <motion.div
        variants={FADE_UP}
        style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}
      >
        <div style={{ position: "relative" }}>
          <RadarChart liveVector={liveVector} killSwitches={killSwitches} size={220} />
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            textAlign: "center", pointerEvents: "none",
          }}>
            <p style={{ fontSize: 9, color: T.muted, letterSpacing: "0.1em" }}>DNA</p>
          </div>
        </div>
      </motion.div>

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

    // Build terpWeights — feeds ALL new onboarding signals into the scoring engine
    // so changing conditions / effects / timing / goals actually changes the results.
    const OIL_EFFECT_W = {
      calm_body:    { myrcene: 1.4, linalool: 0.8, humulene: 0.5 },
      clear_head:   { pinene: 1.4, limonene: 1.0, terpinolene: 0.6 },
      deep_sleep:   { myrcene: 1.6, linalool: 1.2, caryophyllene: 0.4 },
      pain_relief:  { caryophyllene: 1.5, myrcene: 0.9, humulene: 0.7 },
      appetite:     { myrcene: 1.2, humulene: 0.8, limonene: 0.5 },
      anxiety_calm: { linalool: 1.3, limonene: 1.0, caryophyllene: 0.4 },
    };
    const PRIMARY_GOAL_W = {
      focus:      { pinene: 0.9, limonene: 0.7 },
      relax:      { linalool: 0.9, myrcene: 0.7 },
      sleep:      { myrcene: 1.1, linalool: 0.9 },
      pain_relief:{ caryophyllene: 1.1, myrcene: 0.8 },
      mood:       { limonene: 1.1, linalool: 0.6 },
    };
    const TIMING_W = {
      morning:   { pinene: 0.7, limonene: 0.5 },
      noon:      { pinene: 0.5, terpinolene: 0.5 },
      afternoon: { limonene: 0.4, terpinolene: 0.3 },
      evening:   { linalool: 0.6, myrcene: 0.5 },
      night:     { myrcene: 1.0, linalool: 0.8 },
    };

    const terpWeights = {};
    const addTW = (t, v) => { terpWeights[t] = (terpWeights[t] || 0) + v; };

    // From oil effects
    for (const e of (payload.oilEffects || [])) {
      for (const [t, w] of Object.entries(OIL_EFFECT_W[e] || {})) addTW(t, w);
    }
    // From timing
    for (const slot of (payload.usageTiming || [])) {
      for (const [t, w] of Object.entries(TIMING_W[slot] || {})) addTW(t, w);
    }
    // From primary goals (multi-select, scale down when many)
    const pgScale = (payload.primaryGoals || []).length > 1 ? 0.65 : 1.0;
    for (const g of (payload.primaryGoals || [])) {
      for (const [t, w] of Object.entries(PRIMARY_GOAL_W[g] || {})) addTW(t, w * pgScale);
    }
    // From medical condition profiles (already loaded at top of wizard)
    const condScale = (payload.medicalConditions || []).length > 2 ? 0.6
                    : (payload.medicalConditions || []).length > 1 ? 0.8 : 1.0;
    // Import lazily to avoid circular — use inline mini-map for the engine path
    const COND_TERP_W = {
      chronic_pain:    { caryophyllene: 1.4, myrcene: 1.1, humulene: 0.8 },
      neuropathic:     { caryophyllene: 1.3, linalool: 0.9, myrcene: 0.8 },
      oncology:        { myrcene: 1.2, limonene: 0.9, caryophyllene: 0.7 },
      nausea_vomiting: { limonene: 1.2, terpinolene: 0.7, myrcene: 0.6 },
      ibd:             { caryophyllene: 1.3, myrcene: 0.8, humulene: 0.7 },
      ms:              { myrcene: 1.0, linalool: 0.9, caryophyllene: 0.8 },
      parkinsons:      { linalool: 1.1, limonene: 0.9, myrcene: 0.8 },
      epilepsy:        { linalool: 1.4, myrcene: 0.8, caryophyllene: 0.5 },
      tourette:        { myrcene: 1.1, linalool: 0.9, caryophyllene: 0.6 },
      ptsd:            { linalool: 1.3, limonene: 1.0, caryophyllene: 0.7 },
      autism:          { linalool: 1.2, myrcene: 0.9, limonene: 0.7 },
      fibromyalgia:    { myrcene: 1.2, caryophyllene: 1.0, linalool: 0.8 },
      aids:            { myrcene: 1.0, limonene: 0.8, caryophyllene: 0.7 },
      glaucoma:        { myrcene: 0.9, caryophyllene: 0.7 },
      dementia:        { linalool: 1.1, limonene: 0.9, myrcene: 0.8 },
      palliative:      { myrcene: 1.3, linalool: 1.0, caryophyllene: 0.9 },
      heart_failure:   { linalool: 1.0, myrcene: 0.8 },
    };
    for (const c of (payload.medicalConditions || [])) {
      for (const [t, w] of Object.entries(COND_TERP_W[c] || {})) addTW(t, w * condScale);
    }

    // Derive delivery method from consumptionForm for backward compat with scoring engine
    const formToDelivery = {
      flower: ["smoke"],
      oil:    ["oil"],
      vape:   ["vaping"],
      mixed:  ["vaping", "oil"],
    };
    const derivedDelivery = formToDelivery[payload.consumptionForm] || [];

    const localAns = {
      cats:      payload.licenseCategories || [],
      form:      derivedDelivery.map((m) => m === "vaping" ? "אידוי" : m === "oil" ? "שמן" : "עישון"),
      reasons:   localReasons,
      flavors:   Object.entries(payload.scentSelections || {})
                  .filter(([, v]) => v !== "disliked")
                  .map(([id]) => FLAVOR_TO_LOCAL[id] || id),
      terpWeights,  // pre-computed from conditions + oilEffects + timing + primaryGoals
      medicalConditions: payload.medicalConditions || [],
      oilEffects:        payload.oilEffects    || [],
      primaryGoals:      payload.primaryGoals  || [],
      helped:       payload.lovedStrains  || [],
      notHelped:    payload.hatedStrains  || [],
      current:      [],
      licenseVerified: payload.licenseVerified || false,
      licenseExpiry:   payload.licenseExpiry   || null,
    };

    let dna = null;
    try {
      const data = await api.submitOnboarding({ ...payload, deliveryMethods: derivedDelivery });
      dna = data.dna;
    } catch (err) {
      console.warn("Onboarding backend sync skipped:", err.message);
    }

    setSaving(false);
    onComplete({ localAns, dna });
  }, [payload, onComplete]);

  const stageTitles = [
    "אימות רישיון",
    "דרך צריכה",
    "מצב רפואי",
    "מטרות ויעדים",
    "ארומות ותחושות",
    "שגרת השימוש",
    "מוצרים מהעבר",
    "הפרופיל שלך",
  ];
  const stageSubtitles = [
    "בוא נוודא שאתה מורשה",
    "איך אתה/את צורכ/ת?",
    "לאיזה מצב קיבלת אישור?",
    "מה אתה/את מחפש/ת מהקנאביס שלך",
    payload.consumptionForm === "oil"
      ? "מה עוזר לך — מה אתה/את מרגיש/ה?"
      : "אילו ריחות אתה/את אוהב/ת ולא אוהב/ת",
    "מתי צורכ/ת ומה הכי חשוב לך?",
    "מוצרים שכבר ניסית — מה עבד ומה לא",
    "הפרופיל שלך מוכן לסריקת התפריט",
  ];

  const isLastStage = stage === totalStages - 1;

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
              שלב {stage + 1} מתוך {totalStages} — {stageTitles[stage]}
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
        <p style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>{stageSubtitles[stage]}</p>
        <ProgressBar stage={stage} total={totalStages} />
      </div>

      {/* Stage content */}
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
            {stage === 0 && <Stage0_License        payload={payload} errors={errors} updatePayload={updatePayload} />}
            {stage === 1 && <Stage1_ConsumptionForm payload={payload} errors={errors} updatePayload={updatePayload} />}
            {stage === 2 && <Stage2_Conditions      payload={payload} errors={errors} updatePayload={updatePayload} />}
            {stage === 3 && <Stage3_Goals           payload={payload} errors={errors} updatePayload={updatePayload} />}
            {stage === 4 && <Stage4_Sensory         payload={payload} errors={errors} updatePayload={updatePayload} />}
            {stage === 5 && <Stage5_Circadian       payload={payload} errors={errors} updatePayload={updatePayload} />}
            {stage === 6 && <Stage6_Products        payload={payload} updatePayload={updatePayload} />}
            {stage === 7 && (
              <Stage7_Preview
                liveVector={liveVector}
                killSwitches={killSwitches}
                payload={payload}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Per-stage skip */}
      {stage < totalStages - 1 && (
        <div style={{ padding: "6px 18px 0", flexShrink: 0, textAlign: "center" }}>
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

      {/* Navigation */}
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
