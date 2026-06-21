// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — "Dynamic DNA Laboratory" Onboarding Wizard
//  7-Stage cinematic experience. Framer Motion + Cyberpunk/Sci-Fi theme.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOnboardingStore, STAGE_NAMES } from "../hooks/useOnboardingStore.js";
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

function Stage2_Goals({ payload, errors, updatePayload }) {
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
  { id: "gas_fuel",        label: "גז / דלק",        icon: "⛽", color: "#FFA040",
    sub: "כבד ופאנקי",    terps: "קריופילן · מירצן" },
  { id: "citrus_sharp",    label: "הדרים / חד",       icon: "🍋", color: "#FFE040",
    sub: "מרענן וחד",     terps: "לימונן · פינן" },
  { id: "earthy_musky",   label: "אדמתי / מוסקי",    icon: "🌍", color: "#8B6914",
    sub: "עמוק ואדמתי",  terps: "מירצן · הומולן" },
  { id: "sweet_berry",     label: "מתוק / פירות יער", icon: "🍓", color: "#FF6B8A",
    sub: "פירותי ומתוק",  terps: "לינלול · לימונן" },
  { id: "pine_fresh",      label: "אורן / רענן",      icon: "🌲", color: "#39FF85",
    sub: "יערי וצלול",   terps: "פינן · טרפינולן" },
  { id: "floral_lavender", label: "פרחוני / לבנדר",  icon: "💜", color: "#C855FF",
    sub: "עדין ורגוע",   terps: "לינלול · אוסימן" },
  { id: "spicy_pepper",    label: "תבלוני / פלפלי",   icon: "🌶️", color: "#FF4560",
    sub: "נגד-דלקת",     terps: "קריופילן · הומולן" },
  { id: "tropical_mango",  label: "טרופי / מנגו",    icon: "🥭", color: "#40CFFF",
    sub: "אקזוטי ורענן", terps: "מירצן · אוסימן" },
];

