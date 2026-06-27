// ─────────────────────────────────────────────────────────────────────────────
//  PharmacyViewer — Live Pharmacy Intelligence Dashboard
//
//  Render contract (bulletproof):
//  • Pharmacies load and render IMMEDIATELY — geo state NEVER blocks the list.
//  • Geo CTA is a slim dismissable banner (≤64px) at the TOP, never a blocking card.
//  • When geo is granted → distance badges appear + "הקרובים" sort pill activates.
//  • Pharmacies are always sorted: open-first → nearest (if geo) → alphabetical.
//
//  Community features (auth-optional):
//  • VerifyButtons: POST /api/pharmacies/:id/verify — no auth required (rate-limited).
//  • AlertBell: POST /api/pharmacies/alert — auth optional; degrades to localStorage.
//  Both persist state in localStorage so they survive page refreshes.
//
//  External search fallback:
//  • If text search yields < 2 local results, server tries DuckDuckGo + Brave.
//  • Web results shown below the local list with a "from web" badge.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence }                           from 'framer-motion';
import { P, B, G, SPRING, VARIANTS, FONT }                  from '../styles/ds.js';
import { useGeolocation }                                    from '../hooks/useGeolocation.js';
import { api }                                               from '../services/api.js';
import LoadingSkeleton                                       from './LoadingSkeleton.jsx';
import { PHARMACIES as LOCAL_PHARMACIES, REGION_ORDER }     from '../data/pharmacies.js';

// ── Pure utilities ────────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(km) {
  if (km == null) return null;
  return km < 1 ? `${Math.round(km * 1000)} מ'` : `${km.toFixed(1)} ק"מ`;
}

function timeAgo(iso) {
  if (!iso) return null;
  const min = Math.round((Date.now() - new Date(iso)) / 60_000);
  if (min < 1) return 'עכשיו';
  if (min < 60) return `לפני ${min} דק'`;
  const hr = Math.floor(min / 60);
  return hr < 24 ? `לפני ${hr} שע'` : `לפני ${Math.floor(hr / 24)} ימים`;
}

function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function lsSet(k, v)   { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// ── Category visual tokens ────────────────────────────────────────────────────
function catStyle(cat = '') {
  const n = parseInt(cat.match(/T(\d+)/)?.[1] ?? '0', 10);
  if (cat.toLowerCase().includes('cbd') || cat.toLowerCase().includes('שמן'))
    return { color: '#38BDF8', bg: 'rgba(56,189,248,0.09)',   bdr: 'rgba(56,189,248,0.24)'  };
  if (n >= 20) return { color: '#C084FC', bg: 'rgba(192,132,252,0.10)', bdr: 'rgba(192,132,252,0.26)' };
  if (n >= 15) return { color: '#4ADE80', bg: 'rgba(74,222,128,0.09)',  bdr: 'rgba(74,222,128,0.24)'  };
  if (n >= 10) return { color: '#FBBF24', bg: 'rgba(251,191,36,0.08)',  bdr: 'rgba(251,191,36,0.24)'  };
  return          { color: '#86EFAC', bg: 'rgba(134,239,172,0.08)', bdr: 'rgba(134,239,172,0.20)' };
}

// ── Slim geo banner (≤64px, dismissable) ─────────────────────────────────────
function GeoBanner({ status, onRequest, onDismiss }) {
  const isRequesting = status === 'requesting';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, height: 0 }} transition={SPRING.quick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        borderRadius: 14, marginBottom: 12,
        background: 'rgba(56,189,248,0.07)',
        border: '1px solid rgba(56,189,248,0.20)',
        backdropFilter: 'blur(8px)',
      }}>
      <span style={{ fontSize: 15, flexShrink: 0 }}>
        {isRequesting ? '🔍' : status === 'denied' ? '🔒' : '📍'}
      </span>
      <span style={{ flex: 1, fontSize: 12, color: 'rgba(187,247,208,0.75)', lineHeight: 1.4 }}>
        {isRequesting
          ? 'מאתר מיקום...'
          : status === 'denied'
            ? 'מיקום חסום — הפעל בהגדרות הדפדפן לתוצאות לפי מרחק'
            : 'הפעל מיקום לראות בתי מרקחת ממוינים לפי מרחק'}
      </span>
      {!isRequesting && status !== 'denied' && (
        <motion.button onClick={onRequest} whileTap={{ scale: 0.92 }}
          style={{
            flexShrink: 0, fontSize: 11, fontWeight: 800, padding: '5px 12px',
            borderRadius: 10, cursor: 'pointer', fontFamily: FONT,
            background: 'rgba(56,189,248,0.18)', color: '#38BDF8',
            border: '1px solid rgba(56,189,248,0.36)',
          }}>
          הפעל
        </motion.button>
      )}
      <button onClick={onDismiss}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(187,247,208,0.35)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>
        ✕
      </button>
    </motion.div>
  );
}

