// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — Premium Daily Check-In Modal
//  Flow: mood-select → DNA calibration scan → Zemach result + safe targets
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { P, G, B, SPRING, VARIANTS, FONT } from '../styles/ds.js';
import { api } from '../services/api.js';

const MOODS = [
  {
    key: 'racing',
    emoji: '🧠⚡',
    label: 'הראש בעומס יתר',
    sub: 'מחשבות מרוצות · חרדה',
    dim: 'mood', val: 'anxious',
    gradient: `linear-gradient(145deg, ${P.genetics.kush.from}, #1a0d36)`,
    border: 'rgba(167,139,250,0.35)',
    glow: P.violet,
  },
  {
    key: 'pain',
    emoji: '💥',
    label: 'הגוף מרוסק',
    sub: 'כאב פיזי · עייפות',
    dim: 'pain', val: 'high',
    gradient: `linear-gradient(145deg, ${P.genetics.cookies.from}, #250e00)`,
    border: 'rgba(251,191,36,0.35)',
    glow: P.amber,
  },
  {
    key: 'ghost',
    emoji: '👻',
    label: 'רוח רפאים',
    sub: 'חסר שינה · ריקנות',
    dim: 'mood', val: 'anxious',
    gradient: `linear-gradient(145deg, ${P.genetics.haze.from}, #05182a)`,
    border: 'rgba(56,189,248,0.30)',
    glow: P.sky,
  },
  {
    key: 'chill',
    emoji: '😌',
    label: 'רגוע וזורם',
    sub: 'מצב טוב · שליטה',
    dim: 'mood', val: 'calm',
    gradient: `linear-gradient(145deg, #052e16, #0a3d1f)`,
    border: 'rgba(74,222,128,0.30)',
    glow: P.mint,
  },
];

// ── DNA scan animation ────────────────────────────────────────────────────────
function DNAScan({ mood }) {
  return (
    <motion.div
      variants={VARIANTS.fadeIn}
      initial="hidden" animate="show"
      style={{ textAlign: 'center', padding: '36px 0' }}
    >
      {/* Rings */}
      <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 20px' }}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ scale: [1, 1.8 + i * 0.3, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2.2, delay: i * 0.4, repeat: Infinity }}
            style={{
              position: 'absolute',
              inset: `${-i * 12}px`,
              borderRadius: '50%',
              border: `1.5px solid ${mood?.glow || P.mint}`,
              opacity: 0.5,
            }}
          />
        ))}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2.0, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute', inset: 4,
            borderRadius: '50%',
            border: `2.5px solid ${mood?.glow || P.mint}`,
            borderTopColor: 'transparent',
            borderRightColor: 'transparent',
          }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36,
        }}>
          🧬
        </div>
      </div>

      <motion.p
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.4, repeat: Infinity }}
        style={{ fontSize: 17, fontWeight: 800, color: P.hi, marginBottom: 6 }}
      >
        מכייל את ה-DNA…
      </motion.p>
      <p style={{ fontSize: 11, color: P.lo, letterSpacing: '0.05em' }}>
        סורק טריגרים · נועל זנים מסוכנים · מחשב מטרות בטוחות
      </p>

      {/* Progress shimmer */}
      <div style={{
        marginTop: 20, height: 3, borderRadius: 3,
        background: 'rgba(255,255,255,0.07)', overflow: 'hidden', maxWidth: 200, margin: '20px auto 0',
      }}>
        <motion.div
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            height: '100%', width: '50%', borderRadius: 3,
            background: `linear-gradient(90deg, transparent, ${mood?.glow || P.mint}, transparent)`,
          }}
        />
      </div>
    </motion.div>
  );
}

