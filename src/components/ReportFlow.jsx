// ─────────────────────────────────────────────────────────────────────────────
//  ReportFlow — The 5-second report. The most important component in the app.
//
//  THREE STEPS, one bottom-sheet:
//    1. Emoji rating  (😣 / 😐 / 🙂 / 😄)
//    2. Side effects  (tap chips, multi-select)
//    3. "Map updated" moment — animated diff, altruistic framing, close
//
//  The map-update step is the hero experience. It must feel weighted and real —
//  numbers that animate, a diff that shows exactly what changed, the reward of
//  "קיבלתי 🙏 עדכנתי לך את המפה".
//
//  Props:
//    strain     {object}   — the strain being reported (id, name, kind)
//    onClose    {()=>void} — close the sheet (after step 3 or via backdrop)
//    onSubmit   {(rating:number, effects:string[])=>void}
//                          — called when user taps "עדכן את המפה שלי"
//    mapDiff    {object|null}  — { added, removed } populated after onSubmit fires
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Data ─────────────────────────────────────────────────────────────────────

const RATINGS = [
  { id: 1, emoji: '😣', label: 'לא עזר',  color: '#F87171' },
  { id: 2, emoji: '😐', label: 'בינוני',   color: '#FBBF24' },
  { id: 3, emoji: '🙂', label: 'עזר',      color: '#86EFAC' },
  { id: 4, emoji: '😄', label: 'מצוין!',  color: '#4ADE80' },
];

