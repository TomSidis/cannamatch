// ─────────────────────────────────────────────────────────────────────────────
//  ZemachAvatarChat — Premium Organic Floating Companion
//
//  Architecture:
//  • Canvas chroma-key renderer: per-pixel luminance threshold removes the
//    pure-black video background at the GPU read-back level. The resulting
//    canvas has real alpha → CSS drop-shadow on the canvas follows the
//    character shape (no more square bounding-box glow).
//  • No mix-blend-mode needed — no filter/blend-mode compositing conflicts.
//  • Glow rings, pulse rings, burst rings are all siblings of the canvas
//    inside the button; none of them affect the canvas's filter context.
//  • Bubbles extend to the RIGHT of the avatar with an SVG left-pointing tail.
//  • Chat panel opens to the right at bottom: 0, clearing the avatar entirely.
//  • All state transitions (idle / active / thinking / celebrating / nudge)
//    drive size, glow colour, and float animation independently.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { P, G, B, SPRING, VARIANTS, FONT } from '../styles/ds.js';

const AVATAR_SRC   = '/zemach-avatar.mp4';
const CANVAS_RES   = 256;   // internal canvas pixel budget
const CHROMA_HARD  = 22;    // luminance below this → fully transparent
const CHROMA_SOFT  = 56;    // luminance below this → feathered edge

// ── Zemach personality lines ──────────────────────────────────────────────────
const PROACTIVE_LINES = {
  welcome:    (name) => `שלום${name ? ` ${name}` : ''}, ברוכים הבאים 🌿\nאני צמח — כאן בשבילך בכל שאלה על הקנאביס הרפואי שלך.`,
  returning:  (name) => `איזה כיף שחזרת${name ? `, ${name}` : ''}! 🌿\nבדקתי — יש כמה זנים חדשים שמתאימים לפרופיל שלך ממש טוב.`,
  highMatch:  (strain) => `מצאתי לך גביע! ✨ ${strain} — ${Math.floor(85 + Math.random() * 13)}% התאמה. הגנטיקה שלו כמו מותאמת בשבילך.`,
  lowData:    () => `ה-DNA שלך עוד מתגבש 🧬\nדרג כמה זנים שניסית ואני אהפוך את ההמלצות מדויקות בהרבה.`,
  newMenu:    () => `תפריט חדש מחכה לניתוח 📸\nגרור תמונה לכאן ואני אפענח לך כל זן תוך שניות.`,
  anxiety:    () => `שמתי לב שסמנת חרדה 🛡️\nחסמתי זנים עם טרפינולן גבוה — הראש שלך בידיים טובות.`,
  nighttime:  () => `לילה טוב 🌙\nמציע לסנן ל"זנים לשינה" — מירצן ולינלול הם מה שצריך עכשיו.`,
  killSwitch: (terp, ind) => `רגע, עצרתי הכל 🛑\nהזן הזה עמוס ב${terp} — וזה בדיוק מה שמדליק לך את ה${ind}. הורדתי אותו מהמסך שלך. אתה בידיים טובות, חבר 💚`,
  tabs: {
    journal:   () => `יומן המעקב עוזר לי להכיר אותך טוב יותר 📊\nכל רשומה שתמלא מדייקת את ההמלצות. 5 שניות = המלצה טובה יותר.`,
    dna:       () => `זה הפרופיל הגנטי שלך 🧬\nאם יש זן ספציפי שאתה תוהה לגביו — שאל אותי.`,
    market:    () => `בדקתי את המחירים 🏪\nגיליתי הבדלי מחיר של עד ₪40 בין בתי מרקחת על אותו זן.`,
    menu:      () => `תפריט מחכה? 📸\nשלח לי תמונה ואפענח כל זן תוך שניות — גנטיקה, טרפנים, התאמה.`,
    knowledge: () => `מחקר מעניין בנושא 📚\nשאל אותי על כל זן ואסביר לך את המדע מאחוריו בשפה פשוטה.`,
    cooking:   () => `אוכל עם קנאביס דורש קצת ידע 🍳\nאל תדלג על הדקרבוקסילציה — בלעדיה ה-THC לא יעיל.`,
    community: () => `קהילה של מטופלים מאומתים 🌿\nאתה לא לבד. כאן מטופלים אמיתיים משתפים מה עבד ומה לא.`,
    basket:    () => `בדקת את התכנון שלך? 🗓️\nאני יכול לוודא שהסל מתאים לקנה מידה של הרישיון החודשי שלך.`,
  },
};

