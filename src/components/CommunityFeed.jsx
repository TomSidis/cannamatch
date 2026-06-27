/**
 * CommunityFeed — trust-ranked community report feed (C4).
 *
 * Trust indicator uses text + icon (never color alone) — accessible to color-blind users.
 * Thresholds imported from reportTrust.ts — single source of truth.
 * "עזר לי" toggle: optimistic update with rollback on failure.
 * No external social links; comments are internal only.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TRUST_THRESHOLDS } from "../engine/reportTrust.ts";
import { api } from "../services/api.js";
import CommentThread from "./CommentThread.jsx";

// ── Design tokens (matches CannaMatch.jsx C object) ───────────────────────────
const C = {
  ink:    "#F0FDF4",
  card:   "rgba(20,23,32,0.90)",
  line:   "rgba(74,222,128,0.12)",
  accent: "#4ADE80",
  soft:   "rgba(74,222,128,0.08)",
  bg:     "#0c0d11",
};

// ── Trust indicator ───────────────────────────────────────────────────────────
// Icons are shape-distinct (✔ ◐ ○) so they work without color discrimination.
function TrustBadge({ weight }) {
  if (weight >= TRUST_THRESHOLDS.HIGH)
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(74,222,128,0.80)" }}>
        ✔ דיווח מאומת
      </span>
    );
  if (weight >= TRUST_THRESHOLDS.MEDIUM)
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(251,191,36,0.75)" }}>
        ◐ דיווח חלקי
      </span>
    );
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(187,247,208,0.40)" }}>
      ○ דיווח בסיסי
    </span>
  );
}

// ── Single feed card ──────────────────────────────────────────────────────────
function FeedCard({ item, idx }) {
  const [helpedState, setHelpedState] = useState({
    helped: item.user_helped ?? false,
    count:  item.helped_me_count ?? 0,
  });
  const [helping, setHelping]           = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const toggleHelp = useCallback(async () => {
    if (helping) return;
    const prev = helpedState;
    // Optimistic update
    setHelpedState({ helped: !prev.helped, count: prev.count + (prev.helped ? -1 : 1) });
    setHelping(true);
    try {
      const result = await api.feed.help(item.id);
      setHelpedState({ helped: result.helped, count: result.count });
    } catch {
      setHelpedState(prev); // rollback
    } finally {
      setHelping(false);
    }
  }, [helping, helpedState, item.id]);

  const efficacyEmoji = ["😣","😐","🙂","😄","🌟"][Math.max(0, (item.efficacy ?? 3) - 1)];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      style={{
        borderRadius: 18, overflow: "hidden",
        background: C.card, border: `1px solid ${C.line}`,
        marginBottom: 10,
      }}>

      {/* Card body */}
      <div style={{ padding: "14px 16px" }}>

        {/* Header: strain + trust badge */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>
              {item.strain_name ?? "—"}
            </div>
            {item.genetics && (
              <div style={{ fontSize: 10, color: "rgba(187,247,208,0.45)", marginTop: 2 }}>
                {item.genetics}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ fontSize: 20 }}>{efficacyEmoji}</span>
            <TrustBadge weight={item.trust_weight ?? 0} />
          </div>
        </div>

        {/* Side effects chips */}
        {(item.side_effects ?? []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {item.side_effects.slice(0, 4).map(se => (
              <span key={se} style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 8,
                background: "rgba(248,113,113,0.07)", color: "rgba(248,113,113,0.70)",
                border: "1px solid rgba(248,113,113,0.14)",
              }}>
                {se}
              </span>
            ))}
          </div>
        )}

        {/* Action bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>

          {/* Helped me */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={toggleHelp}
            disabled={helping}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${helpedState.helped ? "rgba(74,222,128,0.30)" : "rgba(74,222,128,0.14)"}`,
              background: helpedState.helped ? C.soft : "transparent",
              color: helpedState.helped ? C.accent : "rgba(187,247,208,0.50)",
              fontSize: 12, fontWeight: 700, fontFamily: "'Heebo',sans-serif",
            }}>
            <span>{helpedState.helped ? "💚" : "🤍"}</span>
            <span>עזר לי</span>
            {helpedState.count > 0 && (
              <span style={{ opacity: 0.75 }}>· {helpedState.count}</span>
            )}
          </motion.button>

          {/* Comments toggle */}
          <button
            onClick={() => setCommentsOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${commentsOpen ? "rgba(192,132,252,0.25)" : "rgba(255,255,255,0.08)"}`,
              background: commentsOpen ? "rgba(192,132,252,0.06)" : "transparent",
              color: commentsOpen ? "#C084FC" : "rgba(187,247,208,0.50)",
              fontSize: 12, fontWeight: 700, fontFamily: "'Heebo',sans-serif",
            }}>
            💬 תגובות
          </button>

        </div>
      </div>

      {/* Comment thread (lazy) */}
      <AnimatePresence>
        {commentsOpen && (
          <motion.div
            key="comments"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}>
            <CommentThread reviewId={item.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function CommunityFeed({ categories = [] }) {
  const [feed, setFeed]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [offset, setOffset]   = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 20;
  const catKey = categories.join(","); // stable string for effect dep

  const loadMore = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const cats = catKey ? catKey.split(",") : [];
      const data = await api.feed.list({ limit: LIMIT, offset: nextOffset, categories: cats });
      const items = data.feed ?? [];
      setFeed(prev => nextOffset === 0 ? items : [...prev, ...items]);
      setHasMore(items.length === LIMIT);
      setOffset(nextOffset + items.length);
    } catch {
      setError("שגיאה בטעינת הפיד — נסו שוב.");
    } finally {
      setLoading(false);
    }
  }, [catKey]);

  useEffect(() => { loadMore(0); }, [loadMore]);

  if (loading && feed.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "44px 16px", color: "rgba(187,247,208,0.45)" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>🌿</div>
        <div style={{ fontSize: 12 }}>טוען דיווחי קהילה...</div>
      </div>
    );
  }

  if (error && feed.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 16px" }}>
        <div style={{ fontSize: 12, color: "#FCA5A5", marginBottom: 12 }}>{error}</div>
        <button onClick={() => loadMore(0)} style={{
          padding: "8px 20px", borderRadius: 12, border: "none", cursor: "pointer",
          background: "rgba(74,222,128,0.14)", color: C.accent,
          fontSize: 12, fontWeight: 800, fontFamily: "'Heebo',sans-serif",
        }}>
          נסה שוב
        </button>
      </div>
    );
  }

  if (!loading && feed.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "44px 16px", color: "rgba(187,247,208,0.45)" }}>
        <div style={{ fontSize: 38, marginBottom: 12 }}>🌱</div>
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          עוד אין דיווחים בפיד.{"\n"}שתפו חוויה מהיומן שלכם כדי להתחיל.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "4px 0" }}>
      {feed.map((item, idx) => (
        <FeedCard key={item.id} item={item} idx={idx} />
      ))}

      {hasMore && !loading && (
        <button
          onClick={() => loadMore(offset)}
          style={{
            width: "100%", padding: "11px", borderRadius: 14, cursor: "pointer",
            background: "transparent", border: `1px solid ${C.line}`,
            color: "rgba(187,247,208,0.50)", fontSize: 12, fontWeight: 700,
            fontFamily: "'Heebo',sans-serif", marginTop: 4,
          }}>
          טען עוד דיווחים ↓
        </button>
      )}

      {loading && feed.length > 0 && (
        <div style={{ textAlign: "center", padding: "16px", fontSize: 11, color: "rgba(187,247,208,0.35)" }}>
          טוען...
        </div>
      )}
    </div>
  );
}
