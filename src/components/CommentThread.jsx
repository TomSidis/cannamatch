/**
 * CommentThread — single-level threaded comment view for a community report.
 * Loaded lazily when the user expands comments on a FeedCard.
 * Anonymous: no user_id is displayed anywhere.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../services/api.js";

const REASON_LABELS = {
  external_link: "קישורים חיצוניים אסורים בפווידר.",
  sales:         "תוכן מסחרי/טלפון אינו מותר.",
  profanity:     "התגובה כוללת שפה פוגענית.",
  empty:         "יש לכתוב תגובה לפני השליחה.",
};

// ── Shared inline styles ───────────────────────────────────────────────────────
const S = {
  wrap:   { padding: "12px 14px", borderTop: "1px solid rgba(74,222,128,0.08)", background: "rgba(0,0,0,0.12)" },
  bubble: { borderRadius: 12, padding: "9px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(74,222,128,0.08)" },
  body:   { fontSize: 12, color: "rgba(187,247,208,0.82)", lineHeight: 1.55 },
  meta:   { fontSize: 10, color: "rgba(187,247,208,0.35)", fontWeight: 700, marginBottom: 3 },
  reply:  { borderRadius: 10, padding: "7px 11px", background: "rgba(192,132,252,0.05)", border: "1px solid rgba(192,132,252,0.10)", marginTop: 6, marginRight: 16 },
  input:  {
    width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 12,
    background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(74,222,128,0.15)",
    color: "#F0FDF4", fontSize: 12, resize: "none", outline: "none",
    fontFamily: "'Heebo',sans-serif", lineHeight: 1.5, direction: "rtl",
  },
  sendBtn: (active) => ({
    padding: "7px 18px", borderRadius: 10, cursor: "pointer", border: "none",
    background: active ? "rgba(74,222,128,0.16)" : "rgba(255,255,255,0.04)",
    color: active ? "#4ADE80" : "rgba(187,247,208,0.30)",
    fontSize: 12, fontWeight: 800, fontFamily: "'Heebo',sans-serif",
  }),
  errBox: { fontSize: 11, color: "#FCA5A5", padding: "7px 11px", borderRadius: 10, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.18)", marginBottom: 8 },
};

// ── Single comment bubble (root or reply) ─────────────────────────────────────
function CommentBubble({ comment, reviewId, isReply = false, onReplyClick, replyingTo }) {
  const ts = comment.created_at
    ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(comment.created_at))
    : "";

  return (
    <div style={isReply ? S.reply : S.bubble}>
      <div style={S.meta}>
        {isReply ? "↳ " : ""}מטופל/ת אנונימי/ת · {ts}
      </div>
      <div style={S.body}>{comment.body}</div>
      {!isReply && (
        <button
          onClick={() => onReplyClick(replyingTo === comment.id ? null : comment.id)}
          style={{ marginTop: 5, background: "none", border: "none", cursor: "pointer", fontSize: 10.5, color: "rgba(187,247,208,0.38)", fontFamily: "'Heebo',sans-serif", padding: 0 }}>
          {replyingTo === comment.id ? "ביטול" : "↩ הגב"}
        </button>
      )}
    </div>
  );
}

// ── New comment form ──────────────────────────────────────────────────────────
function CommentForm({ reviewId, parentId = null, placeholder, onSuccess, onCancel }) {
  const [text, setText]       = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr]         = useState(null);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setErr(null);
    try {
      const result = await api.feed.addComment(reviewId, text.trim(), parentId);
      setText("");
      onSuccess(result);
    } catch (e) {
      const reason = e?.reason ?? e?.message;
      setErr(REASON_LABELS[reason] ?? "שגיאה בשליחה — נסו שוב.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      {err && <div style={S.errBox}>🛡️ {err}</div>}
      <textarea
        value={text} onChange={e => setText(e.target.value)} rows={2} autoFocus={!!parentId}
        placeholder={placeholder}
        style={S.input}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        {onCancel && (
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "rgba(187,247,208,0.40)", fontFamily: "'Heebo',sans-serif" }}>
            ביטול
          </button>
        )}
        <motion.button whileTap={{ scale: 0.94 }} onClick={send} disabled={!text.trim() || sending}
          style={{ ...S.sendBtn(text.trim() && !sending), marginRight: onCancel ? 0 : "auto" }}>
          {sending ? "..." : "שלח →"}
        </motion.button>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function CommentThread({ reviewId }) {
  const [comments, setComments]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [replyingTo, setReplyingTo] = useState(null);

  useEffect(() => {
    api.feed.listComments(reviewId)
      .then(data => setComments(data.comments ?? []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [reviewId]);

  const addRoot = (comment) => {
    setComments(prev => [...prev, { ...comment, replies: [] }]);
  };

  const addReply = (parentId, reply) => {
    setComments(prev => prev.map(c =>
      c.id === parentId ? { ...c, replies: [...(c.replies ?? []), reply] } : c
    ));
    setReplyingTo(null);
  };

  if (loading) {
    return <div style={S.wrap}><span style={{ fontSize: 11, color: "rgba(187,247,208,0.35)" }}>טוען תגובות...</span></div>;
  }

  return (
    <div style={S.wrap}>
      {comments.length === 0 && (
        <p style={{ fontSize: 11, color: "rgba(187,247,208,0.35)", marginBottom: 10, marginTop: 0 }}>
          עוד אין תגובות — היה/י ראשון/ה.
        </p>
      )}

      <div className="space-y-2">
        {comments.map(comment => (
          <div key={comment.id}>
            <CommentBubble
              comment={comment}
              reviewId={reviewId}
              onReplyClick={setReplyingTo}
              replyingTo={replyingTo} />

            {/* Inline replies */}
            {(comment.replies ?? []).map(reply => (
              <CommentBubble key={reply.id} comment={reply} reviewId={reviewId} isReply />
            ))}

            {/* Reply form (single-level) */}
            <AnimatePresence>
              {replyingTo === comment.id && (
                <motion.div
                  key="reply-form"
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}>
                  <CommentForm
                    reviewId={reviewId}
                    parentId={comment.id}
                    placeholder="תגובה תומכת או טיפ..."
                    onSuccess={(reply) => addReply(comment.id, reply)}
                    onCancel={() => setReplyingTo(null)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* New root comment */}
      <CommentForm
        reviewId={reviewId}
        placeholder="כתבו תגובה תומכת, טיפ, או שאלה..."
        onSuccess={addRoot} />
    </div>
  );
}
