// ─────────────────────────────────────────────────────────────────────────────
//  useReportTiming — context-aware report nudge.
//
//  Rule: Every nudge passes this test — "would a real person be glad to get it?"
//
//  Logic:
//    - Sleep strain (high myrcene/linalool) used → nudge next morning (7-11 AM)
//    - Any strain used → nudge in the evening window (16-21)
//    - Never nudge more than once per calendar day
//    - User can dismiss and it won't show until tomorrow
//
//  Returns:
//    shouldNudge    {boolean}  — true when the timing is right
//    nudgeMsg       {string}   — warm message in friend voice
//    nudgeStrain    {object|null} — the strain the nudge is about
//    dismissNudge   {()=>void} — call to silence for today
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'cm_report_nudge';

function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getHour() {
  return new Date().getHours();
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function save(obj) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch {}
}

export function useReportTiming(lastUsedStrain = null) {
  const [dismissed, setDismissed] = useState(() => {
    const s = load();
    return s.date === todayStr() && s.dismissed;
  });

  // Rehydrate on day boundary (if tab stays open past midnight)
  useEffect(() => {
    const check = () => {
      const s = load();
      if (s.date !== todayStr()) setDismissed(false);
    };
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);

  const hour = getHour();

  const isSleepStrain = lastUsedStrain
    ? ((lastUsedStrain.terps?.myrcene  || 0) > 0.55 ||
       (lastUsedStrain.terps?.linalool || 0) > 0.55)
    : false;

  // Morning window: 7–11 AM (after sleep strain use)
  const isMorningWindow  = hour >= 7  && hour <= 11;
  // Evening window: 16–21 (after daytime / general use)
  const isEveningWindow  = hour >= 16 && hour <= 21;

  const shouldNudge = !dismissed && (
    (isSleepStrain  && isMorningWindow) ||
    (!isSleepStrain && isEveningWindow)
  );

  const nudgeMsg = isSleepStrain
    ? 'איך ישנת? 30 שניות לדווח — מדייק את ההמלצות שלך 🌙'
    : 'ניסית משהו לאחרונה? דווח — תקבל מפה מדויקת יותר 🌿';

  const dismissNudge = () => {
    setDismissed(true);
    save({ date: todayStr(), dismissed: true });
  };

  return { shouldNudge, nudgeMsg, nudgeStrain: shouldNudge ? lastUsedStrain : null, dismissNudge };
}
