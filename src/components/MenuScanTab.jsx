import { useState, useRef } from "react";
import { api } from "../services/api.js";
import { STRAINS } from "../data/strainsConfig.js";
import LoadingSkeleton from "./LoadingSkeleton.jsx";

// ── Design tokens (mirrors CannaMatch.jsx) ──────────────────
const C = {
  ink: "#16302B", bg: "#F3F6F2", card: "#FFFFFF",
  line: "#DCE5DC", accent: "#2E6B53", soft: "#E7F0E9",
};

// ── MatchRing — inline to avoid cross-import dependency ─────
function MatchRing({ pct }) {
  const r = 22, circ = 2 * Math.PI * r;
  const tier =
    pct >= 85 ? { color: "#2E6B53", label: "מצוין" } :
    pct >= 72 ? { color: "#5E7C4F", label: "טוב" } :
    pct >= 60 ? { color: "#9C6F12", label: "חלקי" } :
                { color: "#9AA79C", label: "נמוך" };
  return (
    <div className="relative flex-shrink-0" style={{ width: 52, height: 52 }}>
      <svg width={52} height={52}>
        <circle cx={26} cy={26} r={r} fill="none" stroke="#DCE5DC" strokeWidth={4} />
        <circle cx={26} cy={26} r={r} fill="none" stroke={tier.color} strokeWidth={4}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
          strokeLinecap="round" transform="rotate(-90 26 26)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold text-sm leading-none" style={{ color: tier.color }}>{pct}</span>
        <span className="text-xs leading-none" style={{ color: tier.color, fontSize: 8 }}>{tier.label}</span>
      </div>
    </div>
  );
}

// ── Sample menu for the "try example" button ─────────────────
const SAMPLE_MENU = `תפריט — בית מרקחת פארמרי, אור עקיבא

תפרחות:
ויסטה T22/C4 — 350₪
לגאטו T22/C4 — 265₪
פינק שרב T22/C4 — 170₪
גרין קלובר T22/C4 — 285₪
תכלת T22/C4 — 250₪
מד דאג T22/C4 — 249₪
גסטרופופ T22/C4 — 299₪
ג'ורג'יה פי T22/C4 — 399₪
Chem D Mini T22/C4 — 120₪
מ.ר.מ.ל T22/C4 — 270₪
טוטאל פי מיני T10/C10 — 210₪`;

// ── Commercial name → known strain mapping ───────────────────
const MENU_CODE_MAP = {
  "P&Z":    { strainId: "s1",  note: "פרפל זקיטלז (Purple Zkittlez) · טריכום",        aka: ["פי&זד"],           confidence: "high" },
  "CARBO":  { strainId: "s4",  note: "קרבון פייבר (Carbon Fiber) · טריכום",           aka: ["קארבו"],          confidence: "high" },
  "ICC":    { strainId: "s8",  note: "אייס קרים קייק · קנדוק",                        aka: ["Ice Cream Cake"],  confidence: "high" },
  "WCK":    { strainId: "s3",  note: "וודינג קייק (Wedding Cake) · פיס נטורלס",       aka: ["Wedding CK"],     confidence: "high" },
  "TWC":    { strainId: "s10", note: "וודינג קייק (Wedding Cake) · קנדוק — אותה גנטיקה, מגדל אחר!", aka: ["The Wedding Cake"], confidence: "high" },
  "WK":     { strainId: "s13", note: "וודינג קראשר (Wedding Crasher) · שיח — שם דומה, גנטיקה שונה!", aka: ["Wedding K"], confidence: "high" },
  "JU":     { strainId: "s5",  note: "ג'ו (סאטיבה יום) · מדיקיין",                   aka: ["ג'ו"],            confidence: "med" },
  "LIT":    { strainId: "s14", note: "ליט מנגו · קרונוס",                             aka: ["Lit"],            confidence: "high" },
  "GMO.T":  { strainId: "s29", note: "GMO / Garlic Cookies (Chemdawg × GSC) · קנאבר", aka: ["GMO"],            confidence: "high" },
  "GMO":    { strainId: "s29", note: "GMO / Garlic Cookies (Chemdawg × GSC)",         aka: ["Garlic Cookies"], confidence: "high" },
  "JL":     { strainId: "s28", note: "ג'יי.אל · טוגדר",                               aka: ["ג'יי אל"],        confidence: "med" },
  "JOP":    { strainId: "s27", note: "ג'ופ · שיח מדיקל",                              aka: ["ג'ופ מיני"],      confidence: "med" },
  "L.MNTZ": { strainId: "s31", note: "ל.מנטז (Lemon Mints) · טוגדר",                  aka: ["למון מינטס"],     confidence: "med" },
  "D-51":   { strainId: "s8",  note: "ביסקוטי × ג'לאטו — לאמת מול קטלוג מגדל",       aka: [],                 confidence: "med" },
};

