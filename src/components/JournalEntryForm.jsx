// ─────────────────────────────────────────────────────────────────────────────
//  JournalEntryForm — Private treatment journal entry (Phase C2).
//
//  TWO PHASES:
//    1. "form"    — EmotionalRating + optional photo + optional notes → Save
//    2. "details" — "רוצה להוסיף פרטים?" → effects chips + side_effects chips
//
//  Design rules (from C2 brief):
//    • Phase 1 saves with rating alone — zero required fields beyond rating.
//    • Phase 2 is optional and framed as "more detail", never as required.
//    • No gamification of consumption. No streaks. No medical claims in copy.
//    • No community share / opt-in anywhere in this component — that is C3.
//
//  Props:
//    strain      {id: string, name: string}  — the strain being logged
//    onClose     ()=>void                    — dismiss the sheet
//    onSaved     (entry)=>void               — called after phase-1 save (entry has id)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { P, B, G, SPRING, FONT } from '../styles/ds.js';
import EmotionalRating from './EmotionalRating.jsx';
import { api } from '../services/api.js';

// ── Closed lists (IDs mirror api/lib/journalConfig.js — backend validates) ────
const EFFECTS = [
  { id: 'sleep',       label: 'שינה',           emoji: '🌙' },
  { id: 'antiPain',    label: 'הקלה בכאב',      emoji: '💊' },
  { id: 'antiAnxiety', label: 'הרגעת חרדה',     emoji: '🧘' },
  { id: 'mood',        label: 'שיפור מצב רוח',  emoji: '☀️' },
  { id: 'bodyCalm',    label: 'רוגע גופני',      emoji: '🌿' },
  { id: 'clearHead',   label: 'ראש צלול',        emoji: '🎯' },
  { id: 'appetite',    label: 'עלייה בתיאבון',  emoji: '🍽️' },
];

