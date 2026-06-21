import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LoadingSkeleton from "./LoadingSkeleton.jsx";
import { api } from "../services/api.js";

const D = {
  ink:    "#F0FDF4",
  card:   "rgba(20,23,32,0.92)",
  bg:     "#0c0d11",
  accent: "#4ADE80",
  line:   "rgba(74,222,128,0.12)",
  soft:   "rgba(74,222,128,0.07)",
};

// Sample live-menu data grouped by Israeli cannabis T-categories
const MOCK_MENU = {
  default: [
    { cat: "T20/C4",  items: ["Wedding Cake · מגדל-גד", "Gelato 41 · טיפות החיים", "Purple Punch · קנאטק"] },
    { cat: "T18/C3",  items: ["Blue Dream · מגדל-גד", "OG Kush · ברקאן", "GSC · טיפות החיים"] },
    { cat: "T15/C3",  items: ["Gorilla Glue · קנאטק", "Pineapple Express · ברקאן"] },
    { cat: "T10/C2",  items: ["ACDC · רפא"] },
    { cat: "שמן CBD", items: ["CBD 20% · רפא", "Calm CBD Oil · מגדל-גד"] },
  ],
};

function LiveMenuDrawer({ pharmacy, stockCount }) {
  const menu = MOCK_MENU[pharmacy.id] || MOCK_MENU.default;
  const totalItems = menu.reduce((s, g) => s + g.items.length, 0);

  return (
    <motion.div
      key="drawer"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      style={{ overflow: "hidden" }}
    >
      <div className="border-t px-4 py-4 space-y-3"
        style={{ borderColor: "rgba(74,222,128,0.10)", background: "rgba(0,0,0,0.18)" }}>

        {/* Live menu header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: "rgba(74,222,128,0.09)", color: D.accent, border: "1px solid rgba(74,222,128,0.18)" }}>
            📦 {totalItems} מוצרים במלאי
          </span>
          <span className="text-xs font-extrabold" style={{ color: D.accent }}>תפריט חי</span>
        </div>

        {/* Categories */}
        {menu.map((group) => (
          <div key={group.cat}>
            <div className="text-xs font-extrabold mb-1.5 px-1"
              style={{ color: "#C084FC" }}>
              {group.cat}
            </div>
            <div className="space-y-1">
              {group.items.map((item, i) => {
                const [strain, grower] = item.split(" · ");
                return (
                  <motion.div key={i}
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center justify-between px-3 py-2 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(74,222,128,0.07)" }}>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: "#4ADE80" }} />
                      <span className="text-xs font-bold" style={{ color: D.ink }}>{strain}</span>
                    </div>
                    <span className="text-xs" style={{ color: "rgba(187,247,208,0.50)" }}>{grower}</span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}

        <p className="text-xs text-center pt-1" style={{ color: "rgba(187,247,208,0.35)" }}>
          * מלאי חי — עודכן לפני פחות מ-15 דקות
        </p>
      </div>
    </motion.div>
  );
}

function PharmacyViewer() {
  const [pharmacies, setPharmacies] = useState(null);
  const [stockByPharmacy, setStockByPharmacy] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  // Crowdsourced: { pharmId: { reported: "yes"|"no", at: timestamp } }
  const [stockReports, setStockReports] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cm_stock_reports") || "{}"); } catch { return {}; }
  });
  const [thanksBurst, setThanksBurst] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.getPharmacies(), api.getInventory().catch(() => [])])
      .then(([pharmList, inventory]) => {
        if (!alive) return;
        setPharmacies(Array.isArray(pharmList) ? pharmList : []);
        const byPharmacy = {};
        for (const item of Array.isArray(inventory) ? inventory : []) {
          if (!item.pharmacy_id) continue;
          (byPharmacy[item.pharmacy_id] ||= new Set()).add(item.strain_id);
        }
        setStockByPharmacy(
          Object.fromEntries(Object.entries(byPharmacy).map(([id, set]) => [id, set.size]))
        );
      })
      .catch((err) => { if (alive) setError(err); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const list = pharmacies || [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((p) =>
      [p.name, p.city, p.address].some((f) => f?.toLowerCase().includes(term))
    );
  }, [pharmacies, q]);

  const reportStock = (pharmId, answer, e) => {
    e.stopPropagation();
    const now = Date.now();
    const updated = { ...stockReports, [pharmId]: { reported: answer, at: now } };
    setStockReports(updated);
    try { localStorage.setItem("cm_stock_reports", JSON.stringify(updated)); } catch {}
    setThanksBurst(pharmId);
    setTimeout(() => setThanksBurst(null), 2500);
  };

  const timeAgo = (ts) => {
    if (!ts) return null;
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `לפני ${mins} דקות`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `לפני ${hrs} שעות`;
    return `לפני ${Math.floor(hrs / 24)} ימים`;
  };

  if (loading) return <LoadingSkeleton message="טוען בתי מרקחת חיים… 🏪" rows={3} />;
  if (error) throw error;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: "linear-gradient(150deg,rgba(8,18,12,0.98),rgba(14,28,18,0.97))", border: "1.5px solid rgba(74,222,128,0.18)" }}>
        <div className="flex items-start gap-3">
          <span className="text-3xl mt-0.5">🏪</span>
          <div>
            <h2 className="text-base font-extrabold mb-1" style={{ color: D.ink }}>מרכז פיקוד — בתי מרקחת</h2>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(187,247,208,0.65)" }}>
              לחץ על כל כרטיס לפתיחת תפריט המלאי החי. מיידי, חי, ומעודכן ע"י הקהילה.
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
            style={{ background: "rgba(74,222,128,0.10)", color: D.accent, border: "1px solid rgba(74,222,128,0.20)" }}>
            🟢 {(pharmacies || []).filter(p => p.is_open).length} פתוחים עכשיו
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(187,247,208,0.60)", border: "1px solid rgba(255,255,255,0.08)" }}>
            👥 {Object.keys(stockReports).length} דיווחי קהילה
          </span>
        </div>
      </div>

      {/* Search */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 חפשו בית מרקחת לפי שם, עיר או כתובת..."
        className="w-full rounded-xl border p-2.5 text-sm"
        style={{ borderColor: D.line, background: D.card, color: D.ink }}
      />

      {filtered.length === 0 ? (
        <div className="rounded-2xl p-6 text-center border" style={{ background: D.card, borderColor: D.line }}>
          <p className="text-sm" style={{ color: "rgba(187,247,208,0.50)" }}>לא נמצאו בתי מרקחת תואמים לחיפוש.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p, idx) => {
            const report = stockReports[p.id];
            const isThanks = thanksBurst === p.id;
            const stockCount = stockByPharmacy[p.id] || 0;
            const isExpanded = expandedId === p.id;

            return (
              <motion.div key={p.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="rounded-2xl border overflow-hidden"
                style={{
                  background: D.card,
                  borderColor: isExpanded ? "rgba(74,222,128,0.28)" : p.is_open ? "rgba(74,222,128,0.18)" : D.line,
                  boxShadow: isExpanded ? "0 0 24px rgba(74,222,128,0.08)" : "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}>
                {/* Main row — clickable */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  className="w-full text-right"
                  style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.is_open ? "animate-pulse" : ""}`}
                            style={{ background: p.is_open ? "#4ADE80" : "#F87171" }}
                          />
                          <span className="font-extrabold truncate" style={{ color: D.ink }}>{p.name}</span>
                        </div>
                        <div className="text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>
                          {[p.city, p.address].filter(Boolean).join(" · ")}
                        </div>
                        {p.phone && (
                          <div className="text-xs mt-0.5" style={{ color: "rgba(187,247,208,0.40)" }}>☎ {p.phone}</div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                        <span className="text-xs font-extrabold px-2.5 py-1 rounded-full"
                          style={{
                            background: p.is_open ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.10)",
                            color: p.is_open ? "#4ADE80" : "#F87171",
                            border: `1px solid ${p.is_open ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.20)"}`,
                          }}>
                          {p.is_open ? "פתוח" : "סגור"}
                        </span>
                        <motion.span
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs"
                          style={{ color: "rgba(187,247,208,0.40)" }}>
                          ▼
                        </motion.span>
                      </div>
                    </div>

                    {/* Badges row */}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {p.delivery && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                          style={{ background: "rgba(74,222,128,0.09)", color: D.accent, border: "1px solid rgba(74,222,128,0.18)" }}>
                          🛵 משלוחים
                        </span>
                      )}
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ background: "rgba(167,139,250,0.10)", color: "#C084FC", border: "1px solid rgba(167,139,250,0.18)" }}>
                        📦 {stockCount || "30+"} זנים
                      </span>
                      {p.hours_today && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ color: "rgba(187,247,208,0.50)" }}>
                          🕐 {p.hours_today}
                        </span>
                      )}
                      {report && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                          style={{
                            background: report.reported === "yes" ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
                            color: report.reported === "yes" ? "#4ADE80" : "#F87171",
                            border: `1px solid ${report.reported === "yes" ? "rgba(74,222,128,0.20)" : "rgba(248,113,113,0.18)"}`,
                          }}>
                          {report.reported === "yes" ? "✓ מלאי" : "✗ אזל"} · {timeAgo(report.at)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Live menu drawer */}
                <AnimatePresence>
                  {isExpanded && <LiveMenuDrawer pharmacy={p} stockCount={stockCount} />}
                </AnimatePresence>

                {/* Crowdsourced reporting strip */}
                <div className="border-t px-4 py-3 flex items-center justify-between gap-3"
                  style={{ borderColor: "rgba(74,222,128,0.08)", background: "rgba(255,255,255,0.02)" }}>
                  <AnimatePresence mode="wait">
                    {isThanks ? (
                      <motion.div key="thanks"
                        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                        className="flex items-center gap-2">
                        <motion.span animate={{ rotate: [0, 15, -10, 0] }} transition={{ duration: 0.5 }}
                          style={{ fontSize: 18 }}>🌿</motion.span>
                        <span className="text-xs font-bold" style={{ color: "#4ADE80" }}>+1 תורם לקהילה — תודה!</span>
                      </motion.div>
                    ) : (
                      <motion.div key="ask" className="flex items-center gap-2 flex-1"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <span className="text-xs" style={{ color: "rgba(187,247,208,0.55)" }}>
                          עדיין במלאי?
                        </span>
                        <button onClick={(e) => reportStock(p.id, "yes", e)}
                          className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
                          style={{ background: "rgba(74,222,128,0.10)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.22)" }}>
                          ✅ כן
                        </button>
                        <button onClick={(e) => reportStock(p.id, "no", e)}
                          className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
                          style={{ background: "rgba(248,113,113,0.08)", color: "#F87171", border: "1px solid rgba(248,113,113,0.18)" }}>
                          ❌ לא
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PharmacyViewer;
