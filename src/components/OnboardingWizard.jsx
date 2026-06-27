// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — "Dynamic DNA Laboratory" Onboarding Wizard
//  7-Stage cinematic experience. Framer Motion + Cyberpunk/Sci-Fi theme.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "../hooks/useReducedMotion.js";
import { useOnboardingStore, STAGE_NAMES } from "../hooks/useOnboardingStore.js";
import { api } from "../services/api.js";
import {
  hashLicenseId, isValidIsraeliId, isLicenseExpired,
  stripExif, storeLicenseMeta, getStoredLicenseHash,
} from "../lib/licenseUtils.js";
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
// MOH Procedure 106 (post-July-2024) T/C categories — single source of truth.
// Grouped: עתיר THC → מאוזן → עתיר CBD
export const LICENSE_CATEGORY_GROUPS = [
  {
    label: "עתיר THC",
    color: "#FFA040",
    cats:  ["T22/C4", "T18/C3", "T15/C3", "T12/C2", "T10/C2"],
  },
  {
    label: "מאוזן",
    color: "#39FF85",
    cats:  ["T12/C12", "T10/C10", "T8/C8", "T5/C5", "T1/C1"],
  },
  {
    label: "עתיר CBD",
    color: "#40CFFF",
    cats:  ["T5/C10", "T3/C12", "T3/C15", "T3/C18", "T1/C22", "T0/C26"],
  },
];
// Flat list for validation / filtering
const LICENSE_CATEGORIES = LICENSE_CATEGORY_GROUPS.flatMap((g) => g.cats);

// Parse raw Tesseract text for Israeli cannabis license fields.
// Returns { cats: string[], expiry: string|null, grams: number|null, licenseId: string|null }
function parseLicenseOCR(text) {
  const upper = text.toUpperCase();

  // T/C category patterns: T22/C4, T18/C3 etc. — also match with spaces or Hebrew slashes
  const catRegex = /T\s*(\d{1,2})\s*[\/\\]\s*C\s*(\d{1,2})/gi;
  const cats = [];
  let m;
  while ((m = catRegex.exec(upper)) !== null) {
    const cat = `T${m[1]}/C${m[2]}`;
    if (LICENSE_CATEGORIES.includes(cat) && !cats.includes(cat)) cats.push(cat);
  }

  // Expiry date: DD.MM.YYYY / DD/MM/YYYY / YYYY-MM-DD
  let expiry = null;
  const isoMatch = text.match(/(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})/);
  if (isoMatch) {
    const [, y, mo, d] = isoMatch;
    if (parseInt(y) > 2024) expiry = `${y}-${mo}-${d}`;
  }
  if (!expiry) {
    const dmyMatch = text.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);
    if (dmyMatch) {
      let [, d, mo, y] = dmyMatch;
      if (y.length === 2) y = `20${y}`;
      if (parseInt(y) > 2024 && parseInt(mo) <= 12 && parseInt(d) <= 31)
        expiry = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }
  }

  // Monthly grams: "50 גרם" / "50g" / "כמות: 50"
  let grams = null;
  const gramsMatch = text.match(/(\d{2,3})\s*(?:גרם|g\b)/i);
  if (gramsMatch) grams = parseInt(gramsMatch[1]);

  // Israeli ID / license number: 7–9 consecutive digits (avoid matching T/C, dates, grams)
  const idCandidates = [...text.matchAll(/\b(\d{7,9})\b/g)];
  const licenseId = idCandidates
    .map((r) => r[1])
    .find((n) => !cats.some((c) => c.includes(n)) && !expiry?.replace(/-/g,'').includes(n))
    || null;

  return { cats, expiry, grams, licenseId };
}

