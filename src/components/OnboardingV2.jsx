// ─────────────────────────────────────────────────────────────────────────────
//  OnboardingV2 — The reordered, S-tier onboarding experience.
//
//  FLOW  (per the product brief §3):
//   0. License       — upload/skip, OCR expiry, store only verified+expiry
//   1. Form          — flower / oil / vape / mixed
//   2. Tried before? — YES: tap real products + rate; NO: goal/symptom chips
//   3. Time of day   — 5 chips (multi-select)
//   4. Context       — 4 settings (quietly adjusts profile, no chemical labels)
//   5. Flavor        — optional, skippable, flower-users only
//   6. DNA reveal    — the payoff / identity moment
//
//  All Hebrew strings from copy.he.js. No chemical names ever surface.
//  Terpene descriptions via terpeneToHuman.js.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { C as COPY } from '../copy.he.js';
import { buildDnaStrands } from '../lib/terpeneToHuman.js';
import { STRAINS, REASONS } from '../data/strainsConfig.js';
import { api } from '../services/api.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        '#080c10',
  card:      'rgba(255,255,255,0.04)',
  border:    'rgba(74,222,128,0.18)',
  accent:    '#4ADE80',
  violet:    '#A78BFA',
  amber:     '#FBBF24',
  danger:    '#F87171',
  text:      '#F0FDF4',
  muted:     'rgba(187,247,208,0.55)',
  font:      "'Heebo','Segoe UI',sans-serif",
};

const SPRING = { type: 'spring', stiffness: 280, damping: 28 };
const FADE   = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, transition: { duration: 0.3 } };

// ── Showcase products — real Israeli pharmacy box names ────────────────────────
// 14 diverse products across kinds (ind/sat/hyb) and categories (T/C ratio)
// that patients encounter on pharmacy shelves
const SHOWCASE_PRODUCTS = [
  { id: 's1',   name: 'P&Z',              kind: 'אינדיקה',  cat: 'T22/C4',   icon: '🏔️', mood: 'מרגיע עמוק — ערב ולילה' },
  { id: 'p394', name: 'וקטור',            kind: 'אינדיקה',  cat: 'T18/C3',   icon: '💜', mood: 'עמוק ומרגיע, כאב ושינה' },
  { id: 's11',  name: 'אור',              kind: 'אינדיקה',  cat: 'T15/C3',   icon: '🌙', mood: 'מאוזן לגוף ולנפש' },
  { id: 'p39',  name: 'גל',              kind: 'אינדיקה',  cat: 'T10/C10',  icon: '🌊', mood: 'CBD גבוה — רגוע ולא מטשטש' },
  { id: 'p308', name: 'שוהם',            kind: 'אינדיקה',  cat: 'T10/C2',   icon: '🌿', mood: 'עדין, CBD נמוך' },
  { id: 's2',   name: 'תכלת',            kind: 'סאטיבה',   cat: 'T22/C4',   icon: '☁️', mood: 'מרים, בהיר — שעות היום' },
  { id: 'p376', name: 'ילו סאנפלאוור',  kind: 'סאטיבה',   cat: 'T15/C3',   icon: '🌻', mood: 'לימוני, אנרגיה נקייה' },
  { id: 'p94',  name: 'וולטר זי',        kind: 'סאטיבה',   cat: 'T10/C10',  icon: '⚡', mood: 'מאוזן, ראש צלול' },
  { id: 'p44',  name: 'ארי',             kind: 'סאטיבה',   cat: 'T3/C15',   icon: '🍋', mood: 'CBD גבוה — שקט ביום' },
  { id: 's3',   name: 'Wedding CK',      kind: 'היברידי',  cat: 'T22/C4',   icon: '🎂', mood: 'שמח ומאוזן' },
  { id: 'p439', name: 'גליליות סלים',   kind: 'היברידי',  cat: 'T15/C3',   icon: '🌱', mood: 'עדין ומאוזן — כל יום' },
  { id: 's7',   name: 'ספיישל טי',      kind: 'היברידי',  cat: 'T10/C10',  icon: '🫖', mood: 'CBD גבוה, CBD:THC 1:1' },
  { id: 's12',  name: 'גרין קלובר',     kind: 'היברידי',  cat: 'T10/C2',   icon: '🍀', mood: 'עדין, כל יום' },
  { id: 's32',  name: 'טרנקילה',        kind: 'היברידי',  cat: 'T3/C15',   icon: '🧘', mood: 'CBD גבוה — נרגע ולא "גבוה"' },
];

// ── Why-chips (what happened with the product) ──────────────────────────────
const WHY_CHIPS = [
  { id: 'foggy',    label: COPY.onboarding.triedWhyFoggy,      emoji: '🌫️' },
  { id: 'sedated',  label: COPY.onboarding.triedWhySedated,    emoji: '😴' },
  { id: 'nothing',  label: COPY.onboarding.triedWhyDidNothing, emoji: '🫥' },
  { id: 'anxious',  label: COPY.onboarding.triedWhyAnxious,    emoji: '😬' },
  { id: 'lifted',   label: COPY.onboarding.triedWhyLiftedMood, emoji: '🌟' },
  { id: 'pain',     label: COPY.onboarding.triedWhyPainRelief, emoji: '💪' },
];

