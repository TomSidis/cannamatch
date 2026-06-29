// ─────────────────────────────────────────────────────────────────────────────
//  OnboardingV3 — the 3-screen, experience-forked onboarding (Layer 3).
//
//  Screen 1 — License (reuses Stage0_License OCR: confirm categories + grams/category)
//  Screen 2 — Who you are medically: experience + indication (MANDATORY) + when-relief
//  Screen 3 — forks on experience:
//             experienced / little → liked + disliked strain (BOTH mandatory)
//             first time           → skip past-strain; show "start low & slow" guidance
//
//  Feeds the engine via onComplete → CannaMatch ans → ansToNeed → buildNeedVector:
//  experience flips newUserRoute, reasons drive condition leans, timing gates myrcene.
//  Scoring is NOT rebuilt here — only the inputs are wired.
//
//  Mobile-first RTL Hebrew. Persists to useOnboardingStore.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '../hooks/useOnboardingStore.js';
import { Stage0_License } from './OnboardingWizard.jsx';
import { STRAINS } from '../data/strainsConfig.js';
import { api } from '../services/api.js';
import ChemProfile, { ChemProfileLegend } from './ChemProfile.jsx';
import {
  READY_MICROCOPY, EXPERIENCE_OPTIONS, INDICATION_OPTIONS, DAYPART_OPTIONS,
  dayPartToTimes, experienceToTolerance, screen2Complete, screen3Mode, pastStrainComplete,
  deriveProfileBatch, indicationReasons,
} from './onboardingV3Logic.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: '#0B1810', accent: '#4ADE80', text: '#EBF6ED', muted: '#7EA88E',
  border: 'rgba(74,222,128,0.18)', danger: '#FF6B6B', font: "'Heebo','Segoe UI',sans-serif",
};

function Dots({ step, total }) {
  return (
    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', marginBottom: 16 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === step ? 18 : 7, height: 7, borderRadius: 4,
          background: i <= step ? T.accent : 'rgba(126,168,142,0.3)', transition: 'all .3s',
        }} />
      ))}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <motion.button whileTap={disabled ? {} : { scale: 0.97 }} onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: 15, borderRadius: 16, border: 'none', minHeight: 52,
        cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: T.font, fontSize: 16, fontWeight: 800,
        background: disabled ? 'rgba(74,222,128,0.16)' : 'linear-gradient(135deg,#4ADE80,#22C55E)',
        color: disabled ? 'rgba(187,247,208,0.4)' : '#04120a', transition: 'all .18s',
      }}>
      {children}
    </motion.button>
  );
}

function Chip({ label, emoji, selected, onClick }) {
  return (
    <motion.button whileTap={{ scale: 0.93 }} onClick={onClick}
      style={{
        padding: '10px 15px', borderRadius: 20, cursor: 'pointer', fontFamily: T.font,
        fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7,
        background: selected ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.04)',
        color: selected ? T.accent : T.muted,
        border: `1.5px solid ${selected ? T.accent + '66' : 'rgba(255,255,255,0.08)'}`,
        transition: 'all .15s',
      }}>
      {emoji && <span>{emoji}</span>}{label}
    </motion.button>
  );
}

// ── Screen 2 — medical ──────────────────────────────────────────────────────
function ScreenMedical({ experience, setExperience, indications, toggleIndication, dayPart, setDayPart, onNext }) {
  const canNext = screen2Complete({ experience, indications });
  return (
    <div style={{ padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <section>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: '0 0 10px' }}>ניסית קנאביס רפואי בעבר?</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {EXPERIENCE_OPTIONS.map(o => {
            const on = experience === o.id;
            return (
              <motion.button key={o.id} whileTap={{ scale: 0.98 }} onClick={() => setExperience(o.id)}
                style={{
                  padding: '13px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'right', fontFamily: T.font,
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: on ? 'rgba(74,222,128,0.10)' : 'rgba(255,255,255,0.04)',
                  border: `1.5px solid ${on ? T.accent + '66' : 'rgba(255,255,255,0.08)'}`,
                }}>
                <span style={{ fontSize: 22 }}>{o.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: on ? T.accent : T.text }}>{o.label}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>{o.sub}</div>
                </div>
                {on && <span style={{ color: T.accent }}>✓</span>}
              </motion.button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: '0 0 4px' }}>במה מטפלים? <span style={{ color: T.danger, fontSize: 12 }}>*חובה</span></h3>
        <p style={{ fontSize: 11, color: T.muted, margin: '0 0 10px' }}>בחר/י לפחות אחד</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {INDICATION_OPTIONS.map(o => (
            <Chip key={o.id} label={o.label} emoji={o.emoji}
              selected={indications.includes(o.id)} onClick={() => toggleIndication(o.id)} />
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: '0 0 10px' }}>מתי ההקלה הכי נחוצה?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {DAYPART_OPTIONS.map(o => {
            const on = dayPart === o.id;
            return (
              <motion.button key={o.id} whileTap={{ scale: 0.96 }} onClick={() => setDayPart(o.id)}
                style={{
                  padding: '14px 6px', borderRadius: 14, cursor: 'pointer', fontFamily: T.font,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minHeight: 72,
                  background: on ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.04)',
                  color: on ? T.accent : T.muted,
                  border: `1.5px solid ${on ? T.accent + '66' : 'rgba(255,255,255,0.08)'}`,
                  transition: 'all .15s',
                }}>
                <span style={{ fontSize: 22 }}>{o.emoji}</span>
                <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>{o.label}</span>
              </motion.button>
            );
          })}
        </div>
      </section>

      <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, textAlign: 'center', margin: 0 }}>
        {READY_MICROCOPY}
      </p>

      <PrimaryBtn onClick={onNext} disabled={!canNext}>המשך →</PrimaryBtn>
    </div>
  );
}

