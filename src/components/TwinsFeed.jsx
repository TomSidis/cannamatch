// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — Genetic Twins Feed (premium dark-mode redesign)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { P, G, B, SPRING, VARIANTS, detectGenFamily, FONT } from '../styles/ds.js';
import StrainAvatar from './StrainAvatar.jsx';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import { api } from '../services/api.js';

// ── Similarity ring ────────────────────────────────────────────────────────────
function SimilarityRing({ pct }) {
  const r    = 20;
  const circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);
  const color = pct >= 80 ? P.violet : pct >= 65 ? P.mint : P.amber;

  return (
    <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
      <svg width={48} height={48} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={24} cy={24} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4} />
        <motion.circle
          cx={24} cy={24} r={r}
          fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${dash} ${circ}` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, color,
      }}>
        {pct}%
      </div>
    </div>
  );
}

// ── Twin card ─────────────────────────────────────────────────────────────────
function TwinCard({ p, index }) {
  const [expanded, setExpanded] = useState(false);
  const family = detectGenFamily(p.lineage || '');
  const fam    = P.genetics[family] || P.genetics.default;

  return (
    <motion.div
      variants={VARIANTS.fadeUp}
      custom={index}
      layout
      onClick={() => setExpanded((e) => !e)}
      whileHover={{ y: -2 }}
      style={{
        borderRadius: 22,
        overflow: 'hidden',
        background: P.surface,
        border: `1.5px solid ${fam.glow}20`,
        boxShadow: G.card,
        cursor: 'pointer',
      }}
    >
      {/* Genetics glow strip */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, transparent, ${fam.glow}60, transparent)`,
      }} />

      <div style={{ padding: '16px 18px' }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <StrainAvatar lineage={p.lineage} size={50} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 800, color: P.hi,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              marginBottom: 3,
            }}>
              {p.strain}
            </div>
            <div style={{ fontSize: 11, color: P.lo }}>
              {p.city && <span>{p.city}</span>}
              {p.indication && <span> · {p.indication}</span>}
            </div>
            <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} style={{
                  fontSize: 12,
                  color: i < (p.rating || 0) ? P.amber : 'rgba(255,255,255,0.12)',
                }}>
                  ★
                </span>
              ))}
            </div>
          </div>

          <SimilarityRing pct={p.similarity || 0} />
        </div>

        {/* Quote */}
        {p.quote && (
          <div style={{
            padding: '10px 14px', borderRadius: 14,
            background: 'rgba(255,255,255,0.03)',
            border: B.card,
          }}>
            <p style={{
              fontSize: 12.5, color: P.mid, lineHeight: 1.65,
              fontStyle: 'italic',
            }}>
              "{p.quote}"
            </p>
          </div>
        )}

        {/* Hotspot badge */}
        {(p.hotspot || 0) >= 15 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              marginTop: 10,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 12,
              background: 'rgba(251,191,36,0.10)',
              border: `1px solid rgba(251,191,36,0.28)`,
              fontSize: 11, fontWeight: 700, color: P.amber,
            }}
          >
            🔥 {p.hotspot} מטופלי {p.indication} ב{p.city} דירגו 5★ השבוע
          </motion.div>
        )}

        {/* Expanded lineage detail */}
        <AnimatePresence>
          {expanded && p.lineage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={SPRING.smooth}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                marginTop: 10, paddingTop: 10,
                borderTop: `1px solid rgba(255,255,255,0.05)`,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 12 }}>🧬</span>
                <span style={{ fontSize: 12, color: P.lo }}>{p.lineage}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Main TwinsFeed ────────────────────────────────────────────────────────────
export default function TwinsFeed({ userId }) {
  const [twins,   setTwins]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let alive = true;
    api.getTwins(userId)
      .then((d) => { if (alive) setTwins(Array.isArray(d) ? d : d.twins || []); })
      .catch((err) => { if (alive) setError(err); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId]);

  if (loading) return (
    <LoadingSkeleton
      variant="twins"
      message="מחפש את התאומים הגנטיים שלך… 👯🧬"
      rows={3}
    />
  );
  if (error) throw error;

  const list = twins || [];

  return (
    <motion.div
      variants={VARIANTS.stagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT }}
    >
      {/* Header card */}
      <motion.div
        variants={VARIANTS.fadeUp}
        style={{
          borderRadius: 22,
          padding: '20px 20px',
          background: `linear-gradient(145deg, ${P.genetics.kush.from}, #100a20)`,
          border: `1.5px solid ${P.violet}25`,
          boxShadow: `${G.violet(14)}, 0 4px 24px rgba(0,0,0,0.45)`,
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', top: -20, left: -20, width: 160, height: 160,
          background: `radial-gradient(circle, ${P.violet}20, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>👯</span>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: P.hi }}>
              התאומים הגנטיים שלך
            </h2>
          </div>
          <p style={{ fontSize: 12.5, color: 'rgba(233,213,255,0.70)', lineHeight: 1.5 }}>
            אנשים עם DNA כמעט זהה לשלך — מה הם אוהבים עכשיו.
            ככל שתדרג יותר, ההתאמות יהיו מדויקות יותר.
          </p>
        </div>
      </motion.div>

      {/* Empty state */}
      {list.length === 0 && (
        <motion.div
          variants={VARIANTS.fadeUp}
          style={{
            borderRadius: 22, padding: '28px 24px',
            textAlign: 'center',
            background: P.surface, border: B.card,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 10 }}>🧬</div>
          <p style={{ fontSize: 14, color: P.lo, lineHeight: 1.6 }}>
            אין עדיין תאומים גנטיים זמינים.
            <br />
            דרגו כמה זנים שניסיתם — ואנחנו נמצא לכם התאמות.
          </p>
        </motion.div>
      )}

      {/* Twin cards */}
      {list.map((p, i) => (
        <TwinCard key={i} p={p} index={i} />
      ))}
    </motion.div>
  );
}
