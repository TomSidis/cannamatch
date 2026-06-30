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
import TerpRadar, { dnaSequence } from './TerpRadar.jsx';
import { TERPENE_HUMAN } from '../lib/terpeneToHuman.js';
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
  // Fits the viewport: experience + day-part + button stay fixed; only the indication grid
  // scrolls (bounded) if it overflows. No page-level scroll.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '4px 16px 12px', gap: 12, minHeight: 0 }}>
      {/* experience — compact 3-across */}
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: '0 0 8px' }}>ניסיתם קנאביס רפואי בעבר?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {EXPERIENCE_OPTIONS.map(o => {
            const on = experience === o.id;
            return (
              <motion.button key={o.id} whileTap={{ scale: 0.96 }} onClick={() => setExperience(o.id)}
                style={{
                  padding: '10px 4px', borderRadius: 12, cursor: 'pointer', fontFamily: T.font,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minHeight: 64,
                  background: on ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.04)',
                  color: on ? T.accent : T.text,
                  border: `1.5px solid ${on ? T.accent + '66' : 'rgba(255,255,255,0.08)'}`,
                }}>
                <span style={{ fontSize: 20 }}>{o.emoji}</span>
                <span style={{ fontSize: 12.5, fontWeight: 800 }}>{o.label}</span>
                <span style={{ fontSize: 9, color: T.muted }}>{o.sub}</span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* indications — the scrollable region (bounded), so the button below never clips */}
      <section style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 70 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: '0 0 6px' }}>במה מטפלים? <span style={{ color: T.danger, fontSize: 12 }}>חובה</span></h3>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 7, alignContent: 'flex-start' }}>
          {INDICATION_OPTIONS.map(o => (
            <Chip key={o.id} label={o.label} emoji={o.emoji}
              selected={indications.includes(o.id)} onClick={() => toggleIndication(o.id)} />
          ))}
        </div>
      </section>

      {/* day-part + continue — pinned, always visible */}
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: '0 0 8px' }}>מתי ההקלה הכי נחוצה?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {DAYPART_OPTIONS.map(o => {
            const on = dayPart === o.id;
            return (
              <motion.button key={o.id} whileTap={{ scale: 0.96 }} onClick={() => setDayPart(o.id)}
                style={{
                  padding: '10px 6px', borderRadius: 12, cursor: 'pointer', fontFamily: T.font,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minHeight: 56,
                  background: on ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.04)',
                  color: on ? T.accent : T.muted,
                  border: `1.5px solid ${on ? T.accent + '66' : 'rgba(255,255,255,0.08)'}`,
                }}>
                <span style={{ fontSize: 19 }}>{o.emoji}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>{o.label}</span>
              </motion.button>
            );
          })}
        </div>
      </section>

      <PrimaryBtn onClick={onNext} disabled={!canNext}>המשך</PrimaryBtn>
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