const SIDE_CHIPS = [
  { id: 'foggy',   label: 'מעורפל',  emoji: '🌫️' },
  { id: 'anxious', label: 'חרדתי',   emoji: '😬' },
  { id: 'sleepy',  label: 'ישנוני',  emoji: '😴' },
  { id: 'hungry',  label: 'רעב',    emoji: '🍽️' },
  { id: 'focused', label: 'ממוקד',   emoji: '🎯' },
  { id: 'calm',    label: 'רגוע',   emoji: '😌' },
  { id: 'none',    label: 'כלום מיוחד', emoji: '✓' },
];

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimCount({ target, color }) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (!target) return;
    const dur = 700, start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      setVal(Math.round(p * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return <span style={{ color, fontWeight: 900 }}>{val}</span>;
}

// ── Particle burst ────────────────────────────────────────────────────────────
function Burst() {
  const pts = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const r = 70 + (i % 3) * 18;
    return {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      color: ['#4ADE80','#A78BFA','#FBBF24','#F87171'][i % 4],
      size: 4 + (i % 3),
    };
  });
  return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }}>
      {pts.map((p,i) => (
        <motion.div key={i}
          initial={{ opacity:1, x:'50%', y:'40%', scale:1 }}
          animate={{ opacity:0, x:`calc(50% + ${p.x}px)`, y:`calc(40% + ${p.y}px)`, scale:0.4 }}
          transition={{ duration:0.9, ease:'easeOut', delay: i*0.025 }}
          style={{
            position:'absolute', width:p.size, height:p.size,
            borderRadius:'50%', background:p.color, top:0, left:0,
          }} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReportFlow({ strain, onClose, onSubmit, mapDiff }) {
  const [step, setStep]       = useState(1);   // 1 | 2 | 3
  const [rating, setRating]   = useState(null);
  const [effects, setEffects] = useState([]);
  const [burst, setBurst]     = useState(false);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // Auto-advance after rating selection (feels snappy)
  const pickRating = (r) => {
    setRating(r);
    setTimeout(() => setStep(2), 380);
  };

  const toggleChip = (id) => {
    if (id === 'none') { setEffects(['none']); return; }
    setEffects(prev => {
      const without = prev.filter(e => e !== 'none');
      return without.includes(id)
        ? without.filter(e => e !== id)
        : [...without, id];
    });
  };

  const submit = () => {
    onSubmit(rating, effects);
    setBurst(true);
    setStep(3);
  };

  // Auto-close 3 seconds after showing the map-update screen
  useEffect(() => {
    if (step !== 3) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [step, onClose]);

  // Backdrop closes at any step
  const onBackdropClick = useCallback(() => onClose(), [onClose]);

  const R = RATINGS.find(r => r.id === rating);

  return (
    <AnimatePresence>
      {/* ── Backdrop ───────────────────────────────────────────────────────── */}
      <motion.div
        key='bd'
        initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
        transition={{ duration:0.2 }}
        onClick={onBackdropClick}
        style={{
          position:'fixed', inset:0, zIndex:500,
          background:'rgba(0,0,0,0.72)', backdropFilter:'blur(8px)',
        }}
      />

      {/* ── Bottom sheet ───────────────────────────────────────────────────── */}
      <motion.div
        key='sheet'
        initial={{ y:'100%', opacity:0 }}
        animate={{ y:0, opacity:1 }}
        exit={{ y:'100%', opacity:0 }}
        transition={{ type:'spring', damping:30, stiffness:220 }}
        style={{
          position:'fixed', bottom:0, left:0, right:0,
          maxWidth:480, margin:'0 auto',
          background:'linear-gradient(180deg,#0f1420 0%,#0a0c12 100%)',
          borderRadius:'28px 28px 0 0',
          border:'1.5px solid rgba(74,222,128,0.22)',
          borderBottom:'none',
          padding:'0 20px 44px',
          zIndex:501, direction:'rtl',
          boxShadow:'0 -8px 60px rgba(0,0,0,0.60)',
        }}>

        {/* Handle + X button row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', position:'relative', paddingTop:14 }}>
          <div style={{ width:40, height:4, borderRadius:2, background:'rgba(255,255,255,0.14)' }} />
          <button onClick={onClose} style={{
            position:'absolute', left:0, top:4,
            background:'none', border:'none', cursor:'pointer',
            color:'rgba(187,247,208,0.45)', fontSize:20, lineHeight:1, padding:'4px 8px',
          }}>✕</button>
        </div>

        {/* Strain header */}
        <div style={{ textAlign:'center', padding:'16px 0 18px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize:11, color:'rgba(187,247,208,0.45)', marginBottom:3, letterSpacing:'0.06em' }}>
            מדווח על
          </div>
          <div style={{ fontSize:19, fontWeight:900, color:'#F0FDF4', letterSpacing:'-0.02em' }}>
            {strain?.name}
          </div>
          {strain?.cat && (
            <div style={{ fontSize:11, color:'rgba(74,222,128,0.60)', marginTop:2 }}>
              {strain.cat} · {strain.kind}
            </div>
          )}
        </div>

        {/* Steps */}
        <AnimatePresence mode='wait'>

          {/* ── Step 1: Rating ────────────────────────────────────────────── */}
          {step === 1 && (
            <motion.div key='s1'
              initial={{ opacity:0, x:40 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }}
              transition={{ duration:0.22 }}
              style={{ paddingTop:22 }}>
              <div style={{ fontSize:16, fontWeight:800, color:'#F0FDF4', textAlign:'center', marginBottom:22 }}>
                איך זה הלך? 👇
              </div>
              <div style={{ display:'flex', gap:10 }}>
                {RATINGS.map(r => {
                  const sel = rating === r.id;
                  return (
                    <motion.button key={r.id}
                      whileTap={{ scale:0.84 }}
                      onClick={() => pickRating(r.id)}
                      style={{
                        flex:1, padding:'16px 4px', borderRadius:18, cursor:'pointer',
                        background: sel ? `${r.color}18` : 'rgba(255,255,255,0.04)',
                        border:`2.5px solid ${sel ? r.color : 'rgba(255,255,255,0.09)'}`,
                        display:'flex', flexDirection:'column', alignItems:'center', gap:7,
                        transition:'all 0.18s',
                        boxShadow: sel ? `0 0 20px ${r.color}30` : 'none',
                      }}>
                      <motion.span style={{ fontSize:30 }}
                        animate={sel ? { scale:[1, 1.25, 1] } : {}}
                        transition={{ duration:0.3 }}>
                        {r.emoji}
                      </motion.span>
                      <span style={{ fontSize:10, fontWeight:800, color: sel ? r.color : 'rgba(187,247,208,0.50)' }}>
                        {r.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Side effects ──────────────────────────────────────── */}
          {step === 2 && (
            <motion.div key='s2'
              initial={{ opacity:0, x:40 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }}
              transition={{ duration:0.22 }}
              style={{ paddingTop:22 }}>

              {/* Rating recap */}
              {R && (
                <motion.div
                  initial={{ scale:0.8, opacity:0 }} animate={{ scale:1, opacity:1 }}
                  style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:18 }}>
                  <span style={{ fontSize:22 }}>{R.emoji}</span>
                  <span style={{ fontSize:13, fontWeight:700, color: R.color }}>{R.label}</span>
                  <span style={{ fontSize:11, color:'rgba(187,247,208,0.40)' }}>— טוב, קיבלתי</span>
                </motion.div>
              )}

              <div style={{ fontSize:15, fontWeight:800, color:'#F0FDF4', textAlign:'center', marginBottom:16 }}>
                שמת לב למשהו?
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', marginBottom:22 }}>
                {SIDE_CHIPS.map(c => {
                  const sel = effects.includes(c.id);
                  return (
                    <motion.button key={c.id}
                      whileTap={{ scale:0.90 }}
                      onClick={() => toggleChip(c.id)}
                      style={{
                        padding:'9px 16px', borderRadius:20, cursor:'pointer',
                        fontSize:13, fontWeight:700,
                        background: sel ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.05)',
                        color:      sel ? '#4ADE80' : 'rgba(187,247,208,0.65)',
                        border:`1.5px solid ${sel ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.09)'}`,
                        boxShadow:  sel ? '0 0 14px rgba(74,222,128,0.20)' : 'none',
                        transition:'all 0.15s',
                      }}>
                      {c.emoji} {c.label}
                    </motion.button>
                  );
                })}
              </div>

              <motion.button
                whileTap={{ scale:0.96 }}
                onClick={submit}
                style={{
                  width:'100%', padding:'15px', borderRadius:18, cursor:'pointer',
                  background:'linear-gradient(135deg,#4ADE80 0%,#22C55E 100%)',
                  color:'#061006', fontSize:15, fontWeight:900, border:'none',
                  boxShadow:'0 6px 24px rgba(74,222,128,0.38)',
                  letterSpacing:'-0.01em',
                }}>
                קיבלתי 🙏 — עדכן את המפה שלי
              </motion.button>
              <div style={{ textAlign:'center', marginTop:10 }}>
                <button onClick={submit}
                  style={{ fontSize:12, color:'rgba(187,247,208,0.40)', background:'none', border:'none', cursor:'pointer' }}>
                  דלג
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Map updated hero moment ───────────────────────────── */}
          {step === 3 && (
            <motion.div key='s3'
              initial={{ opacity:0, scale:0.88 }} animate={{ opacity:1, scale:1 }}
              exit={{ opacity:0 }}
              transition={{ duration:0.4, ease:[0.22,1,0.36,1] }}
              style={{ paddingTop:26, textAlign:'center', position:'relative' }}>

              {burst && <Burst />}

              {/* Hero icon */}
              <motion.div
                initial={{ scale:0.5, opacity:0 }}
                animate={{ scale:1, opacity:1 }}
                transition={{ type:'spring', stiffness:300, damping:18, delay:0.05 }}
                style={{ fontSize:52, marginBottom:10, position:'relative', zIndex:1 }}>
                🎯
              </motion.div>

              {/* Hero text */}
              <motion.div
                initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                transition={{ delay:0.22 }}
                style={{ fontSize:22, fontWeight:900, color:'#4ADE80', marginBottom:4,
                  textShadow:'0 0 24px rgba(74,222,128,0.50)', letterSpacing:'-0.02em' }}>
                עדכנתי את המפה שלך
              </motion.div>
              <motion.div
                initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.38 }}
                style={{ fontSize:13, color:'rgba(187,247,208,0.60)', marginBottom:22 }}>
                קיבלתי — הדיווח שלך שיפר את ההתאמות
              </motion.div>

              {/* Diff counts — the visible feedback of what changed */}
              {mapDiff && (mapDiff.removed > 0 || mapDiff.added > 0) ? (
                <motion.div
                  initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
                  transition={{ delay:0.50 }}
                  style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:18 }}>
                  {mapDiff.removed > 0 && (
                    <div style={{
                      padding:'14px 20px', borderRadius:18, flex:1, maxWidth:130,
                      background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.22)',
                    }}>
                      <div style={{ fontSize:28, fontWeight:900, color:'#F87171', lineHeight:1.1 }}>
                        <AnimCount target={mapDiff.removed} color='#F87171' />
                      </div>
                      <div style={{ fontSize:11, color:'rgba(248,113,113,0.65)', marginTop:4 }}>
                        זנים סוננו
                      </div>
                    </div>
                  )}
                  {mapDiff.added > 0 && (
                    <div style={{
                      padding:'14px 20px', borderRadius:18, flex:1, maxWidth:130,
                      background:'rgba(74,222,128,0.07)', border:'1px solid rgba(74,222,128,0.22)',
                    }}>
                      <div style={{ fontSize:28, fontWeight:900, color:'#4ADE80', lineHeight:1.1 }}>
                        <AnimCount target={mapDiff.added} color='#4ADE80' />
                      </div>
                      <div style={{ fontSize:11, color:'rgba(74,222,128,0.65)', marginTop:4 }}>
                        זנים עלו
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.50 }}
                  style={{ marginBottom:18 }}>
                  <div style={{
                    padding:'12px 18px', borderRadius:16, display:'inline-block',
                    background:'rgba(74,222,128,0.07)', border:'1px solid rgba(74,222,128,0.20)',
                  }}>
                    <div style={{ fontSize:12, color:'rgba(74,222,128,0.80)' }}>
                      ✓ המפה מדויקת יותר עכשיו
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Altruistic framing */}
              <motion.div
                initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.68 }}
                style={{
                  padding:'11px 16px', borderRadius:14, marginBottom:20,
                  background:'rgba(167,139,250,0.06)', border:'1px solid rgba(167,139,250,0.14)',
                }}>
                <div style={{ fontSize:12, color:'rgba(167,139,250,0.85)', lineHeight:1.6 }}>
                  💜 הדיווח שלך אנונימי לחלוטין — ועוזר למטופלים אחרים עם פרופיל דומה לשלך
                </div>
              </motion.div>

              {/* Close */}
              <motion.button
                initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                transition={{ delay:0.85 }}
                onClick={onClose}
                style={{
                  width:'100%', padding:'13px', borderRadius:16, cursor:'pointer',
                  background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.11)',
                  color:'rgba(187,247,208,0.75)', fontSize:14, fontWeight:700,
                }}>
                סגור
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
