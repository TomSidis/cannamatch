/**
 * BasketPlannerScreen — monthly purchase planning with 3 daily-rhythm tracks.
 *
 * Tracks drive timing, NOT botanical type (no indica/sativa).
 * What moves a track = real strain terpene profile + user preference.
 * Users can override: a "day" user who needs sedation will still see sedating strains.
 *
 * Props:
 *   ans            {object}  — { cats, reasons, killSwitches } from onboarding/DNA
 *   gramsByCategory{object}  — { 'T22/C4': 30, ... } monthly quota; editable inline
 *   strains        {array}   — static catalog STRAINS (from strainsConfig.js)
 *   onClose        {()=>void}
 */

import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence }   from 'framer-motion';
import { bridgeScore }               from '../engine/legacyBridge.ts';
import { buildNeedVector }           from '../engine/vectorMath.ts';
import { planBasket }                from '../engine/basketPlanner.ts';
import { ocrLicense, parseGramsFromLicense } from '../lib/licenseOcr.js';
import { LICENSED_CATEGORIES }       from '../lib/categoryConfig.js';
import { TRUST_LAYER_COLOR }         from '../styles/ds.js';

// ── Track definitions ─────────────────────────────────────────────────────────
// Timing is the only variable — the engine determines what fits each rhythm.
const TRACKS = {
  day:      { label: 'מקצב יום',    timing: ['morning', 'afternoon'] },
  night:    { label: 'מקצב לילה',   timing: ['evening', 'night']     },
  balanced: { label: 'כל היום',     timing: ['morning', 'afternoon', 'evening', 'night'] },
};

// ── Confidence badge ──────────────────────────────────────────────────────────
const LAYER_STYLE = {
  measured:  { bg: 'rgba(74,222,128,0.15)',  border: 'rgba(74,222,128,0.5)',  text: '#4ADE80', label: 'COA מאומת'      },
  community: { bg: 'rgba(129,140,248,0.15)', border: 'rgba(129,140,248,0.5)', text: '#818CF8', label: 'דיווחי קהילה'  },
  prior:     { bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.4)',  text: '#FBBF24', label: 'הערכת גנטיקה'  },
};

function ConfidenceBadge({ topLayer, confidence }) {
  const st = LAYER_STYLE[topLayer] ?? LAYER_STYLE.prior;
  const level = confidence >= 0.65 ? 'גבוה' : confidence >= 0.45 ? 'בינוני' : 'נמוך';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
      padding: '2px 7px', borderRadius: 20,
      background: st.bg, border: `1px solid ${st.border}`, color: st.text,
    }}>
      {st.label} · {level}
    </span>
  );
}

// ── Map static strain to Batch format for planBasket ─────────────────────────
function strainToBatch(s) {
  const catM = s.cat?.match(/T(\d+)\/C(\d+)/i);
  return {
    id:         s.id,
    productId:  s.id,
    thcPct:     catM ? parseInt(catM[1]) : 18,
    cbdPct:     catM ? parseInt(catM[2]) : 3,
    terpenes:   Object.entries(s.terps || {}).map(([terpene, pct]) => ({ terpene, pct })),
    provenance: Object.keys(s.terps || {}).length > 0 ? 'declared' : 'inferred',
    category:   s.cat || 'T22/C4',
  };
}

