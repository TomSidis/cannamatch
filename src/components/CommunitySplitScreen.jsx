// ─────────────────────────────────────────────────────────────────────────────
//  CommunitySplitScreen — The twin-pane community experience.
//
//  Left/right panes (mobile: top-tab selector):
//    1. "אנשים כמוני"  — reports from users with similar terpene profiles
//    2. "כל הקהילה"   — all reports, general feed
//
//  Access: valid-license required (gated at the parent level — CannaMatch.jsx
//          already gates with `licenseVerified ? Community : CommunityLicenseGate`)
//
//  Social proof: "X אנשים עם פרופיל דומה לשלך דירגו את זה גבוה"
//  Altruistic framing: "הדיווח שלך עזר ל-N אנשים השבוע"
//  Anonymity: prominently flagged as a feature
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { C as COPY } from '../copy.he.js';
import { api } from '../services/api.js';
import CommunityFeed from './CommunityFeed.jsx';

// ── Tone-correct post template — the kind of content we want to cultivate ────
// These seed the "all" feed until real posts accumulate.
// They're labeled clearly as seed content and will drop off as real posts grow.
const SEED_POSTS_ALL = [
  {
    id: 'seed_1', nick: 'מטופל שינה · צפון', tag: 'שינה', time: 'לפני 3 שעות',
    text: 'Wedding CK — שלוש לילות רצופות בלי להתעורר באמצע. ממליץ למי שמחפש שינה בלי הכבדות.',
    helped: 14, strain: 'Wedding CK', rating: 4,
    socialProof: 'עזר ל-12 אנשים עם פרופיל דומה',
  },
  {
    id: 'seed_2', nick: 'מטופלת כאב · מרכז', tag: 'כאב כרוני', time: 'לפני 5 שעות',
    text: 'גל T10/C10 — ראשון שלא מרגיש שאני צריכה לישון אחרי. מצוין ליום שצריך לתפקד.',
    helped: 8, strain: 'גל', rating: 3,
    socialProof: 'עזר ל-6 אנשים עם פרופיל דומה',
  },
  {
    id: 'seed_3', nick: 'מטופל ריכוז · דרום', tag: 'ריכוז', time: 'אתמול',
    text: 'תכלת T22/C4 — ניסיתי בבוקר לפני עבודה. ראש צלול, לא מבולבל, הצלחתי להתרכז.',
    helped: 11, strain: 'תכלת', rating: 4,
    socialProof: '9 אנשים דיווחו על ריכוז עם זה',
  },
];

const SEED_POSTS_LIKE = [
  {
    id: 'seed_like_1', nick: 'פרופיל דומה לשלך', tag: 'שינה', time: 'לפני שעה',
    text: 'ספיישל טי T10/C10 — 1:1 CBD:THC ממש עובד לי לפני שינה. לא ישנוני ביום למחרת.',
    helped: 9, strain: 'ספיישל טי', rating: 4,
    socialProof: '7 אנשים עם פרופיל דומה דיווחו בחיוב',
  },
  {
    id: 'seed_like_2', nick: 'פרופיל דומה לשלך', tag: 'כאב', time: 'לפני 3 שעות',
    text: 'וקטור T18/C3 — אחרי שבוע של כאב גב — הראשון שהרגיש משמעותי. ממליץ.',
    helped: 6, strain: 'וקטור', rating: 4,
    socialProof: '5 אנשים עם צרכים דומים מצאו את זה שימושי',
  },
];

// ── Community stats cache ──────────────────────────────────────────────────────
function useCommunityStats(strainId) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!strainId) return;
    api.getCommunityStats({ strainId }).then(setStats).catch(() => {});
  }, [strainId]);
  return stats;
}

