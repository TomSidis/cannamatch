// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — Cinematic Loading State
//  Three variants:
//    default    — DNA genome scan (recommendations loading)
//    twins      — Genetic twin search
//    scanning   — Menu photo analysis
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion';
import { P, G, B, SPRING, VARIANTS, FONT } from '../styles/ds.js';

// ── Animated DNA double-helix ─────────────────────────────────────────────────
function HelixSpinner({ size = 56, color = P.mint }) {
  const dots = 8;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {Array.from({ length: dots }).map((_, i) => {
        const angle = (i / dots) * Math.PI * 2;
        const x     = Math.cos(angle) * (size * 0.32);
        const y     = Math.sin(angle) * (size * 0.16);
        return (
          <motion.div
            key={i}
            animate={{
              x:       [x, -x, x],
              y:       [y, -y, y],
              opacity: [0.4, 1, 0.4],
              scale:   [0.7, 1.2, 0.7],
            }}
            transition={{
              duration: 2.2,
              delay: (i / dots) * 1.1,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: size * 0.14, height: size * 0.14,
              borderRadius: '50%',
              background: i % 2 === 0 ? color : P.violet,
              boxShadow: i % 2 === 0 ? G.mint(6) : G.violet(6),
              transform: `translate(${x}px,${y}px) translate(-50%,-50%)`,
            }}
          />
        );
      })}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute', inset: 4,
          borderRadius: '50%',
          border: `2px solid transparent`,
          borderTopColor: color,
          borderLeftColor: `${color}40`,
        }}
      />
    </div>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow({ delay = 0 }) {
  const shimmerKeyframes = {
    background: [
      'rgba(255,255,255,0.04)',
      'rgba(255,255,255,0.09)',
      'rgba(255,255,255,0.04)',
    ],
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING.gentle, delay }}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '18px 20px',
        borderRadius: 22,
        background: P.surface,
        border: B.card,
      }}
    >
      <motion.div
        animate={shimmerKeyframes}
        transition={{ duration: 1.8, repeat: Infinity, delay: delay * 0.5 }}
        style={{
          width: 52, height: 52, borderRadius: 16, flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <motion.div
          animate={shimmerKeyframes}
          transition={{ duration: 1.8, repeat: Infinity, delay: delay * 0.5 + 0.1 }}
          style={{ height: 14, width: '58%', borderRadius: 8, marginBottom: 8 }}
        />
        <motion.div
          animate={shimmerKeyframes}
          transition={{ duration: 1.8, repeat: Infinity, delay: delay * 0.5 + 0.2 }}
          style={{ height: 10, width: '36%', borderRadius: 6 }}
        />
      </div>
      <motion.div
        animate={shimmerKeyframes}
        transition={{ duration: 1.8, repeat: Infinity, delay: delay * 0.5 + 0.15 }}
        style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0 }}
      />
    </motion.div>
  );
}

// ── Scanning bar (for menu analysis) ─────────────────────────────────────────
function LaserLine({ color = P.mint }) {
  return (
    <motion.div
      animate={{ top: ['0%', '100%', '0%'] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        position: 'absolute', left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        boxShadow: `0 0 12px 4px ${color}60`,
        pointerEvents: 'none',
      }}
    />
  );
}

// ── Main LoadingSkeleton ──────────────────────────────────────────────────────
export default function LoadingSkeleton({
  message = 'מנתח את הפרופיל הגנטי שלך…',
  rows = 3,
  variant = 'default',
}) {
  const isScanning = variant === 'scanning';
  const isTwins    = variant === 'twins';

  const headerGradient = isTwins
    ? `linear-gradient(145deg, ${P.genetics.kush.from}, #1a0d36)`
    : `linear-gradient(145deg, #0a1a10, #0c1a26)`;

  const accentColor = isTwins ? P.violet : P.mint;
  const spinnerColor = isTwins ? P.violet : P.mint;

  const subLabels = isScanning
    ? ['מזהה זנים · פענוח גנטיקה · חישוב קטגוריות']
    : isTwins
    ? ['מנתח DNA · מחפש פרופילים דומים · מחשב קרבה גנטית']
    : ['סורק 380 זנים · מחשב דמיון וקטורי · בודק Kill-Switches'];

  return (
    <motion.div
      variants={VARIANTS.stagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT }}
    >
      {/* Header */}
      <motion.div
        variants={VARIANTS.fadeUp}
        style={{
          borderRadius: 22,
          padding: '22px 20px',
          textAlign: 'center',
          background: headerGradient,
          border: `1.5px solid ${accentColor}20`,
          boxShadow: `0 0 24px ${accentColor}15, 0 4px 24px rgba(0,0,0,0.45)`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Ambient glow */}
        <div style={{
          position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)',
          width: 220, height: 220,
          background: `radial-gradient(circle, ${accentColor}18, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        {isScanning && (
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 22 }}>
            <LaserLine color={P.mint} />
          </div>
        )}

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <HelixSpinner size={52} color={spinnerColor} />
          </div>
          <p style={{
            fontSize: 16, fontWeight: 800, color: P.hi, marginBottom: 4,
          }}>
            {message}
          </p>
          <p style={{ fontSize: 11, color: P.lo, letterSpacing: '0.04em' }}>
            {subLabels[0]}
          </p>

          {/* Progress bar */}
          <div style={{
            marginTop: 14, height: 3, borderRadius: 3,
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}>
            <motion.div
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                height: '100%', width: '45%', borderRadius: 3,
                background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
                boxShadow: `0 0 8px ${accentColor}80`,
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* Skeleton rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} delay={i * 0.08} />
      ))}
    </motion.div>
  );
}