const SIDE_EFFECTS = [
  { id: 'dry_mouth',  label: 'יובש בפה',      emoji: '🫦' },
  { id: 'anxiety',    label: 'חרדה',           emoji: '😬' },
  { id: 'dizzy',      label: 'סחרחורת',        emoji: '💫' },
  { id: 'oversleep',  label: 'ישנוניות יתר',   emoji: '😴' },
  { id: 'foggy',      label: 'ערפול',           emoji: '🌫️' },
  { id: 'munchies',   label: 'עלייה בתיאבון',  emoji: '🍽️' },
  { id: 'heart_rate', label: 'דפיקות לב',      emoji: '💓' },
  { id: 'headache',   label: 'כאב ראש',         emoji: '🤕' },
  { id: 'nausea',     label: 'בחילה',           emoji: '🤢' },
  { id: 'other',      label: 'אחר',             emoji: '📝', isFreeText: true },
];

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ item, active, onClick }) {
  return (
    <motion.button
      onClick={() => onClick(item.id)}
      whileTap={{ scale: 0.93 }}
      aria-pressed={active}
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        gap:           5,
        padding:       '6px 12px',
        borderRadius:  20,
        border:        `1px solid ${active ? P.mint : B.subtle}`,
        background:    active ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.03)',
        color:         active ? P.mint : P.mid,
        fontSize:      13,
        fontFamily:    FONT,
        cursor:        'pointer',
        transition:    'border-color 0.15s, background 0.15s, color 0.15s',
        boxShadow:     active ? G.mint(10) : 'none',
        direction:     'rtl',
      }}
    >
      <span>{item.emoji}</span>
      <span>{item.label}</span>
    </motion.button>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p style={{
      margin:     '0 0 8px',
      fontSize:   12,
      fontWeight: 600,
      color:      P.lo,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      direction:  'rtl',
    }}>
      {children}
    </p>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JournalEntryForm({ strain, onClose, onSaved }) {
  const [phase,   setPhase]   = useState('form');    // 'form' | 'details' | 'done'
  const [rating,  setRating]  = useState(null);
  const [notes,   setNotes]   = useState('');
  const [effects,     setEffects]     = useState([]);
  const [sideEffects, setSideEffects] = useState([]);
  const [sideOther,   setSideOther]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);
  const savedIdRef = useRef(null);

  // ── Toggle chip ─────────────────────────────────────────────────────────────
  function toggleEffect(id)     { setEffects((p)     => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); }
  function toggleSideEffect(id) { setSideEffects((p) => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); }

  // ── Phase 1 save ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!rating) return;
    setSaving(true);
    setError(null);
    try {
      const entry = await api.journal.create({
        strain_id: strain.id,
        rating,
        notes: notes.trim() || undefined,
      });
      savedIdRef.current = entry.id;
      onSaved?.(entry);
      setPhase('details');
    } catch (err) {
      setError(err.message || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  }

  // ── Phase 2 save (details) ──────────────────────────────────────────────────
  async function handleSaveDetails() {
    if (!savedIdRef.current) { setPhase('done'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.journal.addDetails(savedIdRef.current, {
        effects:            effects.length   ? effects     : undefined,
        side_effects:       sideEffects.length ? sideEffects : undefined,
        side_effects_other: sideEffects.includes('other') && sideOther.trim()
          ? sideOther.trim()
          : undefined,
      });
      setPhase('done');
    } catch (err) {
      setError(err.message || 'שגיאה בשמירת פרטים');
    } finally {
      setSaving(false);
    }
  }

  // ── Backdrop click closes (phase 1 only) ───────────────────────────────────
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose?.();
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{   opacity: 0 }}
      onClick={handleBackdrop}
      style={{
        position:        'fixed',
        inset:           0,
        zIndex:          200,
        background:      'rgba(12,13,17,0.78)',
        display:         'flex',
        alignItems:      'flex-end',
        justifyContent:  'center',
        backdropFilter:  'blur(4px)',
      }}
    >
      <motion.div
        initial={{ y: '100%', opacity: 0.5 }}
        animate={{ y: 0,      opacity: 1   }}
        exit={{   y: '100%', opacity: 0   }}
        transition={SPRING.smooth}
        style={{
          width:          '100%',
          maxWidth:       480,
          maxHeight:      '92dvh',
          overflowY:      'auto',
          background:     P.raised,
          borderRadius:   '20px 20px 0 0',
          padding:        '24px 20px 32px',
          fontFamily:     FONT,
          direction:      'rtl',
          boxShadow:      '0 -8px 40px rgba(0,0,0,0.55)',
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.15)',
          margin: '0 auto 20px',
        }} />

        <AnimatePresence mode="wait">

          {/* ── PHASE 1: form ─────────────────────────────────────────── */}
          {phase === 'form' && (
            <motion.div key="form"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0  }}
              exit={{   opacity: 0, y: -12 }}
              transition={SPRING.ease}
              style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
            >
              {/* Strain header */}
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 12, color: P.lo }}>יומן טיפול אישי</p>
                <h3 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: P.hi }}>
                  {strain?.name ?? 'זן לא ידוע'}
                </h3>
              </div>

              {/* Emotional rating — the hero */}
              <EmotionalRating value={rating} onChange={setRating} />

              {/* Notes — optional */}
              <div>
                <label style={{ display: 'block', fontSize: 12, color: P.lo, marginBottom: 6 }}>
                  הערות אישיות (נשאר פרטי לגמרי)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="איך הרגשת? מה שרצית לרשום לעצמך..."
                  rows={3}
                  style={{
                    width:         '100%',
                    boxSizing:     'border-box',
                    background:    P.surface,
                    border:        `1px solid ${B.subtle}`,
                    borderRadius:  10,
                    color:         P.hi,
                    fontSize:      14,
                    fontFamily:    FONT,
                    padding:       '10px 12px',
                    resize:        'none',
                    outline:       'none',
                    direction:     'rtl',
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <p style={{ margin: 0, fontSize: 13, color: P.danger, textAlign: 'center' }}>{error}</p>
              )}

              {/* Save button */}
              <motion.button
                onClick={handleSave}
                disabled={!rating || saving}
                whileTap={{ scale: 0.97 }}
                style={{
                  width:         '100%',
                  padding:       '14px 0',
                  borderRadius:  12,
                  border:        'none',
                  background:    rating ? P.mint : 'rgba(255,255,255,0.07)',
                  color:         rating ? P.inv  : P.lo,
                  fontSize:      16,
                  fontWeight:    700,
                  fontFamily:    FONT,
                  cursor:        rating ? 'pointer' : 'default',
                  transition:    'background 0.25s, color 0.25s',
                  boxShadow:     rating ? G.mint(16) : 'none',
                }}
              >
                {saving ? 'שומר...' : 'שמור יומן'}
              </motion.button>
            </motion.div>
          )}

          {/* ── PHASE 2: details ─────────────────────────────────────── */}
          {phase === 'details' && (
            <motion.div key="details"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0  }}
              exit={{   opacity: 0, y: -12 }}
              transition={SPRING.ease}
              style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: P.mint }}>
                  נשמר בהצלחה
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: P.lo }}>
                  רוצה להוסיף פרטים על ההשפעה?
                </p>
              </div>

              {/* Positive effects */}
              <div>
                <SectionLabel>מה הרגשת?</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {EFFECTS.map((e) => (
                    <Chip key={e.id} item={e} active={effects.includes(e.id)} onClick={toggleEffect} />
                  ))}
                </div>
              </div>

              {/* Side effects */}
              <div>
                <SectionLabel>תופעות לוואי?</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {SIDE_EFFECTS.map((e) => (
                    <Chip key={e.id} item={e} active={sideEffects.includes(e.id)} onClick={toggleSideEffect} />
                  ))}
                </div>
                {/* Free-text "other" input — only when "other" chip is selected */}
                <AnimatePresence>
                  {sideEffects.includes('other') && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{   height: 0,    opacity: 0 }}
                      transition={SPRING.smooth}
                      style={{ overflow: 'hidden' }}
                    >
                      <input
                        type="text"
                        value={sideOther}
                        onChange={(e) => setSideOther(e.target.value)}
                        placeholder="תאר את התופעה..."
                        maxLength={300}
                        style={{
                          width:       '100%',
                          boxSizing:   'border-box',
                          marginTop:   10,
                          background:  P.surface,
                          border:      `1px solid ${B.subtle}`,
                          borderRadius: 8,
                          color:       P.hi,
                          fontSize:    14,
                          fontFamily:  FONT,
                          padding:     '8px 12px',
                          outline:     'none',
                          direction:   'rtl',
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Error */}
              {error && (
                <p style={{ margin: 0, fontSize: 13, color: P.danger, textAlign: 'center' }}>{error}</p>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <motion.button
                  onClick={handleSaveDetails}
                  disabled={saving}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    width: '100%', padding: '13px 0', borderRadius: 12,
                    border: 'none', background: P.mint, color: P.inv,
                    fontSize: 15, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
                    boxShadow: G.mint(14),
                  }}
                >
                  {saving ? 'שומר...' : 'שמור פרטים'}
                </motion.button>
                <button
                  onClick={() => setPhase('done')}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 12,
                    border: 'none', background: 'transparent',
                    color: P.lo, fontSize: 14, fontFamily: FONT, cursor: 'pointer',
                  }}
                >
                  דלג
                </button>
              </div>
            </motion.div>
          )}

          {/* ── PHASE 3: done ─────────────────────────────────────────── */}
          {phase === 'done' && (
            <motion.div key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1   }}
              exit={{   opacity: 0             }}
              transition={SPRING.bounce}
              onAnimationComplete={() => setTimeout(onClose, 1400)}
              style={{ textAlign: 'center', padding: '20px 0 8px' }}
            >
              <motion.div
                animate={{ rotate: [0, -8, 8, -4, 0] }}
                transition={{ duration: 0.55, delay: 0.1 }}
                style={{ fontSize: 52, marginBottom: 12 }}
              >
                🌿
              </motion.div>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: P.mint }}>
                יומן עודכן
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: P.lo }}>
                המידע נשמר אצלך בלבד
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