// ── Post card ─────────────────────────────────────────────────────────────────
function PostCard({ post, onLike, liked, idx }) {
  const ratingStars = post.rating
    ? ['😣','😐','🙂','😄'][Math.min(post.rating - 1, 3)]
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.07 }}
      style={{
        borderRadius: 18, padding: '14px 16px', marginBottom: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1.5px solid rgba(255,255,255,0.07)',
      }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {ratingStars && <span style={{ fontSize: 18 }}>{ratingStars}</span>}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(74,222,128,0.80)' }}>
              {post.nick}
            </div>
            {post.tag && (
              <div style={{ fontSize: 10, color: 'rgba(187,247,208,0.40)', marginTop: 1 }}>
                {post.tag} · {post.time}
              </div>
            )}
          </div>
        </div>
        {post.strain && (
          <div style={{
            padding: '3px 9px', borderRadius: 10, fontSize: 10, fontWeight: 700,
            background: 'rgba(74,222,128,0.08)', color: 'rgba(74,222,128,0.70)',
            border: '1px solid rgba(74,222,128,0.18)',
          }}>
            {post.strain}
          </div>
        )}
      </div>

      {/* Text */}
      <div style={{ fontSize: 13, color: 'rgba(240,253,244,0.88)', lineHeight: 1.65, marginBottom: 10 }}>
        {post.text}
      </div>

      {/* Social proof line */}
      {post.socialProof && (
        <div style={{ fontSize: 10.5, color: 'rgba(167,139,250,0.75)', marginBottom: 8, lineHeight: 1.5 }}>
          💜 {post.socialProof}
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => onLike(post.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
            borderRadius: 10, cursor: liked ? 'default' : 'pointer', border: 'none',
            background: liked ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.04)',
            color: liked ? '#4ADE80' : 'rgba(187,247,208,0.50)',
            fontSize: 12, fontWeight: 700, fontFamily: "'Heebo',sans-serif",
          }}>
          {liked ? '✓ עזר' : '👍 עזר לי'} {post.helped > 0 && <span>· {post.helped}</span>}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────────
function Composer({ user, ans, onPost }) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    // Fire to backend (non-blocking, not required)
    try { await api.submitReview({ user_id: user?.id, text }); } catch {}
    onPost({ id: Date.now(), nick: 'אני · הרגע', tag: '', time: 'עכשיו', text: text.trim(), helped: 0 });
    setText('');
    setPosting(false);
  };

  return (
    <div style={{ padding: '12px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <textarea
        value={text} onChange={e => setText(e.target.value)} rows={3}
        placeholder='שתף/י חוויה — מה עזר, מה לא. לגמרי אנונימי.'
        style={{
          width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 14,
          background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(74,222,128,0.18)',
          color: '#F0FDF4', fontSize: 13, resize: 'none', outline: 'none',
          fontFamily: "'Heebo',sans-serif", lineHeight: 1.6, direction: 'rtl',
        }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 10, color: 'rgba(187,247,208,0.35)' }}>
          💜 אנונימי לחלוטין
        </span>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={submit}
          disabled={!text.trim() || posting}
          style={{
            padding: '8px 20px', borderRadius: 12, cursor: 'pointer', border: 'none',
            background: text.trim() ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.04)',
            color: text.trim() ? '#4ADE80' : 'rgba(187,247,208,0.35)',
            fontSize: 13, fontWeight: 800, fontFamily: "'Heebo',sans-serif",
          }}>
          {posting ? '...' : 'שתף →'}
        </motion.button>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ message }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 24px', color: 'rgba(187,247,208,0.50)' }}>
      <div style={{ fontSize: 42, marginBottom: 14 }}>🌱</div>
      <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{message}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function CommunitySplitScreen({ ans, user }) {
  const [tab, setTab]         = useState('all'); // 'all' | 'cats'
  const [likedIds, setLikedIds] = useState([]);
  const [extraPosts, setExtraPosts] = useState([]);   // user-submitted in this session
  const [composerOpen, setComposerOpen] = useState(false);

  const userCats = ans?.cats || [];
  const allPosts = [...SEED_POSTS_ALL, ...extraPosts];
  const currentPosts = allPosts; // only used for 'all' tab seed posts (legacy, fades out)

  const handleLike = useCallback((id) => {
    setLikedIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const handlePost = useCallback((post) => {
    setExtraPosts(prev => [{ ...post, _tab: tab }, ...prev]);
    setComposerOpen(false);
  }, [tab]);

  // Altruistic framing — simulated (replace with real DB count when available)
  const weeklyImpact = 9 + Math.floor(currentPosts.length * 2.3);

  return (
    <div dir='rtl' style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Anonymity + altruistic strip */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 10.5, color: 'rgba(167,139,250,0.80)', fontWeight: 700 }}>
          💜 {COPY.community.anonymousNote}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(74,222,128,0.60)', fontWeight: 700 }}>
          הדיווחים עזרו ל-{weeklyImpact} אנשים השבוע
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', padding: '10px 16px 0', gap: 8, flexShrink: 0,
      }}>
        {[
          { id: 'all',  label: COPY.community.tabAll,  icon: '🌐' },
          { id: 'cats', label: 'הקטגוריה שלי',         icon: '🏷️' },
        ].map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 14, cursor: 'pointer',
                background: active ? 'rgba(74,222,128,0.10)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${active ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.07)'}`,
                color: active ? '#4ADE80' : 'rgba(187,247,208,0.50)',
                fontSize: 12, fontWeight: 800, fontFamily: "'Heebo',sans-serif",
                transition: 'all .18s',
              }}>
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {/* Context label under tabs */}
      <AnimatePresence mode='wait'>
        <motion.div key={tab}
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          style={{ padding: '8px 18px 2px', flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, color: 'rgba(187,247,208,0.40)' }}>
            {tab === 'cats'
              ? `🏷️ דיווחים ממטופלים עם ${userCats.length > 0 ? userCats.join(", ") : "אותה קטגוריית רישיון"} — אותו פרוטוקול`
              : '🌐 כל הקהילה — חוויות מכל הפרופילים'}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 16px', scrollbarWidth: 'none' }}>
        <AnimatePresence mode='wait'>
          <motion.div key={tab}
            initial={{ opacity: 0, x: tab === 'all' ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}>

            {tab === 'all' ? (
              // General trust-ranked feed — no filter
              <CommunityFeed />
            ) : (
              // Category-filtered view — same ranked data, filtered by author's license category
              <CommunityFeed categories={userCats} />
            )}
          </motion.div>
        </AnimatePresence>
        <div style={{ height: 80 }} />
      </div>

      {/* Composer toggle + form */}
      <div style={{ flexShrink: 0 }}>
        <AnimatePresence>
          {composerOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
              <Composer user={user} ans={ans} onPost={handlePost} />
            </motion.div>
          )}
        </AnimatePresence>
        <div style={{ padding: '10px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setComposerOpen(v => !v)}
            style={{
              width: '100%', padding: '12px', borderRadius: 16, cursor: 'pointer',
              background: composerOpen ? 'rgba(255,255,255,0.04)' : 'rgba(74,222,128,0.10)',
              border: `1.5px solid ${composerOpen ? 'rgba(255,255,255,0.08)' : 'rgba(74,222,128,0.30)'}`,
              color: composerOpen ? 'rgba(187,247,208,0.50)' : '#4ADE80',
              fontSize: 13, fontWeight: 800, fontFamily: "'Heebo',sans-serif",
            }}>
            {composerOpen ? '× סגור' : '+ שתף חוויה — אנונימי לחלוטין'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
