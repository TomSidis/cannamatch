/**
 * ImpactSummary — shows the user their cumulative "helped me" impact (C5).
 *
 * Design rules (hard — do not relax):
 *   • No streak, no badge, no level, no flame, no animation tied to count growth.
 *   • No guilt on empty state — "עוד אין" not "כדאי לפרסם יותר".
 *   • No CTA on empty state — no button, no link, no prompt.
 *   • Direction-neutral: the component never knows or shows if reports were positive/negative.
 *   • Count only — never shows who marked helped (anonymity from API is structural).
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "../services/api.js";

const C = {
  ink:    "#F0FDF4",
  card:   "rgba(20,23,32,0.90)",
  line:   "rgba(74,222,128,0.12)",
  accent: "#4ADE80",
  soft:   "rgba(74,222,128,0.08)",
  lo:     "rgba(187,247,208,0.45)",
};

export default function ImpactSummary() {
  const [data,    setData]    = useState(null);   // { total, reports }
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.impact.get()
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  if (loading) return null; // silent until ready — no flash
  if (error)   return null; // silent on error — this is supplementary info

  const total   = data?.total   ?? 0;
  const reports = data?.reports ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      dir="rtl"
      style={{
        borderRadius: 16,
        border: `1px solid ${C.line}`,
        background: C.card,
        padding: "16px 18px",
        fontFamily: "'Heebo', sans-serif",
      }}>

      {/* Section label */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.lo, marginBottom: 12, letterSpacing: 0.4 }}>
        ההשפעה של הדיווחים שלך
      </div>

      {/* Empty state — calm, no guilt, no CTA */}
      {total === 0 ? (
        <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>🌱</div>
          <p style={{ margin: 0, fontSize: 13, color: C.lo, lineHeight: 1.6 }}>
            עוד אין דיווחים שעזרו לאחרים
          </p>
        </div>
      ) : (
        <>
          {/* Aggregate line */}
          <div style={{
            fontSize: 15, fontWeight: 800, color: C.ink,
            marginBottom: reports.length > 0 ? 14 : 0,
            lineHeight: 1.4,
          }}>
            הדיווחים שלך עזרו ל‑
            <span style={{ color: C.accent }}>{total}</span>
            {" "}מטופלים
          </div>

          {/* Per-report breakdown */}
          {reports.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {reports.map(r => (
                r.helped_count > 0 && (
                  <div key={r.review_id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", borderRadius: 10,
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${C.line}`,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(187,247,208,0.55)" }}>
                      עזר ל‑{r.helped_count}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
                      {r.strain_name ?? "—"}
                    </span>
                  </div>
                )
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
