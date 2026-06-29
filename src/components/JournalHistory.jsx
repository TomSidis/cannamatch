// ─────────────────────────────────────────────────────────────────────────────
//  JournalHistory — Per-user private treatment journal list (Phase C2).
//
//  Shows the user's own entries: strain, date, rating, and effect chips.
//  No community data. No sharing controls. No gamification.
//  Tapping an entry shows the notes (private, never shared).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { P, B, G, SPRING, FONT, VARIANTS } from '../styles/ds.js';
import { RatingBadge } from './EmotionalRating.jsx';
import { api } from '../services/api.js';

// ── Effect chip display (read-only) ──────────────────────────────────────────
const EFFECT_META = {
  sleep:       { label: 'שינה',           emoji: '🌙' },
  antiPain:    { label: 'הקלה בכאב',      emoji: '💊' },
  antiAnxiety: { label: 'הרגעת חרדה',     emoji: '🧘' },
  mood:        { label: 'שיפור מצב רוח',  emoji: '☀️' },
  bodyCalm:    { label: 'רוגע גופני',      emoji: '🌿' },
  clearHead:   { label: 'ראש צלול',        emoji: '🎯' },
  appetite:    { label: 'עלייה בתיאבון',  emoji: '🍽️' },
  dry_mouth:   { label: 'יובש בפה',       emoji: '🫦' },
  anxiety:     { label: 'חרדה',           emoji: '😬' },
  dizzy:       { label: 'סחרחורת',        emoji: '💫' },
  oversleep:   { label: 'ישנוניות יתר',   emoji: '😴' },
  foggy:       { label: 'ערפול',           emoji: '🌫️' },
  munchies:    { label: 'עלייה בתיאבון',  emoji: '🍽️' },
  heart_rate:  { label: 'דפיקות לב',      emoji: '💓' },
  headache:    { label: 'כאב ראש',         emoji: '🤕' },
  nausea:      { label: 'בחילה',           emoji: '🤢' },
};

function EffectTag({ id, isAdverse }) {
  const m = EFFECT_META[id];
  if (!m) return null;
  return (
    <span style={{
      display:      'inline-flex',
      alignItems:   'center',
      gap:          4,
      padding:      '2px 8px',
      borderRadius: 12,
      fontSize:     11,
      fontFamily:   FONT,
      background:   isAdverse ? 'rgba(248,113,113,0.10)' : 'rgba(74,222,128,0.08)',
      color:        isAdverse ? P.danger : P.sage,
      border:       `1px solid ${isAdverse ? 'rgba(248,113,113,0.20)' : 'rgba(74,222,128,0.16)'}`,
      direction:    'rtl',
    }}>
      {m.emoji} {m.label}
    </span>
  );
}