// ── Typing animation ──────────────────────────────────────────────────────────
function useTypingEffect(fullText, speed = 16) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone]           = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!fullText) { setDisplayed(''); setDone(true); return; }
    setDisplayed(''); setDone(false);
    let i = 0;
    timer.current = setInterval(() => {
      i++;
      setDisplayed(fullText.slice(0, i));
      if (i >= fullText.length) { clearInterval(timer.current); setDone(true); }
    }, speed);
    return () => clearInterval(timer.current);
  }, [fullText, speed]);

  return { displayed, done };
}

// ── Canvas chroma-key — strips black background; enables character-shaped glow ──
function ChromaCanvas({ displaySize, glowColor, glowPx }) {
  const canvasRef = useRef(null);
  const videoRef  = useRef(null);
  const rafRef    = useRef(null);
  const aliveRef  = useRef(true);

  useEffect(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    aliveRef.current = true;

    function tick() {
      if (!aliveRef.current) return;
      if (!video.paused && video.readyState >= 2) {
        try {
          ctx.clearRect(0, 0, CANVAS_RES, CANVAS_RES);
          ctx.drawImage(video, 0, 0, CANVAS_RES, CANVAS_RES);
          const img = ctx.getImageData(0, 0, CANVAS_RES, CANVAS_RES);
          const d   = img.data;
          for (let i = 0; i < d.length; i += 4) {
            // perceptual luminance
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            if (lum < CHROMA_HARD) {
              d[i + 3] = 0;
            } else if (lum < CHROMA_SOFT) {
              // soft feathered edge
              const t = (lum - CHROMA_HARD) / (CHROMA_SOFT - CHROMA_HARD);
              d[i + 3] = Math.floor(t * d[i + 3]);
            }
          }
          ctx.putImageData(img, 0, 0);
        } catch { /* canvas taint safety — skip frame */ }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();

    return () => { aliveRef.current = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  // drop-shadow on canvas tracks real alpha — perfectly character-shaped glow
  const shadow = glowPx > 0
    ? `drop-shadow(0 0 ${glowPx}px ${glowColor}) drop-shadow(0 0 ${Math.round(glowPx * 0.55)}px ${glowColor}80)`
    : 'drop-shadow(0 10px 24px rgba(0,0,0,0.45))';

  return (
    <>
      <video ref={videoRef} src={AVATAR_SRC} autoPlay loop muted playsInline
        style={{ display: 'none' }} />
      <canvas
        ref={canvasRef}
        width={CANVAS_RES}
        height={CANVAS_RES}
        style={{
          display: 'block',
          width: displaySize,
          height: displaySize,
          filter: shadow,
          transition: 'filter 0.45s ease, width 0.38s cubic-bezier(.22,1,.36,1), height 0.38s cubic-bezier(.22,1,.36,1)',
        }}
      />
    </>
  );
}

// ── Cinematic speech bubble — extends RIGHT, SVG tail pointing at Zemach ──────
function ProactiveBubble({ message, onDismiss, isAlert = false }) {
  const { displayed } = useTypingEffect(message, 16);
  const isNudge  = !isAlert && (message.includes('שעות') || message.includes('יומן'));
  const borderCol = isAlert
    ? 'rgba(248,113,113,0.45)'
    : isNudge
      ? 'rgba(251,191,36,0.40)'
      : 'rgba(74,222,128,0.38)';
  const bgCol = isAlert ? 'rgba(10,4,4,0.90)' : 'rgba(4,8,16,0.88)';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88, x: -14 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.86, x: -10 }}
      transition={{ type: 'spring', stiffness: 440, damping: 30 }}
      style={{
        position: 'relative',
        maxWidth: 'min(275px, calc(100vw - 164px))',
        padding: '12px 16px 12px 14px',
        borderRadius: 18,
        background: bgCol,
        backdropFilter: 'blur(24px) saturate(1.7)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.7)',
        border: `1.5px solid ${borderCol}`,
        boxShadow: `0 8px 36px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {/* Left-pointing tail — SVG triangle toward Zemach */}
      <svg
        width="14" height="24" viewBox="0 0 14 24"
        style={{ position: 'absolute', left: -12, bottom: 18, display: 'block', overflow: 'visible' }}
        aria-hidden="true"
      >
        {/* Fill triangle */}
        <path d="M14 2 L14 22 L0 12 Z" fill={bgCol} />
        {/* Border stroke on the two exposed edges */}
        <path d="M14 2 L0 12 L14 22"
          fill="none" stroke={borderCol} strokeWidth="1.5" strokeLinejoin="round" />
        {/* Inner mask line to erase the bubble's left border overlap */}
        <line x1="14" y1="1" x2="14" y2="23" stroke={bgCol} strokeWidth="2.5" />
      </svg>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }} dir="rtl">
        <p style={{
          flex: 1,
          fontSize: 13,
          lineHeight: 1.78,
          color: '#F0FDF4',
          whiteSpace: 'pre-line',
          fontWeight: 500,
          letterSpacing: '0.008em',
          minHeight: 18,
        }}>
          {displayed}
        </p>
        <button
          onClick={onDismiss}
          style={{
            flexShrink: 0,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(187,247,208,0.38)',
            fontSize: 12, padding: '1px 0 0 2px', lineHeight: 1,
            transition: 'color 0.18s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(187,247,208,0.80)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(187,247,208,0.38)'}
          aria-label="סגור"
        >✕</button>
      </div>

      {/* Decorative bottom shimmer */}
      <div style={{
        position: 'absolute', bottom: 0, left: 18, right: 18, height: 1, borderRadius: 2,
        background: `linear-gradient(90deg,transparent,${borderCol},transparent)`,
      }} />
    </motion.div>
  );
}

// ── Kill-switch alert ─────────────────────────────────────────────────────────
function KillSwitchPanel({ alert, onDismiss }) {
  if (!alert?.triggered) return null;
  const msg = PROACTIVE_LINES.killSwitch(alert.terpene, alert.indication);
  return (
    <ProactiveBubble
      message={msg}
      onDismiss={onDismiss}
      isAlert
    />
  );
}

// ── Chat message ──────────────────────────────────────────────────────────────
function ChatMessage({ msg, isLast }) {
  const isUser = msg.role === 'user';
  const { displayed } = useTypingEffect(isLast && !isUser ? msg.content : null, 14);
  const text = isLast && !isUser ? displayed : msg.content;

  return (
    <motion.div
      variants={VARIANTS.fadeUp}
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-start' : 'flex-end',
        marginBottom: 10,
      }}
    >
      <div style={{
        maxWidth: '83%',
        padding: '10px 14px',
        borderRadius: isUser ? '18px 18px 18px 4px' : '18px 18px 4px 18px',
        background: isUser ? 'rgba(255,255,255,0.06)' : 'rgba(74,222,128,0.10)',
        border: isUser ? B.subtle : '1px solid rgba(74,222,128,0.20)',
        fontSize: 13.5,
        lineHeight: 1.68,
        color: P.hi,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {text}
      </div>
    </motion.div>
  );
}

// ── Thinking dots ─────────────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
      <div style={{
        padding: '10px 16px', borderRadius: '18px 18px 4px 18px',
        background: 'rgba(74,222,128,0.08)',
        border: '1px solid rgba(74,222,128,0.15)',
        display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <motion.div key={i}
            style={{ width: 7, height: 7, borderRadius: '50%', background: P.sage }}
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
            transition={{ duration: 1.1, delay: i * 0.18, repeat: Infinity }} />
        ))}
      </div>
    </div>
  );
}

// ── State maps ────────────────────────────────────────────────────────────────
const STATE_SIZE = {
  idle: 138, active: 138, thinking: 138, celebrating: 174, nudge: 150,
};
const STATE_GLOW_COLOR = {
  idle: '#4ADE80', active: '#4ADE80', thinking: '#38bdf8', celebrating: '#4ADE80', nudge: '#FBBF24',
};
const STATE_GLOW_PX = {
  idle: 12, active: 22, thinking: 20, celebrating: 44, nudge: 22,
};
const STATE_RING_COLOR = {
  idle: 'rgba(74,222,128,0.30)', active: 'rgba(74,222,128,0.50)',
  thinking: 'rgba(56,189,248,0.45)', celebrating: 'rgba(74,222,128,0.70)', nudge: 'rgba(251,191,36,0.55)',
};

// ── Float animation params by state ──────────────────────────────────────────
function floatAnim(state) {
  if (state === 'celebrating')
    return {
      animate: { y: [0, -24, -10, -22, -8, -18], scale: [1, 1.13, 1.06, 1.11, 1.04, 1.08] },
      transition: { duration: 1.15, repeat: 2, ease: 'easeInOut' },
    };
  if (state === 'nudge')
    return {
      animate: { y: [0, -8, -3, -8, 0] },
      transition: { duration: 3.0, repeat: Infinity, ease: 'easeInOut' },
    };
  return {
    animate: { y: [0, -11, 0] },
    transition: { duration: 4.6, repeat: Infinity, ease: 'easeInOut' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ZemachAvatarChat — main export
// ─────────────────────────────────────────────────────────────────────────────
export default function ZemachAvatarChat({
  contextMessage,
  killSwitchAlert,
  userName,
  onImageAnalyze,
  currentTab,
  celebrating,
  diaryNudge,
  onDiaryClick,
}) {
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState([{
    role: 'assistant',
    content: `שלום${userName ? ` ${userName}` : ''}! אני צמח 🌿\nשאל אותי כל דבר על הקנאביס הרפואי שלך — גנטיקה, טרפנים, מינונים, כל דבר.`,
  }]);
  const [input, setInput]             = useState('');
  const [busy, setBusy]               = useState(false);
  const [bubble, setBubble]           = useState(null);
  const [killDismissed, setKillDismissed] = useState(false);
  const [pendingImg, setPendingImg]   = useState(null);
  const [imgPreview, setImgPreview]   = useState(null);

  const scrollRef  = useRef(null);
  const fileRef    = useRef(null);
  const inputRef   = useRef(null);
  const prevTabRef = useRef(null);

  // Scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  // External context message
  useEffect(() => {
    if (!contextMessage || open) return;
    setBubble(contextMessage);
    const t = setTimeout(() => setBubble(null), 9000);
    return () => clearTimeout(t);
  }, [contextMessage]);

  // Reset kill-switch state on new alert
  useEffect(() => {
    if (killSwitchAlert?.triggered) setKillDismissed(false);
  }, [killSwitchAlert]);

  // Tab-aware proactive bubble
  useEffect(() => {
    if (!currentTab || currentTab === prevTabRef.current || open) return;
    prevTabRef.current = currentTab;
    const line = PROACTIVE_LINES.tabs[currentTab];
    if (!line) return;
    const t = setTimeout(() => setBubble(line()), 3000);
    return () => clearTimeout(t);
  }, [currentTab, open]);

  // License celebration
  useEffect(() => {
    if (!celebrating) return;
    setBubble('🎉 כניסה לקהילה אושרה!\nמרחב המטופלים המאומתים פתוח לך עכשיו.\nברוך הבא לפיד החי 🌿');
  }, [celebrating]);

  // 4h diary nudge
  useEffect(() => {
    if (!diaryNudge || open) return;
    setBubble('היי 🌙 עברו כמה שעות — איך אתה מרגיש?\nלוחץ על הכפתור ירשום לי 30 שניות ויעזור לי לדייק את ההמלצות 📊');
  }, [diaryNudge, open]);

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && !pendingImg) || busy) return;
    setBusy(true);
    setInput('');
    const userMsg = { role: 'user', content: text || '📸 שאלה עם תמונה' };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setPendingImg(null);
    setImgPreview(null);

    try {
      const body = {
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system: `אתה צמח, עוזר AI ידידותי ומקצועי באפליקציית קנאמאצ׳ לקנאביס רפואי.
ענה תמיד בעברית, בטון חם ובגובה העיניים. אל תיתן ייעוץ רפואי. שם המשתמש${userName ? ` הוא ${userName}` : ' לא ידוע'}.`,
        messages: nextHistory.map(m => ({ role: m.role, content: m.content })),
        ...(pendingImg ? {
          messages: [
            ...nextHistory.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: pendingImg.type, data: pendingImg.data } },
                { type: 'text', text: text || 'מה יש בתמונה הזו? פענח לי את הזנים.' },
              ],
            },
          ],
        } : {}),
      };
      const res  = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
        || 'מצטער, לא הצלחתי לענות כרגע — נסה שוב בעוד רגע.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'שגיאת חיבור — בדקו אינטרנט ונסו שוב 🙏' }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, pendingImg, userName]);

  const handleFile = useCallback((file) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const base64 = e.target.result.split(',')[1];
      setPendingImg({ data: base64, type: file.type });
      setImgPreview(e.target.result);
      onImageAnalyze?.(base64, file.type);
    };
    reader.readAsDataURL(file);
  }, [onImageAnalyze]);

  const handleDrop = useCallback(e => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onKeyDown = useCallback(e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  // ── Derive avatar state ─────────────────────────────────────────────────────
  const avatarState = busy ? 'thinking' : open ? 'active' : celebrating ? 'celebrating' : diaryNudge ? 'nudge' : 'idle';
  const displaySize = STATE_SIZE[avatarState];
  const glowColor   = STATE_GLOW_COLOR[avatarState];
  const glowPx      = STATE_GLOW_PX[avatarState];
  const ringColor   = STATE_RING_COLOR[avatarState];
  const { animate: floatAnimate, transition: floatTransition } = floatAnim(avatarState);

  // Offsets for right-side overlays
  const PANEL_LEFT = 148; // all right-side content starts here (px from screen left)

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        zIndex: 9999,
        pointerEvents: 'none',
        fontFamily: FONT,
      }}
    >

      {/* ── Kill-switch alert — right side ──────────────────────────────── */}
      <div style={{
        position: 'absolute',
        left: PANEL_LEFT,
        bottom: 168,
        pointerEvents: 'auto',
      }}>
        <AnimatePresence>
          {killSwitchAlert?.triggered && !killDismissed && (
            <KillSwitchPanel
              key="kill"
              alert={killSwitchAlert}
              onDismiss={() => setKillDismissed(true)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Proactive bubble — right side ───────────────────────────────── */}
      <div style={{
        position: 'absolute',
        left: PANEL_LEFT,
        bottom: 158,
        pointerEvents: 'auto',
      }}>
        <AnimatePresence>
          {bubble && !open && (
            <ProactiveBubble
              key={bubble}
              message={bubble}
              onDismiss={() => setBubble(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Chat panel — right side, bottom-aligned ─────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 22, scale: 0.94 }}
            transition={SPRING.smooth}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            style={{
              position: 'absolute',
              left: PANEL_LEFT,
              bottom: 10,
              width: 'min(348px, calc(100vw - 158px))',
              maxHeight: '56vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 22,
              overflow: 'hidden',
              background: 'rgba(6,11,18,0.96)',
              backdropFilter: 'blur(28px) saturate(1.5)',
              WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
              border: '1.5px solid rgba(74,222,128,0.22)',
              boxShadow: '0 0 0 1px rgba(74,222,128,0.07) inset, 0 18px 52px rgba(0,0,0,0.75)',
              pointerEvents: 'auto',
            }}
          >
            {/* Chat header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 15px',
              borderBottom: '1px solid rgba(74,222,128,0.10)',
              background: 'rgba(74,222,128,0.03)',
              flexShrink: 0,
            }}>
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2.4, repeat: Infinity }}
                style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: P.mint,
                  boxShadow: G.mint(6),
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: P.hi }}>צמח — העוזר האישי</span>
              <span style={{
                fontSize: 10, color: P.lo, marginRight: 'auto',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                {avatarState === 'thinking' ? 'חושב...' : 'מוכן'}
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(187,247,208,0.40)', fontSize: 16, lineHeight: 1,
                  padding: '0 2px',
                  transition: 'color 0.18s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(187,247,208,0.85)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(187,247,208,0.40)'}
              >✕</button>
            </div>

            {/* Messages */}
            <div ref={scrollRef}
              style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', scrollbarWidth: 'none' }}>
              <motion.div variants={VARIANTS.stagger} initial="hidden" animate="show">
                {messages.map((m, i) => (
                  <ChatMessage key={i} msg={m} isLast={i === messages.length - 1} />
                ))}
              </motion.div>
              {busy && <ThinkingDots />}
            </div>

            {/* Image preview */}
            {imgPreview && (
              <div style={{
                padding: '6px 14px 0',
                display: 'flex', alignItems: 'center', gap: 8,
                flexShrink: 0,
              }}>
                <img src={imgPreview} alt=""
                  style={{ height: 44, borderRadius: 8, objectFit: 'cover' }} />
                <span style={{ fontSize: 11, color: P.mid }}>תמונה מצורפת</span>
                <button
                  onClick={() => { setPendingImg(null); setImgPreview(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.lo, fontSize: 13 }}
                >✕</button>
              </div>
            )}

            {/* Input row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px 14px',
              borderTop: '1px solid rgba(74,222,128,0.08)',
              background: 'rgba(0,0,0,0.22)',
              flexShrink: 0,
            }}>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: B.subtle,
                  borderRadius: 12, padding: '9px 11px',
                  cursor: 'pointer', color: P.lo, fontSize: 15, flexShrink: 0,
                }}
                title="צרף תמונת תפריט"
              >📸</button>
              <input
                ref={inputRef}
                dir="rtl"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={busy}
                placeholder="שאל אותי כל דבר..."
                style={{
                  flex: 1, minWidth: 0,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1.5px solid rgba(74,222,128,0.18)',
                  borderRadius: 16,
                  padding: '10px 14px',
                  color: P.hi,
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: FONT,
                }}
              />
              <motion.button
                onClick={handleSend}
                disabled={busy || (!input.trim() && !pendingImg)}
                whileHover={busy ? {} : { scale: 1.06, boxShadow: G.mint(10) }}
                whileTap={busy ? {} : { scale: 0.93 }}
                style={{
                  background: P.mint, border: 'none',
                  borderRadius: 14, padding: '10px 16px',
                  color: P.inv, fontSize: 12, fontWeight: 800,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: (busy || (!input.trim() && !pendingImg)) ? 0.40 : 1,
                  flexShrink: 0,
                  fontFamily: FONT,
                }}
              >שלח</motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Avatar button ────────────────────────────────────────────────── */}
      {/*
          Layering inside the button (bottom → top, all position:absolute/relative):
            1. Ambient radial glow div   (z:0, behind canvas, no filter context)
            2. Pulsing outer ring        (z:0, absolute, no filter on canvas parent)
            3. Celebration burst rings   (z:0, absolute)
            4. Diary nudge amber ring    (z:0, absolute)
            5. ChromaCanvas              (z:1, relative — filter applied directly
                                          to canvas element; character-shaped glow)
            6. Status dot               (z:2, absolute, top-left)

          The button itself has NO filter property, so the canvas's mix-blend-mode
          (not used) or drop-shadow filter works in the correct compositing context.
      */}
      <motion.button
        onClick={() => {
          setOpen(o => !o);
          setBubble(null);
          if (diaryNudge && !open) onDiaryClick?.();
        }}
        animate={floatAnimate}
        transition={floatTransition}
        whileHover={{ scale: 1.07, rotate: -2 }}
        whileTap={{ scale: 0.92 }}
        aria-label="פתח שיחה עם צמח"
        style={{
          pointerEvents: 'auto',
          position: 'relative',
          width: displaySize,
          height: displaySize,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          outline: 'none',
          // No filter here — keeps canvas drop-shadow compositing clean
          transition: 'width 0.38s cubic-bezier(.22,1,.36,1), height 0.38s cubic-bezier(.22,1,.36,1)',
        }}
      >
        {/* ── Layer 1: ambient radial glow (behind character) ── */}
        <div style={{
          position: 'absolute',
          inset: -24,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${glowColor}1A 0%, ${glowColor}0A 45%, transparent 70%)`,
          pointerEvents: 'none',
          zIndex: 0,
          transition: 'background 0.5s ease',
        }} />

        {/* ── Layer 2: pulsing outer ring ── */}
        <motion.div
          animate={{ scale: [1, 1.32, 1], opacity: [0.38, 0, 0.38] }}
          transition={{
            duration: avatarState === 'celebrating' ? 0.75 : avatarState === 'nudge' ? 2.0 : 3.2,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          style={{
            position: 'absolute',
            inset: -10,
            borderRadius: '50%',
            border: `2px solid ${ringColor}`,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* ── Layer 3: celebration burst rings ── */}
        {celebrating && [0, 1, 2].map(i => (
          <motion.div
            key={`burst-${i}`}
            initial={{ scale: 0.55, opacity: 0.85 }}
            animate={{ scale: 2.6, opacity: 0 }}
            transition={{ duration: 1.05, delay: i * 0.38, repeat: 2, repeatDelay: 0.9 }}
            style={{
              position: 'absolute',
              inset: -14,
              borderRadius: '50%',
              border: '2.5px solid #4ADE80',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        ))}

        {/* ── Layer 4: diary nudge amber pulse ── */}
        {diaryNudge && !celebrating && (
          <motion.div
            animate={{ scale: [1, 1.50, 1], opacity: [0.52, 0, 0.52] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              inset: -8,
              borderRadius: '50%',
              border: '2px solid rgba(251,191,36,0.80)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}

        {/* ── Layer 5: ChromaCanvas — character with real alpha + character glow ── */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <ChromaCanvas
            displaySize={displaySize}
            glowColor={glowColor}
            glowPx={glowPx}
          />
        </div>

        {/* ── Layer 6: status notification dot ── */}
        <AnimatePresence>
          {!open && (bubble || killSwitchAlert?.triggered) && (
            <motion.div
              key="notif-dot"
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.35, 1], opacity: [1, 0.65, 1] }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity }}
              style={{
                position: 'absolute',
                top: 9, left: 9,
                width: 14, height: 14,
                borderRadius: '50%',
                background: killSwitchAlert?.triggered ? '#F87171' : '#4ADE80',
                border: '2.5px solid #04100a',
                boxShadow: killSwitchAlert?.triggered
                  ? '0 0 10px rgba(248,113,113,0.90)'
                  : '0 0 10px rgba(74,222,128,0.90)',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>
      </motion.button>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
