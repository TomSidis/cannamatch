// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — Premium "FIFA-Card" Strain Recommendation Card
//
//  Two-tier information density:
//    Collapsed  → match %, name, top effects, safety indicator
//    Expanded   → full terpene chart, genetics lineage, Zemach quote, CTA
//
//  Usage:
//    <StrainCard strain={s} onBasket={fn} onRate={fn} zemachQuote="..." />
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  P, B, G, SPRING, VARIANTS, TERP_META, detectGenFamily, matchTier,
} from '../styles/ds.js';

// ── Genetics family gradient map ─────────────────────────────────────────────
function GenGradient({ family, children, style = {} }) {
  const fam = P.genetics[family] || P.genetics.default;
  return (
    <div style={{
      background: `linear-gradient(155deg, ${fam.from} 0%, ${fam.to} 100%)`,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Match percentage ring (SVG) ───────────────────────────────────────────────
function MatchRing({ pct, size = 64 }) {
  const tier = matchTier(pct);
  const r    = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={5} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={tier.color} strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${dash} ${circ}` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
          style={{ filter: tier.glow !== 'none' ? `drop-shadow(0 0 5px ${tier.color})` : 'none' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: size < 56 ? 13 : 16, fontWeight: 800, color: tier.color, lineHeight: 1 }}>
          {pct}
        </span>
        <span style={{ fontSize: 8, fontWeight: 600, color: tier.color, opacity: 0.8 }}>%</span>
      </div>
    </div>
  );
}

// ── Terpene mini-bar chart ────────────────────────────────────────────────────
function TerpChart({ terps = {}, max = 4 }) {
  const sorted = Object.entries(terps)
    .filter(([k]) => TERP_META[k])
    .sort(([, a], [, b]) => b - a)
    .slice(0, max);

  if (sorted.length === 0) return null;

  const peak = sorted[0]?.[1] || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.map(([terp, val]) => {
        const meta = TERP_META[terp];
        const pct  = Math.round((val / peak) * 100);
        return (
          <div key={terp} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, width: 46, color: P.mid, fontWeight: 600,
                           textAlign: 'right', flexShrink: 0 }}>
              {meta.label}
            </span>
            <div style={{ flex: 1, height: 4, borderRadius: 2,
                          background: 'rgba(255,255,255,0.08)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }}
                style={{
                  height: '100%', borderRadius: 2,
                  background: meta.color,
                  boxShadow: `0 0 6px ${meta.color}88`,
                }}
              />
            </div>
            <span style={{ fontSize: 9, color: P.lo, width: 26, textAlign: 'left', flexShrink: 0 }}>
              {Math.round(val * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Effect pills ─────────────────────────────────────────────────────────────
const EFFECT_LABELS = {
  sleep:       { label: 'שינה',         icon: '💤' },
  pain:        { label: 'כאב',          icon: '🩹' },
  anxiety:     { label: 'חרדה',         icon: '🧘' },
  ptsd:        { label: 'PTSD',         icon: '🛡️' },
  focus:       { label: 'ריכוז',        icon: '🎯' },
  appetite:    { label: 'תיאבון',       icon: '🍽️' },
  gi:          { label: 'מעי',          icon: '🌿' },
  mood:        { label: 'מצב רוח',     icon: '🌈' },
  relax:       { label: 'הרגעה',        icon: '😌' },
};

function EffectPill({ id }) {
  const eff = EFFECT_LABELS[id];
  if (!eff) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '3px 9px', borderRadius: 20,
      background: 'rgba(255,255,255,0.08)',
      border: B.subtle,
      fontSize: 10, fontWeight: 600, color: P.mid,
    }}>
      <span style={{ fontSize: 11 }}>{eff.icon}</span> {eff.label}
    </span>
  );
}

// ── Kill-switch safety badge ─────────────────────────────────────────────────
function SafetyBadge({ triggered = false, message }) {
  if (!triggered) return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 10,
        background: 'rgba(248,113,113,0.15)',
        border: `1px solid rgba(248,113,113,0.35)`,
        boxShadow: G.rose(10),
      }}
    >
      <span style={{ fontSize: 14 }}>🛡️</span>
      <p style={{ fontSize: 11, color: P.danger, fontWeight: 600, lineHeight: 1.4 }}>
        {message || 'זן זה חסום לבטיחותך'}
      </p>
    </motion.div>
  );
}

// ── Zemach inline quote ────────────────────────────────────────────────────────
function ZemachQuote({ message, family }) {
  if (!message) return null;
  const fam = P.genetics[family] || P.genetics.default;
  return (
    <motion.div
      variants={VARIANTS.fadeUp}
      style={{
        display: 'flex', gap: 10, padding: '12px 14px',
        borderRadius: 14,
        background: 'rgba(0,0,0,0.30)',
        border: `1px solid ${fam.glow}28`,
      }}
    >
      <motion.span
        animate={{ rotate: [0, -3, 3, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ fontSize: 22, flexShrink: 0, filter: `drop-shadow(0 0 6px ${fam.glow}88)` }}
      >
        🌿
      </motion.span>
      <p style={{ fontSize: 12.5, color: P.mid, lineHeight: 1.65, fontStyle: 'italic' }}>
        {message}
      </p>
    </motion.div>
  );
}

// ── Category badge ────────────────────────────────────────────────────────────
function CategoryBadge({ cat }) {
  if (!cat) return null;
  const isCBD = cat.includes('/C') && parseInt((cat.match(/C(\d+)/) || [])[1] || 0) >= 10;
  const isBlnd = cat.includes('/C') && parseInt((cat.match(/T(\d+)/) || [])[1] || 0) <= 5;
  const color  = isCBD ? P.sky : isBlnd ? P.violet : P.mint;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 8,
      background: `${color}18`,
      border: `1px solid ${color}40`,
      fontSize: 10, fontWeight: 800, color,
      letterSpacing: '0.04em',
    }}>
      {cat}
    </span>
  );
}

// ── Confidence indicator ──────────────────────────────────────────────────────
function ConfidenceDot({ level }) {
  const c = level === 'verified' ? P.mint
          : level === 'grower'   ? P.amber
          : P.lo;
  const t = level === 'verified' ? '✓ מאומת'
          : level === 'grower'   ? '⊕ מגדל'
          : '? לא מאומת';
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: c, letterSpacing: '0.06em',
    }}>
      {t}
    </span>
  );
}

// ── Main StrainCard ───────────────────────────────────────────────────────────
export default function StrainCard({
  strain,
  onBasket,
  onRate,
  inBasket  = false,
  zemachQuote,
  safetyTriggered = false,
  safetyMessage,
  index = 0,
}) {
  const [expanded, setExpanded] = useState(false);
  const tier   = matchTier(strain.match || 0);
  const family = detectGenFamily(strain.lineage || strain.genetics || '');
  const fam    = P.genetics[family] || P.genetics.default;
  const topEffects = (strain.effects || []).slice(0, 3);

  const toggle = useCallback(() => setExpanded((e) => !e), []);

  const cardStyle = {
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    border: `1.5px solid ${fam.glow}28`,
    boxShadow: expanded ? G.cardHover : G.card,
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'box-shadow 0.3s',
  };

  // Collapsed height content
  const CollapsedContent = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '18px 20px',
    }}>
      {/* Genetics avatar badge */}
      <div style={{
        width: 52, height: 52, borderRadius: 16, flexShrink: 0,
        background: `linear-gradient(145deg, ${fam.glow}40, ${fam.glow}15)`,
        border: `1.5px solid ${fam.glow}50`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24,
        boxShadow: `0 0 14px ${fam.glow}30`,
      }}>
        {family === 'kush'    ? '🏔️' :
         family === 'diesel'  ? '⛽' :
         family === 'cookies' ? '🍪' :
         family === 'haze'    ? '☁️' :
         family === 'purple'  ? '💜' :
         family === 'og'      ? '🌊' :
         family === 'gelato'  ? '🍨' : '🌿'}
      </div>

      {/* Name + effects */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{
            fontSize: 16, fontWeight: 800,
            color: P.hi,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {strain.name}
          </span>
          {safetyTriggered && (
            <span style={{ fontSize: 13, flexShrink: 0 }} title="חסום לבטיחותך">🛡️</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
          <CategoryBadge cat={strain.cat || strain.category} />
          <ConfidenceDot level={strain.gConf || strain.genetic_confidence} />
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {topEffects.map((e) => <EffectPill key={e} id={e} />)}
        </div>
      </div>

      {/* Match ring */}
      <div style={{ flexShrink: 0 }}>
        <MatchRing pct={strain.match || 0} size={58} />
      </div>
    </div>
  );

  return (
    <motion.div
      layout
      variants={VARIANTS.fadeUp}
      custom={index}
      whileHover={{ y: -3, boxShadow: `${G.cardHover}, 0 0 24px ${fam.glow}20` }}
      style={cardStyle}
      onClick={toggle}
    >
      {/* Background gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(165deg, ${fam.from} 0%, ${fam.to} 85%, ${P.void} 100%)`,
        zIndex: 0,
      }} />
      {/* Ambient glow top-right */}
      <div style={{
        position: 'absolute', top: -20, left: -20, width: 120, height: 120,
        background: `radial-gradient(circle, ${fam.glow}25, transparent 70%)`,
        zIndex: 0, pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {CollapsedContent}

        {/* Kill-switch overlay */}
        {safetyTriggered && (
          <div style={{ padding: '0 20px 14px' }}>
            <SafetyBadge triggered={safetyTriggered} message={safetyMessage} />
          </div>
        )}

        {/* Expanded details */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={SPRING.smooth}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                padding: '0 20px 20px',
                borderTop: `1px solid ${fam.glow}18`,
              }}>
                {/* Genetics detail */}
                {strain.genetics && (
                  <motion.p
                    variants={VARIANTS.fadeUp}
                    style={{
                      fontSize: 12, color: P.mid, marginBottom: 14, marginTop: 12,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>🧬</span>
                    <span style={{ fontWeight: 600 }}>{strain.genetics}</span>
                    {strain.grower && (
                      <span style={{ color: P.lo }}>· {strain.grower}</span>
                    )}
                  </motion.p>
                )}

                {/* Terpene chart */}
                {strain.terps && Object.keys(strain.terps).length > 0 && (
                  <motion.div variants={VARIANTS.fadeUp} style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 10, color: P.lo, fontWeight: 700,
                                letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>
                      פרופיל טרפנים
                    </p>
                    <TerpChart terps={strain.terps} max={5} />
                  </motion.div>
                )}

                {/* Zemach quote */}
                {zemachQuote && (
                  <motion.div variants={VARIANTS.fadeUp} style={{ marginBottom: 14 }}>
                    <ZemachQuote message={zemachQuote} family={family} />
                  </motion.div>
                )}

                {/* Price + actions */}
                <motion.div
                  variants={VARIANTS.fadeUp}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}
                >
                  {strain.price && (
                    <span style={{
                      fontSize: 15, fontWeight: 800, color: P.amber,
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                      {Math.round(strain.price)} ₪
                      <span style={{ fontSize: 10, fontWeight: 400, color: P.lo }}>/ גרם</span>
                    </span>
                  )}
                  <div style={{ flex: 1 }} />

                  {onRate && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); onRate(strain); }}
                      style={{
                        padding: '9px 16px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.07)',
                        border: B.subtle,
                        color: P.mid, fontSize: 12, fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ⭐ דרג
                    </motion.button>
                  )}

                  {onBasket && (
                    <motion.button
                      whileHover={{ scale: 1.05, boxShadow: G.mint(12) }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); onBasket(strain); }}
                      style={{
                        padding: '9px 20px', borderRadius: 12,
                        background: inBasket ? 'rgba(74,222,128,0.15)' : P.mint,
                        border: inBasket ? `1.5px solid ${P.mint}50` : 'none',
                        color: inBasket ? P.mint : P.inv,
                        fontSize: 12, fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: inBasket ? G.mint(8) : 'none',
                      }}
                    >
                      {inBasket ? '✓ בתכנון' : '+ לתכנון'}
                    </motion.button>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expand indicator */}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={SPRING.quick}
          style={{
            position: 'absolute', bottom: expanded ? 'auto' : 14, top: expanded ? 14 : 'auto',
            left: 18, fontSize: 12, color: `${fam.glow}80`,
            pointerEvents: 'none',
          }}
        >
          ▾
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── StrainCardSkeleton ────────────────────────────────────────────────────────
export function StrainCardSkeleton({ index = 0 }) {
  return (
    <motion.div
      variants={VARIANTS.fadeIn}
      custom={index}
      style={{
        borderRadius: 22,
        background: P.surface,
        border: B.card,
        padding: '18px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: 16,
        background: 'rgba(255,255,255,0.06)',
        animation: 'pulse 1.8s ease-in-out infinite',
      }} />
      <div style={{ flex: 1 }}>
        <div style={{
          height: 16, width: '55%', borderRadius: 8,
          background: 'rgba(255,255,255,0.07)',
          marginBottom: 8,
          animation: 'pulse 1.8s ease-in-out infinite',
        }} />
        <div style={{
          height: 10, width: '35%', borderRadius: 6,
          background: 'rgba(255,255,255,0.05)',
          animation: 'pulse 1.8s ease-in-out 0.15s infinite',
        }} />
      </div>
      <div style={{
        width: 58, height: 58, borderRadius: '50%',
        background: 'rgba(255,255,255,0.05)',
        animation: 'pulse 1.8s ease-in-out 0.3s infinite',
      }} />
    </motion.div>
  );
}
