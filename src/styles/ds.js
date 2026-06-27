// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — "Organic Cyberpunk" Global Design System
//
//  Philosophy:
//  • Deep-space backgrounds — rich, not harsh. Feel like premium nighttime app.
//  • Organic greens — warm, alive, not screaming neon.
//  • Generous typography — 70-year-old patient can read without straining.
//  • Slow spring physics — nothing should feel snappy or anxiety-inducing.
//  • Ambient glows — radial gradients that breathe life into static layouts.
// ─────────────────────────────────────────────────────────────────────────────

// ── Palette ──────────────────────────────────────────────────────────────────
export const P = {
  // Backgrounds
  void:    '#0c0d11',          // deep space
  abyss:   '#0f1118',          // slightly lighter void
  surface: '#141720',          // card / panel surface
  raised:  '#1a1f2e',          // elevated element (modal, tooltip)
  glass:   'rgba(20,23,32,0.88)',

  // Brand greens
  mint:    '#4ADE80',          // primary CTA — warm organic green
  sage:    '#86EFAC',          // secondary / soft green
  leaf:    '#22C55E',          // mid-tone
  forest:  '#14532D',          // deep fill backgrounds

  // Accent palette
  violet:  '#A78BFA',          // DNA / genetics / premium
  orchid:  '#C084FC',          // hover state for violet
  amber:   '#FBBF24',          // warning / highlights / stars
  rose:    '#F87171',          // danger / kill-switch warning
  sky:     '#38BDF8',          // info / time-of-day

  // Text hierarchy
  hi:      '#F0FDF4',          // primary — warm off-white
  mid:     '#BBF7D0',          // secondary
  lo:      '#6B7280',          // tertiary / disabled / placeholder
  inv:     '#0c0d11',          // inverse (on bright backgrounds)

  // Semantic
  safe:    '#4ADE80',
  warn:    '#FBBF24',
  danger:  '#F87171',

  // Genetics families (used in cards)
  genetics: {
    kush:    { from: '#312e81', to: '#1e1b4b', glow: '#818cf8', accent: '#a5b4fc' },
    diesel:  { from: '#14532d', to: '#052e16', glow: '#4ade80', accent: '#86efac' },
    cookies: { from: '#431407', to: '#1c0a03', glow: '#fb923c', accent: '#fed7aa' },
    haze:    { from: '#0c4a6e', to: '#082f49', glow: '#38bdf8', accent: '#bae6fd' },
    purple:  { from: '#4a1d96', to: '#2e1065', glow: '#c084fc', accent: '#e9d5ff' },
    og:      { from: '#052e16', to: '#022c22', glow: '#34d399', accent: '#a7f3d0' },
    gelato:  { from: '#701a75', to: '#4a044e', glow: '#e879f9', accent: '#f5d0fe' },
    default: { from: '#14532d', to: '#052e16', glow: '#4ade80', accent: '#86efac' },
  },
};

// ── Border / Stroke ───────────────────────────────────────────────────────────
export const B = {
  mint:   'rgba(74,222,128,0.18)',
  violet: 'rgba(167,139,250,0.18)',
  amber:  'rgba(251,191,36,0.22)',
  rose:   'rgba(248,113,113,0.22)',
  subtle: 'rgba(255,255,255,0.07)',
  card:   'rgba(255,255,255,0.05)',
};

// ── Shadow / Glow ─────────────────────────────────────────────────────────────
export const G = {
  mint:   (r = 20) => `0 0 ${r}px rgba(74,222,128,0.40), 0 0 ${r * 2.5}px rgba(74,222,128,0.12)`,
  violet: (r = 20) => `0 0 ${r}px rgba(167,139,250,0.45), 0 0 ${r * 2}px rgba(167,139,250,0.14)`,
  amber:  (r = 16) => `0 0 ${r}px rgba(251,191,36,0.40)`,
  rose:   (r = 14) => `0 0 ${r}px rgba(248,113,113,0.38)`,
  card:              '0 4px 32px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.30)',
  cardHover:         '0 8px 48px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.35)',
};

// ── Spring Physics ────────────────────────────────────────────────────────────
export const SPRING = {
  gentle: { type: 'spring', damping: 32, stiffness: 180 },   // page transitions
  smooth: { type: 'spring', damping: 40, stiffness: 240 },   // drawer / expand
  bounce: { type: 'spring', damping: 18, stiffness: 260 },   // micro-interactions
  ease:   { duration: 0.45, ease: [0.22, 1, 0.36, 1] },      // fade/slide
  quick:  { duration: 0.20, ease: [0.22, 1, 0.36, 1] },
};