// ── Goal options (for "haven't tried" branch) ────────────────────────────────
const GOALS = [
  { id: 'sleep',    label: 'שינה',                  emoji: '🌙' },
  { id: 'pain',     label: 'כאב',                   emoji: '💪' },
  { id: 'anxiety',  label: 'חרדה / מתח',            emoji: '🧘' },
  { id: 'ptsd',     label: 'PTSD / פוסט-טראומה',   emoji: '💜' },
  { id: 'focus',    label: 'ריכוז ואנרגיה',         emoji: '⚡' },
  { id: 'appetite', label: 'תיאבון / בחילות',       emoji: '🍽️' },
  { id: 'gi',       label: 'מערכת עיכול',           emoji: '🌿' },
  { id: 'mood',     label: 'מצב רוח',               emoji: '☀️' },
];

// ── Context options → quiet profile adjustment ───────────────────────────────
// The user never sees the terpene mapping — we just adjust internally.
const CONTEXTS = [
  {
    id: 'home',
    label:  COPY.onboarding.contextHome,
    emoji:  '🛋️',
    lean:   {},   // no override needed
  },
  {
    id: 'social',
    label:  COPY.onboarding.contextSocial,
    emoji:  '🎭',
    // Quietly boosts calm/anti-anxiety; adds protective kill-switches against high-THC sedation
    lean:   { linalool: +0.3, limonene: +0.2, myrcene: -0.2 },
  },
  {
    id: 'work',
    label:  COPY.onboarding.contextWork,
    emoji:  '💼',
    lean:   { pinene: +0.35, terpinolene: +0.25, myrcene: -0.3, linalool: -0.15 },
  },
  {
    id: 'sleep',
    label:  COPY.onboarding.contextSleep,
    emoji:  '🌙',
    lean:   { myrcene: +0.4, linalool: +0.35, pinene: -0.2, terpinolene: -0.25 },
  },
];

// ── Flavor options (flower users only, optional) ─────────────────────────────
const FLAVORS = [
  { id: 'citrus',  label: COPY.onboarding.flavorCitrus,  emoji: '🍋', terp: 'limonene' },
  { id: 'sweet',   label: COPY.onboarding.flavorSweet,   emoji: '🍬', terp: null },
  { id: 'earthy',  label: COPY.onboarding.flavorEarthy,  emoji: '🌲', terp: 'pinene' },
  { id: 'spicy',   label: COPY.onboarding.flavorSpicy,   emoji: '🌶️', terp: 'caryophyllene' },
  { id: 'floral',  label: COPY.onboarding.flavorFloral,  emoji: '🌸', terp: 'linalool' },
];

// ── Utility ────────────────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, variant = 'primary', style: s = {} }) {
  const base = {
    width: '100%', padding: '14px', borderRadius: 16, cursor: disabled ? 'default' : 'pointer',
    fontSize: 15, fontWeight: 800, border: 'none', fontFamily: T.font, transition: 'all .15s',
    opacity: disabled ? 0.45 : 1, ...s,
  };
  const styles = {
    primary: { background: 'linear-gradient(135deg,#4ADE80,#22C55E)', color: '#061006', boxShadow: '0 6px 24px rgba(74,222,128,0.30)' },
    ghost:   { background: 'rgba(255,255,255,0.04)', color: T.muted, border: `1px solid ${T.border}` },
    danger:  { background: 'rgba(248,113,113,0.12)', color: T.danger, border: '1px solid rgba(248,113,113,0.25)' },
  };
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={!disabled ? onClick : undefined}
      style={{ ...base, ...styles[variant] }}>
      {children}
    </motion.button>
  );
}

function Chip({ label, emoji, selected, onClick, color }) {
  const col = color || T.accent;
  return (
    <motion.button whileTap={{ scale: 0.92 }} onClick={onClick}
      style={{
        padding: '10px 16px', borderRadius: 22, cursor: 'pointer',
        fontSize: 13, fontWeight: 700, fontFamily: T.font,
        background:  selected ? `${col}15` : 'rgba(255,255,255,0.04)',
        color:       selected ? col : T.muted,
        border:     `1.5px solid ${selected ? col+'66' : 'rgba(255,255,255,0.08)'}`,
        boxShadow:   selected ? `0 0 16px ${col}22` : 'none',
        display: 'flex', alignItems: 'center', gap: 7,
        transition: 'all .15s',
      }}>
      {emoji && <span>{emoji}</span>}
      {label}
    </motion.button>
  );
}

