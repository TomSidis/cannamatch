import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  useJourneyContext — coordinates the full post-login psychological journey
//
//  loginStage:  'greeting' → 'entering' → 'ready'
//  celebrating: true for 4s after license unlock (Zemach burst + community flash)
//  diaryNudge:  true if ≥4h since last journal entry (Zemach grows + prompts)
// ─────────────────────────────────────────────────────────────────────────────

const JourneyCtx = createContext(null);

export function JourneyProvider({ children, screen, licenseVerified, checked }) {
  const [loginStage, setLoginStage]   = useState("greeting");
  const [celebrating, setCelebrating] = useState(false);
  const [diaryNudge, setDiaryNudge]   = useState(false);
  const celebrateTimerRef             = useRef(null);
  const prevLicenseRef                = useRef(licenseVerified);

  // ── Staged login sequence when screen becomes "app" ─────────────────────
  useEffect(() => {
    if (screen !== "app") { setLoginStage("greeting"); return; }
    const t1 = setTimeout(() => setLoginStage("entering"), 1100);
    const t2 = setTimeout(() => setLoginStage("ready"), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [screen]);

  // ── License unlock → celebration ────────────────────────────────────────
  useEffect(() => {
    if (licenseVerified && !prevLicenseRef.current) {
      setCelebrating(true);
      clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = setTimeout(() => setCelebrating(false), 4200);
    }
    prevLicenseRef.current = licenseVerified;
    return () => clearTimeout(celebrateTimerRef.current);
  }, [licenseVerified]);

  // ── 4-hour diary nudge ───────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "app") return;
    try {
      const entries = JSON.parse(localStorage.getItem("cm_checkins") || "[]");
      if (entries.length === 0) return;
      const last = entries[entries.length - 1];
      const ts = last.ts || last.date || last.createdAt;
      if (!ts) return;
      const hrsSince = (Date.now() - new Date(ts).getTime()) / 3_600_000;
      if (hrsSince >= 4) {
        const t = setTimeout(() => setDiaryNudge(true), 7000);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [screen, checked]);

  const celebrate          = useCallback(() => {
    setCelebrating(true);
    clearTimeout(celebrateTimerRef.current);
    celebrateTimerRef.current = setTimeout(() => setCelebrating(false), 4200);
  }, []);

  const dismissDiaryNudge  = useCallback(() => setDiaryNudge(false), []);
  const advanceStage       = useCallback((s) => setLoginStage(s), []);

  return (
    <JourneyCtx.Provider value={{
      loginStage, advanceStage,
      celebrating, celebrate,
      diaryNudge, dismissDiaryNudge,
    }}>
      {children}
    </JourneyCtx.Provider>
  );
}

export function useJourney() {
  const ctx = useContext(JourneyCtx);
  if (!ctx) throw new Error("useJourney must be used inside JourneyProvider");
  return ctx;
}