// ── Single entry card ─────────────────────────────────────────────────────────
// helpedCount: number | undefined — undefined = not yet loaded or not shared.
// Shown only when entry is shared (review_id exists) and count > 0.
// Kept minimal: just a quiet count, no gamification.
function EntryCard({ entry, helpedCount }) {
  const [expanded,  setExpanded]  = useState(false);
  // review_id tracks share state. null=not shared, string=shared, 'sharing'=in-flight.
  const [reviewId,  setReviewId]  = useState(entry.review_id ?? null);
  const [shareErr,  setShareErr]  = useState(null);

  const date = new Date(entry.created_at).toLocaleDateString('he-IL', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
  });

  const hasNotes   = !!entry.notes?.trim();
  const effects    = entry.effects      ?? [];
  const sideEffs   = entry.side_effects ?? [];
  const hasDetails = effects.length > 0 || sideEffs.length > 0;
  const isSharing  = reviewId === 'sharing';
  const isShared   = typeof reviewId === 'string' && reviewId !== 'sharing';

  // Share — optimistic: show "sharing..." immediately; rollback on failure
  const handleShare = useCallback(async (e) => {
    e.stopPropagation();
    if (isSharing) return;
    setShareErr(null);
    setReviewId('sharing');
    try {
      const res = await api.journal.share(entry.id);
      setReviewId(res.review_id);
    } catch (err) {
      setReviewId(null);              // rollback
      setShareErr(err.message || 'שגיאה בשיתוף');
    }
  }, [entry.id, isSharing]);

  // Unshare — optimistic: hide button immediately; rollback on failure
  const handleUnshare = useCallback(async (e) => {
    e.stopPropagation();
    const prevReviewId = reviewId;
    setShareErr(null);
    setReviewId(null);               // optimistic remove
    try {
      await api.journal.unshare(entry.id);
    } catch (err) {
      setReviewId(prevReviewId);     // rollback
      setShareErr(err.message || 'שגיאה בביטול שיתוף');
    }
  }, [entry.id, reviewId]);

  return (
    <motion.div
      layout
      style={{
        background:   P.surface,
        border:       `1px solid ${B.card}`,
        borderRadius: 14,
        padding:      '14px 16px',
        cursor:       hasNotes ? 'pointer' : 'default',
        direction:    'rtl',
        fontFamily:   FONT,
      }}
      onClick={() => hasNotes && setExpanded((p) => !p)}
    >
      {/* Row 1: strain + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: P.hi }}>
            {entry.strain_name ?? 'זן לא ידוע'}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: P.lo }}>{date}</p>
        </div>
        <RatingBadge value={entry.rating} />
      </div>

      {/* Effect chips */}
      {hasDetails && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {effects.map((id) => <EffectTag key={id} id={id} isAdverse={false} />)}
          {sideEffs.map((id) => <EffectTag key={id} id={id} isAdverse />)}
        </div>
      )}

      {/* Share / Unshare — internal only. No external links. No gamification. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: hasDetails ? 0 : 4 }}
           onClick={(e) => e.stopPropagation()}
      >
        {!isShared && (
          <motion.button
            onClick={handleShare}
            whileTap={{ scale: 0.95 }}
            disabled={isSharing}
            style={{
              padding:      '4px 12px',
              borderRadius: 20,
              border:       `1px solid ${isSharing ? B.subtle : B.mint}`,
              background:   'transparent',
              color:        isSharing ? P.lo : P.mint,
              fontSize:     12,
              fontFamily:   FONT,
              cursor:       isSharing ? 'default' : 'pointer',
              transition:   'color 0.15s, border-color 0.15s',
            }}
          >
            {isSharing ? 'משתף...' : 'שתף לפווידר'}
          </motion.button>
        )}
        {isShared && (
          <motion.button
            onClick={handleUnshare}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={SPRING.smooth}
            style={{
              padding:      '4px 12px',
              borderRadius: 20,
              border:       `1px solid ${B.subtle}`,
              background:   'transparent',
              color:        P.lo,
              fontSize:     12,
              fontFamily:   FONT,
              cursor:       'pointer',
            }}
          >
            בטל שיתוף
          </motion.button>
        )}
        {shareErr && (
          <span style={{ fontSize: 11, color: P.danger }}>{shareErr}</span>
        )}
      </div>

      {/* Helped count — shown only when shared and count > 0 (C5) */}
      {isShared && helpedCount > 0 && (
        <div style={{ marginTop: 6 }}>
          <span style={{
            fontSize: 11, color: 'rgba(187,247,208,0.55)',
            fontFamily: FONT,
          }}>
            💚 עזר ל‑{helpedCount} מטופלים
          </span>
        </div>
      )}

      {/* Private notes — expandable */}
      <AnimatePresence>
        {expanded && hasNotes && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{   height: 0,    opacity: 0 }}
            transition={SPRING.smooth}
            style={{ overflow: 'hidden' }}
          >
            <p style={{
              marginTop: 10,
              padding:   '10px 12px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 8,
              fontSize:  13,
              color:     P.mid,
              lineHeight: 1.55,
              borderRight: `3px solid ${B.mint}`,
            }}>
              {entry.notes}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes hint */}
      {hasNotes && !expanded && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: P.lo }}>
          📝 יש הערה — לחץ לצפייה
        </p>
      )}
    </motion.div>
  );
}