// ── Motion Variants ───────────────────────────────────────────────────────────
export const VARIANTS = {
  page: {
    hidden:  { opacity: 0, y: 24, scale: 0.975 },
    show:    { opacity: 1, y: 0, scale: 1, transition: SPRING.ease },
    exit:    { opacity: 0, y: -18, scale: 0.975, transition: SPRING.quick },
  },
  fadeUp: {
    hidden:  { opacity: 0, y: 16 },
    show:    { opacity: 1, y: 0,  transition: SPRING.gentle },
  },
  fadeIn: {
    hidden:  { opacity: 0 },
    show:    { opacity: 1, transition: { duration: 0.35 } },
  },
  stagger: {
    show:    { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
  },
  scale: {
    hidden:  { opacity: 0, scale: 0.88 },
    show:    { opacity: 1, scale: 1, transition: SPRING.bounce },
  },
};

// ── Terpene metadata ──────────────────────────────────────────────────────────
export const TERP_META = {
  myrcene:       { label: 'מירצן',    emoji: '🌿', color: '#4ade80', aroma: 'עשבוני-אדמתי, נוטה לתחושה כבדה ורגועה' },
  limonene:      { label: 'לימונן',   emoji: '🍋', color: '#fde047', aroma: 'הדרי-לימוני, נוטה לתחושה קלה ומרוממת' },
  caryophyllene: { label: 'קריופילן', emoji: '🌶️', color: '#f87171', aroma: 'פלפלי-חריף, טעמים עשירים ומחממים' },
  linalool:      { label: 'לינלול',   emoji: '💜', color: '#c084fc', aroma: 'ארומת לבנדר, נוטה לתחושה רכה ושקטה' },
  pinene:        { label: 'פינן',     emoji: '🌲', color: '#86efac', aroma: 'ניחוח אורנים ועצים, תחושה צוננת ומרעננת' },
  humulene:      { label: 'הומולן',   emoji: '🌾', color: '#fbbf24', aroma: 'כשות ועשבי בר, טעמים מרירים ומורכבים' },
  terpinolene:   { label: 'טרפינולן', emoji: '🌸', color: '#fb923c', aroma: 'פרחוני-מרענן, גוון פירותי עדין' },
  ocimene:       { label: 'אוסימן',   emoji: '🌺', color: '#38bdf8', aroma: 'טרופי-מתוק, גוון פרחים ומנטה' },
};

// Trust layer → ring/badge color.
// measured = COA lab-verified, declared = grower-stated, inferred = genetics estimate.
export const TRUST_LAYER_COLOR = {
  measured:  '#4ADE80', // green  — lab data
  declared:  '#FBBF24', // amber  — grower declaration
  inferred:  '#6B7280', // gray   — genetics-derived estimate
};

// ── Genetics family detection ────────────────────────────────────────────────
export function detectGenFamily(lineage = '') {
  const l = lineage.toLowerCase();
  if (/kush|afghan|hindu/.test(l)) return 'kush';
  if (/diesel|sour|chem/.test(l)) return 'diesel';
  if (/cookie|cake|gelato|sherbet|runtz/.test(l)) return 'cookies';
  if (/haze|jack/.test(l)) return 'haze';
  if (/purple|granddaddy|gdp/.test(l)) return 'purple';
  if (/og\s|og$/.test(l)) return 'og';
  if (/gelato|zkittlez/.test(l)) return 'gelato';
  return 'default';
}

// ── Match tier classification ─────────────────────────────────────────────────
export function matchTier(pct) {
  if (pct >= 85) return { label: 'מצוינת', color: P.mint,   bg: 'rgba(74,222,128,0.12)',  icon: '🎯', glow: G.mint   };
  if (pct >= 72) return { label: 'טובה',   color: P.sage,   bg: 'rgba(134,239,172,0.10)', icon: '✓',  glow: G.mint   };
  if (pct >= 60) return { label: 'חלקית',  color: P.amber,  bg: 'rgba(251,191,36,0.10)',  icon: '~',  glow: G.amber  };
  return              { label: 'נמוכה',   color: P.lo,     bg: 'rgba(107,114,128,0.08)', icon: '·',  glow: 'none'   };
}

// ── Readable CSS helpers ───────────────────────────────────────────────────────
export function radial(color, size = '50%', pos = 'center') {
  return `radial-gradient(${size} circle at ${pos}, ${color}, transparent)`;
}

export const FONT = "'Heebo','Segoe UI',system-ui,sans-serif";
