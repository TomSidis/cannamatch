import { useState, useEffect, useRef } from "react";
import StrainAvatar from "./StrainAvatar.jsx";

// counter שעולה מ-0 לציון — אפקט "ספרינג"
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const raf = useRef();
  useEffect(() => {
    if (target == null) return;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);          // ease-out cubic
      setVal(Math.round(eased * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

const LINEAGE_THEME = (l = "") => {
  const s = l.toLowerCase();
  if (/kush|purple|afghan/.test(s)) return { border:"#8A7BC0", glow:"rgba(138,123,192,.5)" };
  if (/diesel|sour|chem/.test(s))   return { border:"#4BD06A", glow:"rgba(75,208,106,.5)" };
  if (/cookie|cake|gelato/.test(s)) return { border:"#E0A04B", glow:"rgba(224,160,75,.5)" };
  return { border:"#5BA177", glow:"rgba(91,161,119,.45)" };
};

function ResultCard({ p, i }) {
  const score = p.match ?? 0;
  const display = useCountUp(score, 900 + i * 120);
  const locked = score === 0;
  const godTier = score >= 85;
  const theme = LINEAGE_THEME(p.lineage);

  return (
    <div className="relative rounded-3xl p-4 slide-up overflow-hidden"
      style={{
        animationDelay: `${i * 90}ms`,
        background: "#fff",
        border: `2px solid ${locked ? "#C0392B" : godTier ? theme.border : "#DCE5DC"}`,
        boxShadow: godTier ? `0 0 20px ${theme.glow}` : "none",
        animation: locked ? "shake 0.5s ease-in-out 2" : undefined,
      }}>
      {/* מגן נעילה ל-Kryptonite */}
      {locked && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center"
          style={{ background:"rgba(122,31,31,.82)", backdropFilter:"blur(3px)" }}>
          <span className="text-3xl mb-1">🛑</span>
          <span className="text-white font-extrabold text-sm">נחסם לבטיחותך</span>
          <span className="text-xs mt-0.5" style={{ color:"#FFD0CA" }}>טריגר זוהה — לא להיום</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <StrainAvatar lineage={p.lineage} matchScore={score} size={56} />
        <div className="flex-1 min-w-0">
          <div className="font-extrabold flex items-center gap-2" style={{ color:"#16302B" }}>
            {p.commercial || p.strain || p.name}
            {godTier && <span className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ background:"#EDE7F6", color:"#5E4B8B" }}>⭐ התאמה מצוינת</span>}
            {p.ai_inferred && <span className="text-xs px-1.5 py-0.5 rounded" title="גנטיקה משוערת ב-AI"
              style={{ background:"#FBF3E3", color:"#9C6F12" }}>🔮 משוער</span>}
          </div>
          <div className="text-xs truncate" style={{ color:"#9AA79C" }}>{p.genetics || p.lineage}</div>
        </div>
        {/* counter מונפש */}
        <div className="text-center" style={{ minWidth: 52 }}>
          <div className="text-2xl font-extrabold"
            style={{ color: locked ? "#C0392B" : godTier ? theme.border : "#2E6B53" }}>
            {display}%
          </div>
          <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background:"#EEF3EE" }}>
            <div style={{ width:`${display}%`, height:"100%",
              background: locked ? "#C0392B" : theme.border, transition:"width .1s" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * RankedResults — תצוגת התוצאות המדורגות
 * products = [{ commercial, genetics, lineage, match, ai_inferred }]
 * companionMessage = הודעת החבר מ-verifyClinicalSafety / השרת
 */
function RankedResults({ products = [], companionMessage, userName = "אלוף" }) {
  const sorted = [...products].sort((a, b) => (b.match ?? -1) - (a.match ?? -1));
  const top = sorted.find((p) => (p.match ?? 0) >= 85);
  const locked = sorted.filter((p) => p.match === 0);

  const msg = companionMessage || (
    top
      ? `${userName}, תקשיב לחבר: ${top.commercial || top.strain} עם ${top.match}% התאמה — ` +
        `הגנטיקה המדויקת בשבילך. ${locked.length ? `ויש ${locked.length} שחסמתי כי הם טריגר — אל תתקרב.` : "לך על זה. 💚"}`
      : "פענחתי את התפריט. הנה מה שמצאתי, מדורג לפי מה שעובד עליך. 🌿"
  );

  return (
    <div className="space-y-3">
      {/* status bar של החבר */}
      <div className="rounded-3xl p-4 glow-high slide-up"
        style={{ background:"linear-gradient(150deg,#16302B,#2E6B53)", border:"1px solid rgba(91,161,119,.4)" }}>
        <div className="flex items-start gap-2">
          <span className="text-2xl float-anim">🤖</span>
          <div>
            <div className="text-xs font-bold mb-0.5" style={{ color:"#A8C3B2" }}>🌿 הקומפניון שלך</div>
            <p className="text-sm leading-relaxed text-white">{msg}</p>
          </div>
        </div>
      </div>

      {sorted.map((p, i) => <ResultCard key={i} p={p} i={i} />)}

      {sorted.length === 0 && (
        <div className="rounded-2xl p-6 text-center" style={{ background:"#fff", border:"1px dashed #DCE5DC" }}>
          <div className="text-3xl mb-2">🤷</div>
          <p className="text-sm font-bold" style={{ color:"#16302B" }}>לא זיהיתי מוצרים</p>
        </div>
      )}
    </div>
  );
}

export default RankedResults;