// ── Verification micro-interaction ────────────────────────────────────────────
function VerifyButtons({ batchId, pharmacyId, initial }) {
  const SK = `cm_v_${batchId}`;
  const [state,  setState]  = useState(() => lsGet(SK, null));
  const [counts, setCounts] = useState(initial || { yes: 0, no: 0 });
  const [burst,  setBurst]  = useState(false);
  const [busy,   setBusy]   = useState(false);

  const submit = useCallback(async (answer, e) => {
    e.stopPropagation();
    if (state || busy) return;
    setBusy(true);
    setState(answer);
    setCounts(c => ({ ...c, [answer]: c[answer] + 1 }));
    lsSet(SK, answer);
    setBurst(true);
    setTimeout(() => setBurst(false), 2400);
    try { await api.verifyStock(pharmacyId, batchId, answer); } catch {}
    setBusy(false);
  }, [state, busy, SK, pharmacyId, batchId]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <AnimatePresence mode="wait">
        {burst ? (
          <motion.span key="burst"
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }} transition={SPRING.bounce}
            style={{ fontSize: 10, fontWeight: 800, color: P.mint, whiteSpace: 'nowrap' }}>
            🌿 +1
          </motion.span>
        ) : state ? (
          <motion.span key="state"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{
              fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 8,
              background: state === 'yes' ? 'rgba(74,222,128,0.10)' : 'rgba(248,113,113,0.09)',
              color:      state === 'yes' ? P.mint : P.rose,
              border:    `1px solid ${state === 'yes' ? 'rgba(74,222,128,0.24)' : 'rgba(248,113,113,0.22)'}`,
            }}>
            {state === 'yes' ? `✓ ${counts.yes}` : `✗ ${counts.no}`}
          </motion.span>
        ) : (
          <motion.div key="btns"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'rgba(187,247,208,0.38)' }}>מלאי?</span>
            <motion.button onClick={(e) => submit('yes', e)} whileTap={{ scale: 0.82 }}
              style={{ fontSize: 10, padding: '3px 7px', borderRadius: 7, cursor: 'pointer', fontFamily: FONT,
                background: 'rgba(74,222,128,0.08)', color: P.mint, border: '1px solid rgba(74,222,128,0.20)' }}>
              ✅
            </motion.button>
            <motion.button onClick={(e) => submit('no', e)} whileTap={{ scale: 0.82 }}
              style={{ fontSize: 10, padding: '3px 7px', borderRadius: 7, cursor: 'pointer', fontFamily: FONT,
                background: 'rgba(248,113,113,0.07)', color: P.rose, border: '1px solid rgba(248,113,113,0.18)' }}>
              ❌
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Alert bell ────────────────────────────────────────────────────────────────
function AlertBell({ pharmacyId, strainId, strainName, pharmacyName }) {
  const LKEY   = 'cm_pharmacy_alerts';
  const setKey = `${pharmacyId}:${strainId}`;
  const [active, setActive] = useState(() => lsGet(LKEY, []).includes(setKey));
  const [shake,  setShake]  = useState(false);
  const [pulse,  setPulse]  = useState(false);

  const toggle = useCallback(async (e) => {
    e.stopPropagation();
    const saved = lsGet(LKEY, []);
    if (active) {
      lsSet(LKEY, saved.filter(k => k !== setKey));
      setActive(false);
      try { await api.deleteStockAlert(setKey.replace(':', '-')); } catch {}
    } else {
      lsSet(LKEY, [...saved, setKey]);
      setActive(true);
      setShake(true); setPulse(true);
      setTimeout(() => setShake(false), 700);
      setTimeout(() => setPulse(false), 2000);
      try { await api.setStockAlert(pharmacyId, strainId, strainName, pharmacyName); } catch {}
    }
  }, [active, setKey, pharmacyId, strainId, strainName, pharmacyName]);

  return (
    <motion.button onClick={toggle}
      animate={shake ? { rotate: [0, 18, -18, 12, -8, 0] } : {}}
      transition={{ duration: 0.55 }}
      title={active ? 'בטל התראה' : 'הודע לי כשחוזר למלאי'}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 13, padding: '2px 3px', lineHeight: 1,
        opacity: active ? 1 : 0.38,
        filter: active && pulse ? 'drop-shadow(0 0 5px rgba(251,191,36,0.90))' : active ? 'drop-shadow(0 0 3px rgba(251,191,36,0.55))' : 'none',
        transition: 'opacity 0.2s, filter 0.3s',
      }}>
      {active ? '🔔' : '🔕'}
    </motion.button>
  );
}

