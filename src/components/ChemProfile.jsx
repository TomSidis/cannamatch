// ─────────────────────────────────────────────────────────────────────────────
//  ChemProfile — visual chemical fingerprint badge (B6)
//
//  shape  = chemotype:   angular (THC) | round (balanced) | circle (CBD)
//  colors = terpenes:    primary fill gradient, secondary border, tertiary dot
//
//  "Similar profile → similar effect" at a glance:
//    same shape  = same cannabinoid ratio
//    same colors = same dominant terpene profile
//
//  Props:
//    batch    { thcPct, cbdPct, terpenes[] }  — or any object with those fields
//    size     number  (default 52)
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion';
import { chemProfileData, CHEMOTYPE_SHAPE } from '../engine/chemProfile.ts';

const SHAPE_RADIUS = {
  angular: 12,    // square-ish — high-THC
  round:   26,    // soft pill  — balanced
  circle: '50%',  // circular   — CBD-rich
};

export default function ChemProfile({ batch, size = 52 }) {
  const { shape, primaryColor, secondaryColor, tertiaryColor } = chemProfileData(batch);

  const radius   = SHAPE_RADIUS[shape];
  const gradient = secondaryColor
    ? `linear-gradient(145deg, ${primaryColor}99, ${secondaryColor}66)`
    : `${primaryColor}80`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{
        width:        size,
        height:       size,
        borderRadius: radius,
        flexShrink:   0,
        background:   gradient,
        border:       `2px solid ${secondaryColor ?? primaryColor}60`,
        boxShadow:    `0 0 12px ${primaryColor}30`,
        position:     'relative',
        overflow:     'hidden',
      }}
    >
      {/* Specular highlight strip */}
      <div style={{
        position:     'absolute',
        top:          0,
        left:         '20%',
        width:        '60%',
        height:       '40%',
        borderRadius: '50%',
        background:   `${primaryColor}22`,
        filter:       'blur(4px)',
        pointerEvents: 'none',
      }} />

      {/* Tertiary terpene accent dot — bottom-right corner */}
      {tertiaryColor && (
        <div style={{
          position:     'absolute',
          bottom:       3,
          right:        3,
          width:        size * 0.22,
          height:       size * 0.22,
          borderRadius: '50%',
          background:   tertiaryColor,
          opacity:      0.65,
          boxShadow:    `0 0 6px ${tertiaryColor}88`,
        }} />
      )}
    </motion.div>
  );
}

// ── ChemProfileLegend — tooltip-style, shows terpene names + shape meaning ──
// Render next to ChemProfile when space allows; omit in tight layouts.
export function ChemProfileLegend({ batch, style = {} }) {
  const { shape, chemotype } = chemProfileData(batch);

  const shapeLabel = {
    angular: 'THC דומיננטי',
    round:   'מאוזן',
    circle:  'CBD דומיננטי',
  }[shape];

  const sorted = [...(batch.terpenes ?? [])].sort((a, b) => b.pct - a.pct).slice(0, 3);

  return (
    <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.6, direction: 'rtl', ...style }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{shapeLabel}</div>
      {sorted.map((r, i) => (
        <div key={r.terpene}>
          {i === 0 ? 'עיקרי' : i === 1 ? 'משני' : 'שלישי'}: {r.terpene}
        </div>
      ))}
    </div>
  );
}
