// ── Terpene wheel / radar — the profile centerpiece (extracted from CannaMatch.jsx) ──
// Pure SVG, no chart lib. 7 axes, bloom-from-center, per-terpene glow dots.
// Labels use terpeneToHuman.js (human language only — no chemical names).
// Shared so the DNA tab (GeneticDNA) AND the onboarding DNA reveal render the same radar.
import { motion } from 'framer-motion';
import { TERPENE_HUMAN } from '../lib/terpeneToHuman.js';

export const RADAR_KEYS = ['myrcene', 'limonene', 'pinene', 'terpinolene', 'caryophyllene', 'humulene', 'linalool'];
export const RADAR_CX = 150, RADAR_CY = 148, RADAR_R = 90, RADAR_LR = 133;

function radarAngle(i)      { return (i * 2 * Math.PI / RADAR_KEYS.length) - Math.PI / 2; }
export function radarPt(i, r) { const a = radarAngle(i); return { x: RADAR_CX + r * Math.cos(a), y: RADAR_CY + r * Math.sin(a) }; }
function radarPolyPts(vals) { return RADAR_KEYS.map((_, i) => { const p = radarPt(i, RADAR_R * Math.max(0.04, vals[i])); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' '); }
export function radarGridPts(s) { return RADAR_KEYS.map((_, i) => { const p = radarPt(i, RADAR_R * s); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' '); }
function radarAnchor(i)     { const x = Math.cos(radarAngle(i)); return x > 0.2 ? 'start' : x < -0.2 ? 'end' : 'middle'; }

// "DNA קנבינואידי" code string — unique fingerprint from the dominant terpenes (CY9-LM8-…).
export function dnaSequence(profile) {
  const codes = { limonene: 'LM', myrcene: 'MY', pinene: 'PN',
    caryophyllene: 'CY', linalool: 'LN', terpinolene: 'TP', humulene: 'HM' };
  if (!profile || typeof profile !== 'object') return '—';
  const entries = Object.entries(profile).filter(([t, v]) => v > 0 && codes[t]);
  if (entries.length === 0) return '—';
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([t, v]) => `${codes[t]}${Math.round(Math.max(1, v * 9))}`)
    .join('-');
}

export default function TerpRadar({ profile, avoided = [] }) {
  const raw        = RADAR_KEYS.map(t => Math.max(0, profile[t] || 0));
  const maxV       = Math.max(...raw, 0.01);
  const vals       = raw.map(v => v / maxV);
  const avoidedSet = new Set(avoided);

  return (
    <motion.svg viewBox="0 0 300 296"
      style={{ width: '100%', maxWidth: 320, display: 'block', margin: '0 auto', overflow: 'visible' }}
      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}>
      <defs>
        <radialGradient id="rFill" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#4ADE80" stopOpacity="0.70" />
          <stop offset="100%" stopColor="#22C55E" stopOpacity="0.15" />
        </radialGradient>
        <filter id="rGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="dotGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <motion.circle cx={RADAR_CX} cy={RADAR_CY}
        fill="none" stroke="rgba(74,222,128,0.35)" strokeWidth={1.5}
        animate={{ r: [11, 17, 11], opacity: [0.35, 0.08, 0.35] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} />

      {[0.25, 0.5, 0.75, 1.0].map((s, ri) => (
        <polygon key={ri} points={radarGridPts(s)}
          fill="none"
          stroke={ri === 3 ? 'rgba(74,222,128,0.30)' : 'rgba(74,222,128,0.09)'}
          strokeWidth={ri === 3 ? 1.5 : 0.8}
          strokeDasharray={ri === 3 ? undefined : '3 5'} />
      ))}

      {RADAR_KEYS.map((_, i) => {
        const tip = radarPt(i, RADAR_R);
        return <line key={i} x1={RADAR_CX} y1={RADAR_CY} x2={tip.x.toFixed(1)} y2={tip.y.toFixed(1)}
          stroke="rgba(74,222,128,0.11)" strokeWidth={0.9} />;
      })}

      <motion.polygon
        points={radarPolyPts(vals)}
        fill="url(#rFill)" stroke="#4ADE80" strokeWidth={2.2} strokeLinejoin="round"
        filter="url(#rGlow)"
        style={{ transformOrigin: `${RADAR_CX}px ${RADAR_CY}px` }}
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ duration: 0.90, type: 'spring', stiffness: 180, damping: 16, delay: 0.18 }} />

      {RADAR_KEYS.map((t, i) => {
        if (vals[i] < 0.07) return null;
        const p   = radarPt(i, RADAR_R * vals[i]);
        const col = avoidedSet.has(t) ? '#F87171' : (TERPENE_HUMAN[t]?.color || '#4ADE80');
        return (
          <motion.circle key={t} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={6}
            fill={col} stroke="#07120A" strokeWidth={2} filter="url(#dotGlow)"
            style={{ transformOrigin: `${p.x}px ${p.y}px` }}
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ delay: 0.55 + i * 0.07, duration: 0.35, type: 'spring', stiffness: 360, damping: 18 }} />
        );
      })}

      {RADAR_KEYS.map((t, i) => {
        const lp        = radarPt(i, RADAR_LR);
        const info      = TERPENE_HUMAN[t];
        const isActive  = vals[i] > 0.07;
        const isAvoided = avoidedSet.has(t);
        const col = isAvoided ? '#FCA5A5' : isActive ? (info?.color || '#4ADE80') : 'rgba(187,247,208,0.24)';
        return (
          <text key={t} textAnchor={radarAnchor(i)}>
            <tspan x={lp.x.toFixed(1)} y={(lp.y - 6).toFixed(1)} fontSize="15" fill={col}>
              {isAvoided ? '🛡' : (info?.icon || '🌿')}
            </tspan>
            <tspan x={lp.x.toFixed(1)} dy="14" fontSize="10" fontWeight={isActive ? '800' : '400'} fill={col}>
              {info?.shortLabel || t}
            </tspan>
          </text>
        );
      })}
    </motion.svg>
  );
}
