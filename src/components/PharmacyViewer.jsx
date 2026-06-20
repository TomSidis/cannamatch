import { useState, useEffect, useMemo } from "react";
import LoadingSkeleton from "./LoadingSkeleton.jsx";
import { api } from "../services/api.js";

function PharmacyViewer() {
  const [pharmacies, setPharmacies] = useState(null);
  const [stockByPharmacy, setStockByPharmacy] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");

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

  if (loading) return <LoadingSkeleton message="טוען בתי מרקחת חיים… 🏪" rows={3} />;
  if (error) throw error; // נתפס ע"י ה-ErrorBoundary הקרוב

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-5 text-white slide-up" style={{ background: "linear-gradient(150deg,#16302B,#2E6B53)" }}>
        <h2 className="text-xl font-extrabold mb-1">🏪 בתי מרקחת מורשות חיות</h2>
        <p className="text-xs" style={{ color: "#A8C3B2" }}>
          סטטוס פתוח/סגור בזמן אמת לפי שעון ישראל, ומה יש במלאי כרגע מתוך מאגר 357 הזנים שלנו.
        </p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 חפשו בית מרקחת לפי שם, עיר או כתובת..."
        className="w-full rounded-xl border p-2.5 text-sm"
        style={{ borderColor: "#DCE5DC", background: "#FFFFFF", color: "#16302B" }}
      />

      {filtered.length === 0 ? (
        <div className="rounded-3xl p-6 text-center" style={{ background: "#fff", border: "1px solid #DCE5DC" }}>
          <p className="text-sm" style={{ color: "#6B7280" }}>לא נמצאו בתי מרקחת תואמים לחיפוש.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-3xl p-4 card-hover slide-up"
              style={{ background: "#fff", border: "1px solid #DCE5DC" }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.is_open ? "animate-pulse" : ""}`}
                      style={{ background: p.is_open ? "#2E6B53" : "#B5543B" }}
                    />
                    <span className="font-extrabold truncate" style={{ color: "#16302B" }}>{p.name}</span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: "#6B7280" }}>
                    {[p.city, p.address].filter(Boolean).join(" · ")}
                  </div>
                  {p.phone && (
                    <div className="text-xs mt-0.5" style={{ color: "#6B7280" }}>☎ {p.phone}</div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-xs font-extrabold px-2.5 py-1 rounded-full"
                    style={{
                      background: p.is_open ? "#E7F0E9" : "#F6E3E0",
                      color: p.is_open ? "#2E6B53" : "#B5543B",
                    }}>
                    {p.is_open ? "פתוח עכשיו" : "סגור"}
                  </span>
                  {p.hours_today && (
                    <div className="text-xs mt-1" style={{ color: "#6B7280" }}>{p.hours_today}</div>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.delivery && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ background: "#E7F0E9", color: "#2E6B53" }}>
                    🛵 משלוחים
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "#EDE7F6", color: "#5E4B8B" }}>
                  📦 {stockByPharmacy[p.id] || 0} זנים במלאי כרגע
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PharmacyViewer;
