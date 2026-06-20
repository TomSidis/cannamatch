// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — StrainAvatar: Premium SVG badge themed by genetics family
//
//  States:
//    normal  — themed hex badge with family icon
//    godTier — pulsing golden glow + ✨ crown
//    locked  — red shield warning (kill-switch blocked)
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion';
import { P, G, detectGenFamily } from '../styles/ds.js';

const FAMILY_THEMES = {
  kush:    { a: '#4c3a9e', b: '#7c6abf', c: '#c4b5f8', icon: '🏔️', glow: '#818cf8' },
  diesel:  { a: '#1a6b3d', b: '#3cad6a', c: '#86efac', icon: '⛽', glow: '#4ade80' },
  cookies: { a: '#8b4500', b: '#d47820', c: '#fed7aa', icon: '🍪', glow: '#fb923c' },
  haze:    { a: '#1e4d7a', b: '#4a9bd4', c: '#bae6fd', icon: '☁️', glow: '#38bdf8' },
  purple:  { a: '#5a1d96', b: '#a855f7', c: '#e9d5ff', icon: '💜', glow: '#c084fc' },
  og:      { a: '#0b4226', b: '#22a05c', c: '#a7f3d0', icon: '🌊', glow: '#34d399' },
  gelato:  { a: '#7c1568', b: '#d946a8', c: '#f5d0fe', icon: '🍨', glow: '#e879f9' },
  default: { a: '#145232', b: '#3da46b', c: '#bbf7d0', icon: '🌿', glow: '#4ade80' },
};

export default function StrainAvatar({
  lineage   = '',
  matchScore = null,
  size      = 56,
}) {
  const family = detectGenFamily(lineage);
  const t      = FAMILY_THEMES[family] || FAMILY_THEMES.default;
  const uid    = `av${family}${size}`;

  const isGodTier = matchScore !== null && matchScore >= 85;
  const isLocked  = matchScore === 0;

  // ── Locked / Kill-switch ──────────────────────────────────────────────────
  if (isLocked) {
    return (
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <motion.div
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 0.55, repeat: Infinity }}
          style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            background: 'rgba(248,113,113,0.20)',
            filter: 'blur(8px)',
          }}
        />
        <svg width={size} height={size} viewBox="0 0 64 64">
          <defs>
            <linearGradient id={`${uid}r`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#991b1b" />
              <stop offset="100%" stopColor="#450a0a" />
            </linearGradient>
          </defs>
          <motion.path
            d="M32 5 L54 14 V32 C54 46 44 55 32 60 C20 55 10 46 10 32 V14 Z"
            fill={`url(#${uid}r)`}
            stroke={P.danger}
            strokeWidth="1.5"
            animate={{ opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          />
          <line x1="32" y1="20" x2="32" y2="38" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="32" cy="45" r="2.5" fill="#fff" />
        </svg>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* Glow halo */}
      <motion.div
        animate={isGodTier
          ? { opacity: [0.4, 0.75, 0.4], scale: [0.9, 1.15, 0.9] }
          : { opacity: [0.15, 0.28, 0.15] }
        }
        transition={{ duration: isGodTier ? 1.8 : 3.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: -3,
          borderRadius: '30%',
          background: t.glow,
          filter: `blur(${isGodTier ? 10 : 7}px)`,
        }}
      />

      {/* SVG badge */}
      <motion.svg
        width={size} height={size} viewBox="0 0 64 64"
        animate={isGodTier ? { rotate: [0, 5, -5, 0] } : {}}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'relative' }}
      >
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={t.b} />
            <stop offset="100%" stopColor={t.a} />
          </linearGradient>
          <linearGradient id={`${uid}hl`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`${t.c}60`} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Hex shape */}
        <polygon
          points="32,4 56,18 56,46 32,60 8,46 8,18"
          fill={`url(#${uid})`}
          stroke={`${t.c}50`}
          strokeWidth="1.5"
        />
        {/* Specular highlight */}
        <polygon
          points="32,4 56,18 44,32 32,22 20,32 8,18"
          fill={`url(#${uid}hl)`}
        />
      </motion.svg>

      {/* Icon overlay using emoji */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, lineHeight: 1,
        filter: `drop-shadow(0 1px 3px rgba(0,0,0,0.6))`,
        pointerEvents: 'none',
      }}>
        {t.icon}
      </div>

      {/* God-tier crown */}
      {isGodTier && (
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{
            position: 'absolute', top: -4, right: -4,
            fontSize: size * 0.30, lineHeight: 1,
          }}
        >
          ✨
        </motion.div>
      )}
    </div>
  );
}
