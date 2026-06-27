/**
 * TermsGate — full-screen terms acceptance gate (C6).
 *
 * Forced-read pattern:
 *   1. Checkbox is DISABLED until the user has scrolled to the bottom of the text.
 *   2. "Enter" button is DISABLED until the checkbox is checked.
 *   3. On confirm: POST /api/terms/accept (user_id + version from server — never client).
 *
 * text and version are received as props from GET /api/terms/status — the client
 * never holds an independent copy. If text is null (network error on status fetch),
 * a reload-prompt is shown instead.
 */

import { useState, useRef, useCallback } from "react";
import { api } from "../services/api.js";

const C = {
  ink:    "#F0FDF4",
  card:   "rgba(20,23,32,0.95)",
  line:   "rgba(74,222,128,0.12)",
  accent: "#4ADE80",
  soft:   "rgba(74,222,128,0.08)",
  lo:     "rgba(187,247,208,0.45)",
};

export default function TermsGate({ text, version, onAccept }) {
  const [scrolled,   setScrolled]   = useState(false);
  const [checked,    setChecked]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);
  const scrollRef = useRef(null);

  // Enable checkbox once user has scrolled to within 8px of the bottom.
  // The threshold allows for sub-pixel rendering differences across browsers.
  const handleScroll = useCallback(() => {
    if (scrolled) return; // already unlocked — no need to recompute
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      setScrolled(true);
    }
  }, [scrolled]);

  const handleSubmit = useCallback(async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.terms.accept();
      onAccept();
    } catch {
      setError("שגיאה בשמירת האישור — נסה שוב.");
      setSubmitting(false);
    }
  }, [checked, submitting, onAccept]);

  // Network error: text is null if GET /terms/status failed (set by CannaMatch.jsx).
  // Gate cannot be bypassed — user must reload and re-fetch.
  if (!text) {
    return (
      <div dir="rtl" style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "#0c0d11", fontFamily: "'Heebo',sans-serif", padding: 24,
      }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
        <p style={{ fontSize: 14, color: "rgba(187,247,208,0.70)", textAlign: "center", marginBottom: 20 }}>
          שגיאה בטעינת תנאי השימוש.
          <br />יש לרענן את הדף כדי להמשיך.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "10px 28px", borderRadius: 12, border: "none",
            background: "rgba(74,222,128,0.14)", color: C.accent,
            fontSize: 13, fontWeight: 800, fontFamily: "'Heebo',sans-serif", cursor: "pointer",
          }}>
          רענן ונסה שוב
        </button>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", flexDirection: "column",
        background: "#0c0d11", fontFamily: "'Heebo',sans-serif",
      }}>

      {/* Header */}
      <div style={{
        padding: "20px 20px 14px",
        borderBottom: `1px solid ${C.line}`,
        flexShrink: 0,
        background: "rgba(12,13,17,0.98)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>
          🌿 CannaMatch
        </div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: C.ink, lineHeight: 1.2 }}>
          תנאי שימוש
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 11, color: C.lo }}>
          גרסה {version} · יש לגלול עד הסוף לפני שניתן לאשר
        </p>
      </div>

      {/* Scrollable terms text */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "18px 20px 24px",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(74,222,128,0.18) transparent",
        }}>
        <pre style={{
          whiteSpace: "pre-wrap",
          fontFamily: "'Heebo',sans-serif",
          fontSize: 13,
          lineHeight: 1.8,
          color: "rgba(187,247,208,0.80)",
          margin: 0,
        }}>
          {text}
        </pre>
      </div>

      {/* Scroll indicator — only shown before scrolled */}
      {!scrolled && (
        <div style={{
          textAlign: "center", padding: "5px 0 3px",
          fontSize: 10, color: C.lo, flexShrink: 0,
          borderTop: `1px solid ${C.line}`,
        }}>
          ↓ גלול עד הסוף כדי להפעיל את תיבת הסימון
        </div>
      )}

      {/* Footer: checkbox + enter button */}
      <div style={{
        padding: "14px 20px 32px",
        borderTop: `1px solid ${C.line}`,
        flexShrink: 0,
        background: "rgba(12,13,17,0.99)",
      }}>

        {/* Checkbox — disabled until scrolled */}
        <label style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 16,
          cursor: scrolled ? "pointer" : "not-allowed",
          opacity: scrolled ? 1 : 0.38,
          direction: "rtl",
        }}>
          <input
            type="checkbox"
            checked={checked}
            disabled={!scrolled}
            onChange={e => setChecked(e.target.checked)}
            style={{
              marginTop: 2,
              accentColor: C.accent,
              width: 17, height: 17,
              flexShrink: 0,
              cursor: scrolled ? "pointer" : "not-allowed",
            }}
          />
          <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
            קראתי את תנאי השימוש במלואם ואני מסכים/ה לתנאים אלה
          </span>
        </label>

        {/* Error */}
        {error && (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#FCA5A5" }}>{error}</p>
        )}

        {/* Enter button — disabled until checkbox checked */}
        <button
          onClick={handleSubmit}
          disabled={!checked || submitting}
          style={{
            width: "100%",
            padding: "13px",
            borderRadius: 16,
            border: "none",
            cursor: checked && !submitting ? "pointer" : "not-allowed",
            background: checked && !submitting
              ? C.accent
              : "rgba(74,222,128,0.10)",
            color: checked && !submitting
              ? "#050d07"
              : "rgba(187,247,208,0.35)",
            fontSize: 15,
            fontWeight: 900,
            fontFamily: "'Heebo',sans-serif",
            transition: "background 0.18s, color 0.18s",
          }}>
          {submitting ? "שומר אישור..." : "אני מאשר/ת וממשיכ/ה לאפליקציה →"}
        </button>
      </div>
    </div>
  );
}