function ScreenPastStrains({ liked, disliked, pickLiked, pickDisliked, removeLiked, removeDisliked, onComplete, cats = [] }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const catsKey = cats.join(',');

  // Live-catalog list (product_sku active). Empty query → a default "מומלץ עבורך" list filtered
  // by the user's licensed categories (never a blank box). Typing → debounced search.
  useEffect(() => {
    const s = q.trim();
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { items } = await api.getCatalogStrains(s, cats);
        if (!cancelled) setResults(items?.length ? items : (s ? seedFallback(s) : []));
      } catch {
        if (!cancelled) setResults(s ? seedFallback(s) : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, s ? 250 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, catsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const inLiked    = (s) => liked.some(x => x.id === s.id);
  const inDisliked = (s) => disliked.some(x => x.id === s.id);
  const canDone    = pastStrainComplete({ liked, disliked });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 20px 10px' }}>
        <p style={{ fontSize: 12, color: T.muted, margin: '0 0 12px', lineHeight: 1.6 }}>
          סמנו זנים שאהבתם 👍 ושפחות אהבתם 👎. גם שניים מספיקים, וזה עוזר לנו לדייק לכם את ההמלצות.
        </p>

        {/* Selected chips — removable */}
        {(liked.length > 0 || disliked.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {liked.map(x => <RemovableChip key={x.id} label={`👍 ${x.name}`} color={T.accent} onRemove={() => removeLiked(x.id)} />)}
            {disliked.map(x => <RemovableChip key={x.id} label={`👎 ${x.name}`} color={T.danger} onRemove={() => removeDisliked(x.id)} />)}
          </div>
        )}

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש לפי שם זן או מגדל..."
          style={{
            width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.05)', border: `1.5px solid ${T.border}`,
            color: T.text, fontSize: 13, fontFamily: T.font, outline: 'none',
          }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', minHeight: 120 }}>
        {/* default-list header (empty query) — recommended/leading from the live catalog */}
        {!q.trim() && results.length > 0 && (
          <p style={{ fontSize: 11, fontWeight: 800, color: T.accent, margin: '4px 2px 10px', letterSpacing: '0.04em' }}>
            ⭐ מומלץ עבורך · מוביל בקטלוג{cats.length ? ' (לפי הרישיון שלך)' : ''}
          </p>
        )}
        {loading && (
          <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', marginTop: 20 }}>טוען…</p>
        )}
        {results.slice(0, 12).map(s => {  /* capped — no endless scroll; search narrows the rest */
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
      <PrimaryBtn onClick={onComplete}>המשך</PrimaryBtn>
    </div>
  );
}

// ── Final screen — DNA reveal (the payoff) ───────────────────────────────────
function ScreenDnaReveal({ batch, onComplete }) {
  // batch.terpenes → { terpeneKey: weight } for the radar. Weights are RANK-derived from the
  // user's onboarding answers (not measured %), so no "%" is shown — names only.
  const profile = Object.fromEntries((batch.terpenes || []).map(t => [t.terpene, t.pct]));
  const seq = dnaSequence(profile);
  const top = Object.entries(profile).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div style={{ padding: '6px 18px 22px', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', overflowY: 'auto', minHeight: 0 }}>
      <h2 style={{ fontSize: 20, fontWeight: 900, color: T.accent, margin: 0 }}>ה-DNA הטרפני שלך 🧬</h2>
      <TerpRadar profile={profile} />

      {/* Dominant terpene chips (rank, not %) */}
      {top.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {top.map(([t]) => {
            const info = TERPENE_HUMAN[t];
            const col = info?.color || T.accent;
            return (
              <span key={t} style={{ fontSize: 12, fontWeight: 800, padding: '4px 11px', borderRadius: 14,
                background: `${col}22`, color: col, border: `1px solid ${col}44` }}>
                {info?.icon} {info?.shortLabel || t}
              </span>
            );
          })}
        </div>
      )}

      {/* DNA קנבינואידי code string */}
      <div style={{ width: '100%', maxWidth: 320, textAlign: 'center', padding: '8px 12px', borderRadius: 12,
        background: 'rgba(0,0,0,0.35)', color: '#A8E6C0', fontFamily: 'monospace', letterSpacing: '0.12em', fontSize: 14 }}>
        {seq}
      </div>

      <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', lineHeight: 1.7, margin: 0 }}>
        טביעת האצבע הטרפנית שלך — נבנתה מהתשובות שלך. פרופיל דומה → התנהגות דומה.
      </p>
      <PrimaryBtn onClick={onComplete}>המשך</PrimaryBtn>
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
      height: '100dvh', maxHeight: '100dvh', overflow: 'hidden',
      background: T.bg, color: T.text, fontFamily: T.font,
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
            <div style={{ padding: '4px 20px 20px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
              ? <ScreenPastStrains liked={liked} disliked={disliked} cats={payload.licenseCategories || []}
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
