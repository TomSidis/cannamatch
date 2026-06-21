// ─────────────────────────────────────────────────────────────────────────────
//  NextExperiment — "The next experiment" forward-motion card.
//
//  Always gives the user somewhere to go next. Not just "here's a match" —
//  "based on what worked for you, here's the ONE thing worth trying next."
//  This card lives below the top-picks in Dashboard.
//
//  Props:
//    strain       {object}     — untried next strain from nextExperimentStrain()
//    why          {string}     — friend-voice explanation from friendWhy()
//    inBasket     {boolean}
//    onAddToBasket{()=>void}
//    onReport     {()=>void}   — open ReportFlow for this strain
// ─────────────────────────────────────────────────────────────────────────────

import { motion } from 'framer-motion';

function MiniRing({ pct }) {
  const col  = pct >= 85 ? '#4ADE80' : pct >= 72 ? '#86EFAC' : '#FBBF24';
  const R    = 15;
  const circ = 2 * Math.PI * R;
  return (
    <div style={{ position:'relative', width:42, height:42, flexShrink:0 }}>
      <svg width='42' height='42' style={{ transform:'rotate(-90deg)' }}>
        <circle cx='21' cy='21' r={R} fill='none' stroke='rgba(255,255,255,0.07)' strokeWidth='3' />
        <motion.circle cx='21' cy='21' r={R} fill='none' stroke={col} strokeWidth='3'
          strokeLinecap='round'
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct / 100) }}
          transition={{ duration:0.9, ease:'easeOut' }}
          style={{ strokeDasharray: circ }} />
      </svg>
      <div style={{
        position:'absolute', inset:0, display:'flex',
        alignItems:'center', justifyContent:'center', transform:'rotate(90deg)',
      }}>
        <span style={{ fontSize:9, fontWeight:900, color: col, letterSpacing:'-0.02em' }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

export default function NextExperiment({ strain, why, inBasket, onAddToBasket, onReport }) {
  if (!strain) return null;

  return (
    <motion.div
      initial={{ opacity:0, y:16 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:0.4, delay:0.2 }}
      style={{
        borderRadius:20,
        background:'linear-gradient(140deg,rgba(10,14,26,0.98) 0%,rgba(8,12,22,0.99) 100%)',
        border:'1.5px solid rgba(167,139,250,0.24)',
        padding:'15px',
        position:'relative', overflow:'hidden',
        boxShadow:'0 0 28px rgba(167,139,250,0.07)',
      }}>

      {/* Ambient violet glow */}
      <div style={{
        position:'absolute', top:-24, right:-18, width:110, height:110, borderRadius:'50%',
        background:'radial-gradient(circle,rgba(167,139,250,0.14) 0%,transparent 70%)',
        pointerEvents:'none',
      }} />

      {/* Label */}
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:13 }}>
        <motion.span
          animate={{ rotate:[0,14,-14,0] }}
          transition={{ duration:5, repeat:Infinity, ease:'easeInOut' }}
          style={{ fontSize:17 }}>🧪</motion.span>
        <div>
          <div style={{
            fontSize:10, fontWeight:800, color:'rgba(167,139,250,0.80)', letterSpacing:'0.08em',
            textTransform:'uppercase',
          }}>
            הניסוי הבא שכדאי לנסות
          </div>
          <div style={{ fontSize:9.5, color:'rgba(187,247,208,0.40)' }}>
            בהתבסס על מה שעבד לך
          </div>
        </div>
      </div>

      {/* Strain row */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:11 }}>
        <MiniRing pct={strain.match} />
        <div style={{ flex:1, textAlign:'right', minWidth:0 }}>
          <div style={{ fontSize:15, fontWeight:900, color:'#F0FDF4', letterSpacing:'-0.01em' }}>
            {strain.name}
          </div>
          <div style={{
            fontSize:11, color:'rgba(187,247,208,0.48)',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          }}>
            {strain.genetics} · {strain.cat}
          </div>
        </div>
        <div style={{ flexShrink:0 }}>
          <span style={{ fontSize:14, fontWeight:800, color:'#4ADE80' }}>₪{strain.price}</span>
        </div>
      </div>

      {/* Why sentence */}
      <div style={{
        padding:'10px 13px', borderRadius:12, marginBottom:12,
        background:'rgba(167,139,250,0.07)', border:'1px solid rgba(167,139,250,0.14)',
      }}>
        <div style={{ fontSize:12, color:'rgba(187,247,208,0.80)', lineHeight:1.65 }}>
          {why || 'מתאים לפרופיל שלך — בהתאם למה שדיווחת עד כה 🌱'}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:8 }}>
        <motion.button
          whileTap={{ scale:0.94 }}
          onClick={onAddToBasket}
          disabled={inBasket}
          style={{
            flex:1, padding:'10px', borderRadius:12,
            cursor: inBasket ? 'default' : 'pointer',
            background: inBasket
              ? 'rgba(74,222,128,0.08)'
              : 'linear-gradient(135deg,#4ADE80,#22C55E)',
            color: inBasket ? '#4ADE80' : '#061006',
            border: inBasket ? '1px solid rgba(74,222,128,0.22)' : 'none',
            fontSize:12, fontWeight:800,
            boxShadow: inBasket ? 'none' : '0 3px 14px rgba(74,222,128,0.30)',
          }}>
          {inBasket ? '✓ בתכנון' : 'הוסף לתכנון'}
        </motion.button>
        {onReport && (
          <motion.button
            whileTap={{ scale:0.94 }}
            onClick={onReport}
            style={{
              padding:'10px 16px', borderRadius:12, cursor:'pointer',
              background:'rgba(167,139,250,0.09)', border:'1px solid rgba(167,139,250,0.22)',
              color:'#A78BFA', fontSize:12, fontWeight:700,
            }}>
            דווח
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