const ZEMACH_SENSORY = {
  default:         "בחר/י את הריחות שאתה/את אוהב/ת — ולא אוהב/ת. זה עוזר לנו לדייק עבורך בסריקת התפריט 👃",
  gas_fuel:        "ריח כבד וחריף — הרבה מטופלים עם זנים כאלה מדווחים על הקלה בכאב. Diesel, Chemdawg ועוד 🤌",
  citrus_sharp:    "הדרים וחד — ריח מרענן שמרבה מטופלים מקשרים לשיפור מצב רוח ואנרגיה 🍋",
  earthy_musky:    "אדמתי ועמוק — ריח שמרבה מטופלים מקשרים להרפיה ולהקלת כאב 🌿",
  sweet_berry:     "מתוק ופירותי — ריח עדין שמרבה מטופלים אוהבים לפנאי ולרוגע 💜",
  pine_fresh:      "יערי ואורן — ריח צלול שמרבה מטופלים מקשרים לריכוז ועירנות 🌲",
  floral_lavender: "פרחוני ולבנדר — ריח מרגיע ועדין, נפוץ אצל מטופלים שמחפשים שינה ורוגע 💆",
  spicy_pepper:    "תבלוני ופלפלי — ריח נועז שמרבה מטופלים מקשרים להקלה בדלקות ובכאב 🌶️",
  tropical_mango:  "טרופי ומנגו — ריח מתוק ואקזוטי, מועדף על מטופלים שמחפשים הרפיה נעימה 🥭",
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

function Stage3_Sensory({ payload, errors, updatePayload }) {
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

  // ── Flower / Vape / Mixed: original flavor screen ─────────────────────────
  const scentSels = payload.scentSelections || {};

  const cycle = (id) => {
    const cur = scentSels[id];
    let next;
    if (!cur)                   next = "liked";
    else if (cur === "liked")   next = "loved";
    else if (cur === "loved")   next = "disliked";
    else                        next = undefined;
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
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={3} />
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
        <motion.p variants={FADE_UP} style={{
          textAlign: "center", marginTop: 12, fontSize: 12,
          color: "rgba(187,247,208,0.45)", cursor: "default",
        }}>
          לא בטוח? לחץ ״המשך״ למטה — טעם הוא אופציונלי 🌿
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

function Stage4_Circadian({ payload, errors, updatePayload }) {
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

// ── Stage 5: Real Market Products ─────────────────────────────────────────────
// Real Israeli pharmacy product names filtered by consumption form.
// Scored by: עזר (helped) / לא עזר (didn't help) — same UI as original genetics stage.

const REAL_PRODUCTS = {
  flower: [
    { id: "pz_t22",     name: "פי&זד T22/C4",           icon: "🌸", sub: "אינדיקה · THC גבוה",      mood: "מרגיע עמוק לערב" },
    { id: "vector_t18", name: "וקטור T18/C3",           icon: "💜", sub: "אינדיקה · THC בינוני-גבוה", mood: "מרגיע ומסייע לשינה" },
    { id: "or_t15",     name: "אור T15/C3",             icon: "✨", sub: "אינדיקה · THC בינוני",      mood: "מאוזן ומרגיע" },
    { id: "gal_t10",    name: "גל T10/C10",             icon: "🌊", sub: "היברידי · מאוזן",           mood: "מאוזן יום וערב" },
    { id: "shoham",     name: "שוהם T10/C2",            icon: "💎", sub: "אינדיקה · T10",             mood: "מרגיע ולשינה" },
    { id: "techelet",   name: "תכלת T22/C4",            icon: "💙", sub: "סאטיבה · THC גבוה",         mood: "מרים ואנרגטי ביום" },
    { id: "yellow_sf",  name: "ילו סאנפלאוור T15/C3",  icon: "🌻", sub: "סאטיבה · T15",              mood: "עירני ומרוכז ביום" },
    { id: "green_cl",   name: "גרין קלובר T10/C2",     icon: "🍀", sub: "היברידי · T10",             mood: "מאוזן ויציב" },
    { id: "special",    name: "ספיישל טי T10/C10",     icon: "⭐", sub: "היברידי · מאוזן",            mood: "מאוזן לכל שעה" },
    { id: "tranquila",  name: "טרנקילה T3/C15",        icon: "💚", sub: "היברידי · CBD גבוה",         mood: "CBD דומיננטי ליום" },
    { id: "ninio",      name: "ניניה T15/C3",           icon: "🌺", sub: "אינדיקה · T15",             mood: "מרגיע ולשינה" },
    { id: "ari",        name: "ארי T3/C15",             icon: "🦁", sub: "סאטיבה · CBD גבוה",          mood: "CBD גבוה, עדין" },
  ],
  oil: [
    { id: "oil_120",    name: "שמן 1/20",               icon: "💧", sub: "T1/C20 · CBD גבוה מאוד",    mood: "CBD טהור כמעט" },
    { id: "oil_110",    name: "שמן 1/10",               icon: "🌊", sub: "T2/C20 · CBD דומיננטי",     mood: "CBD עם מעט THC" },
    { id: "oil_11",     name: "שמן 1/1 T10/C10",        icon: "⚖️", sub: "T10/C10 · מאוזן",          mood: "THC ו-CBD שווים" },
    { id: "oil_t15",    name: "שמן T15/C3",             icon: "🌿", sub: "T15/C3 · THC בינוני",        mood: "THC בינוני, מאוזן" },
    { id: "oil_t20",    name: "שמן T20/C4",             icon: "💎", sub: "T20/C4 · THC גבוה",          mood: "THC דומיננטי לערב" },
    { id: "oil_cbd",    name: "שמן T3/C15",             icon: "💚", sub: "T3/C15 · CBD גבוה",           mood: "CBD גבוה ליום" },
  ],
  vape: [
    { id: "vape_pz",    name: "קרטרידג' פי&זד T22",    icon: "💨", sub: "אינדיקה · T22",             mood: "מרגיע עמוק" },
    { id: "vape_tech",  name: "קרטרידג' תכלת T22",     icon: "💙", sub: "סאטיבה · T22",              mood: "מרים ואנרגטי" },
    { id: "vape_or",    name: "מאדה אור T15",           icon: "✨", sub: "אינדיקה · T15",             mood: "מאוזן" },
    { id: "vape_yellow",name: "מאדה ילו T15",          icon: "🌻", sub: "סאטיבה · T15",              mood: "עירני ביום" },
    { id: "vape_gal",   name: "מאדה גל T10/C10",       icon: "🌊", sub: "היברידי · מאוזן",           mood: "מאוזן יום וערב" },
    { id: "vape_green", name: "מאדה גרין קלובר T10",   icon: "🍀", sub: "היברידי · T10",             mood: "מאוזן ויציב" },
  ],
};
REAL_PRODUCTS.mixed = [
  ...REAL_PRODUCTS.flower.slice(0, 4),
  ...REAL_PRODUCTS.oil.slice(0, 3),
  ...REAL_PRODUCTS.vape.slice(0, 3),
];

const ZEMACH_PRODUCTS = {
  default: "איזה מוצרים ניסית? מה שעזר — חיזק את המפה. מה שלא — נסנן אותו. 🗺️",
  loved:   "מצוין! נרשם ✅ אנחנו נחפש מוצרים בעלי פרופיל דומה.",
  hated:   "הבנתי 🚫 סיננתי את הפרופיל הזה מהמלצות שלך.",
};

function Stage5_Products({ payload, updatePayload }) {
  const [q, setQ]     = useState("");
  const loved  = payload.lovedStrains  || [];
  const hated  = payload.hatedStrains  || [];
  const form   = payload.consumptionForm || "flower";

  const products = REAL_PRODUCTS[form] || REAL_PRODUCTS.flower;

  const zemachMsg = useMemo(() => {
    if (hated.length > 0) return ZEMACH_PRODUCTS.hated;
    if (loved.length > 0) return ZEMACH_PRODUCTS.loved;
    return ZEMACH_PRODUCTS.default;
  }, [loved, hated]);

  const setLoved = (id) => {
    if (loved.includes(id)) {
      updatePayload({ lovedStrains: loved.filter((x) => x !== id) });
    } else {
      updatePayload({ lovedStrains: [...loved, id], hatedStrains: hated.filter((x) => x !== id) });
    }
  };
  const setHated = (id) => {
    if (hated.includes(id)) {
      updatePayload({ hatedStrains: hated.filter((x) => x !== id) });
    } else {
      updatePayload({ hatedStrains: [...hated, id], lovedStrains: loved.filter((x) => x !== id) });
    }
  };

  const filtered = products.filter(
    (s) => !q || s.name.includes(q) || s.mood.includes(q) || s.sub.includes(q),
  );

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      <motion.div variants={FADE_UP}>
        <AnimatePresence mode="wait">
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={5} />
        </AnimatePresence>
      </motion.div>

      <motion.div variants={FADE_UP}>
        <SectionLabel>מוצרים שכבר ניסית — מה עבד ומה לא?</SectionLabel>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="לא מצאת? חפש מתוך כל המוצרים..."
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
                  <span style={{ fontSize: 18, filter: `drop-shadow(0 0 5px ${col}88)`, flexShrink: 0 }}>{s.icon}</span>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: isLoved ? T.accent : isHated ? T.danger : T.text, margin: 0, lineHeight: 1.3 }}>
                      {s.name}
                    </p>
                    <p style={{ fontSize: 9, color: T.muted, margin: 0 }}>{s.sub}</p>
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
                    {isLoved ? "✓ עזר" : "❤️ עזר"}
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
                    {isHated ? "✕ לא עזר" : "💔 לא עזר"}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
        {(loved.length > 0 || hated.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12,
                     background: "rgba(57,255,133,0.06)", border: `1px solid ${T.border}` }}
          >
            {loved.length > 0 && (
              <p style={{ fontSize: 12, color: T.accent, marginBottom: 2 }}>
                ❤️ עזר: {loved.map((id) => products.find((s) => s.id === id)?.name).filter(Boolean).join(", ")}
              </p>
            )}
            {hated.length > 0 && (
              <p style={{ fontSize: 12, color: T.danger }}>
                💔 לא עזר: {hated.map((id) => products.find((s) => s.id === id)?.name).filter(Boolean).join(", ")}
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

function Stage6_Preview({ liveVector, killSwitches, payload }) {
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
          <ZemachBubble key="preview" message={zemachMsg} stage={6} />
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
      oilEffects:   payload.oilEffects    || [],
      primaryGoals: payload.primaryGoals  || [],
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
    "מטרות ויעדים",
    "ארומות ותחושות",
    "שגרת השימוש",
    "מוצרים מהעבר",
    "הפרופיל שלך",
  ];
  const stageSubtitles = [
    "בוא נוודא שאתה מורשה",
    "איך אתה/את צורכ/ת?",
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
            {stage === 0 && <Stage0_License   payload={payload} errors={errors} updatePayload={updatePayload} />}
            {stage === 1 && <Stage1_ConsumptionForm payload={payload} errors={errors} updatePayload={updatePayload} />}
            {stage === 2 && <Stage2_Goals     payload={payload} errors={errors} updatePayload={updatePayload} />}
            {stage === 3 && <Stage3_Sensory   payload={payload} errors={errors} updatePayload={updatePayload} />}
            {stage === 4 && <Stage4_Circadian payload={payload} errors={errors} updatePayload={updatePayload} />}
            {stage === 5 && <Stage5_Products  payload={payload} updatePayload={updatePayload} />}
            {stage === 6 && (
              <Stage6_Preview
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