// ── JournalHistory ────────────────────────────────────────────────────────────
export default function JournalHistory({ onNewEntry }) {
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [hasMore,    setHasMore]    = useState(false);
  const [offset,     setOffset]     = useState(0);
  // impactMap: Map<review_id, helped_count> — from GET /api/impact (C5).
  // Separate call: GET /treatment is the private journal; impact is community data.
  const [impactMap,  setImpactMap]  = useState({});
  const PAGE = 20;

  useEffect(() => {
    let cancelled = false;
    api.impact.get()
      .then(({ reports = [] }) => {
        if (!cancelled) {
          const map = {};
          for (const r of reports) map[r.review_id] = r.helped_count;
          setImpactMap(map);
        }
      })
      .catch(() => {}); // non-critical — journal works without impact counts
    return () => { cancelled = true; };
  }, []);

  async function load(reset = false) {
    setLoading(true);
    setError(null);
    try {
      const start = reset ? 0 : offset;
      const data  = await api.journal.list({ limit: PAGE, offset: start });
      setEntries((p) => reset ? data.entries : [...p, ...data.entries]);
      setOffset(start + data.entries.length);
      setHasMore(data.entries.length === PAGE);
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת היומן');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT, direction: 'rtl' }}>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16,
      }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: P.hi }}>
          יומן טיפול שלי
        </h2>
        {onNewEntry && (
          <motion.button
            onClick={onNewEntry}
            whileTap={{ scale: 0.95 }}
            style={{
              padding:      '7px 14px',
              borderRadius: 20,
              border:       `1px solid ${B.mint}`,
              background:   'rgba(74,222,128,0.08)',
              color:        P.mint,
              fontSize:     13,
              fontWeight:   600,
              fontFamily:   FONT,
              cursor:       'pointer',
              boxShadow:    G.mint(8),
            }}
          >
            + רשומה חדשה
          </motion.button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(248,113,113,0.08)', border: `1px solid ${B.rose}`,
          color: P.danger, fontSize: 13, marginBottom: 12,
        }}>
          {error}
          <button
            onClick={() => load(true)}
            style={{ marginRight: 10, background: 'none', border: 'none', color: P.mint, cursor: 'pointer', fontSize: 13 }}
          >
            נסה שוב
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <motion.div
          variants={VARIANTS.fadeUp}
          initial="hidden"
          animate="show"
          style={{
            textAlign:  'center',
            padding:    '40px 20px',
            color:      P.lo,
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 12 }}>🌱</div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: P.mid }}>
            עדיין אין רשומות ביומן
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>
            הרשומה הראשונה שלך תשפר את ההמלצות
          </p>
        </motion.div>
      )}

      {/* Entry list */}
      <motion.div
        variants={VARIANTS.stagger}
        initial="hidden"
        animate="show"
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {entries.map((entry) => (
          <motion.div key={entry.id} variants={VARIANTS.fadeUp}>
            <EntryCard
              entry={entry}
              helpedCount={entry.review_id ? (impactMap[entry.review_id] ?? 0) : undefined}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Load more */}
      {hasMore && !loading && (
        <motion.button
          onClick={() => load(false)}
          whileTap={{ scale: 0.97 }}
          style={{
            width:        '100%',
            marginTop:    12,
            padding:      '10px 0',
            borderRadius: 10,
            border:       `1px solid ${B.subtle}`,
            background:   'transparent',
            color:        P.lo,
            fontSize:     13,
            fontFamily:   FONT,
            cursor:       'pointer',
          }}
        >
          טען עוד
        </motion.button>
      )}

      {/* Loading spinner */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{
              width: 24, height: 24, borderRadius: '50%',
              border: `2px solid ${B.subtle}`,
              borderTopColor: P.mint,
            }}
          />
        </div>
      )}
    </div>
  );
}