// ── Safe target pill ──────────────────────────────────────────────────────────
function SafeTarget({ t }) {
  return (
    <motion.div
      variants={VARIANTS.scale}
      style={{
        padding: '7px 14px', borderRadius: 14,
        background: 'rgba(74,222,128,0.10)',
        border: `1px solid rgba(74,222,128,0.25)`,
        fontSize: 12, fontWeight: 700, color: P.sage,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      <span style={{ fontSize: 10, color: P.mint, fontWeight: 800 }}>✓</span>
      {t.name}
      {t.category && (
        <span style={{ color: P.lo, fontWeight: 500 }}>· {t.category}</span>
      )}
    </motion.div>
  );
}

// ── Main DailyCheckIn ─────────────────────────────────────────────────────────
export default function DailyCheckIn({ userId, userName = 'חבר', onUpdateDNA, onClose }) {
  const [phase,   setPhase]   = useState('ask');
  const [reply,   setReply]   = useState(null);
  const [targets, setTargets] = useState([]);
  const [selMood, setSelMood] = useState(null);
  const [leaving, setLeaving] = useState(false);

  const pick = async (m) => {
    setSelMood(m);
    setPhase('scanning');
    try {
      const data = await api.checkin(userId, m.dim, m.val);
      onUpdateDNA?.(data.profile || data);
      setReply(data.message || `קלטתי, ${userName}. עדכנתי לך את ה-DNA. 🧬`);
      setTargets(data.safe_targets || []);
    } catch {
      setReply(`קלטתי, ${userName}! עדכנתי לך את הפרופיל. 🌿`);
    }
    setTimeout(() => setPhase('result'), 1500);
  };

  const close = () => {
    setLeaving(true);
    setTimeout(() => onClose?.(), 360);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={SPRING.smooth}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(6,7,10,0.72)',
        backdropFilter: 'blur(12px)',
        padding: '0 0 env(safe-area-inset-bottom,0)',
        fontFamily: FONT,
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <motion.div
        dir="rtl"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: leaving ? 60 : 0, opacity: leaving ? 0 : 1 }}
        transition={SPRING.smooth}
        style={{
          width: '100%', maxWidth: 440,
          borderRadius: '28px 28px 0 0',
          background: 'rgba(12,14,20,0.97)',
          backdropFilter: 'blur(24px)',
          border: `1.5px solid rgba(74,222,128,0.15)`,
          borderBottom: 'none',
          boxShadow: `${G.mint(20)}, 0 -16px 48px rgba(0,0,0,0.70)`,
          overflow: 'hidden',
        }}
      >
        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{
            width: 40, height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.15)',
          }} />
        </div>

        <div style={{ padding: '8px 24px 32px' }}>
          <AnimatePresence mode="wait">

            {/* ── Phase: Ask ──────────────────────────────────────────── */}
            {phase === 'ask' && (
              <motion.div key="ask" {...VARIANTS.page}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 20,
                }}>
                  <div>
                    <p style={{ fontSize: 11, color: P.mint, fontWeight: 700, letterSpacing: '0.1em',
                                textTransform: 'uppercase', marginBottom: 2 }}>
                      צ׳ק-אין יומי
                    </p>
                    <h3 style={{ fontSize: 22, fontWeight: 800, color: P.hi }}>
                      איך אתה מרגיש?
                    </h3>
                    <p style={{ fontSize: 13, color: P.lo, marginTop: 2 }}>
                      לחץ פעם אחת — ואני אכייל את ה-DNA שלך
                    </p>
                  </div>
                  <button
                    onClick={close}
                    style={{
                      background: 'rgba(255,255,255,0.07)', border: B.subtle,
                      borderRadius: 12, padding: '8px 12px',
                      color: P.lo, fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {MOODS.map((m) => (
                    <motion.button
                      key={m.key}
                      whileHover={{ scale: 1.03, boxShadow: `0 0 20px ${m.glow}30` }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => pick(m)}
                      style={{
                        padding: '18px 14px',
                        borderRadius: 20,
                        background: m.gradient,
                        border: `1.5px solid ${m.border}`,
                        cursor: 'pointer',
                        textAlign: 'right',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.40)',
                      }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 8 }}>{m.emoji}</div>
                      <p style={{ fontSize: 14, fontWeight: 800, color: P.hi, marginBottom: 3 }}>
                        {m.label}
                      </p>
                      <p style={{ fontSize: 11, color: 'rgba(240,253,244,0.55)' }}>
                        {m.sub}
                      </p>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Phase: Scanning ──────────────────────────────────────── */}
            {phase === 'scanning' && (
              <motion.div key="scan" {...VARIANTS.page}>
                <DNAScan mood={selMood} />
              </motion.div>
            )}

            {/* ── Phase: Result ────────────────────────────────────────── */}
            {phase === 'result' && (
              <motion.div key="result" {...VARIANTS.page}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: P.mint, boxShadow: G.mint(6),
                    }} />
                    <span style={{ fontSize: 11, color: P.mint, fontWeight: 700,
                                   textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      ה-DNA עודכן
                    </span>
                  </div>
                  <button
                    onClick={close}
                    style={{
                      background: 'rgba(255,255,255,0.07)', border: B.subtle,
                      borderRadius: 12, padding: '8px 12px',
                      color: P.lo, fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Zemach response bubble */}
                <motion.div
                  variants={VARIANTS.fadeUp}
                  initial="hidden" animate="show"
                  style={{
                    padding: '16px 18px', borderRadius: 20,
                    background: 'rgba(74,222,128,0.07)',
                    border: `1.5px solid rgba(74,222,128,0.22)`,
                    boxShadow: G.mint(10),
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <motion.span
                      animate={{ rotate: [0, -5, 5, 0] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      style={{ fontSize: 28, flexShrink: 0 }}
                    >
                      🌿
                    </motion.span>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: P.hi }}>
                      {reply}
                    </p>
                  </div>
                </motion.div>

                {/* Safe targets */}
                {targets.length > 0 && (
                  <motion.div
                    variants={VARIANTS.fadeUp}
                    initial="hidden" animate="show"
                    style={{ marginBottom: 20 }}
                  >
                    <p style={{ fontSize: 11, color: P.lo, fontWeight: 700,
                                letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                      🎯 מטרות בטוחות עכשיו
                    </p>
                    <motion.div
                      variants={VARIANTS.stagger}
                      initial="hidden" animate="show"
                      style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
                    >
                      {targets.map((t, i) => (
                        <SafeTarget key={i} t={t} />
                      ))}
                    </motion.div>
                  </motion.div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: G.mint(14) }}
                  whileTap={{ scale: 0.97 }}
                  onClick={close}
                  style={{
                    width: '100%', padding: '15px',
                    borderRadius: 18, border: 'none',
                    background: P.mint,
                    color: P.inv, fontSize: 15, fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: G.mint(8),
                  }}
                >
                  קיבלתי, תודה 💚
                </motion.button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