// ── Gram editor ───────────────────────────────────────────────────────────────
function GramsEditor({ categories, grams, onChange, onOcr, ocrLoading }) {
  const fileRef = useRef(null);

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
          תקציב גרמים לחודש
        </span>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={ocrLoading}
          style={{
            fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 12,
            background: 'rgba(167,139,250,0.18)', border: '1px solid rgba(167,139,250,0.4)',
            color: '#a78bfa', cursor: 'pointer',
          }}
        >
          {ocrLoading ? 'סורק...' : 'סרוק רישיון'}
        </button>
        <input
          ref={fileRef} type='file' accept='image/*' style={{ display: 'none' }}
          onChange={e => e.target.files?.[0] && onOcr(e.target.files[0])}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: 8,
      }}>
        {categories.map(cat => (
          <div key={cat} style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '8px 10px',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
              {cat}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type='number' min={0} max={200} value={grams[cat] || ''}
                onChange={e => onChange({ ...grams, [cat]: parseInt(e.target.value) || 0 })}
                placeholder='גרם'
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  color: '#fff', fontSize: 16, fontWeight: 700, outline: 'none',
                }}
              />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                ג׳
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bag card ──────────────────────────────────────────────────────────────────
// Ring color = trust layer (measured/declared/inferred), ring fill = match %.
// Same number, different color → patient sees confidence signal at a glance.
function BagCard({ bag, strain, idx }) {
  const topLayer   = strain?._topLayer ?? 'prior';
  const trustColor = TRUST_LAYER_COLOR[topLayer] ?? '#FBBF24';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.06 }}
      style={{
        borderRadius: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
        padding: '13px 15px',
        display: 'flex', alignItems: 'flex-start', gap: 13,
      }}
    >
      {/* Match ring — color encodes data trust, fill encodes match quality */}
      <div style={{
        flexShrink: 0, width: 42, height: 42, borderRadius: '50%',
        background: `conic-gradient(${trustColor} ${bag.matchPct * 3.6}deg, rgba(255,255,255,0.06) 0)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'rgba(10,14,26,0.95)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 900, color: trustColor,
        }}>
          {bag.matchPct}%
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
          {strain?.name ?? bag.batchId}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
          {bag.role}
          {bag.grams > 0 && (
            <span style={{ marginRight: 8, color: 'rgba(255,255,255,0.35)' }}>
              · {bag.grams} ג׳
            </span>
          )}
        </div>
        <ConfidenceBadge topLayer={strain?._topLayer ?? 'prior'} confidence={strain?._confidence ?? 0.35} />
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BasketPlannerScreen({ ans = {}, gramsByCategory = {}, strains = [], onClose }) {
  const [activeTrack, setActiveTrack]   = useState('balanced');
  const [grams, setGrams]               = useState(gramsByCategory);
  const [ocrLoading, setOcrLoading]     = useState(false);
  const [ocrMsg, setOcrMsg]             = useState('');

  const activeCats = (ans.cats ?? []).filter(c => LICENSED_CATEGORIES.includes(c));

  // ── Score all eligible strains once per ans/grams change ──
  const { scoredMap, batchList } = useMemo(() => {
    const batchList = strains.map(strainToBatch);
    const scoredMap = {};
    for (const s of strains) {
      const r = bridgeScore(s, { ...ans, gramsByCategory: grams });
      scoredMap[s.id] = {
        productId:    s.id,
        batchId:      s.id,
        matchPct:     r.matchPct,
        confidence:   r.confidence,
        reasonHuman:  r.reasonHuman,
        topLayer:     r.topLayer,
        _topLayer:    r.topLayer,
        _confidence:  r.confidence,
      };
    }
    return { scoredMap, batchList };
  }, [ans, grams, strains]);

  // ── Build plan for the active track ──────────────────────────────────────
  const plan = useMemo(() => {
    const track   = TRACKS[activeTrack];
    const need    = buildNeedVector({
      reasons:           ans.reasons ?? [],
      licenseCategories: ans.cats    ?? [],
      gramsByCategory:   grams,
      timing:            track.timing,
      killSwitches:      ans.killSwitches ?? [],
    });

    const scored = Object.values(scoredMap).filter(s => s.matchPct > 0);

    return planBasket(need, scored, batchList, { maxBags: 3 });
  }, [activeTrack, scoredMap, batchList, ans, grams]);

  // ── OCR path ──────────────────────────────────────────────────────────────
  async function handleOcr(file) {
    setOcrLoading(true);
    setOcrMsg('');
    try {
      const { ocrLicense: runOcr, parseGramsFromLicense } = await import('../lib/licenseOcr.js');
      const text   = await runOcr(file, () => {});
      const result = parseGramsFromLicense(text);
      if (Object.keys(result.gramsByCategory).length > 0) {
        setGrams(g => ({ ...g, ...result.gramsByCategory }));
        setOcrMsg(`זוהו ${Object.keys(result.gramsByCategory).length} קטגוריות`);
      } else {
        setOcrMsg('לא זוהו גרמים — הכנס ידנית');
      }
    } catch {
      setOcrMsg('שגיאה בסריקה — הכנס ידנית');
    } finally {
      setOcrLoading(false);
    }
  }

  const strainById = useMemo(() => Object.fromEntries(strains.map(s => [s.id, s])), [strains]);

  const scarcityMsg = plan.bags.length === 0
    ? 'לא נמצאו קופסאות מתאימות למסלול זה'
    : plan.bags.length < 3
      ? `מצאנו ${plan.bags.length} קופסאות למסלול זה — מידע מוגבל`
      : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(5,7,14,0.92)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 env(safe-area-inset-bottom,0)',
      }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        style={{
          width: '100%', maxWidth: 480,
          background: 'linear-gradient(180deg,rgba(12,16,30,0.99) 0%,rgba(8,10,20,1) 100%)',
          borderRadius: '24px 24px 0 0',
          border: '1.5px solid rgba(167,139,250,0.2)',
          borderBottom: 'none',
          padding: '20px 18px 32px',
          maxHeight: '90dvh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
              תכנון קנייה חודשי
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              מבוסס על פרופיל הטרפנים שלך · לא אינדיקה/סאטיבה
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.07)', border: 'none',
            borderRadius: 10, width: 32, height: 32,
            color: 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer',
          }}>
            ✕
          </button>
        </div>

        {/* Track tabs */}
        <div style={{
          display: 'flex', gap: 6, marginBottom: 18,
          background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4,
        }}>
          {Object.entries(TRACKS).map(([key, track]) => (
            <button
              key={key}
              onClick={() => setActiveTrack(key)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 9, border: 'none',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.18s',
                background: activeTrack === key ? 'rgba(167,139,250,0.25)' : 'transparent',
                color: activeTrack === key ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
              }}
            >
              {track.label}
            </button>
          ))}
        </div>

        {/* Gram editor */}
        {activeCats.length > 0 && (
          <GramsEditor
            categories={activeCats}
            grams={grams}
            onChange={setGrams}
            onOcr={handleOcr}
            ocrLoading={ocrLoading}
          />
        )}
        {ocrMsg && (
          <div style={{ fontSize: 11, color: 'rgba(167,139,250,0.8)', marginBottom: 10 }}>
            {ocrMsg}
          </div>
        )}

        {/* Scarcity / count header */}
        <div style={{
          fontSize: 12, fontWeight: 700,
          color: plan.bags.length >= 3 ? 'rgba(255,255,255,0.5)' : '#FBBF24',
          marginBottom: 12,
        }}>
          {scarcityMsg ?? `${plan.bags.length} קופסאות מומלצות`}
        </div>

        {/* Bag list */}
        <AnimatePresence mode='wait'>
          <div key={activeTrack} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {plan.bags.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '32px 20px',
                color: 'rgba(255,255,255,0.3)', fontSize: 13,
              }}>
                אין מספיק נתונים אמינים למסלול זה
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  נסה לשנות את הגרמים או לבחור מסלול אחר
                </div>
              </div>
            ) : (
              plan.bags.map((bag, i) => (
                <BagCard
                  key={bag.batchId}
                  bag={bag}
                  strain={{ ...strainById[bag.batchId], ...scoredMap[bag.batchId] }}
                  idx={i}
                />
              ))
            )}
          </div>
        </AnimatePresence>

        {/* Warnings */}
        {plan.warnings.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {plan.warnings.map((w, i) => (
              <div key={i} style={{
                fontSize: 11, color: 'rgba(251,191,36,0.7)',
                padding: '6px 10px', marginBottom: 4,
                background: 'rgba(251,191,36,0.06)', borderRadius: 8,
              }}>
                {w}
              </div>
            ))}
          </div>
        )}

        {/* DEFERRED: hard quota enforcement */}
        {/* API-side block of recommendations exceeding monthly quota is deferred to next version (§09). */}
        {/* Planning-layer is sufficient for launch. */}
      </motion.div>
    </motion.div>
  );
}