// ── Screen 3a — past strains (experienced / little) ──────────────────────────
// Seed fallback used only when the live-catalog API is unavailable (offline).
function seedFallback(s) {
  const n = s.toLowerCase();
  return STRAINS.filter(x => x.name.toLowerCase().includes(n)).slice(0, 8)
    .map(x => ({ id: x.id, name: x.name, category: x.cat }));
}

function RemovableChip({ label, color, onRemove }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 14,
      fontSize: 12, fontWeight: 700, background: `${color}1f`, color, border: `1px solid ${color}55`,
    }}>
      {label}
      <button onClick={onRemove} aria-label="הסר" style={{ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
    </span>
  );
}

function ScreenPastStrains({ liked, disliked, pickLiked, pickDisliked, removeLiked, removeDisliked, onComplete }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Debounced search against the LIVE catalog (product_sku active); seed fallback offline.
  useEffect(() => {
    const s = q.trim();
    if (!s) { setResults([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { items } = await api.getCatalogStrains(s);
        if (!cancelled) setResults(items?.length ? items : seedFallback(s));
      } catch {
        if (!cancelled) setResults(seedFallback(s));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const inLiked    = (s) => liked.some(x => x.id === s.id);
  const inDisliked = (s) => disliked.some(x => x.id === s.id);
  const canDone    = pastStrainComplete({ liked, disliked });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 20px 10px' }}>
        <p style={{ fontSize: 12, color: T.muted, margin: '0 0 12px', lineHeight: 1.6 }}>
          סמן/י כמה שתרצה/י — ככל שיותר, ההתאמה מדויקת יותר. בחר/י לפחות אחד שאהבת ואחד שפחות.
        </p>

        {/* Selected chips — removable */}
        {(liked.length > 0 || disliked.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {liked.map(x => <RemovableChip key={x.id} label={`👍 ${x.name}`} color={T.accent} onRemove={() => removeLiked(x.id)} />)}
            {disliked.map(x => <RemovableChip key={x.id} label={`👎 ${x.name}`} color={T.danger} onRemove={() => removeDisliked(x.id)} />)}
          </div>
        )}

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="חפש/י זן לפי שם..."
          style={{
            width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.05)', border: `1.5px solid ${T.border}`,
            color: T.text, fontSize: 13, fontFamily: T.font, outline: 'none',
          }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', minHeight: 120 }}>
        {/* initial hint */}
        {!q.trim() && (
          <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', marginTop: 24, lineHeight: 1.7 }}>
            🔍 הקלד/י שם זן כדי לחפש בקטלוג.<br />יש כמה "וודינג קייק" ממגדלים שונים — בחר/י לפי המגדל.
          </p>
        )}
        {loading && q.trim() && (
          <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', marginTop: 20 }}>מחפש…</p>
        )}
        {results.map(s => {
          const grower = s.grower || s.genetics;
          const onL = inLiked(s), onD = inDisliked(s);
          return (
            <div key={s.id} style={{
              padding: '12px 14px', borderRadius: 14, marginBottom: 8,
              background: onL ? 'rgba(74,222,128,0.07)' : onD ? 'rgba(255,107,107,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1.5px solid ${onL ? T.accent + '55' : onD ? T.danger + '55' : 'rgba(255,255,255,0.08)'}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  🏭 {grower || 'מגדל לא ידוע'}{(s.category || s.cat) ? ` · ${s.category || s.cat}` : ''}
                </div>
              </div>
              <button onClick={() => pickLiked(s)} aria-label="אהבתי" style={{
                width: 40, height: 40, borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                background: onL ? T.accent : 'rgba(74,222,128,0.16)',
                color: onL ? '#04120a' : T.accent, border: `1.5px solid ${T.accent}`,
              }}>👍</button>
              <button onClick={() => pickDisliked(s)} aria-label="פחות" style={{
                width: 40, height: 40, borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                background: onD ? T.danger : 'rgba(255,107,107,0.16)',
                color: onD ? '#fff' : T.danger, border: `1.5px solid ${T.danger}`,
              }}>👎</button>
            </div>
          );
        })}
        {q.trim() && !loading && results.length === 0 && (
          <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', marginTop: 16 }}>לא נמצא זן בשם הזה</p>
        )}
      </div>

      <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <PrimaryBtn onClick={onComplete} disabled={!canDone}>
          {canDone ? `סיימתי — ${liked.length}👍 ${disliked.length}👎` : 'בחר/י לפחות אחד שאהבת ואחד שפחות'}
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ── Screen 3b — first-timer guidance (start low & slow) ──────────────────────
function ScreenGuidance({ onComplete }) {
  return (
    <div style={{ padding: '12px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ textAlign: 'center', fontSize: 46 }}>🌱</motion.div>
      <div style={{
        padding: '16px 18px', borderRadius: 16, lineHeight: 1.75,
        background: 'rgba(74,222,128,0.06)', border: `1.5px solid ${T.accent}33`,
      }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: T.accent, margin: '0 0 8px' }}>כיוון שזו הפעם הראשונה — קח/י את זה לאט</p>
        <p style={{ fontSize: 13, color: T.text, margin: 0 }}>
          התחל/י ממנה קטנה, חכה/י, ותראה/י איך הגוף מגיב לפני שמוסיפים. יותר THC זה לא יותר טוב —
          אצל מי שאין לו ניסיון, מינון גבוה הוא הדרך הקלאסית לחרדה. אין מרוץ. נתחיל מעדין, ונכוון לפי מה שתרגיש/י.
        </p>
      </div>
      <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
        בנינו לך כיוון התחלתי לפי ההתוויה שבחרת. נדייק אותו ככל שתדווח/י איך הלך.
      </p>
      <PrimaryBtn onClick={onComplete}>קח אותי לזנים 🌿</PrimaryBtn>
    </div>
  );
}

// ── Final screen — DNA reveal (the payoff) ───────────────────────────────────
function ScreenDnaReveal({ batch, onComplete }) {
  return (
    <div style={{ padding: '12px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
      <h2 style={{ fontSize: 20, fontWeight: 900, color: T.accent, margin: 0 }}>הפרופיל שלך 🧬</h2>
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}>
        <ChemProfile batch={batch} size={140} />
      </motion.div>
      <ChemProfileLegend batch={batch} style={{ textAlign: 'center', color: T.muted }} />
      <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', lineHeight: 1.7, margin: 0 }}>
        הצורה מייצגת את יחס הקנבינואידים, והצבעים את הטרפנים הדומיננטיים. פרופיל דומה → התנהגות דומה.
      </p>
      <PrimaryBtn onClick={onComplete}>קח אותי לזנים 🌿</PrimaryBtn>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function OnboardingV3({ user, onComplete, onSkip }) {
  const store = useOnboardingStore();
  const { payload, errors, updatePayload } = store;

  const [step, setStep]             = useState(0); // 0 license · 1 medical · 2 fork
  const [experience, setExperience] = useState(payload.experience || null);
  const [indications, setIndications] = useState(payload.medicalConditions || []);
  const [dayPart, setDayPart]       = useState(null);
  // Multi-select, unlimited: arrays of { id, name, cat }. More picks = stronger signal.
  const [liked, setLiked]           = useState([]);
  const [disliked, setDisliked]     = useState([]);

  const toggleIndication = (id) =>
    setIndications(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const slim = (s) => ({ id: s.id, name: s.name, cat: s.category || s.cat });
  // A strain can be liked OR disliked, never both — picking one side removes it from the other.
  const pickLiked = (s) => {
    setDisliked(d => d.filter(x => x.id !== s.id));
    setLiked(l => l.some(x => x.id === s.id) ? l.filter(x => x.id !== s.id) : [...l, slim(s)]);
  };
  const pickDisliked = (s) => {
    setLiked(l => l.filter(x => x.id !== s.id));
    setDisliked(d => d.some(x => x.id === s.id) ? d.filter(x => x.id !== s.id) : [...d, slim(s)]);
  };
  const removeLiked    = (id) => setLiked(l => l.filter(x => x.id !== id));
  const removeDisliked = (id) => setDisliked(d => d.filter(x => x.id !== id));

  const finish = () => {
    const times = dayPartToTimes(dayPart);
    const cats = payload.licenseCategories || [];
    const grams = payload.gramsByCategory || {};
    const tolerance = experienceToTolerance(experience);
    const likedIds    = liked.map(x => x.id);
    const dislikedIds = disliked.map(x => x.id);

    // Persist to the store (Layer 3 §5).
    updatePayload({
      experience, medicalConditions: indications, usageTiming: times,
      lovedStrains: likedIds, hatedStrains: dislikedIds,
      thcTolerance: tolerance,
    });

    const localAns = {
      cats,
      reasons:          indicationReasons(indications), // option ids → engine reason slugs
      timing:           times,                       // ansToNeed reads `timing` → need.times
      experience,                                    // flips newUserRoute in the engine
      helped:           likedIds,
      notHelped:        dislikedIds,
      likedStrainNames:    liked.map(x => x.name),    // ALL liked → engine boost
      dislikedStrainNames: disliked.map(x => x.name), // ALL disliked → engine demotion
      thcTolerance:     tolerance,
      gramsByCategory:  grams,
      licenseVerified:  !!payload.licenseVerified,
      licenseExpiry:    payload.licenseExpiry || null,
    };
    onComplete({ localAns });
  };

  const goMedical = () => { updatePayload({ experience, medicalConditions: indications }); setStep(1); };
  const goFork    = () => setStep(2);
  const goReveal  = () => setStep(3); // DNA reveal is the final screen, before finish()
  // DNA reveal: derive from the mapped engine reason slugs (NOT raw option ids), else the
  // profile collapses to a single-terpene fallback that renders as a washed-out blob.
  const revealBatch = useMemo(
    () => deriveProfileBatch(indicationReasons(indications), experience),
    [indications, experience],
  );

  return (
    <div dir="rtl" style={{
      minHeight: '100%', background: T.bg, color: T.text, fontFamily: T.font,
      display: 'flex', flexDirection: 'column', maxWidth: 480, marginInline: 'auto',
    }}>
      <div style={{ padding: '16px 20px 0' }}>
        <Dots step={step} total={4} />
        {step > 0 && (
          <button onClick={() => setStep(s => Math.max(0, s - 1))}
            style={{ background: 'none', border: 'none', color: T.muted, fontSize: 12, cursor: 'pointer', fontFamily: T.font, padding: '4px 0' }}>
            ← חזרה
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step}
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.26 }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {step === 0 && (
            <div style={{ padding: '4px 20px 20px' }}>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: T.text, margin: '0 0 14px' }}>רישיון רפואי 🪪</h2>
              <Stage0_License payload={payload} errors={errors} updatePayload={updatePayload}
                onSkip={() => { updatePayload({ licenseVerified: false, licenseCategories: [] }); goMedical(); }} />
              <div style={{ marginTop: 18 }}>
                <PrimaryBtn onClick={goMedical}>המשך →</PrimaryBtn>
              </div>
            </div>
          )}

          {step === 1 && (
            <ScreenMedical
              experience={experience} setExperience={setExperience}
              indications={indications} toggleIndication={toggleIndication}
              dayPart={dayPart} setDayPart={setDayPart}
              onNext={goFork}
            />
          )}

          {step === 2 && (
            screen3Mode(experience) === 'past_strain'
              ? <ScreenPastStrains liked={liked} disliked={disliked}
                  pickLiked={pickLiked} pickDisliked={pickDisliked}
                  removeLiked={removeLiked} removeDisliked={removeDisliked} onComplete={goReveal} />
              : <ScreenGuidance onComplete={goReveal} />
          )}

          {step === 3 && (
            <ScreenDnaReveal batch={revealBatch} onComplete={finish} />
          )}
        </motion.div>
      </AnimatePresence>

      {step === 1 && onSkip && (
        <div style={{ padding: '0 20px 16px', textAlign: 'center' }}>
          {/* ponytail: keep a quiet escape hatch; indication is still enforced before the fork. */}
        </div>
      )}
    </div>
  );
}