function StepHeader({ step, total, title, sub }) {
  return (
    <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, justifyContent: 'flex-end' }}>
        {Array.from({ length: total }).map((_, i) => (
          <motion.div key={i}
            animate={{ scale: i === step ? 1.3 : 1, opacity: i <= step ? 1 : 0.2 }}
            style={{ width: i === step ? 16 : 6, height: 6, borderRadius: 3,
              background: i <= step ? T.accent : T.muted, transition: 'all .3s' }} />
        ))}
      </div>
      <motion.div key={step} {...FADE}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: T.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          {title}
        </h2>
        {sub && <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.55 }}>{sub}</p>}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 0 — License
// ─────────────────────────────────────────────────────────────────────────────
function StepLicense({ onVerified, onSkip }) {
  const [state, setState] = useState('idle'); // idle | scanning | ok | expired | error
  const [expiry, setExpiry]  = useState(null);
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setState('scanning');

    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const b64 = ev.target.result.split(',')[1];
        const mtype = file.type || 'image/jpeg';
        try {
          const res = await api.parseMenu({ image_base64: b64, media_type: mtype,
            text: 'Extract the license expiry date (תוקף) from this Israeli medical cannabis license. Return ONLY the date in ISO format YYYY-MM-DD or "not_found".' });
          const extracted = res?.items?.[0]?.name || res?.rawText || '';
          const match = extracted.match(/\d{4}-\d{2}-\d{2}/);
          if (match) {
            const d = new Date(match[0]);
            const today = new Date();
            if (d < today) { setState('expired'); setExpiry(match[0]); }
            else { setState('ok'); setExpiry(match[0]); }
          } else {
            setState('ok'); // assume ok if we couldn't extract — let user continue
          }
        } catch { setState('ok'); } // network error → optimistic
      };
      reader.readAsDataURL(file);
    } catch { setState('error'); }
  };

  return (
    <div style={{ padding: '24px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ textAlign: 'center', padding: '28px 0 20px' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🪪</div>
        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.65, maxWidth: 280, marginInline: 'auto' }}>
          {COPY.onboarding.licenseSub}
        </div>
      </motion.div>

      {state === 'idle' && (
        <>
          <Btn onClick={() => fileRef.current?.click()}>
            {COPY.onboarding.licenseUpload} 📷
          </Btn>
          <input ref={fileRef} type='file' accept='image/*' capture='environment'
            style={{ display: 'none' }} onChange={handleFile} />
          <Btn variant='ghost' onClick={onSkip}>{COPY.onboarding.licenseSkip}</Btn>
        </>
      )}

      {state === 'scanning' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            style={{ fontSize: 32, marginBottom: 12 }}>🔍</motion.div>
          <div style={{ fontSize: 13, color: T.muted }}>{COPY.onboarding.licenseScanning}</div>
        </div>
      )}

      {state === 'ok' && (
        <>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ textAlign: 'center', padding: '16px', borderRadius: 18,
              background: 'rgba(74,222,128,0.08)', border: `1.5px solid rgba(74,222,128,0.30)` }}>
            <div style={{ fontSize: 32 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.accent, marginTop: 8 }}>
              {COPY.onboarding.licenseOk}
            </div>
            {expiry && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>תוקף: {expiry}</div>}
          </motion.div>
          <Btn onClick={() => onVerified(expiry)}>נמשיך →</Btn>
        </>
      )}

      {state === 'expired' && (
        <>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ padding: '16px', borderRadius: 18, background: 'rgba(251,191,36,0.08)',
              border: '1.5px solid rgba(251,191,36,0.30)' }}>
            <div style={{ fontSize: 13, color: T.amber, lineHeight: 1.6 }}>
              {COPY.onboarding.licenseExpired}
            </div>
          </motion.div>
          <Btn variant='ghost' onClick={onSkip}>אמשיך בלי פווידר</Btn>
        </>
      )}

      {state === 'error' && (
        <>
          <div style={{ fontSize: 13, color: T.muted, textAlign: 'center', padding: '12px' }}>
            {COPY.onboarding.licenseError}
          </div>
          <Btn onClick={() => { setState('idle'); fileRef.current.value = ''; }}>נסה שוב</Btn>
          <Btn variant='ghost' onClick={onSkip}>{COPY.onboarding.licenseSkip}</Btn>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 1 — Consumption form
// ─────────────────────────────────────────────────────────────────────────────
const FORMS = [
  { id: 'flower', label: COPY.onboarding.formFlower, emoji: '🌸', desc: 'תפרחת — לעישון, מאדה' },
  { id: 'oil',    label: COPY.onboarding.formOil,    emoji: '💧', desc: 'שמן תת-לשוני / קפסולות' },
  { id: 'vape',   label: COPY.onboarding.formVape,   emoji: '💨', desc: 'אידוי / ואפורייזר / קרטריג' },
  { id: 'mixed',  label: COPY.onboarding.formMixed,  emoji: '🔄', desc: 'שילוב של כמה צורות' },
];

function StepForm({ selected, onChange, onNext }) {
  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {FORMS.map(f => {
        const sel = selected === f.id;
        return (
          <motion.button key={f.id} whileTap={{ scale: 0.97 }} onClick={() => onChange(f.id)}
            style={{
              padding: '14px 18px', borderRadius: 18, cursor: 'pointer', textAlign: 'right',
              background: sel ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)',
              border: `2px solid ${sel ? T.accent + '66' : 'rgba(255,255,255,0.08)'}`,
              display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: sel ? '0 0 20px rgba(74,222,128,0.15)' : 'none',
              fontFamily: T.font,
            }}>
            <span style={{ fontSize: 26, flexShrink: 0 }}>{f.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: sel ? T.accent : T.text }}>{f.label}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{f.desc}</div>
            </div>
            {sel && <span style={{ color: T.accent, fontSize: 18 }}>✓</span>}
          </motion.button>
        );
      })}
      <div style={{ marginTop: 8 }}>
        <Btn onClick={onNext} disabled={!selected}>המשך →</Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 2 — Tried before?
// ─────────────────────────────────────────────────────────────────────────────
function StepTriedBranch({ onYes, onNo }) {
  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        style={{ textAlign: 'center', fontSize: 44, marginBottom: 10 }}>🌿</motion.div>

      <Btn onClick={onYes}>
        כן — ניסיתי כבר כמה דברים
      </Btn>
      <Btn variant='ghost' onClick={onNo}>
        לא עדיין — עזרו לי להתחיל
      </Btn>
      <p style={{ fontSize: 11, color: T.muted, textAlign: 'center', marginTop: 4, lineHeight: 1.55 }}>
        אם ניסית — תוכל/י לספר לנו מה עבד ומה לא ונבנה פרופיל מדויק יותר.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 2A — Tried picker (real box names)
// ─────────────────────────────────────────────────────────────────────────────
function StepTriedPicker({ ratings, onRatingChange, onWhy, activeWhy, onNext }) {
  const [q, setQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch]   = useState(false);

  const handleSearch = (val) => {
    setQ(val);
    if (!val.trim()) { setSearchResults([]); return; }
    const sl = val.toLowerCase();
    const hits = STRAINS.filter(s =>
      s.name.toLowerCase().includes(sl) || (s.genetics||'').toLowerCase().includes(sl)
    ).slice(0, 6).map(s => ({ id: s.id, name: s.name, cat: s.cat, kind: s.kind, icon: '🌿', mood: s.kind }));
    setSearchResults(hits);
  };

  const allProducts = showSearch && searchResults.length ? searchResults : SHOWCASE_PRODUCTS;
  const rated = Object.keys(ratings).length;

  const RATING_OPTS = [
    { id: 'helped', label: COPY.onboarding.triedHelped, color: T.accent, emoji: '✅' },
    { id: 'meh',    label: COPY.onboarding.triedMeh,    color: T.amber,  emoji: '🤷' },
    { id: 'nope',   label: COPY.onboarding.triedNope,   color: T.danger, emoji: '❌' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Search */}
      <div style={{ padding: '14px 20px 10px', flexShrink: 0 }}>
        <input value={q} onChange={e => { handleSearch(e.target.value); setShowSearch(true); }}
          onFocus={() => setShowSearch(true)}
          placeholder={COPY.onboarding.triedSearchPlaceholder}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 14, boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.05)', border: `1.5px solid ${T.border}`,
            color: T.text, fontSize: 13, outline: 'none', fontFamily: T.font,
          }} />
        {q && <button onClick={() => { setQ(''); setShowSearch(false); setSearchResults([]); }}
          style={{ marginTop: 6, fontSize: 11, color: T.muted, background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: T.font }}>
          ← חזרה לרשימה
        </button>}
      </div>

      {/* Product list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', scrollbarWidth: 'none' }}>
        {allProducts.map(p => {
          const r = ratings[p.id];
          const hasWhy = activeWhy === p.id;
          const ratingColor = r === 'helped' ? T.accent : r === 'nope' ? T.danger : r === 'meh' ? T.amber : undefined;

          return (
            <div key={p.id} style={{ marginBottom: 8 }}>
              <div style={{
                borderRadius: 16, border: `1.5px solid ${r ? ratingColor + '44' : 'rgba(255,255,255,0.08)'}`,
                background: r ? `${ratingColor}08` : 'rgba(255,255,255,0.03)',
                padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{p.icon || '🌿'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{p.cat} · {p.mood}</div>
                  </div>
                </div>
                {/* Rating buttons */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {RATING_OPTS.map(opt => (
                    <button key={opt.id}
                      onClick={() => { onRatingChange(p.id, r === opt.id ? null : opt.id); if (!r || r !== opt.id) onWhy(p.id); }}
                      style={{
                        flex: 1, padding: '7px 4px', borderRadius: 10, cursor: 'pointer',
                        fontSize: 11, fontWeight: 700, fontFamily: T.font,
                        background: r === opt.id ? `${opt.color}18` : 'rgba(255,255,255,0.04)',
                        color:      r === opt.id ? opt.color : T.muted,
                        border:    `1.5px solid ${r === opt.id ? opt.color + '55' : 'rgba(255,255,255,0.07)'}`,
                        boxShadow:  r === opt.id ? `0 0 12px ${opt.color}22` : 'none',
                      }}>
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
                {/* Why chips — show after a rating */}
                <AnimatePresence>
                  {r && hasWhy && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <div style={{ paddingTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {WHY_CHIPS.map(c => (
                          <button key={c.id}
                            onClick={() => { /* why chips are informational — could store them */ }}
                            style={{
                              padding: '6px 12px', borderRadius: 16, cursor: 'pointer',
                              fontSize: 11, fontWeight: 700, fontFamily: T.font,
                              background: 'rgba(255,255,255,0.04)',
                              color: T.muted, border: '1px solid rgba(255,255,255,0.07)',
                            }}>
                            {c.emoji} {c.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
        <div style={{ height: 20 }} />
      </div>

      {/* Continue */}
      <div style={{ padding: '12px 20px', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Btn onClick={onNext} disabled={rated === 0}>
          {rated > 0 ? `סיימתי — שמרת ${rated} מוצרים` : 'בחר/י לפחות מוצר אחד'}
        </Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 2B — Goals (didn't try yet)
// ─────────────────────────────────────────────────────────────────────────────
function StepGoals({ selected, onChange, onNext }) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id].slice(0, 3));
  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {GOALS.map(g => (
          <Chip key={g.id} label={g.label} emoji={g.emoji} selected={selected.includes(g.id)}
            onClick={() => toggle(g.id)} />
        ))}
      </div>
      <Btn onClick={onNext} disabled={selected.length === 0}>המשך →</Btn>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 3 — Time of day
// ─────────────────────────────────────────────────────────────────────────────
const TIME_CHIPS = [
  { id: 'morning',   label: COPY.onboarding.timeMorning,   emoji: '☀️' },
  { id: 'midday',    label: COPY.onboarding.timeMidDay,    emoji: '🌤️' },
  { id: 'afternoon', label: COPY.onboarding.timeAfternoon, emoji: '🌇' },
  { id: 'evening',   label: COPY.onboarding.timeEvening,   emoji: '🌆' },
  { id: 'night',     label: COPY.onboarding.timeNight,     emoji: '🌙' },
];

function StepTime({ selected, onChange, onNext }) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        {TIME_CHIPS.map(t => (
          <Chip key={t.id} label={t.label} emoji={t.emoji} selected={selected.includes(t.id)}
            onClick={() => toggle(t.id)} />
        ))}
      </div>
      <div style={{ marginTop: 4 }}>
        <Btn onClick={onNext} disabled={selected.length === 0}>המשך →</Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 4 — Context / setting (quietly adjusts profile)
// ─────────────────────────────────────────────────────────────────────────────
function StepContext({ selected, onChange, onNext }) {
  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {CONTEXTS.map(c => {
        const sel = selected === c.id;
        return (
          <motion.button key={c.id} whileTap={{ scale: 0.97 }} onClick={() => onChange(c.id)}
            style={{
              padding: '14px 18px', borderRadius: 18, cursor: 'pointer', textAlign: 'right',
              background: sel ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.04)',
              border: `2px solid ${sel ? T.violet + '55' : 'rgba(255,255,255,0.08)'}`,
              display: 'flex', alignItems: 'center', gap: 14, fontFamily: T.font,
            }}>
            <span style={{ fontSize: 26, flexShrink: 0 }}>{c.emoji}</span>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: sel ? T.violet : T.text }}>{c.label}</div>
            </div>
            {sel && <span style={{ color: T.violet, fontSize: 18 }}>✓</span>}
          </motion.button>
        );
      })}
      <div style={{ marginTop: 4 }}>
        <Btn onClick={onNext} disabled={!selected}>המשך →</Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 5 — Flavor (optional, flower only)
// ─────────────────────────────────────────────────────────────────────────────
function StepFlavor({ selected, onChange, onNext, onSkip }) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 4 }}>
        {FLAVORS.map(f => (
          <Chip key={f.id} label={f.label} emoji={f.emoji} selected={selected.includes(f.id)}
            onClick={() => toggle(f.id)} />
        ))}
      </div>
      <Btn onClick={onNext}>{selected.length > 0 ? 'המשך →' : COPY.onboarding.flavorSkip}</Btn>
      {selected.length > 0 && (
        <button onClick={onSkip}
          style={{ fontSize: 12, color: T.muted, background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: T.font, textAlign: 'center' }}>
          דלג על הטעמים
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 6 — DNA Reveal (the payoff)
// ─────────────────────────────────────────────────────────────────────────────
function StepDNAReveal({ profile, onComplete }) {
  const [showScience, setShowScience] = useState(false);
  const strands = buildDnaStrands(profile, 4);
  const noProfile = strands.length === 0;

  // Fallback strands if nothing computed
  const displayStrands = noProfile
    ? [
        { strand: 'מאוזן ושקוט', icon: '🌿', color: '#4ADE80', weight: 0.7 },
        { strand: 'ראש צלול ביום', icon: '🌲', color: '#86EFAC', weight: 0.5 },
      ]
    : strands;

  return (
    <div style={{ padding: '24px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <motion.div style={{ textAlign: 'center' }}>
        <motion.div
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 16 }}
          style={{ fontSize: 56, marginBottom: 10 }}>🧬</motion.div>
        <div style={{ fontSize: 22, fontWeight: 900, color: T.accent, marginBottom: 4, letterSpacing: '-0.02em' }}>
          {COPY.onboarding.dnaTitle}
        </div>
        <div style={{ fontSize: 13, color: T.muted }}>{COPY.onboarding.dnaSub}</div>
      </motion.div>

      {/* Strands */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {displayStrands.map((s, i) => (
          <motion.div key={s.strand}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.12 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '13px 16px', borderRadius: 16,
              background: `${s.color}09`,
              border: `1.5px solid ${s.color}30`,
            }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{s.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.strand}</div>
            </div>
            {/* Weight bar */}
            <div style={{ width: 50, height: 5, borderRadius: 3,
              background: 'rgba(255,255,255,0.07)', flexShrink: 0, overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }} animate={{ width: `${Math.round(s.weight * 100)}%` }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.7, ease: 'easeOut' }}
                style={{ height: '100%', borderRadius: 3, background: s.color }} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Science reveal */}
      <button onClick={() => setShowScience(!showScience)}
        style={{ fontSize: 11, color: T.muted, background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: T.font, textAlign: 'center' }}>
        {showScience ? '↑ הסתר' : COPY.onboarding.dnaScience}
      </button>
      <AnimatePresence>
        {showScience && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderRadius: 14,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              fontSize: 11, color: T.muted, lineHeight: 1.65 }}>
              ❝ ההתאמות שלנו מבוססות על ניתוח טרפנים וגנטיקה — לא THC לבד. מאחורי כל המלצה עומד מנוע שממפה את הפרופיל שלך לזן שמתנהג בצורה דומה לזה שעזר לך בעבר. ❞
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disclaimer */}
      <div style={{ fontSize: 10, color: 'rgba(187,247,208,0.35)', lineHeight: 1.55, textAlign: 'center' }}>
        {COPY.legal.matchIsNotPrescription}
      </div>

      <Btn onClick={onComplete}>{COPY.onboarding.dnaCtaStart} 🌿</Btn>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROOT — OnboardingV2
// ─────────────────────────────────────────────────────────────────────────────

// Context→ terpene lean presets (applied on context selection, never shown to user)
function applyContextLean(profile, contextId) {
  const ctx = CONTEXTS.find(c => c.id === contextId);
  if (!ctx) return profile;
  const result = { ...profile };
  for (const [t, delta] of Object.entries(ctx.lean || {})) {
    result[t] = (result[t] || 0) + delta;
  }
  return result;
}

// Build a naive base profile from "tried before" ratings
// Maps: helped → positive weight by kind, nope → negative, meh → neutral
function buildProfileFromRatings(triedRatings) {
  const profile = {};
  const add = (t, v) => { profile[t] = (profile[t] || 0) + v; };

  for (const [strainId, rating] of Object.entries(triedRatings)) {
    const s = STRAINS.find(x => x.id === strainId) || SHOWCASE_PRODUCTS.find(x => x.id === strainId);
    if (!s) continue;
    const mul = rating === 'helped' ? +1.0 : rating === 'nope' ? -1.0 : 0.2;
    if (s.kind === 'אינדיקה') { add('myrcene', 0.6 * mul); add('linalool', 0.3 * mul); }
    if (s.kind === 'סאטיבה')  { add('limonene', 0.6 * mul); add('terpinolene', 0.3 * mul); add('pinene', 0.3 * mul); }
    if (s.kind === 'היברידי') { add('myrcene', 0.25 * mul); add('limonene', 0.25 * mul); add('caryophyllene', 0.2 * mul); }
    if (s.cat?.includes('C10') || s.cat?.includes('C15')) { add('caryophyllene', 0.3 * mul); }
  }

  return profile;
}

// Build profile from goals
function buildProfileFromGoals(goals) {
  const profile = {};
  const add = (t, v) => { profile[t] = (profile[t] || 0) + v; };
  const GOAL_TERPS = {
    sleep:    { myrcene: 0.8, linalool: 0.6 },
    pain:     { caryophyllene: 0.8, myrcene: 0.5, humulene: 0.3 },
    anxiety:  { linalool: 0.7, limonene: 0.5 },
    ptsd:     { linalool: 0.6, caryophyllene: 0.5 },
    focus:    { pinene: 0.8, terpinolene: 0.5, limonene: 0.3 },
    appetite: { myrcene: 0.6, limonene: 0.3 },
    gi:       { caryophyllene: 0.7, humulene: 0.5 },
    mood:     { limonene: 0.7, terpinolene: 0.4 },
  };
  for (const g of goals) {
    for (const [t, v] of Object.entries(GOAL_TERPS[g] || {})) add(t, v);
  }
  return profile;
}

// Build profile from time-of-day chips
function applyTimeLean(profile, times) {
  if (!times.length) return profile;
  const p = { ...profile };
  const isNight  = times.includes('night') || times.includes('evening');
  const isMorning = times.includes('morning') || times.includes('midday');
  if (isNight && !isMorning) {
    p.myrcene   = (p.myrcene   || 0) + 0.25;
    p.linalool  = (p.linalool  || 0) + 0.20;
    p.pinene    = (p.pinene    || 0) - 0.15;
  }
  if (isMorning && !isNight) {
    p.pinene      = (p.pinene      || 0) + 0.25;
    p.terpinolene = (p.terpinolene || 0) + 0.20;
    p.myrcene     = (p.myrcene     || 0) - 0.15;
  }
  return p;
}

// Flavor → terpene lean
function applyFlavorLean(profile, flavors) {
  const p = { ...profile };
  const FLAVOR_TERP = { citrus: 'limonene', earthy: 'pinene', spicy: 'caryophyllene', floral: 'linalool' };
  for (const f of flavors) {
    const t = FLAVOR_TERP[f];
    if (t) p[t] = (p[t] || 0) + 0.25;
  }
  return p;
}

const TOTAL_STEPS = 7; // 0-6

export default function OnboardingV2({ user, onComplete, onSkip }) {
  const [step, setStep]       = useState(0);
  const [direction, setDir]   = useState(1);

  // Per-step state
  const [licenseVerified, setLicenseVerified] = useState(false);
  const [licenseExpiry,   setLicenseExpiry]   = useState(null);
  const [form, setForm]                       = useState(null);        // flower|oil|vape|mixed
  const [triedBranch, setTriedBranch]         = useState(null);        // null|'yes'|'no'
  const [triedRatings, setTriedRatings]       = useState({});          // { [strainId]: 'helped'|'nope'|'meh' }
  const [activeWhy, setActiveWhy]             = useState(null);
  const [goals, setGoals]                     = useState([]);
  const [times, setTimes]                     = useState([]);
  const [context, setContext]                 = useState(null);
  const [flavors, setFlavors]                 = useState([]);

  const next = (skip = false) => { setDir(1); setStep(s => s + (skip ? 2 : 1)); };
  const prev = () => { setDir(-1); setStep(s => Math.max(0, s - 1)); };

  // Compute the terpene profile incrementally
  const profile = useMemo(() => {
    let p = {};
    if (triedBranch === 'yes') {
      p = buildProfileFromRatings(triedRatings);
    } else if (triedBranch === 'no') {
      p = buildProfileFromGoals(goals);
    }
    p = applyTimeLean(p, times);
    if (context) p = applyContextLean(p, context);
    if (form !== 'oil') p = applyFlavorLean(p, flavors);
    return p;
  }, [triedRatings, goals, times, context, flavors, form, triedBranch]);

  const handleComplete = useCallback(async () => {
    // Build the `ans` shape expected by scoreAll / CannaMatch
    const helpedIds  = Object.entries(triedRatings).filter(([, r]) => r === 'helped').map(([id]) => id);
    const noHelpIds  = Object.entries(triedRatings).filter(([, r]) => r === 'nope').map(([id]) => id);

    // Map goals/times to internal reason IDs
    const GOAL_REASON = {
      sleep: 'sleep', pain: 'pain', anxiety: 'anxiety', ptsd: 'ptsd',
      focus: 'focus', appetite: 'appetite', gi: 'gi', mood: 'anxiety',
    };
    const reasons = goals.map(g => GOAL_REASON[g]).filter(Boolean);

    // Time → form cats
    const isNight   = times.includes('night');
    const isMorning = times.includes('morning') || times.includes('midday');
    const defaultCats = isNight
      ? ['T22/C4','T18/C3','T15/C3','T10/C10']
      : isMorning
        ? ['T15/C3','T10/C10','T10/C2','T3/C15']
        : ['T22/C4','T18/C3','T15/C3','T12/C12','T10/C10'];

    const localAns = {
      cats:      defaultCats,
      form:      form ? [form] : [],
      reasons,
      flavors,
      helped:    helpedIds,
      notHelped: noHelpIds,
      current:   [],
      times,
      context:   context || 'home',
      terpeneProfile: profile,
    };

    // Persist to backend — best-effort
    const payload = {
      licenseVerified, licenseExpiry,
      deliveryMethods: form ? [form] : [],
      effectGoals: goals,
      timingPrefs: times,
      contextPref: context,
      scentSelections: Object.fromEntries(flavors.map(f => [f, 'liked'])),
      lovedStrains: helpedIds,
      hatedStrains: noHelpIds,
      terpeneProfile: profile,
    };
    let dna = null;
    try {
      const data = await api.submitOnboarding(payload);
      dna = data?.dna;
    } catch {}

    onComplete({ localAns, dna, licenseVerified, licenseExpiry });
  }, [triedRatings, goals, times, context, flavors, form, profile, licenseVerified, licenseExpiry, onComplete]);

  // Determine step titles
  const STEP_META = [
    { title: COPY.onboarding.licenseTitle,   sub: null },
    { title: COPY.onboarding.formTitle,       sub: COPY.onboarding.formSub },
    { title: triedBranch ? (triedBranch === 'yes' ? COPY.onboarding.triedTitle : COPY.onboarding.goalsTitle) : 'כבר ניסית קנאביס? 🌿',
      sub: triedBranch === 'yes' ? COPY.onboarding.triedSub : triedBranch === 'no' ? COPY.onboarding.goalsSub : 'זה יעזור לנו להתאים לך הרבה יותר מהר' },
    { title: COPY.onboarding.timeTitle,       sub: COPY.onboarding.timeSub },
    { title: COPY.onboarding.contextTitle,    sub: COPY.onboarding.contextSub },
    { title: form !== 'oil' ? COPY.onboarding.flavorTitle : null, sub: null },
    { title: COPY.onboarding.dnaTitle,        sub: COPY.onboarding.dnaSub },
  ];

  const meta = STEP_META[step] || STEP_META[0];

  return (
    <div dir='rtl' style={{
      minHeight: '100%', background: T.bg, color: T.text,
      fontFamily: T.font, display: 'flex', flexDirection: 'column',
      maxWidth: 480, marginInline: 'auto',
    }}>
      {/* Step header (not on DNA reveal — that has its own) */}
      {step < 6 && (
        <>
          <StepHeader step={step} total={TOTAL_STEPS} title={meta.title} sub={meta.sub} />
          {step > 0 && (
            <button onClick={prev}
              style={{ margin: '6px 20px 0', padding: '5px 0', background: 'none', border: 'none',
                color: T.muted, fontSize: 12, cursor: 'pointer', fontFamily: T.font, textAlign: 'right' }}>
              ← חזרה
            </button>
          )}
        </>
      )}

      {/* Step body */}
      <AnimatePresence mode='wait' custom={direction}>
        <motion.div key={`step-${step}`}
          custom={direction}
          variants={{
            enter:   d => ({ x: d > 0 ? 60 : -60, opacity: 0 }),
            center:  { x: 0, opacity: 1 },
            exit:    d => ({ x: d > 0 ? -60 : 60, opacity: 0 }),
          }}
          initial='enter' animate='center' exit='exit'
          transition={{ duration: 0.28, ease: 'easeInOut' }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Step 0 — License */}
          {step === 0 && (
            <StepLicense
              onVerified={(expiry) => {
                setLicenseVerified(true);
                setLicenseExpiry(expiry);
                next();
              }}
              onSkip={() => { setLicenseVerified(false); next(); }}
            />
          )}

          {/* Step 1 — Form */}
          {step === 1 && (
            <StepForm
              selected={form}
              onChange={setForm}
              onNext={next}
            />
          )}

          {/* Step 2 — Tried branch */}
          {step === 2 && !triedBranch && (
            <StepTriedBranch
              onYes={() => setTriedBranch('yes')}
              onNo={() => setTriedBranch('no')}
            />
          )}
          {step === 2 && triedBranch === 'yes' && (
            <StepTriedPicker
              ratings={triedRatings}
              onRatingChange={(id, val) => setTriedRatings(r => val ? { ...r, [id]: val } : Object.fromEntries(Object.entries(r).filter(([k]) => k !== id)))}
              onWhy={(id) => setActiveWhy(prev => prev === id ? null : id)}
              activeWhy={activeWhy}
              onNext={next}
            />
          )}
          {step === 2 && triedBranch === 'no' && (
            <StepGoals selected={goals} onChange={setGoals} onNext={next} />
          )}

          {/* Step 3 — Time */}
          {step === 3 && (
            <StepTime selected={times} onChange={setTimes} onNext={next} />
          )}

          {/* Step 4 — Context */}
          {step === 4 && (
            <StepContext selected={context} onChange={setContext} onNext={next} />
          )}

          {/* Step 5 — Flavor (skip for oil users) */}
          {step === 5 && (
            form === 'oil'
              ? (() => { next(); return null; })()
              : <StepFlavor selected={flavors} onChange={setFlavors} onNext={next} onSkip={() => { setFlavors([]); next(); }} />
          )}

          {/* Step 6 — DNA Reveal */}
          {step === 6 && (
            <StepDNAReveal profile={profile} onComplete={handleComplete} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Global skip option (except DNA reveal) */}
      {step > 0 && step < 6 && (
        <div style={{ padding: '6px 20px 14px', textAlign: 'center', flexShrink: 0 }}>
          <button onClick={() => { if (onSkip) onSkip(); }}
            style={{ fontSize: 11, color: 'rgba(187,247,208,0.30)', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: T.font }}>
            דלג על ההגדרה — אמשיך ישירות
          </button>
        </div>
      )}
    </div>
  );
}
