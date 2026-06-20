// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — Ambient Background Engine
//  Provides the deep-space void with breathing organic radial glows.
//  Renders as a fixed full-screen layer behind all content.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion';
import { P } from '../styles/ds.js';

const ORBS = [
  // top-right: mint/green glow — signature brand color
  {
    id: 'orb-mint',
    style: { top: '-12%', right: '-15%', width: '55vw', height: '55vw' },
    color: 'rgba(74,222,128,0.07)',
    duration: 12,
    delay: 0,
  },
  // bottom-left: violet/DNA glow — genetics / premium
  {
    id: 'orb-violet',
    style: { bottom: '-8%', left: '-18%', width: '60vw', height: '60vw' },
    color: 'rgba(167,139,250,0.055)',
    duration: 15,
    delay: 3,
  },
  // center: subtle amber warmth — human / medical
  {
    id: 'orb-amber',
    style: { top: '38%', left: '50%', transform: 'translate(-50%,-50%)', width: '40vw', height: '40vw' },
    color: 'rgba(251,191,36,0.025)',
    duration: 18,
    delay: 6,
  },
  // far top-left: small blue — sky / time-of-day hint
  {
    id: 'orb-sky',
    style: { top: '8%', left: '-8%', width: '30vw', height: '30vw' },
    color: 'rgba(56,189,248,0.035)',
    duration: 20,
    delay: 9,
  },
];

export default function AmbientBackground({ children }) {
  return (
    <div style={{
      position: 'relative',
      minHeight: '100dvh',
      background: P.void,
      isolation: 'isolate',
    }}>
      {/* Fixed ambient orbs layer */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        {ORBS.map((orb) => (
          <motion.div
            key={orb.id}
            animate={{
              scale:   [1, 1.18, 0.92, 1],
              opacity: [0.8, 1, 0.7, 0.8],
            }}
            transition={{
              duration: orb.duration,
              delay: orb.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              position: 'absolute',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${orb.color}, transparent 70%)`,
              filter: 'blur(1px)',
              ...orb.style,
            }}
          />
        ))}

        {/* Noise texture overlay (subtle grain) */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          opacity: 0.018,
          mixBlendMode: 'overlay',
        }} />
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ── Screen-level glow (for specific screens with custom color) ─────────────────
export function ScreenGlow({ color = 'rgba(74,222,128,0.08)', position = 'top' }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      style={{
        position: 'fixed',
        ...(position === 'top' ? { top: 0 } : { bottom: 0 }),
        left: 0, right: 0,
        height: '45vh',
        background: `radial-gradient(ellipse 80% 100% at 50% ${position === 'top' ? '0%' : '100%'}, ${color}, transparent)`,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