// ── Fuzzy matching helpers ────────────────────────────────────
function editDistance(a, b) {
  a = (a || "").toLowerCase(); b = (b || "").toLowerCase();
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function normName(s) {
  return (s || "").toLowerCase()
    .replace(/['"`׳״.\-–—_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyFindStrain(line) {
  const clean = normName(line);
  const exact = STRAINS.find((s) => clean.includes(normName(s.name)) && normName(s.name).length >= 2);
  if (exact) return { strain: exact, fuzzy: false };
  const words = clean.split(" ").filter((w) => w.length >= 2);
  let best = null, bestDist = 99;
  for (const s of STRAINS) {
    const sn = normName(s.name);
    if (sn.length < 2) continue;
    for (const w of words) {
      const d = editDistance(w, sn);
      const tol = sn.length <= 4 ? 1 : 2;
      if (d <= tol && d < bestDist) { best = s; bestDist = d; }
    }
    if (sn.includes(" ")) {
      const d = editDistance(clean, sn);
      if (d <= 2 && d < bestDist) { best = s; bestDist = d; }
    }
  }
  return best ? { strain: best, fuzzy: true } : { strain: null, fuzzy: false };
}

// ── Core parsing logic ────────────────────────────────────────
function parseMenu(text, ans, scored, serverProducts = null) {
  const srvByName = {};
  if (Array.isArray(serverProducts)) {
    serverProducts.forEach((p) => {
      const key = (p.commercial || p.strain || "").trim();
      if (key && p.match != null) srvByName[key] = p.match;
    });
  }
  return text.split("\n")
    .map((l) => l.trim()).filter(Boolean)
    .map((line) => {
      if (/^(תפרחות|שמנים|שמן|תפרחת|תפריט)\s*:?\s*$/.test(line)) return null;
      const cat = (line.match(/T\d+\/C\d+/i) || [null])[0]?.toUpperCase() || null;
      const priceM = line.match(/(\d{2,4})\s*₪/)
                  || line.match(/₪\s*(\d{2,4})/)
                  || line.match(/(\d{2,4})\s*(?:ש"?ח|שקל)/);
      const price = priceM ? +priceM[1] : null;
      const codeKey = Object.keys(MENU_CODE_MAP).find((c) => line.includes(c));
      const mapped = codeKey ? MENU_CODE_MAP[codeKey] : null;
      const ff = fuzzyFindStrain(line);
      let known = ff.strain, fuzzyMatch = ff.fuzzy, decodedNote = null;
      if (!known && mapped) {
        known = STRAINS.find((s) => s.id === mapped.strainId);
        decodedNote = `${codeKey} = ${mapped.note}${mapped.aka?.length ? ` · ידוע גם בתור: ${mapped.aka.join(", ")}` : ""}`;
      }
      if (!cat && !known && !price) return null;
      const inLicense = cat ? ans.cats.includes(cat) : known ? ans.cats.includes(known.cat) : true;
      const match = known ? scored.find((x) => x.id === known.id)?.match ?? null : null;
      const name = known
        ? known.name
        : line.replace(/T\d+\/C\d+/i, "").replace(/[—\-–]?\s*\d{2,4}\s*₪/, "").replace(/₪/, "").trim();
      const isOil = known ? known.type === "oil" : /שמן/.test(line);
      let altGenetic = null;
      if (!known && cat) {
        const alt = scored.find((s) => s.cat === cat && s.match >= 72 && ans.cats.includes(cat));
        if (alt) altGenetic = alt;
      }
      const srvScore = srvByName[name] ?? srvByName[line.trim()];
      const finalMatch = srvScore != null ? srvScore : match;
      return { name, cat: cat || known?.cat, price: price ?? known?.price, known, match: finalMatch,
               inLicense, genetics: known?.genetics, decodedNote, isOil, fuzzyMatch,
               origLine: line.trim(), grower: known?.grower, altGenetic };
    })
    .filter(Boolean).filter((x) => x.name)
    .sort((a, b) => (b.match ?? -1) - (a.match ?? -1));
}

// ── Main component ─────────────────────────────────────────────
export default function MenuScanTab({ ans, scored, basket, addToBasket, user }) {
  const [text, setText]         = useState("");
  const [results, setResults]   = useState(null);
  const [aiParsing, setAiParsing] = useState(false);
  const [aiError, setAiError]   = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef();
  const camRef  = useRef();

  const scan = async () => {
    if (!text.trim()) return;
    setScanning(true); setAiError(null);
    try {
      const data = await api.parseMenu({ text, user_id: user?.id || "demo" });
      const hasScores = data?.products?.some((p) => p.match != null);
      setResults(parseMenu(text, ans, scored, hasScores && !data.db_offline ? data.products : null));
    } catch {
      setResults(parseMenu(text, ans, scored));
    } finally {
      setScanning(false);
    }
  };

  const fileToBase64 = (file) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => res(reader.result.split(",")[1]);
    reader.onerror = () => rej(new Error("שגיאה בקריאת הקובץ"));
    reader.readAsDataURL(file);
  });

  const processFile = async (file) => {
    if (!file) return;
    setAiError(null);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImg = file.type.startsWith("image/");
    if (!isPdf && !isImg) { setAiError("אפשר להעלות תמונה (JPG/PNG) או PDF בלבד"); return; }
    setAiParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const PROMPT = `אתה מנתח תפריט של בית מרקחת לקנאביס רפואי בישראל.
חלץ מהמסמך את כל המוצרים, שורה אחת לכל מוצר, בפורמט:
[שם המוצר] [קטגוריה כגון T22/C4] — [מחיר]₪

חשוב: שמור על שמות הזנים בדיוק כפי שמופיעים. אם אין קטגוריה או מחיר — השאר ריק.
כתוב רק את הרשימה, בלי הסברים. דוגמה:
Wedding CK T22/C4 — 280₪
אור T15/C3 — 225₪`;
      const mediaBlock = isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf",  data: base64 } }
        : { type: "image",    source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } };

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1500,
          messages: [{ role: "user", content: [mediaBlock, { type: "text", text: PROMPT }] }],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || `שגיאת שרת (${response.status})`);
      if (data.error) throw new Error(data.error.message || "שגיאה מהשרת");
      const extracted = (data.content || []).map((b) => b.text || "").join("\n").trim();
      if (extracted) { setText(extracted); setResults(parseMenu(extracted, ans, scored)); }
      else setAiError("לא הצלחתי לחלץ טקסט — נסו תמונה ברורה או הדביקו ידנית");
    } catch (err) {
      setAiError(
        err.message?.includes("API key") || err.message?.includes("503")
          ? "פיצ'ר ה-AI דורש מפתח API (ראו README). בינתיים אפשר להדביק את התפריט כטקסט למטה 👇"
          : "שגיאה בעיבוד: " + err.message
      );
    } finally {
      setAiParsing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  const dupesByGenetics = (() => {
    if (!results) return [];
    const m = {};
    results.forEach((r) => { if (r.genetics && r.genetics !== "—") (m[r.genetics] = m[r.genetics] || []).push(r); });
    return Object.entries(m).filter(([, a]) => a.length > 1);
  })();

  return (
    <div className="space-y-4">
      {/* Upload / input card */}
      <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.line }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}>

        <h3 className="font-bold mb-1" style={{ color: C.ink }}>פענוח תפריט 🔬</h3>
        <p className="text-xs mb-3" style={{ color: "#6B7A6E" }}>
          העלו תמונה, PDF, או הדביקו טקסט — נזהה את הגנטיקה האמיתית מאחורי כל שם ונסמן מה מתאים לכם. 🌿
        </p>

        {/* Drop zone */}
        <div className="rounded-xl border-2 border-dashed p-4 mb-3 text-center"
          style={{ borderColor: dragOver ? C.accent : "#C9D8CC", background: dragOver ? "#E7F0E9" : C.soft }}>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
          <div className="flex gap-2 justify-center">
            <button onClick={() => fileRef.current?.click()} disabled={aiParsing}
              className="font-bold text-sm px-4 py-2 rounded-xl text-white disabled:opacity-50"
              style={{ background: C.accent }}>
              {aiParsing ? "🤖 מנתח..." : "📎 העלה תמונה / PDF"}
            </button>
            <button onClick={() => camRef.current?.click()} disabled={aiParsing}
              className="font-bold text-sm px-4 py-2 rounded-xl border disabled:opacity-50"
              style={{ borderColor: C.accent, color: C.accent, background: "#fff" }}>
              📷 צלם
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: "#6B7A6E" }}>או גררו לכאן קובץ · נפענח אוטומטית עם AI</p>
          {aiError && (
            <p className="text-xs mt-2 font-semibold p-2 rounded-lg" style={{ color: "#B5543B", background: "#FBEAE5" }}>
              ⚠️ {aiError}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-px" style={{ background: C.line }} />
          <span className="text-xs font-semibold" style={{ color: "#9AA79C" }}>או הדביקו טקסט</span>
          <div className="flex-1 h-px" style={{ background: C.line }} />
        </div>

        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
          placeholder={"הדביקו כאן את התפריט, שורה לכל מוצר. למשל:\nWedding CK T22/C4 — 280₪\nאור T15/C3 — 225₪\n\n(לא נורא אם יש שגיאות כתיב — נשלים לזן הקרוב)"}
          className="w-full rounded-xl border p-3 text-sm"
          style={{ borderColor: C.line, color: C.ink, background: C.bg, resize: "vertical" }} />

        <div className="flex gap-2 mt-2">
          <button onClick={() => setText(SAMPLE_MENU)}
            className="px-3 py-2.5 rounded-xl text-xs font-bold border"
            style={{ borderColor: C.line, color: "#6B7A6E" }}>
            נסה דוגמה
          </button>
          <button onClick={scan} disabled={!text.trim() || scanning}
            className="flex-1 py-2.5 rounded-xl font-bold text-white disabled:opacity-40"
            style={{ background: C.accent }}>
            {scanning ? "🧬 מנתח…" : "🔍 פענח את התפריט"}
          </button>
        </div>
      </div>

      {(scanning || aiParsing) && <LoadingSkeleton message="מנתח את הפרופיל הגנטי שלך… 🧠🧬" rows={3} />}

      {/* Duplicate genetics alert */}
      {!scanning && dupesByGenetics.length > 0 && (
        <div className="rounded-2xl p-4 border" style={{ background: "#FBF3E3", borderColor: "#EAD9B0" }}>
          <h4 className="font-bold text-sm mb-2" style={{ color: "#9C6F12" }}>🔓 גילינו: אותה גנטיקה, שמות שונים</h4>
          {dupesByGenetics.map(([gen, arr]) => {
            const sorted = [...arr].sort((a, b) => (a.price || 999) - (b.price || 999));
            const save = (sorted[sorted.length - 1].price || 0) - (sorted[0].price || 0);
            return (
              <div key={gen} className="rounded-xl p-2.5 mb-2" style={{ background: "#fff" }}>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#EDE7F6", color: "#5E4B8B" }}>🧬 {gen}</span>
                <div className="text-xs mt-1.5" style={{ color: "#3D4F43" }}>
                  {sorted.map((r, i) => (
                    <span key={i}>{i > 0 && " = "}
                      <span style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? C.accent : "#6B7A6E" }}>
                        {r.name}{r.price ? ` (₪${r.price})` : ""}
                      </span>
                    </span>
                  ))}
                </div>
                {save > 0 && <p className="text-xs mt-1 font-bold" style={{ color: "#9C6F12" }}>💰 חיסכון של עד ₪{save} על אותה גנטיקה!</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {results && results.length === 0 && (
        <div className="rounded-2xl p-5 text-center" style={{ background: C.card, border: `1px dashed ${C.line}` }}>
          <div className="text-3xl mb-2">🤷</div>
          <p className="text-sm font-bold" style={{ color: C.ink }}>לא זיהינו מוצרים</p>
          <p className="text-xs mt-1" style={{ color: "#6B7A6E" }}>ודאו שכל שורה כוללת שם זן, ורצוי קטגוריה (T../C..) ומחיר.</p>
        </div>
      )}

      {/* Results list */}
      {results && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold" style={{ color: C.ink }}>
            {results.length} מוצרים פוענחו · ממוינים לפי התאמה אליכם
          </p>
          {results.map((r, i) => (
            <div key={i} className="rounded-2xl p-3 border flex items-center gap-3"
              style={{ background: C.card, borderColor: r.match >= 85 ? C.accent : C.line, opacity: r.inLicense ? 1 : 0.5 }}>
              {r.match !== null
                ? <MatchRing pct={r.match} />
                : <div className="text-center" style={{ width: 52 }}>
                    <div className="text-lg">❔</div>
                    <div className="text-xs" style={{ color: "#9AA79C" }}>חדש</div>
                  </div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold" style={{ color: C.ink }}>{r.name}</span>
                  {r.fuzzyMatch && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#FBF3E3", color: "#9C6F12" }}
                      title={`זוהה מתוך: "${r.origLine}"`}>✏️ תוקן</span>
                  )}
                  <span className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: r.isOil ? "#F1EEF8" : "#EEF3EE", color: r.isOil ? "#5E4B8B" : "#2E6B53" }}>
                    {r.isOil ? "💧 שמן" : "🌿 תפרחת"}
                  </span>
                  {r.genetics && r.genetics !== "—" && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#EDE7F6", color: "#5E4B8B" }}>🧬 {r.genetics}</span>
                  )}
                  {r.cat && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: C.soft, color: C.accent }}>{r.cat}</span>
                  )}
                </div>
                {r.decodedNote && (
                  <p className="text-xs mt-0.5 font-semibold" style={{ color: "#5E4B8B" }}>🔓 פיענחנו עבורכם: {r.decodedNote}</p>
                )}
                {r.altGenetic && (
                  <p className="text-xs mt-0.5" style={{ color: C.accent }}>
                    💡 לא במאגר — אך {r.altGenetic.name} ({r.altGenetic.genetics}) באותה קטגוריה מתאים לכם {r.altGenetic.match}%
                  </p>
                )}
                <p className="text-xs mt-0.5" style={{ color: "#6B7A6E" }}>
                  {!r.inLicense        ? "מחוץ לקטגוריות הרישיון שלכם"
                  : r.match === null    ? "זן שלא ניסיתם — דרגו ביומן ונלמד אותו"
                  : r.match >= 85      ? "התאמה מצוינת לפרופיל שלכם 💚"
                  : r.match >= 72      ? "התאמה טובה"
                                       : "פחות מתאים למה שעבד לכם בעבר"}
                </p>
              </div>
              <div className="text-center">
                {r.price && <div className="font-bold text-sm mb-1" style={{ color: C.ink }}>₪{r.price}</div>}
                {r.known && r.inLicense && (
                  <button onClick={() => addToBasket(r.known.id)} disabled={basket.includes(r.known.id)}
                    className="text-xs px-3 py-1.5 rounded-lg font-bold text-white disabled:opacity-40"
                    style={{ background: C.accent }}>
                    {basket.includes(r.known.id) ? "בתכנון ✓" : "+ לתכנון"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