function Stage0_License({ payload, errors, updatePayload, onSkip }) {
  const [mode, setMode]               = useState(null); // null | "manual" | "ocr-confirm" | "ocr-fail" | "expired" | "duplicate"
  const [scanning, setScanning]       = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [detectedCats, setDetectedCats] = useState([]);
  const [detectedExpiry, setDetectedExpiry] = useState(null);
  const [idWarn, setIdWarn]           = useState(false); // OCR read an ID but check-digit failed
  const [localGrams, setLocalGrams]   = useState({});
  const fileRef                       = useRef(null);

  const handleGramChange = (cat, raw) => {
    const v = parseInt(raw) || 0;
    const next = { ...localGrams, [cat]: v };
    setLocalGrams(next);
    updatePayload({ gramsByCategory: next });
  };

  // GramTotal — used after OCR mode to show a summary with inputs per category
  const GramInputs = ({ cats }) => {
    if (cats.length === 0) return null;
    const total = cats.reduce((s, c) => s + (localGrams[c] || 0), 0);
    return (
      <motion.div variants={FADE_UP} style={{
        marginTop: 16, padding: "14px 16px", borderRadius: 16,
        background: "rgba(57,255,133,0.05)", border: `1.5px solid ${T.accent}33`,
      }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: T.accent, marginBottom: 12, letterSpacing: "0.04em" }}>
          📋 כמה גרם לחודש לפי קטגוריה?
        </p>
        {cats.map(cat => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.text }}>{cat}</span>
            <input
              type="number" min="0" max="200" step="10"
              placeholder="0"
              value={localGrams[cat] ?? ""}
              onChange={e => handleGramChange(cat, e.target.value)}
              style={{
                width: 76, textAlign: "center",
                background: "rgba(57,255,133,0.07)",
                border: `1.5px solid ${T.accent}55`,
                borderRadius: 10, color: T.text,
                fontSize: 16, fontWeight: 800, padding: "6px 8px",
                fontFamily: "'Heebo',sans-serif",
              }}
            />
            <span style={{ fontSize: 11, color: T.muted, minWidth: 20 }}>ג׳</span>
          </div>
        ))}
        <div style={{
          borderTop: `1px solid ${T.border}`, marginTop: 8, paddingTop: 10,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: T.muted }}>סה״כ חודשי:</span>
          <span style={{ fontSize: 17, fontWeight: 900, color: total > 0 ? T.accent : T.muted,
                         fontFamily: "'Heebo',sans-serif" }}>
            {total} ג׳ לחודש
          </span>
        </div>
        <p style={{ fontSize: 10, color: T.muted, marginTop: 8 }}>
          לא בטוח/ה? השאר/י 0 — ניתן לעדכן בסל הקנייה
        </p>
      </motion.div>
    );
  };

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
    setScanProgress(0);
    setIdWarn(false);
    try {
      // 1. Strip EXIF/GPS metadata before OCR — never process raw phone photos
      const cleanFile = await stripExif(file);

      // 2. OCR — Hebrew + English, fully offline after first cache
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["heb", "eng"], 1, {
        logger: ({ status, progress }) => {
          if (status === "recognizing text") setScanProgress(Math.round((progress || 0) * 100));
        },
      });
      const { data: { text } } = await worker.recognize(cleanFile);
      await worker.terminate();
      // Image is not kept — only text is used going forward

      const { cats, expiry, grams, licenseId } = parseLicenseOCR(text);

      // 3. Reject already-expired licenses before they enter the system
      if (expiry && isLicenseExpired(expiry)) {
        setMode("expired");
        return;
      }

      // 4. If we got an ID, hash it and check for duplicates
      let idHash = null;
      if (licenseId) {
        // Warn if check-digit fails (OCR can mangle digits) but don't hard-block
        if (!isValidIsraeliId(licenseId)) setIdWarn(true);
        idHash = await hashLicenseId(licenseId);
        const existingHash = getStoredLicenseHash();
        if (existingHash && existingHash === idHash) {
          setMode("duplicate");
          return;
        }
      }

      if (cats.length > 0) {
        setDetectedCats(cats);
        setDetectedExpiry(expiry);
        // Store hash + meta (NOT raw ID); image already discarded above
        storeLicenseMeta({ idHash, expiry, cats });
        updatePayload({ licenseVerified: true, licenseExpiry: expiry, licenseCategories: cats,
                        licenseGrams: grams });
        setMode("ocr-confirm");
      } else {
        // OCR ran but found no categories — let user enter manually
        if (expiry) updatePayload({ licenseExpiry: expiry });
        setMode("ocr-fail");
      }
    } catch (err) {
      console.warn("OCR error:", err);
      setMode("ocr-fail");
    } finally {
      setScanning(false);
      setScanProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Expired license — rejected at upload
  if (mode === "expired") {
    return (
      <motion.div variants={STAGGER} initial="hidden" animate="show">
        <motion.div variants={FADE_UP}>
          <ZemachBubble message="הרישיון שזיהיתי פג תוקף 🛑 לא ניתן לאמת רישיון שפג. אנא חדשו את הרישיון ונסו שוב." stage={0} />
        </motion.div>
        <motion.div variants={FADE_UP} style={{ display: "flex", gap: 8 }}>
          <NeonButton size="md" onClick={() => setMode(null)}>← נסה שוב</NeonButton>
          <NeonButton size="md" variant="ghost" onClick={onSkip}>דלג לעכשיו</NeonButton>
        </motion.div>
      </motion.div>
    );
  }

  // Duplicate license — already registered
  if (mode === "duplicate") {
    return (
      <motion.div variants={STAGGER} initial="hidden" animate="show">
        <motion.div variants={FADE_UP}>
          <ZemachBubble message="הרישיון הזה כבר רשום במערכת 🔒 אם מדובר בטעות, פנו לתמיכה." stage={0} />
        </motion.div>
        <motion.div variants={FADE_UP} style={{ display: "flex", gap: 8 }}>
          <NeonButton size="md" onClick={() => setMode(null)}>← נסה שוב</NeonButton>
          <NeonButton size="md" variant="ghost" onClick={onSkip}>דלג לעכשיו</NeonButton>
        </motion.div>
      </motion.div>
    );
  }

  // OCR ran but found no categories
  if (mode === "ocr-fail") {
    return (
      <motion.div variants={STAGGER} initial="hidden" animate="show">
        <motion.div variants={FADE_UP}>
          <ZemachBubble message="הסריקה רצה אבל לא הצלחתי לזהות קטגוריות T/C בתמונה. לא נורא — בחר/י ידנית 📋" stage={0} />
        </motion.div>
        <motion.div variants={FADE_UP} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <NeonButton size="md" onClick={() => setMode("manual")}>
            הזנה ידנית ✍️
          </NeonButton>
          <NeonButton variant="ghost" size="md" onClick={() => { fileRef.current?.click(); setMode(null); }}>
            נסה שוב 📸
          </NeonButton>
        </motion.div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
      </motion.div>
    );
  }

  // OCR confirmation screen
  if (mode === "ocr-confirm") {
    return (
      <motion.div variants={STAGGER} initial="hidden" animate="show">
        <motion.div variants={FADE_UP}>
          <ZemachBubble message="זיהיתי את הרישיון שלך! בדוק/י שהמידע נכון 🪪" stage={0} />
        </motion.div>
        <motion.div variants={FADE_UP} style={{
          padding: "16px", borderRadius: 16,
          background: "rgba(57,255,133,0.06)", border: `1.5px solid ${T.accent}44`,
          marginBottom: 12,
        }}>
          <p style={{ fontSize: 13, color: T.accent, fontWeight: 700, marginBottom: 4 }}>
            זיהיתי ברישיון:
          </p>
          <p style={{ fontSize: 15, color: T.text, fontWeight: 800, marginBottom: 4 }}>
            {detectedCats.join("  ·  ")}
          </p>
          {detectedExpiry && (
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>
              📅 תוקף: {detectedExpiry}
            </p>
          )}
          {idWarn && (
            <p style={{ fontSize: 10, color: "#FBBF24", marginBottom: 4 }}>
              ⚠️ מספר הרישיון שנקרא לא עבר בדיקת פורמט — בדקו שהתמונה ברורה
            </p>
          )}
          <GramInputs cats={detectedCats} />
          <p style={{ fontSize: 12, color: T.muted, marginBottom: 10, marginTop: 10 }}>— נכון?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <NeonButton size="md"
              onClick={() => { updatePayload({ licenseCategories: detectedCats, licenseVerified: true }); setMode(null); }}
            >
              כן, נכון ✓
            </NeonButton>
            <NeonButton variant="ghost" size="md"
              onClick={() => { updatePayload({ licenseCategories: detectedCats }); setMode("manual"); }}
            >
              אני אתקן
            </NeonButton>
          </div>
        </motion.div>
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
          {LICENSE_CATEGORY_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: group.color, marginBottom: 6, marginTop: 0 }}>
                {group.label}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {group.cats.map((cat) => {
                  const on = selectedCats.includes(cat);
                  return (
                    <motion.div
                      key={cat}
                      onClick={() => toggleCat(cat)}
                      whileHover={{ scale: on ? 1 : 1.04, boxShadow: `0 0 12px ${group.color}44` }}
                      whileTap={{ scale: 0.94 }}
                      style={{
                        padding: on ? "8px 6px 6px" : "8px 6px", borderRadius: 10, textAlign: "center",
                        background: on ? `${group.color}18` : "rgba(255,255,255,0.04)",
                        border:     `1.5px solid ${on ? group.color : T.border}`,
                        boxShadow:  on ? `0 0 10px ${group.color}33` : "none",
                        cursor:     "pointer", transition: "all 0.18s",
                      }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 700, color: on ? group.color : T.text, margin: 0 }}>
                        {cat}
                      </p>
                      {on && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          onClick={e => e.stopPropagation()}
                          style={{ marginTop: 6 }}
                        >
                          <p style={{ fontSize: 9, color: group.color, margin: "0 0 3px", fontWeight: 700 }}>
                            ג׳/חודש
                          </p>
                          <input
                            type="number" min="0" max="200" step="10"
                            placeholder="0"
                            value={localGrams[cat] ?? ""}
                            onChange={e => handleGramChange(cat, e.target.value)}
                            autoFocus
                            style={{
                              width: "100%", textAlign: "center",
                              background: "rgba(57,255,133,0.10)",
                              border: `1.5px solid ${group.color}66`,
                              borderRadius: 8, color: T.text,
                              fontSize: 15, fontWeight: 800, padding: "4px 0",
                              fontFamily: "'Heebo',sans-serif",
                            }}
                          />
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
          {selectedCats.length > 0 && (() => {
            const total = selectedCats.reduce((s, c) => s + (localGrams[c] || 0), 0);
            return (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                style={{ marginTop: 8, padding: "10px 14px", borderRadius: 12,
                         background: "rgba(57,255,133,0.06)", border: `1px solid ${T.border}`,
                         display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <p style={{ fontSize: 12, color: T.accent, margin: 0 }}>
                  ✓ {selectedCats.length} קטגוריות
                </p>
                {total > 0 && (
                  <span style={{ fontSize: 14, fontWeight: 900, color: T.accent }}>
                    {total} ג׳ לחודש
                  </span>
                )}
              </motion.div>
            );
          })()}
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
          {/* Scan — real Tesseract OCR, no API key */}
          <motion.button
            onClick={() => !scanning && fileRef.current?.click()}
            disabled={scanning}
            whileHover={scanning ? {} : { scale: 1.02, boxShadow: T.glow(T.accent, 12) }}
            whileTap={scanning ? {} : { scale: 0.97 }}
            style={{
              padding: "16px 18px", borderRadius: 16, textAlign: "right",
              background: "rgba(57,255,133,0.06)", border: `1.5px solid ${T.accent}55`,
              cursor: scanning ? "not-allowed" : "pointer", transition: "all 0.18s",
              display: "flex", alignItems: "center", gap: 12,
            }}
          >
            <span style={{ fontSize: 28 }}>🪪</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: T.accent, margin: 0 }}>
                {scanning ? `סורק... ${scanProgress}%` : "סריקת רישיון (OCR)"}
              </p>
              {scanning ? (
                <div style={{ height: 3, borderRadius: 3, background: "rgba(57,255,133,0.15)",
                              marginTop: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${scanProgress}%`,
                                background: T.accent, borderRadius: 3,
                                transition: "width 0.3s" }} />
                </div>
              ) : (
                <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>
                  צלם או העלה תמונה — OCR מקומי, ללא שרת
                </p>
              )}
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

          {/* Skip — updates payload AND advances the stage */}
          <motion.button
            onClick={() => {
              updatePayload({ licenseVerified: false, licenseCategories: [] });
              onSkip?.();
            }}
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
              <p style={{ fontSize: 13, fontWeight: 700, color: T.muted, margin: 0 }}>דלג על רישיון</p>
              <p style={{ fontSize: 10, color: T.muted, opacity: 0.7, margin: 0 }}>
                ממשיך בלי לסרוק — אפשר להוסיף מאוחר יותר
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
  { id: "gas_fuel",        label: "עמוק ועשיר",        icon: "🧀", color: "#FFA040",
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

// Shared effects path — used by oil users AND flower users who can't tell scents
function EffectsPath({ payload, updatePayload }) {
  const sels = payload.oilEffectSels || {};
  const isOilUser = payload.consumptionForm === "oil";

  const oilQuickPicks = useMemo(() => [
    ...(PHARMARY_STRAINS   || []),
    ...(PHARMARY_STRAINS_2 || []),
    ...(PHARMARY_STRAINS_3 || []),
    ...(PHARMARY_STRAINS_4 || []),
  ].filter((s) => s.type === "oil")
   .sort((a, b) => (b.nReviews || 0) - (a.nReviews || 0))
   .slice(0, 8), []);

  const lovedOils = payload.lovedStrains || [];
  const hatedOils = payload.hatedStrains || [];
  const setOilLoved = (id) => {
    if (lovedOils.includes(id)) updatePayload({ lovedStrains: lovedOils.filter((x) => x !== id) });
    else updatePayload({ lovedStrains: [...lovedOils, id], hatedStrains: hatedOils.filter((x) => x !== id) });
  };
  const setOilHated = (id) => {
    if (hatedOils.includes(id)) updatePayload({ hatedStrains: hatedOils.filter((x) => x !== id) });
    else updatePayload({ hatedStrains: [...hatedOils, id], lovedStrains: lovedOils.filter((x) => x !== id) });
  };

  const toggleEffect = (id) => {
    const updated = { ...sels };
    if (updated[id] === "loved") delete updated[id]; else updated[id] = "loved";
    const loved = Object.keys(updated).filter(k => updated[k] === "loved");
    updatePayload({ oilEffectSels: updated, oilEffects: loved });
  };

  const nSelected = Object.values(sels).filter(v => v === "loved").length;
  const zemachMsg = nSelected > 0
    ? `מצוין! בחרת ${nSelected} השפעות — ממשיכים לבנות את הפרופיל שלך 🗺️`
    : "בחר/י את ההשפעות שאתה/את מחפש/ת — כל בחירה מחדדת את ההמלצות שלך 🌿";

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show">
      {isOilUser && (
        <motion.div variants={FADE_UP} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 14px", borderRadius: 12, marginBottom: 14,
          background: "rgba(64,207,255,0.08)",
          border: "1.5px solid rgba(64,207,255,0.28)",
        }}>
          <span style={{ fontSize: 20 }}>💧</span>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#40CFFF", margin: 0 }}>מסלול שמן — ✓ מסלול הטעם הושמט</p>
            <p style={{ fontSize: 9, color: T.muted, margin: 0 }}>שאלות לפי השפעה, לא ריח — כי שמן לא ריחני</p>
          </div>
        </motion.div>
      )}
      <motion.div variants={FADE_UP}>
        <AnimatePresence mode="wait">
          <ZemachBubble key={zemachMsg} message={zemachMsg} stage={3} />
        </AnimatePresence>
      </motion.div>
      <motion.div variants={FADE_UP}>
        <SectionLabel>מה אתה/את מחפש/ת? (ניתן לבחור כמה)</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {OIL_EFFECT_TILES.map((tile) => {
            const isOn = sels[tile.id] === "loved";
            return (
              <motion.button
                key={tile.id}
                variants={FADE_UP}
                onClick={() => toggleEffect(tile.id)}
                whileHover={{ scale: 1.03, boxShadow: `0 0 14px ${tile.color}44` }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: "12px 10px", borderRadius: 14, cursor: "pointer",
                  background: isOn ? `${tile.color}16` : "rgba(255,255,255,0.04)",
                  border: `1.5px solid ${isOn ? tile.color : T.border}`,
                  boxShadow: isOn ? `0 0 10px ${tile.color}28` : "none",
                  transition: "all 0.18s",
                  textAlign: "center",
                }}
              >
                <span style={{
                  fontSize: 24, display: "block", marginBottom: 5,
                  filter: isOn ? `drop-shadow(0 0 6px ${tile.color})` : "none",
                }}>
                  {tile.icon}
                </span>
                <p style={{ fontSize: 12, fontWeight: isOn ? 800 : 600, margin: 0,
                             color: isOn ? tile.color : T.text, lineHeight: 1.2 }}>
                  {tile.label}
                </p>
                <p style={{ fontSize: 9, color: T.muted, margin: "3px 0 0", lineHeight: 1.3 }}>
                  {tile.sub}
                </p>
                {isOn && (
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    style={{ display: "block", marginTop: 5, fontSize: 11,
                             color: tile.color, fontWeight: 800 }}>
                    ✓ נבחר
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
      {isOilUser && oilQuickPicks.length > 0 && (
        <motion.div variants={FADE_UP} style={{ marginTop: 14 }}>
          <SectionLabel>שמנים שכבר ניסית? סמנ/י מה עזר ומה לא (לא חובה)</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {oilQuickPicks.map((oil) => {
              const isLoved = lovedOils.includes(oil.id);
              const isHated = hatedOils.includes(oil.id);
              return (
                <div key={oil.id} style={{
                  padding: "8px 12px", borderRadius: 12,
                  background: isLoved ? "rgba(57,255,133,0.07)" : isHated ? "rgba(255,69,96,0.06)" : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${isLoved ? T.accent : isHated ? T.danger : T.border}`,
                  display: "flex", alignItems: "center", gap: 10,
                  transition: "all 0.18s",
                }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>💧</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, margin: 0,
                      color: isLoved ? T.accent : isHated ? T.danger : T.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {oil.name}
                    </p>
                    <p style={{ fontSize: 9, color: T.muted, margin: 0 }}>{oil.cat} · {oil.grower}</p>
                  </div>
                  <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                    <button onClick={() => setOilLoved(oil.id)} style={{
                      padding: "5px 10px", borderRadius: 8, fontSize: 10, fontWeight: 800,
                      background: isLoved ? T.accent : "rgba(57,255,133,0.28)",
                      color:      isLoved ? "#061006" : T.accent,
                      border:     `1.5px solid ${isLoved ? T.accent : "rgba(57,255,133,0.80)"}`,
                      cursor: "pointer",
                    }}>
                      {isLoved ? "✓ עזר" : "💚 עזר"}
                    </button>
                    <button onClick={() => setOilHated(oil.id)} style={{
                      padding: "5px 10px", borderRadius: 8, fontSize: 10, fontWeight: 800,
                      background: isHated ? T.danger : "rgba(255,69,96,0.28)",
                      color:      isHated ? "#fff" : T.danger,
                      border:     `1.5px solid ${isHated ? T.danger : "rgba(255,69,96,0.80)"}`,
                      cursor: "pointer",
                    }}>
                      {isHated ? "✕ לא עזר" : "🔴 לא עזר"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      <motion.p variants={FADE_UP} style={{
        textAlign: "center", marginTop: 12, fontSize: 11,
        color: "rgba(187,247,208,0.40)",
      }}>
        לא בטוח? לחץ ״המשך״ — אפשרי גם בלי לבחור 🌿
      </motion.p>
    </motion.div>
  );
}

function Stage4_Sensory({ payload, errors, updatePayload }) {
  const isOilUser  = payload.consumptionForm === "oil";
  const noScent    = payload.noScentKnowledge;

  // Oil users AND flower/vape users who can't tell scents → effects path
  if (isOilUser || noScent) {
    return <EffectsPath payload={payload} updatePayload={updatePayload} />;
  }

  // ── Flower / Vape / Mixed: taste screen ──────────────────────────────────────
  const scentSels = payload.scentSelections || {};

  const setLiked    = (id) => {
    const cur = scentSels[id];
    const updated = { ...scentSels };
    if (cur === "loved") delete updated[id]; else updated[id] = "loved";
    updatePayload({ scentSelections: updated });
  };
  const setDisliked = (id) => {
    const cur = scentSels[id];
    const updated = { ...scentSels };
    if (cur === "disliked") delete updated[id]; else updated[id] = "disliked";
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
        <SectionLabel>אילו ריחות / טעמים אתה/את אוהב/ת? (לא חייבים לבחור)</SectionLabel>
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
                  padding: "9px 10px", borderRadius: 13,
                  background: isLove ? "rgba(57,255,133,0.08)"
                            : isDis  ? "rgba(255,69,96,0.07)"
                            : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${isLove ? T.accent : isDis ? T.danger : T.border}`,
                  transition: "all 0.18s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                  <span style={{ fontSize: 20, flexShrink: 0,
                                 filter: (isLove || isDis) ? `drop-shadow(0 0 5px ${isLove ? T.accent : T.danger})` : "none" }}>
                    {tile.icon}
                  </span>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, margin: 0, lineHeight: 1.2,
                                color: isLove ? T.accent : isDis ? T.danger : T.text }}>
                      {tile.label}
                    </p>
                    <p style={{ fontSize: 9, color: T.muted, margin: 0 }}>{tile.sub}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  {/* אהבתי — GREEN */}
                  <button
                    onClick={() => setLiked(tile.id)}
                    style={{
                      flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 10, fontWeight: 800,
                      background: isLove ? T.accent : "rgba(57,255,133,0.28)",
                      color:      isLove ? "#061006" : T.accent,
                      border:     `1.5px solid ${isLove ? T.accent : "rgba(57,255,133,0.80)"}`,
                      cursor:     "pointer",
                      boxShadow:  isLove ? `0 0 8px ${T.accent}55` : "none",
                    }}
                  >
                    {isLove ? "✓ אהבתי" : "💚 אהבתי"}
                  </button>
                  {/* לא אהבתי — RED */}
                  <button
                    onClick={() => setDisliked(tile.id)}
                    style={{
                      flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 10, fontWeight: 800,
                      background: isDis ? T.danger : "rgba(255,69,96,0.28)",
                      color:      isDis ? "#fff" : T.danger,
                      border:     `1.5px solid ${isDis ? T.danger : "rgba(255,69,96,0.80)"}`,
                      cursor:     "pointer",
                      boxShadow:  isDis ? `0 0 8px ${T.danger}55` : "none",
                    }}
                  >
                    {isDis ? "✕ לא אהבתי" : "🔴 לא אהבתי"}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* לא מרגיש ריח/טעם → route to effects path */}
        <motion.button
          variants={FADE_UP}
          onClick={() => updatePayload({ noScentKnowledge: true, scentSelections: {} })}
          style={{
            width: "100%", marginTop: 12, padding: "11px 14px", borderRadius: 14,
            background: "rgba(64,207,255,0.08)",
            border: "1.5px solid rgba(64,207,255,0.35)",
            color: "#40CFFF",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Heebo',sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>🤷</span>
          <span>לא מרגיש/ת ריח / טעם? עברו לשאלות ההשפעה</span>
          <span style={{ opacity: 0.8 }}>→</span>
        </motion.button>

        <motion.p variants={FADE_UP} style={{
          textAlign: "center", marginTop: 8, fontSize: 11,
          color: "rgba(187,247,208,0.40)",
        }}>
          לחץ ״המשך״ — ריח / טעם הם אופציונליים לחלוטין 🌿
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
  const consumptionForm = payload.consumptionForm;

  // Filter by license categories + consumption form
  const eligibleCatalog = useMemo(() => {
    let list = ALL_CATALOG;
    if (licCats.length > 0) list = list.filter((s) => licCats.includes(s.cat));
    if (consumptionForm === "oil")                              list = list.filter((s) => s.type === "oil");
    else if (consumptionForm === "flower" || consumptionForm === "vape") list = list.filter((s) => s.type !== "oil");
    // "mixed" → show all types
    return list;
  }, [licCats, consumptionForm]);

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
            : `הנפוצים ביותר${kindFilter ? ` · ${kindFilter}` : ""}${consumptionForm === "oil" ? " · שמנים בלבד" : consumptionForm === "flower" ? " · תפרחות" : consumptionForm === "vape" ? " · תפרחות (לאידוי)" : ""}${licCats.length > 0 ? " (לפי קטגוריות שלך)" : ""}`}
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

// ── Terpene sensory descriptions — educational moment only (§02 P2 / §11) ────
// Chemical names are intentional here (the "aha" DNA wheel).
// They must NOT appear on match cards or anywhere else in the product.
const TERP_AROMA = {
  myrcene:       { label: 'מירצן',    emoji: '🌿', aroma: 'עשבוני-אדמתי — נוטה לתחושה כבדה ורגועה' },
  limonene:      { label: 'לימונן',   emoji: '🍋', aroma: 'הדרי-לימוני — נוטה לתחושה קלה ומרוממת' },
  caryophyllene: { label: 'קריופילן', emoji: '🌶️', aroma: 'פלפלי-חריף — טעמים עשירים ומחממים' },
  linalool:      { label: 'לינלול',   emoji: '💜', aroma: 'ארומת לבנדר — נוטה לתחושה רכה ושקטה' },
  pinene:        { label: 'פינן',     emoji: '🌲', aroma: 'ניחוח אורנים ועצים — תחושה צוננת ומרעננת' },
  humulene:      { label: 'הומולן',   emoji: '🌾', aroma: 'כשות ועשבי בר — טעמים מרירים ומורכבים' },
  terpinolene:   { label: 'טרפינולן', emoji: '🌸', aroma: 'פרחוני-מרענן — גוון פירותי עדין' },
  ocimene:       { label: 'אוסימן',   emoji: '🌺', aroma: 'טרופי-מתוק — גוון פרחים ומנטה' },
};

// Shows aroma + sensory tendency for the user's top terpenes.
// ✅ Aroma / sensory tendency  ❌ No medical or clinical claims.
function TerpInfoPanel({ liveVector }) {
  const top = Object.entries(liveVector)
    .filter(([k, v]) => v > 0.1 && TERP_AROMA[k])
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  if (top.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      style={{
        marginTop: 8,
        padding: '12px 14px',
        borderRadius: 14,
        background: 'rgba(57,255,133,0.04)',
        border: '1px solid rgba(57,255,133,0.14)',
      }}
    >
      <p style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em' }}>
        ארומה ותחושה חושית
      </p>
      {top.map(([key]) => {
        const t = TERP_AROMA[key];
        return (
          <div key={key} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 7,
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{t.emoji}</span>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>{t.label}</span>
              <span style={{ fontSize: 11, color: T.muted }}> — {t.aroma}</span>
            </div>
          </div>
        );
      })}
      <p style={{ fontSize: 9, color: T.muted, opacity: 0.55, marginTop: 6 }}>
        * ניתוח ארומטי בלבד — אין מדובר בהמלצה רפואית
      </p>
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

// ── Welcome screen — the ONLY dramatic moment in the product ─────────────────
function StepWelcome({ onContinue, onBack, reducedMotion }) {
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: reducedMotion ? 0 : 0.3, duration: 0.6 }}
      style={{
        minHeight: "100dvh",
        background: T.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        direction: "rtl",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 60% 40% at 50% 55%, rgba(57,255,133,0.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <motion.span
        initial={reducedMotion ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: reducedMotion ? 0 : 0.5, type: "spring", stiffness: 200 }}
        style={{ fontSize: 64, marginBottom: 16, display: "block" }}
      >
        🌿
      </motion.span>
      <h1 style={{
        fontSize: 32, fontWeight: 900, color: T.accent,
        margin: 0, textAlign: "center",
        fontFamily: "'Heebo','Segoe UI',sans-serif",
        letterSpacing: "-0.02em",
      }}>
        CannaMatch
      </h1>
      <p style={{
        fontSize: 15, color: T.muted, marginTop: 10,
        textAlign: "center", maxWidth: 260, lineHeight: 1.6,
        fontFamily: "'Heebo','Segoe UI',sans-serif",
      }}>
        המלווה שמכיר אותך — לא אפליקציה, לא תפריט.
      </p>
      <motion.button
        initial={reducedMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reducedMotion ? 0 : 0.9, duration: 0.4 }}
        onClick={onContinue}
        style={{
          marginTop: 44,
          padding: "13px 32px",
          borderRadius: 999,
          background: T.accent,
          color: "#061006",
          fontWeight: 800,
          fontSize: 15,
          border: "none",
          cursor: "pointer",
          fontFamily: "'Heebo','Segoe UI',sans-serif",
          boxShadow: T.glow(T.accent, 14),
        }}
      >
        בוא נתחיל →
      </motion.button>
      {onBack && (
        <motion.button
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reducedMotion ? 0 : 1.1, duration: 0.3 }}
          onClick={onBack}
          style={{
            marginTop: 16,
            padding: "8px 20px",
            borderRadius: 999,
            background: "transparent",
            color: T.muted,
            fontWeight: 600,
            fontSize: 13,
            border: `1px solid rgba(126,168,142,0.3)`,
            cursor: "pointer",
            fontFamily: "'Heebo','Segoe UI',sans-serif",
          }}
        >
          ← חזרה
        </motion.button>
      )}
    </motion.div>
  );
}

function Stage7_Preview({ liveVector, killSwitches, payload }) {
  const reducedMotion = useReducedMotion();
  const [wheelPhase, setWheelPhase] = useState(reducedMotion ? "strands" : "wheel");

  useEffect(() => {
    if (wheelPhase !== "wheel") return;
    const t = setTimeout(() => setWheelPhase("strands"), 1200);
    return () => clearTimeout(t);
  }, [wheelPhase]);

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

  // Terpene wheel — spins in for 1.2s before profile reveal
  const TERP_EMOJI = {
    myrcene: "🌙", limonene: "🍋", linalool: "💜",
    caryophyllene: "💪", pinene: "🌲", terpinolene: "⚡", humulene: "🌿",
  };

  if (wheelPhase === "wheel") {
    const wheelTerps = activeTerps.slice(0, 4);
    const R = 68; // orbit radius px
    return (
      <div style={{
        minHeight: 300, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "40px 0",
      }}>
        <div style={{ position: "relative", width: R * 2 + 48, height: R * 2 + 48 }}>
          {/* center DNA */}
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            style={{
              position: "absolute",
              top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              fontSize: 32,
            }}
          >
            🧬
          </motion.span>
          {/* orbit icons */}
          {wheelTerps.map((t, i) => {
            const angle = (i / Math.max(wheelTerps.length, 1)) * 2 * Math.PI - Math.PI / 2;
            const cx = R * Math.cos(angle);
            const cy = R * Math.sin(angle);
            return (
              <motion.span
                key={t.key}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.12 + i * 0.12, type: "spring", stiffness: 280 }}
                style={{
                  position: "absolute",
                  top: "50%", left: "50%",
                  transform: `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`,
                  fontSize: 26,
                }}
                title={t.label}
              >
                {TERP_EMOJI[t.key] || "🌿"}
              </motion.span>
            );
          })}
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          style={{ color: T.muted, fontSize: 12, marginTop: 18, textAlign: "center" }}
        >
          בונה את הפרופיל שלך...
        </motion.p>
      </div>
    );
  }

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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
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
          {/* Sensory descriptions — intentional educational moment; names stay here only */}
          <TerpInfoPanel liveVector={liveVector} />
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

  const reducedMotion              = useReducedMotion();
  const [showWelcome, setShowWelcome] = useState(true);
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

  const handleBackToWelcome = useCallback(() => {
    setShowWelcome(true);
  }, []);

  const handleSkip = useCallback(() => {
    setDirection(1);
    skipStage();
  }, [skipStage]);

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
      relax: "anxiety", mood: "anxiety", energy: "focus",
      appetite: "appetite", creative: "focus",
    };
    // Medical conditions → REASONS ids so the effects-matching bonus fires per-condition
    const CONDITION_TO_REASON = {
      ptsd:            ["ptsd", "anxiety", "sleep"],
      chronic_pain:    ["pain"],
      neuropathic:     ["pain", "diabetes"],
      oncology:        ["pain", "appetite"],
      nausea_vomiting: ["appetite"],
      ibd:             ["gi"],
      crohns:          ["gi"],
      ms:              ["pain", "sleep"],
      parkinsons:      ["anxiety"],
      epilepsy:        ["anxiety", "sleep"],
      tourette:        ["anxiety"],
      autism:          ["anxiety"],
      fibromyalgia:    ["pain"],
      aids:            ["appetite"],
      glaucoma:        ["pain"],
      dementia:        ["anxiety", "sleep"],
      palliative:      ["pain", "sleep", "appetite"],
      heart_failure:   ["anxiety"],
    };

    const localReasons = [
      ...new Set([
        ...(payload.effectGoals || []).map((g) => EFFECT_GOAL_TO_REASON[g]).filter(Boolean),
        ...(payload.medicalConditions || []).flatMap((c) => CONDITION_TO_REASON[c] || []),
      ]),
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

    // From oil effects (liked only — from new אהבתי/לא-אהבתי UI or legacy toggle)
    const likedOilEffects = payload.oilEffects.length > 0 ? payload.oilEffects
      : Object.entries(payload.oilEffectSels || {}).filter(([,v])=>v==="loved").map(([k])=>k);
    for (const e of likedOilEffects) {
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
      // oilEffects: the liked ones from the new אהבתי/לא-אהבתי UI, OR fallback to legacy toggle list
      oilEffects: payload.oilEffects.length > 0 ? payload.oilEffects
                  : Object.entries(payload.oilEffectSels || {}).filter(([,v])=>v==="loved").map(([k])=>k),
      primaryGoals:      payload.primaryGoals  || [],
      helped:       payload.lovedStrains  || [],
      notHelped:    payload.hatedStrains  || [],
      current:      [],
      licenseVerified:  payload.licenseVerified  || false,
      licenseExpiry:    payload.licenseExpiry    || null,
      gramsByCategory:  payload.gramsByCategory  || {},
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

  if (showWelcome) {
    return <StepWelcome onContinue={() => setShowWelcome(false)} onBack={onSkip} reducedMotion={reducedMotion} />;
  }

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
        flex: 1, minHeight: "100%",
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
            {stage === 0 && <Stage0_License        payload={payload} errors={errors} updatePayload={updatePayload} onSkip={handleSkip} />}
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
        <div style={{ padding: "8px 18px 0", flexShrink: 0, textAlign: "center" }}>
          <button
            onClick={handleSkip}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(57,255,133,0.35)",
              borderRadius: 22, padding: "7px 18px",
              color: "rgba(126,168,142,0.90)", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "'Heebo',sans-serif",
              transition: "border-color .15s, color .15s, background .15s",
              letterSpacing: "0.01em",
            }}
            onMouseOver={e => {
              e.currentTarget.style.borderColor = T.accent;
              e.currentTarget.style.color = T.accent;
              e.currentTarget.style.background = "rgba(57,255,133,0.08)";
            }}
            onMouseOut={e => {
              e.currentTarget.style.borderColor = "rgba(57,255,133,0.35)";
              e.currentTarget.style.color = "rgba(126,168,142,0.90)";
              e.currentTarget.style.background = "rgba(255,255,255,0.07)";
            }}
          >
            <span style={{ fontSize: 14 }}>⏭</span>
            דלג על שלב זה
          </button>
          <p style={{
            fontSize: 9, color: "rgba(126,168,142,0.55)",
            lineHeight: 1.55, margin: "5px 0 0",
            fontWeight: 500, maxWidth: 320, marginInline: "auto",
          }}>
            ניתן לדלג — ככל שנדע יותר, ההתאמה מדויקת יותר.
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
        <NeonButton onClick={stage === 0 ? handleBackToWelcome : handlePrev} variant="ghost" size="md">
          ← חזרה
        </NeonButton>
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
