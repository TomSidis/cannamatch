import { useState, useEffect } from "react";
import { api } from "../services/api.js";

// מעשיר את הזנים המקומיים (scored) בציוני מלאי חי מה-DB.
// אם הקריאה נכשלת — זו שגיאה אמיתית שיש להציג, לא להתעלם ולהמשיך בשקט.
export function useEnrichedStrains(localScored, { type } = {}) {
  const [enriched, setEnriched] = useState(localScored);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api.getStrains({ type: type === "all" ? undefined : type })
      .then((rows) => {
        if (!alive) return;
        const byName = {};
        (rows || []).forEach((r) => { if (r.name) byName[r.name] = r; });
        const merged = localScored.map((s) => {
          const hit = byName[s.name];
          return hit ? { ...s, db_id: hit.id, db_backed: true } : s;
        });
        setEnriched(merged);
      })
      .catch((err) => { if (alive) setError(err); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [localScored, type]);

  if (error) throw error; // caught by the nearest <ErrorBoundary>

  return { strains: enriched, loading };
}