// ── Single inventory row in menu drawer ───────────────────────────────────────
const BatchRow = ({ item, pharmacyId, pharmacyName }) => (
  <motion.div variants={VARIANTS.fadeUp}
    style={{
      display: 'grid',
      gridTemplateColumns: '16px 1fr auto auto auto',
      alignItems: 'center', gap: 7,
      padding: '8px 10px', borderRadius: 11, marginBottom: 3,
      background: item.in_stock ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.01)',
      border: `1px solid ${item.in_stock ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)'}`,
      opacity: item.in_stock ? 1 : 0.55,
    }}>

    {/* Status dot */}
    <motion.div
      animate={item.in_stock ? { opacity: [1, 0.55, 1] } : {}}
      transition={{ duration: 2.4, repeat: Infinity }}
      style={{
        width: 7, height: 7, borderRadius: '50%', justifySelf: 'center',
        background: item.in_stock ? P.mint : 'rgba(248,113,113,0.55)',
        boxShadow: item.in_stock ? '0 0 5px rgba(74,222,128,0.55)' : 'none',
      }} />

    {/* Strain name + genetics */}
    <div dir="rtl" style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: P.hi, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.strain_name}
      </div>
      {item.genetics && (
        <div style={{ fontSize: 9.5, color: 'rgba(187,247,208,0.38)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.genetics}
        </div>
      )}
      {!item.in_stock && (
        <div style={{ fontSize: 9.5, color: P.rose, fontWeight: 600, marginTop: 1 }}>אזל מהמלאי</div>
      )}
    </div>

    {/* Price */}
    {item.price != null && item.in_stock ? (
      <span style={{
        fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 7, whiteSpace: 'nowrap',
        background: 'rgba(74,222,128,0.09)', color: P.mint, border: '1px solid rgba(74,222,128,0.20)',
      }}>₪{item.price}/gr</span>
    ) : <span />}

    {/* Verify */}
    <VerifyButtons batchId={String(item.batch_id)} pharmacyId={pharmacyId} initial={item.verification} />

    {/* Alert bell */}
    <AlertBell pharmacyId={pharmacyId} strainId={String(item.strain_id)}
      strainName={item.strain_name} pharmacyName={pharmacyName} />
  </motion.div>
);

// ── Live menu drawer (lazy loaded on first expand) ────────────────────────────
function LiveMenuDrawer({ pharmacyId, pharmacyName, onMeta }) {
  const [data,    setData]  = useState(null);
  const [loading, setLoad]  = useState(true);
  const [error,   setError] = useState(null);
  const [catFilter, setCat] = useState('all');
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    api.getPharmacyMenu(pharmacyId)
      .then(d => { setData(d); onMeta?.({ synced_at: d.synced_at, total: d.total_in_stock }); })
      .catch(e => setError(e.message))
      .finally(() => setLoad(false));
  }, [pharmacyId]);

  return (
    <motion.div key="drawer"
      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      style={{ overflow: 'hidden' }}>
      <div style={{ borderTop: '1px solid rgba(74,222,128,0.08)', background: 'rgba(0,0,0,0.22)', padding: '13px 13px 16px' }}>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 2px' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid transparent`, borderTopColor: P.mint }} />
            <span style={{ fontSize: 12, color: 'rgba(187,247,208,0.45)' }}>טוען תפריט חי...</span>
          </div>
        )}

        {error && !loading && (
          <p style={{ fontSize: 12, color: P.rose, margin: 0 }}>שגיאה: {error}</p>
        )}

        {data && !loading && (
          <>
            {/* Drawer stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 18,
                background: 'rgba(74,222,128,0.09)', color: P.mint, border: '1px solid rgba(74,222,128,0.22)',
              }}>📦 {data.total_in_stock} במלאי</span>
              {data.total_items > data.total_in_stock && (
                <span style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 18,
                  background: 'rgba(248,113,113,0.07)', color: P.rose, border: '1px solid rgba(248,113,113,0.18)',
                }}>{data.total_items - data.total_in_stock} אזל</span>
              )}
              {data.synced_at && (
                <span style={{ fontSize: 10, color: 'rgba(187,247,208,0.30)', marginRight: 'auto' }}>
                  ✓ עודכן {timeAgo(data.synced_at)}
                </span>
              )}
            </div>

            {/* No stock in DB case — show friendly message */}
            {data.total_items === 0 && (
              <div style={{ padding: '16px 8px', textAlign: 'center' }}>
                <p style={{ fontSize: 12.5, color: 'rgba(187,247,208,0.48)', lineHeight: 1.7, margin: 0 }}>
                  אין נתוני מלאי בבסיס הנתונים לבית מרקחת זה עדיין.<br />
                  📱 דווח מלאי על ידי שליחת תמונת תפריט לצמח →
                </p>
              </div>
            )}

            {/* Category filter pills */}
            {data.categories.length > 1 && (
              <div style={{ display: 'flex', gap: 5, overflowX: 'auto', marginBottom: 11, paddingBottom: 2 }}>
                {[{ id: 'all', label: 'הכל', cs: null }, ...data.categories.map(c => ({ id: c.category, label: c.category, cs: catStyle(c.category) }))].map(({ id, label, cs }) => {
                  const active = catFilter === id;
                  return (
                    <button key={id} onClick={() => setCat(id)}
                      style={{
                        flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '4px 10px',
                        borderRadius: 18, cursor: 'pointer', fontFamily: FONT,
                        background: active ? (cs?.color ?? P.mint) : (cs?.bg ?? 'rgba(255,255,255,0.05)'),
                        color:      active ? P.inv : (cs?.color ?? 'rgba(187,247,208,0.60)'),
                        border:     active ? 'none' : `1px solid ${cs?.bdr ?? B.subtle}`,
                      }}>{label}</button>
                  );
                })}
              </div>
            )}

            {/* Items grouped by category */}
            <motion.div variants={VARIANTS.stagger} initial="hidden" animate="show">
              {data.categories
                .filter(({ category: cat }) => catFilter === 'all' || catFilter === cat)
                .map(({ category: cat, items }) => {
                  const cs = catStyle(cat);
                  return (
                    <div key={cat} style={{ marginBottom: 12 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                        padding: '4px 8px', borderRadius: 8,
                        background: cs.bg, border: `1px solid ${cs.bdr}`,
                      }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: cs.color }}>{cat}</span>
                        <span style={{ fontSize: 9.5, color: 'rgba(187,247,208,0.32)', marginRight: 'auto' }}>
                          {items.filter(i => i.in_stock).length}/{items.length}
                        </span>
                      </div>
                      {items.map(item => (
                        <BatchRow key={item.batch_id} item={item}
                          pharmacyId={pharmacyId} pharmacyName={pharmacyName} />
                      ))}
                    </div>
                  );
                })}
            </motion.div>

            <p style={{ fontSize: 9.5, color: 'rgba(187,247,208,0.25)', textAlign: 'center', marginTop: 8 }}>
              מחירים מסריקת תפריט — ניתן לדווח שגיאה עם ✅/❌ למעלה
            </p>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ── Pharmacy card ─────────────────────────────────────────────────────────────
function PharmacyCard({ p, distanceKm, isExpanded, onToggle }) {
  const [meta, setMeta] = useState(null); // { synced_at, total } from drawer

  return (
    <motion.article variants={VARIANTS.fadeUp}
      style={{
        borderRadius: 20, overflow: 'hidden',
        background: 'rgba(20,23,32,0.94)',
        border: `1.5px solid ${isExpanded ? 'rgba(74,222,128,0.30)' : p.is_open ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: isExpanded ? '0 4px 36px rgba(74,222,128,0.07)' : 'none',
        transition: 'border-color 0.28s, box-shadow 0.28s',
      }}>

      {/* ── Card header (clickable) ──────────────────────────────────────── */}
      <button onClick={onToggle}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'block', textAlign: 'right', padding: 0 }}>
        <div style={{ padding: '14px 15px 12px' }}>

          {/* Top row: name + open badge + expand arrow */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }} dir="rtl">
              <span style={{ fontSize: 14.5, fontWeight: 800, color: P.hi, display: 'block', marginBottom: 2 }}>
                {p.name}
              </span>
              <span style={{ fontSize: 11.5, color: 'rgba(187,247,208,0.55)' }}>
                {[p.city, p.address].filter(Boolean).join(' · ')}
              </span>
            </div>

            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {/* Open/Closed pill — null = hours unknown */}
              {p.is_open === null ? (
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                  background: 'rgba(255,255,255,0.04)', color: 'rgba(187,247,208,0.38)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>שעות לא זמינות</span>
              ) : (
                <span style={{
                  fontSize: 10.5, fontWeight: 800, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                  background: p.is_open ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.09)',
                  color:      p.is_open ? P.mint : P.rose,
                  border:    `1px solid ${p.is_open ? 'rgba(74,222,128,0.28)' : 'rgba(248,113,113,0.22)'}`,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <motion.span
                    animate={p.is_open ? { scale: [1, 1.5, 1], opacity: [1, 0.6, 1] } : {}}
                    transition={{ duration: 2.2, repeat: Infinity }}
                    style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: p.is_open ? P.mint : P.rose }}
                  />
                  {p.is_open ? 'פתוח עכשיו' : 'סגור'}
                </span>
              )}

              {/* Expand arrow */}
              <motion.span animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.22 }}
                style={{ fontSize: 11, color: 'rgba(187,247,208,0.32)', lineHeight: 1 }}>▼</motion.span>
            </div>
          </div>

          {/* Info row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {distanceKm != null && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 10,
                background: 'rgba(56,189,248,0.10)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.24)',
              }}>📍 {fmtDist(distanceKm)}</span>
            )}
            {p.hours_today && (
              <span style={{
                fontSize: 10.5, padding: '3px 9px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', color: 'rgba(187,247,208,0.55)', border: B.subtle,
              }}>🕐 {p.hours_today}</span>
            )}
            {p.delivery && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 10,
                background: 'rgba(74,222,128,0.08)', color: P.mint, border: '1px solid rgba(74,222,128,0.20)',
              }}>🛵 משלוחים</span>
            )}
            {p.phone && (
              <a href={`tel:${p.phone}`} onClick={e => e.stopPropagation()}
                style={{ fontSize: 10.5, color: 'rgba(187,247,208,0.40)', textDecoration: 'none' }}>
                ☎ {p.phone}
              </a>
            )}
          </div>

          {/* Action links + stock count */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {p.website_url && (
              <a href={p.website_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 9,
                  background: 'rgba(167,139,250,0.09)', color: P.violet, border: '1px solid rgba(167,139,250,0.20)',
                  textDecoration: 'none',
                }}>🌐 גש לתפריט</a>
            )}
            {p.maps_url && (
              <a href={p.maps_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 9,
                  background: 'rgba(56,189,248,0.08)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.20)',
                  textDecoration: 'none',
                }}>🗺 מפה</a>
            )}

            {/* Stock count badge — only when real data is available */}
            {(meta?.total != null || p.stock_count != null) && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9,
                background: 'rgba(192,132,252,0.09)', color: P.violet, border: '1px solid rgba(192,132,252,0.20)',
              }}>
                📦 {meta?.total ?? p.stock_count} זנים
              </span>
            )}

            {/* Last verified */}
            {meta?.synced_at && (
              <span style={{ fontSize: 9.5, color: 'rgba(187,247,208,0.28)', marginRight: 'auto' }}>
                ✓ תפריט {timeAgo(meta.synced_at)}
              </span>
            )}

            <span style={{ fontSize: 9.5, color: 'rgba(187,247,208,0.38)', marginRight: meta?.synced_at ? 0 : 'auto' }}>
              ▾ לחץ לתפריט חי
            </span>
          </div>
        </div>
      </button>

      {/* ── Live menu drawer ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {isExpanded && (
          <LiveMenuDrawer key="d"
            pharmacyId={p.id} pharmacyName={p.name}
            onMeta={setMeta} />
        )}
      </AnimatePresence>
    </motion.article>
  );
}

// ── External web search results ───────────────────────────────────────────────
function WebResultsPanel({ results }) {
  if (!results?.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        fontSize: 10.5, color: 'rgba(187,247,208,0.38)', fontWeight: 700,
        padding: '6px 12px', textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        🔎 תוצאות מהאינטרנט
      </div>
      {results.map((r, i) => (
        <a key={i} href={r.url || '#'} target="_blank" rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'block', marginBottom: 6 }}>
          <div style={{
            padding: '10px 14px', borderRadius: 14,
            background: 'rgba(20,23,32,0.80)', border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: P.violet, marginBottom: 3 }}>{r.title}</p>
            <p style={{ fontSize: 11, color: 'rgba(187,247,208,0.45)', lineHeight: 1.55 }}>{r.snippet}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

// ── Compute is_open from real pharmacy hours only — never invent hours ────────
// Returns null when no hours data is available (rendered as "שעות לא זמינות").
const _HR = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;
function computeIsOpen(p) {
  if (p.is_open != null) return p.is_open;
  if (!p.hours_weekdays && !p.hours_friday) return null; // no real data → unknown
  const now = new Date(), day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const raw = day === 5 ? p.hours_friday : day === 6 ? p.hours_saturday : p.hours_weekdays;
  if (!raw) return null;
  const m = _HR.exec(raw.trim());
  if (!m) return null;
  const openMin = +m[1] * 60 + +m[2], closeMin = +m[3] * 60 + +m[4];
  return closeMin > openMin ? mins >= openMin && mins < closeMin : mins >= openMin || mins < closeMin;
}

// ── Generate a Google Maps deep link from lat/lng ─────────────────────────────
function mapsUrl(p) {
  if (p.maps_url) return p.maps_url;
  if (p.lat != null && p.lng != null)
    return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  return null;
}

// ── Normalise a pharmacy record: fill computed fields ─────────────────────────
function normalise(p) {
  return {
    ...p,
    is_open:     computeIsOpen(p),
    website_url: p.website_url || p.menuUrl || null,
    maps_url:    mapsUrl(p),
  };
}

// ── Pending new-strain review panel ──────────────────────────────────────────
// Reads cm_unknown_strains (written by menuDecoder.js:recordUnknown) and lets
// the user approve (→ cm_catalog_pending) or reject (→ delete) each entry.
function PendingStrains() {
  const [items, setItems] = useState(() => lsGet('cm_unknown_strains', []));
  const [open,  setOpen]  = useState(false);

  if (items.length === 0) return null;

  const approve = (name) => {
    const pending = lsGet('cm_catalog_pending', []);
    const entry = items.find(s => s.name === name);
    if (entry && !pending.some(s => s.name === name))
      lsSet('cm_catalog_pending', [...pending, { ...entry, approvedAt: Date.now() }]);
    const next = items.filter(s => s.name !== name);
    lsSet('cm_unknown_strains', next);
    setItems(next);
  };

  const reject = (name) => {
    const next = items.filter(s => s.name !== name);
    lsSet('cm_unknown_strains', next);
    setItems(next);
  };

  return (
    <div style={{ marginTop: 16, borderRadius: 18, border: '1.5px solid rgba(251,191,36,0.20)', background: 'rgba(20,23,32,0.92)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#FBBF24', flex: 1, textAlign: 'right' }}>
          🆕 {items.length} זנים חדשים ממתינים לאישור
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }}
          style={{ fontSize: 11, color: 'rgba(251,191,36,0.40)', flexShrink: 0 }}>▼</motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div key="body"
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: 'hidden' }}>
            <div style={{ borderTop: '1px solid rgba(251,191,36,0.10)', padding: '10px 14px 14px' }}>
              <p style={{ fontSize: 10.5, color: 'rgba(187,247,208,0.38)', marginBottom: 10, lineHeight: 1.5 }} dir="rtl">
                זנים שנסרקו ולא זוהו בקטלוג. ״אשר״ מוסיף לקטלוג הממתין, ״דחה״ מוחק רעש OCR.
              </p>
              {items.map(s => (
                <div key={s.name} dir="rtl"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(251,191,36,0.08)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: P.hi }}>{s.name}</span>
                    {s.cat   && <span style={{ fontSize: 10, color: 'rgba(187,247,208,0.40)', marginRight: 6 }}>{s.cat}</span>}
                    {s.price && <span style={{ fontSize: 10, color: P.mint, marginRight: 6 }}>₪{s.price}</span>}
                  </div>
                  <button onClick={() => approve(s.name)}
                    style={{ fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 9, border: '1px solid rgba(74,222,128,0.28)', background: 'rgba(74,222,128,0.09)', color: P.mint, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                    אשר ✓
                  </button>
                  <button onClick={() => reject(s.name)}
                    style={{ fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 9, border: '1px solid rgba(248,113,113,0.22)', background: 'rgba(248,113,113,0.07)', color: P.rose, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                    דחה ✗
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PharmacyViewer() {
  const geo = useGeolocation();

  // Core data state
  const [pharmacies, setPharmacies] = useState(null);
  const [meta,       setMeta]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [syncing,    setSyncing]    = useState(false);

  // Search state
  const [inputQ,      setInputQ]   = useState('');
  const [activeQ,     setActiveQ]  = useState(''); // committed (debounced or on Enter)
  const [searchBusy,  setSearchBusy] = useState(false);
  const [webResults,  setWebResults] = useState([]);

  // Filter + sort
  const [filterMode, setFilterMode] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  // Geo banner
  const [bannerDismissed, setBannerDismissed] = useState(() => lsGet('cm_geo_banner_dismissed', false));

  // ── Initial data load — local-first, API enhancement optional ───────────
  useEffect(() => {
    let alive = true;
    // Immediately populate from bundled data (no server needed)
    setPharmacies(LOCAL_PHARMACIES.map(normalise));
    setLoading(false);
    // Try server for live stock/open-status enhancement
    api.getPharmacies()
      .then(resp => {
        if (!alive) return;
        const fresh = Array.isArray(resp) ? resp : (resp.pharmacies || []);
        if (fresh.length > 0) {
          // Merge: server data wins where present, else keep local entry
          const byId = Object.fromEntries(fresh.map(p => [p.id, p]));
          setPharmacies(LOCAL_PHARMACIES.map(p => normalise(byId[p.id] ? { ...p, ...byId[p.id] } : p)));
          setMeta(Array.isArray(resp) ? null : (resp.meta || null));
        }
      })
      .catch(() => { /* server offline — local data already rendered */ });
    return () => { alive = false; };
  }, []);

  // ── Debounced search (300ms) ──────────────────────────────────────────────
  useEffect(() => {
    if (!inputQ.trim()) {
      setActiveQ('');
      setWebResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setActiveQ(inputQ.trim());
      // Only call backend search if local results look sparse
      const local = (pharmacies || []).filter(p =>
        [p.name, p.city, p.address].some(f => f?.toLowerCase().includes(inputQ.trim().toLowerCase()))
      );
      if (local.length < 2) {
        setSearchBusy(true);
        try {
          const r = await api.syncPharmacies().then(() => {}).catch(() => {}); // wake cache
          const sr = await fetch(`/api/pharmacies/search?q=${encodeURIComponent(inputQ.trim())}`);
          if (sr.ok) {
            const { web_results } = await sr.json();
            setWebResults(web_results || []);
          }
        } catch {}
        setSearchBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [inputQ, pharmacies]);

  // ── Manual sync ───────────────────────────────────────────────────────────
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await api.syncPharmacies();
      const fresh = await api.getPharmacies();
      if (Array.isArray(fresh)) setPharmacies(fresh.map(normalise));
      else { setPharmacies((fresh.pharmacies || []).map(normalise)); setMeta(fresh.meta || null); }
      if (r.synced_at) setMeta(m => ({ ...m, synced_at: r.synced_at, source: r.source }));
    } catch {}
    setSyncing(false);
  }, []);

  // ── Sorted + filtered list ────────────────────────────────────────────────
  const sorted = useMemo(() => {
    let list = pharmacies ? [...pharmacies] : [];

    // Text filter
    if (activeQ) {
      const ql = activeQ.toLowerCase();
      list = list.filter(p =>
        [p.name, p.city, p.address, p.chain].some(f => f?.toLowerCase().includes(ql))
      );
    }

    // Mode filters
    if (filterMode === 'open')     list = list.filter(p => p.is_open);
    if (filterMode === 'delivery') list = list.filter(p => p.delivery);

    // Attach distance
    const hasGeo = geo.status === 'granted' && geo.coords;
    list = list.map(p => ({
      ...p,
      distanceKm: (hasGeo && p.lat != null && p.lng != null)
        ? haversineKm(geo.coords.lat, geo.coords.lng, p.lat, p.lng)
        : null,
    }));

    // Sort
    if (filterMode === 'nearest' && hasGeo) {
      list.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    } else {
      list.sort((a, b) => {
        if (a.is_open !== b.is_open) return a.is_open ? -1 : 1;
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
        return (a.name || '').localeCompare(b.name || '', 'he');
      });
    }

    return list;
  }, [pharmacies, activeQ, filterMode, geo.status, geo.coords]);

  // Group by region for the "all" mode without active search
  // REGION_ORDER imported from pharmacies.js
  const showGrouped = filterMode === 'all' && !activeQ && geo.status !== 'granted';
  const grouped = useMemo(() => {
    if (!showGrouped) return null;
    const map = {};
    for (const p of sorted) {
      const r = p.region || 'אחר';
      if (!map[r]) map[r] = [];
      map[r].push(p);
    }
    return REGION_ORDER.filter(r => map[r]?.length).map(r => ({ region: r, items: map[r] }));
  }, [sorted, showGrouped]);

  const openCount = (pharmacies || []).filter(p => p.is_open).length;
  const showGeoBanner =
    !bannerDismissed &&
    geo.status !== 'granted' &&
    geo.status !== 'unavailable';

  if (loading) return <LoadingSkeleton message="טוען בתי מרקחת חיים… 🏪" rows={4} />;

  return (
    <motion.div variants={VARIANTS.page} initial="hidden" animate="show"
      dir="rtl" style={{ fontFamily: FONT }}>

      {/* ── Slim geo banner ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showGeoBanner && (
          <GeoBanner
            key="geo"
            status={geo.status}
            onRequest={geo.request}
            onDismiss={() => { setBannerDismissed(true); lsSet('cm_geo_banner_dismissed', true); }}
          />
        )}
      </AnimatePresence>

      {/* ── Dashboard header ─────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 22, padding: '16px 18px 14px', marginBottom: 14, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(148deg,rgba(8,18,12,0.99) 0%,rgba(14,28,18,0.97) 100%)',
        border: '1.5px solid rgba(74,222,128,0.20)',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -10, width: 170, height: 100,
          background: 'radial-gradient(ellipse,rgba(74,222,128,0.10),transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 15.5, fontWeight: 800, color: P.hi, marginBottom: 3 }}>🏪 בתי מרקחת חיים</h2>
            <p style={{ fontSize: 11.5, color: 'rgba(187,247,208,0.52)', lineHeight: 1.5 }}>
              {geo.status === 'granted' ? 'ממוין לפי מרחק ממך · לחץ לתפריט' : 'לחץ על בית מרקחת לתפריט המלא'}
            </p>
          </div>
          <motion.button onClick={handleSync} disabled={syncing} whileTap={syncing ? {} : { scale: 0.93 }}
            style={{
              flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '7px 13px', borderRadius: 12,
              cursor: syncing ? 'not-allowed' : 'pointer', fontFamily: FONT,
              background: 'rgba(74,222,128,0.09)', color: P.mint, border: '1px solid rgba(74,222,128,0.22)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
            <motion.span animate={syncing ? { rotate: 360 } : {}} transition={{ duration: 0.9, repeat: syncing ? Infinity : 0, ease: 'linear' }}>🔄</motion.span>
            {syncing ? 'מסנכרן...' : 'רענן'}
          </motion.button>
        </div>

        <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 18,
            background: 'rgba(74,222,128,0.10)', color: P.mint, border: '1px solid rgba(74,222,128,0.22)' }}>
            🟢 {openCount} פתוחים
          </span>
          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 18,
            background: 'rgba(255,255,255,0.04)', color: 'rgba(187,247,208,0.55)', border: B.subtle }}>
            {(pharmacies || []).length} בתי מרקחת
          </span>
          {meta?.synced_at && (
            <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 18,
              background: 'rgba(56,189,248,0.06)', color: 'rgba(56,189,248,0.70)', border: '1px solid rgba(56,189,248,0.15)' }}>
              🕐 {timeAgo(meta.synced_at)}
            </span>
          )}
          {geo.status === 'granted' && (
            <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 18,
              background: 'rgba(56,189,248,0.08)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.22)' }}>
              📍 מיקום פעיל
            </span>
          )}
          {meta?.source === 'moh' && (
            <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 18,
              background: 'rgba(74,222,128,0.06)', color: 'rgba(74,222,128,0.55)', border: '1px solid rgba(74,222,128,0.14)' }}>
              🏛 משרד הבריאות
            </span>
          )}
        </div>
      </div>

      {/* ── Search bar ───────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <input
          value={inputQ}
          onChange={e => setInputQ(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && (setInputQ(''), setWebResults([]))}
          placeholder="🔍 חיפוש לפי שם, עיר, כתובת..."
          dir="rtl"
          style={{
            width: '100%', boxSizing: 'border-box', fontFamily: FONT,
            background: 'rgba(20,23,32,0.92)', outline: 'none',
            border: `1.5px solid ${inputQ ? 'rgba(74,222,128,0.32)' : 'rgba(74,222,128,0.12)'}`,
            borderRadius: 16, padding: '11px 16px 11px 40px',
            color: P.hi, fontSize: 13, transition: 'border-color 0.2s',
          }} />
        {inputQ && (
          <button onClick={() => { setInputQ(''); setWebResults([]); }}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(187,247,208,0.38)', fontSize: 14 }}>
            {searchBusy ? (
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-block' }}>⟳</motion.span>
            ) : '✕'}
          </button>
        )}
      </div>

      {/* ── Filter pills ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
        {[
          { id: 'all',      label: 'הכל' },
          { id: 'open',     label: '🟢 פתוחים' },
          { id: 'delivery', label: '🛵 משלוחים' },
          ...(geo.status === 'granted' ? [{ id: 'nearest', label: '📍 הקרובים' }] : []),
        ].map(({ id, label }) => {
          const active = filterMode === id;
          return (
            <motion.button key={id} onClick={() => setFilterMode(id)} whileTap={{ scale: 0.92 }}
              style={{
                flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '7px 14px', borderRadius: 20,
                cursor: 'pointer', fontFamily: FONT,
                background: active ? P.mint : 'rgba(20,23,32,0.90)',
                color:      active ? P.inv  : 'rgba(187,247,208,0.65)',
                border:     active ? 'none' : '1.5px solid rgba(74,222,128,0.14)',
                boxShadow:  active ? G.mint(8) : 'none',
                transition: 'background 0.22s, color 0.22s',
              }}>{label}</motion.button>
          );
        })}
      </div>

      {/* ── Pharmacy list ────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <motion.div variants={VARIANTS.fadeUp} initial="hidden" animate="show"
          style={{ borderRadius: 18, padding: '28px 18px', textAlign: 'center',
            background: 'rgba(20,23,32,0.90)', border: '1.5px solid rgba(74,222,128,0.09)' }}>
          <p style={{ fontSize: 14, color: 'rgba(187,247,208,0.40)', marginBottom: 10 }}>
            {filterMode !== 'all' ? 'אין תוצאות לסינון הנוכחי' : 'לא נמצאו בתי מרקחת'}
          </p>
          {filterMode !== 'all' && (
            <button onClick={() => setFilterMode('all')}
              style={{ fontSize: 12, color: P.mint, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, textDecoration: 'underline' }}>
              הצג הכל
            </button>
          )}
        </motion.div>
      ) : grouped ? (
        /* ── Grouped by region ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grouped.map(({ region, items }) => (
            <div key={region}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: 'rgba(74,222,128,0.60)',
                letterSpacing: '0.08em', marginBottom: 8,
                paddingBottom: 6, borderBottom: '1px solid rgba(74,222,128,0.10)',
              }}>
                📍 {region}
              </div>
              <motion.div variants={VARIANTS.stagger} initial="hidden" animate="show"
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map(p => (
                  <PharmacyCard
                    key={p.id} p={p} distanceKm={p.distanceKm}
                    isExpanded={expandedId === p.id}
                    onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  />
                ))}
              </motion.div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Flat sorted list (when filtered / searched / geo-sorted) ── */
        <motion.div variants={VARIANTS.stagger} initial="hidden" animate="show"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map(p => (
            <PharmacyCard
              key={p.id} p={p} distanceKm={p.distanceKm}
              isExpanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
            />
          ))}
        </motion.div>
      )}

      {/* ── External web results (when local search was sparse) ──────────── */}
      <WebResultsPanel results={webResults} />

      {/* ── New-strain review (OCR-scanned unknowns from menu decoder) ────── */}
      <PendingStrains />

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      {sorted.length > 0 && (
        <p style={{ fontSize: 10, textAlign: 'center', color: 'rgba(187,247,208,0.25)', marginTop: 18, lineHeight: 1.8 }}>
          {meta?.source === 'moh'
            ? 'מקור: data.gov.il (משרד הבריאות)'
            : 'נתוני סריקה: Pharmary (Or Akiva) + Givol, יוני 2026'}
          <br />מחירים ומלאי — אמת ישירות עם בית המרקחת
        </p>
      )}
    </motion.div>
  );
}
