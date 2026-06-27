// ─────────────────────────────────────────────────────────────────────────────
//  EmotionalRating — 5-state emotional scale, stored as integer 1-5.
//
//  Visual language:
//    • Large central "mascot face" — the emoji changes and bounces on selection.
//    • Glowing ring around the center face whose color tracks the selected state.
//    • 5 pill buttons below for selection; each has its own color at full opacity
//      only when selected, dim otherwise.
//    • Readonly mode: non-interactive, compact, used in JournalHistory entries.
//
//  NOT stars. NOT a slider. NOT a numeric scale shown to the user.
// ─────────────────────────────────────────────────────────────────────────────

import { motion, AnimatePresence } from 'framer-motion';
import { P, SPRING } from '../styles/ds.js';

export const EMOTIONAL_STATES = [
  { id: 1, emoji: '😞', label: 'לא עזר בכלל', color: P.rose,    ring: 'rgba(248,113,113,0.40)' },
  { id: 2, emoji: '😕', label: 'עזר מעט',      color: '#F97316', ring: 'rgba(249,115,22, 0.35)' },
  { id: 3, emoji: '😑', label: 'בינוני',        color: P.amber,  ring: 'rgba(251,191,36, 0.38)' },
  { id: 4, emoji: '🙂', label: 'עזר',           color: P.sage,   ring: 'rgba(134,239,172,0.38)' },
  { id: 5, emoji: '😄', label: 'עזר מאוד',     color: P.mint,   ring: 'rgba(74,222,128, 0.50)' },
];

// ── Readonly badge (used in history list) ─────────────────────────────────────
export function RatingBadge({ value }) {
  const s = EMOTIONAL_STATES.find((e) => e.id === value);
  if (!s) return null;
  return (
    <span style={{
      display:      'inline-flex',
      alignItems:   'center',
      gap:          6,
      padding:      '3px 10px',
      borderRadius: 20,
      background:   `${s.ring}`,
      fontSize:     13,
      color:        s.color,
      fontWeight:   600,
      direction:    'rtl',
    }}>
      {s.emoji} {s.label}
    </span>
  );
}

// ── Interactive EmotionalRating ───────────────────────────────────────────────
export default function EmotionalRating({ value, onChange }) {
  const selected = EMOTIONAL_STATES.find((e) => e.id === value) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>

      {/* Central mascot face — changes expression + glow on selection */}
      <div style={{ position: 'relative', width: 96, height: 96 }}>
        {/* Glow ring */}
        <motion.div
          animate={{
            boxShadow: selected
              ? `0 0 28px ${selected.ring}, 0 0 56px ${selected.ring.replace('0.', '0.1')}`
              : '0 0 0px transparent',
            opacity: selected ? 1 : 0,
          }}
          transition={SPRING.smooth}
          style={{
            position:     'absolute',
            inset:        -4,
            borderRadius: '50%',
            border:       `2px solid ${selected?.ring ?? 'transparent'}`,
            pointerEvents: 'none',
          }}
        />
        {/* Mascot emoji — bounces on change */}
        <AnimatePresence mode="wait">
          <motion.div
            key={value ?? 'empty'}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1,   opacity: 1 }}
            exit={{    scale: 0.6, opacity: 0 }}
            transition={SPRING.bounce}
            style={{
              width:         '100%',
              height:        '100%',
              borderRadius:  '50%',
              background:    selected ? `radial-gradient(circle, ${selected.ring}, transparent 70%)` : P.surface,
              display:       'flex',
              alignItems:    'center',
              justifyContent:'center',
              fontSize:       54,
              userSelect:    'none',
              cursor:        'default',
            }}
          >
            {selected ? selected.emoji : '🤔'}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Label */}
      <AnimatePresence mode="wait">
        {selected && (
          <motion.p
            key={selected.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{    opacity: 0, y: -8 }}
            transition={SPRING.smooth}
            style={{
              margin:     0,
              fontSize:   15,
              fontWeight: 600,
              color:      selected.color,
              direction:  'rtl',
            }}
          >
            {selected.label}
          </motion.p>
        )}
        {!selected && (
          <motion.p
            key="prompt"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{    opacity: 0 }}
            style={{ margin: 0, fontSize: 14, color: P.lo, direction: 'rtl' }}
          >
            איך זה גרם לך להרגיש?
          </motion.p>
        )}
      </AnimatePresence>

      {/* 5 selector buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {EMOTIONAL_STATES.map((s) => {
          const active = value === s.id;
          return (
            <motion.button
              key={s.id}
              onClick={() => onChange(s.id)}
              whileHover={{ scale: 1.12 }}
              whileTap={{   scale: 0.92 }}
              transition={SPRING.bounce}
              aria-label={s.label}
              aria-pressed={active}
              style={{
                width:        44,
                height:       44,
                borderRadius: '50%',
                border:       `2px solid ${active ? s.color : 'rgba(255,255,255,0.08)'}`,
                background:   active ? `${s.ring}` : 'rgba(255,255,255,0.03)',
                fontSize:     22,
                cursor:       'pointer',
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                transition:   'border-color 0.2s, background 0.2s',
                boxShadow:    active ? `0 0 14px ${s.ring}` : 'none',
              }}
            >
              {s.emoji}
            </motion.button>
          );
        })}
      </div>

    </div>
  );
}
