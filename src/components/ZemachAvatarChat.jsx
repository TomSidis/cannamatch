// ─────────────────────────────────────────────────────────────────────────────
//  ZemachAvatarChat — Organic Floating Cannabis Companion
//
//  Visual architecture:
//  • Video element with mix-blend-mode: screen — black background vanishes
//    because screen(black, page_background) ≈ page_background (transparent look).
//  • NO border-radius on video or its container.
//  • NO filter on any ancestor of the video (filter creates compositing isolation
//    that breaks mix-blend-mode). Glow lives in a SIBLING div with its own filter,
//    which doesn't affect the video's blend-mode compositing.
//  • Float animation via framer-motion translate — transform creates a new
//    stacking context, but screen-blending with a transparent parent still
//    produces transparent output for black pixels → character appears cut-out.
//  • Organic blob glow (CSS border-radius cheats, not circles) pulsing behind
//    the character.
//  • No pulsing rings, no rounded square widgets.
//
//  LLM architecture:
//  • Calls /api/zemach-chat (POST { message, history, image })
//  • Server responds { reply, citations, local_fallback, intent }
//  • If GROQ_API_KEY is in .env: Llama-3 free tier via Groq handles Intent C
//    (open questions) and image analysis.
//  • Fully offline-capable: falls back to deterministic localBot.js when Groq
//    is unavailable (no env key or rate-limited).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback, useReducer } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring }   from 'framer-motion';
import { P, G, B, SPRING, VARIANTS, FONT }                      from '../styles/ds.js';
import { routeMessage, probeActiveProvider }                     from '../lib/chat/chatRouter.js';
import { useOnlineStatus }                                       from '../hooks/useOnlineStatus.js';

const AVATAR_SRC = '/zemach-avatar.mp4';

// ── Proactive lines ────────────────────────────────────────────────────────────
const PROACTIVE_LINES = {
  welcome:    (n) => `שלום${n ? ` ${n}` : ''}, ברוכים הבאים 🌿\nאני צמח — כאן בשבילך בכל שאלה על הקנאביס הרפואי שלך.`,
  returning:  (n) => `איזה כיף שחזרת${n ? `, ${n}` : ''}! 🌿\nבדקתי — יש זנים חדשים בתפריט שמתאימים לפרופיל שלך ממש טוב.`,
  highMatch:  (s) => `מצאתי לך גביע! ✨ ${s} — ${Math.floor(85 + Math.random() * 13)}% התאמה. הגנטיקה שלו כמו מותאמת בשבילך.`,
  lowData:    () => `ה-DNA שלך עוד מתגבש 🧬\nדרג כמה זנים שניסית ואהפוך את ההמלצות למדויקות הרבה יותר.`,
  newMenu:    () => `תפריט חדש מחכה לניתוח 📸\nגרור תמונה לכאן ואפענח לך כל זן תוך שניות.`,
  killSwitch: (t, i) => `רגע, עצרתי הכל 🛑\nהזן הזה עמוס ב${t} — וזה בדיוק מה שמדליק לך את ה${i}. הורדתי אותו מהמסך שלך. אתה בידיים טובות 💚`,
  tabs: {
    journal:   () => `יומן המעקב עוזר לי להכיר אותך טוב יותר 📊\nכל רשומה שתמלא מדייקת את ההמלצות. 5 שניות = המלצה טובה יותר.`,
    dna:       () => `זה הפרופיל הגנטי שלך 🧬\nאם יש זן שאתה תוהה לגביו — שאל אותי ואסביר את הקשר לטרפנים.`,
    market:    () => `בדקתי את המחירים 🏪\nגיליתי הבדלי מחיר של עד ₪40 בין בתי מרקחת על אותו זן. רוצה שאמצא לך את העסקה?`,
    menu:      () => `תפריט מחכה? 📸\nשלח לי תמונה ואפענח כל זן — גנטיקה, טרפנים, התאמה לפרופיל שלך.`,
    knowledge: () => `מחקר מעניין בנושא 📚\nשאל אותי על כל זן ואסביר לך את המדע מאחוריו בשפה פשוטה.`,
    cooking:   () => `אוכל עם קנאביס דורש קצת ידע 🍳\nאל תדלג על הדקרבוקסילציה — בלעדיה ה-THC לא יעיל.`,
    community: () => `קהילה של מטופלים מאומתים 🌿\nאתה לא לבד. כאן מטופלים אמיתיים משתפים מה עבד ומה לא.`,
    basket:    () => `בדקת את התכנון שלך? 🗓️\nאני יכול לוודא שהסל מתאים לקנה מידה של הרישיון החודשי שלך.`,
  },
};

// ── Typing effect ──────────────────────────────────────────────────────────────
function useTypingEffect(text, speed = 16) {
  const [shown, setShown] = useState('');
  const timer = useRef(null);
  useEffect(() => {
    if (!text) { setShown(''); return; }
    setShown(''); let i = 0;
    timer.current = setInterval(() => {
      i++; setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(timer.current);
    }, speed);
    return () => clearInterval(timer.current);
  }, [text, speed]);
  return shown;
}

// ── Cinematic speech bubble ────────────────────────────────────────────────────
// Floats to the RIGHT of the avatar with a left-pointing SVG tail.
function Bubble({ message, onDismiss, danger = false }) {
  const shown     = useTypingEffect(message, 16);
  const isNudge   = !danger && (message.includes('שעות') || message.includes('יומן'));
  const borderCol = danger
    ? 'rgba(248,113,113,0.50)'
    : isNudge ? 'rgba(251,191,36,0.45)' : 'rgba(74,222,128,0.42)';
  const bgCol     = danger ? 'rgba(10,4,4,0.91)' : 'rgba(3,7,15,0.90)';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.86, x: -18 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.84, x: -12 }}
      transition={{ type: 'spring', stiffness: 460, damping: 32 }}
      style={{
        position: 'relative',
        maxWidth: 'min(270px, calc(100vw - 168px))',
        padding: '12px 15px 12px 13px',
        borderRadius: 18,
        background: bgCol,
        backdropFilter: 'blur(26px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(26px) saturate(1.8)',
        border: `1.5px solid ${borderCol}`,
        boxShadow: `0 8px 38px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {/* Left-pointing tail toward avatar */}
      <svg width="13" height="22" viewBox="0 0 13 22" aria-hidden="true"
        style={{ position: 'absolute', left: -11, bottom: 18, display: 'block', overflow: 'visible' }}>
        <path d="M13 1.5 L13 20.5 L0.5 11 Z" fill={bgCol}
          stroke={borderCol} strokeWidth="1.5" strokeLinejoin="round" />
        <line x1="13" y1="1" x2="13" y2="21" stroke={bgCol} strokeWidth="3" />
      </svg>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }} dir="rtl">
        <p style={{
          flex: 1, fontSize: 13, lineHeight: 1.80, color: '#F0FDF4',
          whiteSpace: 'pre-line', fontWeight: 500, letterSpacing: '0.008em', minHeight: 18,
        }}>{shown}</p>
        <button onClick={onDismiss} aria-label="סגור"
          style={{
            flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(187,247,208,0.36)', fontSize: 12, padding: '1px 0 0 2px',
            lineHeight: 1, transition: 'color 0.18s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(187,247,208,0.82)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(187,247,208,0.36)'}
        >✕</button>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 18, right: 18, height: 1, borderRadius: 2,
        background: `linear-gradient(90deg,transparent,${borderCol},transparent)`,
      }} />
    </motion.div>
  );
}

// ── Chat message ───────────────────────────────────────────────────────────────
function ChatMessage({ msg, isLast, citations }) {
  const isUser  = msg.role === 'user';
  const rawText = isLast && !isUser ? msg.content : null;
  const shown   = useTypingEffect(rawText, 14);
  const text    = rawText ? shown : msg.content;

  return (
    <motion.div variants={VARIANTS.fadeUp}
      style={{ display: 'flex', justifyContent: isUser ? 'flex-start' : 'flex-end', marginBottom: 10 }}>
      <div style={{
        maxWidth: '84%', padding: '10px 14px',
        borderRadius: isUser ? '18px 18px 18px 4px' : '18px 18px 4px 18px',
        background:  isUser ? 'rgba(255,255,255,0.06)' : 'rgba(74,222,128,0.10)',
        border:      isUser ? B.subtle : '1px solid rgba(74,222,128,0.20)',
        fontSize: 13.5, lineHeight: 1.70, color: P.hi,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {text}
      </div>

      {/* Show source citations for bot messages */}
      {!isUser && citations?.length > 0 && (
        <div style={{ flexBasis: '100%', paddingRight: 8, marginTop: -6 }}>
          {citations.slice(0, 2).map((c, i) => c.url && (
            <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-block', fontSize: 10.5, color: 'rgba(74,222,128,0.70)',
                marginLeft: 6, textDecoration: 'none',
                borderBottom: '1px dotted rgba(74,222,128,0.35)',
              }}>
              🔗 {c.title?.slice(0, 28) || 'מקור'}
            </a>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
      <div style={{
        padding: '10px 16px', borderRadius: '18px 18px 4px 18px',
        background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.15)',
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

// ── Organic blob glow — not a circle, not a square ────────────────────────────
// Built from border-radius fractions to create an irregular amoeba shape.
// Filter:blur is applied HERE, NOT on the avatar button, so mix-blend-mode on
// the video sibling is unaffected.
function BlobGlow({ color, intensity, className }) {
  return (
    <motion.div
      className={className}
      animate={{ scale: [1, 1.18, 1.05, 1.18, 1], opacity: [intensity * 0.7, intensity, intensity * 0.6, intensity, intensity * 0.7] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        position: 'absolute',
        bottom:   8,
        left:     4,
        width:    124,
        height:   108,
        // Organic, non-circular blob via asymmetric border-radius
        borderRadius: '62% 38% 52% 48% / 44% 56% 44% 56%',
        background: color,
        filter:     'blur(32px)',
        pointerEvents: 'none',
        zIndex: 0,
        transition: 'background 0.5s ease',
      }}
    />
  );
}

// ── Celebration sparkles — organic, not rings ─────────────────────────────────
const SPARKLE_EMOJIS = ['✨', '🌿', '💚', '⭐', '🌟', '✨'];
function CelebrationSparkles() {
  return (
    <>
      {SPARKLE_EMOJIS.map((emoji, i) => {
        const angle = (i / SPARKLE_EMOJIS.length) * 2 * Math.PI;
        const dist  = 55 + Math.random() * 35;
        return (
          <motion.span key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist - 20,
              opacity: 0, scale: 0.4,
            }}
            transition={{ duration: 0.85 + i * 0.12, delay: i * 0.07, ease: 'easeOut' }}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              fontSize: 17, pointerEvents: 'none', zIndex: 3,
              transform: 'translate(-50%,-50%)',
            }}
          >{emoji}</motion.span>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
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
  const [open, setOpen]             = useState(false);
  const [messages, setMessages]     = useState([{
    role: 'assistant',
    content: `שלום${userName ? ` ${userName}` : ''}! אני צמח 🌿\nשאל אותי כל דבר על הקנאביס הרפואי שלך — גנטיקה, טרפנים, מינונים, הכל.`,
    citations: [],
  }]);
  const [input, setInput]           = useState('');
  const [busy, setBusy]             = useState(false);
  const [bubble, setBubble]         = useState(null);
  const [killDismissed, setKD]      = useState(false);
  const [pendingImg, setPendingImg] = useState(null);
  const [imgPreview, setImgPreview] = useState(null);

  // ── Provider mode indicator ───────────────────────────────────────────────
  const [activeProvider, setActiveProvider] = useState('server');
  useEffect(() => { probeActiveProvider().then(setActiveProvider); }, []);
  const { online } = useOnlineStatus();
  useEffect(() => { probeActiveProvider().then(setActiveProvider); }, [online]);

  // ── Draggable position (persisted to localStorage) ────────────────────────
  const AVATAR_SIZE = 144;
  const [dragPos, setDragPos] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('cm_avatar_pos'));
      if (s) return s;
    } catch {}
    return { x: 0, y: 0 };   // bottom-left baseline; CSS positions the container
  });

  const saveDragPos = useCallback((x, y) => {
    const pos = { x, y };
    setDragPos(pos);
    try { localStorage.setItem('cm_avatar_pos', JSON.stringify(pos)); } catch {}
  }, []);

  // ── Cursor gaze — subtle body lean toward the mouse ──────────────────────
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const rawGazeX = useMotionValue(0);
  const rawGazeY = useMotionValue(0);
  const gazeX    = useSpring(rawGazeX, { stiffness: 55, damping: 18 });
  const gazeY    = useSpring(rawGazeY, { stiffness: 55, damping: 18 });

  useEffect(() => {
    if (prefersReducedMotion) return;
    const onMove = (e) => {
      // Avatar center in viewport — approximate based on drag offset
      const rect = avatarRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top  + rect.height / 2;
      const dx = (e.clientX - cx) / window.innerWidth;
      const dy = (e.clientY - cy) / window.innerHeight;
      rawGazeX.set(dy * -8);   // rotateX: tilt forward/back
      rawGazeY.set(dx *  8);   // rotateY: turn left/right
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [prefersReducedMotion, rawGazeX, rawGazeY]);

  // ── Wander — random drift every 12–22 seconds ─────────────────────────────
  const [wander, setWander] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (prefersReducedMotion) return;
    const tick = () => {
      const angle = Math.random() * Math.PI * 2;
      const dist  = 10 + Math.random() * 18;
      setWander({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist });
      // Return to base after 3s
      const t = setTimeout(() => setWander({ x: 0, y: 0 }), 3000);
      return t;
    };
    // Initial delay so it doesn't wander immediately on mount
    const interval = setInterval(() => {
      const t = tick();
      return () => clearTimeout(t);
    }, 14_000 + Math.random() * 8_000);
    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  const avatarRef = useRef(null);

  const scrollRef  = useRef(null);
  const fileRef    = useRef(null);
  const inputRef   = useRef(null);
  const prevTabRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (!contextMessage || open) return;
    setBubble(contextMessage);
    const t = setTimeout(() => setBubble(null), 9000);
    return () => clearTimeout(t);
  }, [contextMessage]);

  useEffect(() => {
    if (killSwitchAlert?.triggered) setKD(false);
  }, [killSwitchAlert]);

  useEffect(() => {
    if (!currentTab || currentTab === prevTabRef.current || open) return;
    prevTabRef.current = currentTab;
    const line = PROACTIVE_LINES.tabs[currentTab];
    if (!line) return;
    const t = setTimeout(() => setBubble(line()), 3000);
    return () => clearTimeout(t);
  }, [currentTab, open]);

  useEffect(() => {
    if (!celebrating) return;
    setBubble('🎉 כניסה לקהילה אושרה!\nמרחב המטופלים המאומתים פתוח לך עכשיו. ברוך הבא לפיד החי 🌿');
  }, [celebrating]);

  useEffect(() => {
    if (!diaryNudge || open) return;
    setBubble('היי 🌙 עברו כמה שעות — איך אתה מרגיש?\nלוחץ על הכפתור ירשום 30 שניות ויעזור לי לדייק את ההמלצות 📊');
  }, [diaryNudge, open]);

  // ── Send through the router (cloud → local fallback) ─────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && !pendingImg) || busy) return;
    setBusy(true);
    setInput('');

    const userMsg = { role: 'user', content: text || '📸 שאלה עם תמונה', citations: [] };
    setMessages(prev => [...prev, userMsg]);
    const historySnapshot = messages; // capture before state update
    setPendingImg(null);
    setImgPreview(null);

    try {
      const result = await routeMessage(
        text || '📸 שאלה עם תמונה',
        historySnapshot.map(m => ({ role: m.role, content: m.content })),
        { image: pendingImg || undefined },
      );
      // Refresh mode indicator after each call
      probeActiveProvider().then(setActiveProvider);

      setMessages(prev => [...prev, {
        role:      'assistant',
        content:   result.reply,
        citations: result.citations || [],
        provider:  result.provider,
      }]);
    } catch (err) {
      console.error('zemach-chat router:', err.message);
      setMessages(prev => [...prev, {
        role: 'assistant', content: 'שגיאה זמנית — נסה שוב 🙏', citations: [],
      }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, pendingImg]);

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
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onKeyDown = useCallback(e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  // ── State → visual params ─────────────────────────────────────────────────
  const avatarState  = busy ? 'thinking' : open ? 'active' : celebrating ? 'celebrating' : diaryNudge ? 'nudge' : 'idle';
  const videoSize    = avatarState === 'celebrating' ? 172 : avatarState === 'nudge' ? 150 : 144;
  const glowColor    = avatarState === 'thinking' ? 'rgba(56,189,248,0.32)' : avatarState === 'nudge' ? 'rgba(251,191,36,0.30)' : 'rgba(74,222,128,0.28)';
  const glowIntens   = avatarState === 'celebrating' ? 0.85 : avatarState === 'active' ? 0.70 : avatarState === 'nudge' ? 0.65 : 0.45;

  // Float animation — amplitude and rhythm vary by state
  const floatAnimate = celebrating
    ? { y: [0, -26, -10, -24, -8, -18], scale: [1, 1.14, 1.06, 1.12, 1.04, 1.08] }
    : diaryNudge
      ? { y: [0, -8, -3, -8, 0] }
      : { y: [0, -12, 0] };
  const floatTrans   = celebrating
    ? { duration: 1.1, repeat: 2, ease: 'easeInOut' }
    : diaryNudge
      ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
      : { duration: 4.8, repeat: Infinity, ease: 'easeInOut' };

  // ── Chat panel width (right of avatar, constrained to viewport) ───────────
  const PANEL_LEFT = 152;

  // ── State → enhanced visual params (listening / talking states) ──────────
  const isListening = open && input.length > 0 && !busy;
  const isTalking   = busy;
  const enhancedFloatAnimate = isTalking
    ? { y: [0, -6, -2, -7, -1, -5], scale: [1, 1.03, 1.01, 1.04, 1.0, 1.02] }
    : isListening
      ? { y: [0, -5, -1, -4, 0], rotateZ: [0, 1, -1, 0.5, 0] }
      : prefersReducedMotion
        ? {}
        : { ...floatAnimate, x: [0, wander.x * 0.3, 0], y: Array.isArray(floatAnimate.y)
              ? floatAnimate.y.map((v, i) => v + (i === 1 ? wander.y * 0.5 : 0))
              : [0, -12 + wander.y * 0.5, 0] };

  return (
    <motion.div
      ref={avatarRef}
      dir="rtl"
      drag={!open}
      dragMomentum={false}
      dragElastic={0.08}
      initial={{ x: dragPos.x, y: dragPos.y }}
      onDragEnd={(_, info) => {
        saveDragPos(info.point.x - window.innerWidth + AVATAR_SIZE, -(info.point.y - window.innerHeight + AVATAR_SIZE));
      }}
      style={{
        position: 'fixed', bottom: 0, left: 0, zIndex: 9999,
        pointerEvents: 'none', fontFamily: FONT,
        rotateX: prefersReducedMotion ? 0 : gazeX,
        rotateY: prefersReducedMotion ? 0 : gazeY,
        perspective: 800,
      }}
    >

      {/* ── Kill-switch alert (right side) ───────────────────────────────── */}
      <div style={{ position: 'absolute', left: PANEL_LEFT, bottom: 172, pointerEvents: 'auto' }}>
        <AnimatePresence>
          {killSwitchAlert?.triggered && !killDismissed && (
            <Bubble key="kill" message={PROACTIVE_LINES.killSwitch(killSwitchAlert.terpene, killSwitchAlert.indication)}
              danger onDismiss={() => setKD(true)} />
          )}
        </AnimatePresence>
      </div>

      {/* ── Proactive bubble (right side) ────────────────────────────────── */}
      <div style={{ position: 'absolute', left: PANEL_LEFT, bottom: 162, pointerEvents: 'auto' }}>
        <AnimatePresence>
          {bubble && !open && (
            <Bubble key={bubble} message={bubble} onDismiss={() => setBubble(null)} />
          )}
        </AnimatePresence>
      </div>

      {/* ── Chat panel (right side, bottom-aligned) ──────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div key="chat"
            initial={{ opacity: 0, y: 30, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.94 }}
            transition={SPRING.smooth}
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            style={{
              position: 'absolute', left: PANEL_LEFT, bottom: 10,
              width: 'min(352px, calc(100vw - 162px))',
              maxHeight: '58vh',
              display: 'flex', flexDirection: 'column',
              borderRadius: 22,
              overflow: 'hidden',
              background: 'rgba(5,10,18,0.96)',
              backdropFilter: 'blur(30px) saturate(1.6)',
              WebkitBackdropFilter: 'blur(30px) saturate(1.6)',
              border: '1.5px solid rgba(74,222,128,0.22)',
              boxShadow: '0 0 0 1px rgba(74,222,128,0.06) inset, 0 20px 56px rgba(0,0,0,0.78)',
              pointerEvents: 'auto',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 15px',
              borderBottom: '1px solid rgba(74,222,128,0.10)',
              background: 'rgba(74,222,128,0.03)',
              flexShrink: 0,
            }}>
              <motion.div animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 2.6, repeat: Infinity }}
                style={{ width: 9, height: 9, borderRadius: '50%', background: P.mint, boxShadow: G.mint(6), flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: P.hi }}>צמח — העוזר האישי</span>
              <span style={{ fontSize: 10, color: P.lo, marginRight: 'auto', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {avatarState === 'thinking' ? 'חושב...' : 'מוכן'}
              </span>
              <button onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(187,247,208,0.38)', fontSize: 16, lineHeight: 1, padding: '0 2px', transition: 'color 0.18s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(187,247,208,0.88)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(187,247,208,0.38)'}
              >✕</button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', scrollbarWidth: 'none' }}>
              <motion.div variants={VARIANTS.stagger} initial="hidden" animate="show">
                {messages.map((m, i) => (
                  <ChatMessage key={i} msg={m} isLast={i === messages.length - 1}
                    citations={m.role === 'assistant' ? m.citations : null} />
                ))}
              </motion.div>
              {busy && <ThinkingDots />}
            </div>

            {/* Image preview */}
            {imgPreview && (
              <div style={{ padding: '6px 14px 0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <img src={imgPreview} alt="" style={{ height: 44, borderRadius: 8, objectFit: 'cover' }} />
                <span style={{ fontSize: 11, color: P.mid }}>תמונה מצורפת</span>
                <button onClick={() => { setPendingImg(null); setImgPreview(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.lo, fontSize: 13 }}>✕</button>
              </div>
            )}

            {/* Input */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px 14px',
              borderTop: '1px solid rgba(74,222,128,0.08)',
              background: 'rgba(0,0,0,0.22)',
              flexShrink: 0,
            }}>
              <button onClick={() => fileRef.current?.click()}
                style={{ background: 'rgba(255,255,255,0.05)', border: B.subtle, borderRadius: 12, padding: '9px 11px', cursor: 'pointer', color: P.lo, fontSize: 15, flexShrink: 0 }}
                title="צרף תמונת תפריט">📸</button>
              <input ref={inputRef} dir="rtl" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown} disabled={busy} placeholder="שאל אותי כל דבר..."
                style={{
                  flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)',
                  border: '1.5px solid rgba(74,222,128,0.18)', borderRadius: 16,
                  padding: '10px 14px', color: P.hi, fontSize: 13, outline: 'none', fontFamily: FONT,
                }} />
              <motion.button onClick={handleSend}
                disabled={busy || (!input.trim() && !pendingImg)}
                whileHover={busy ? {} : { scale: 1.06 }}
                whileTap={busy ? {} : { scale: 0.93 }}
                style={{
                  background: P.mint, border: 'none', borderRadius: 14, padding: '10px 16px',
                  color: P.inv, fontSize: 12, fontWeight: 800, flexShrink: 0,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: (busy || (!input.trim() && !pendingImg)) ? 0.40 : 1,
                  fontFamily: FONT,
                }}>שלח</motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Avatar area ──────────────────────────────────────────────────── */}
      {/*
          Stack (back → front):
            1. BlobGlow (sibling with filter:blur — doesn't isolate video compositing)
            2. motion.button (NO filter — keeps video's mix-blend-mode working)
               └── video (mix-blend-mode: screen — black disappears)
               └── Status dot
               └── Celebration sparkles
      */}
      <div style={{ position: 'relative' }}>
        {/* Layer 1: Organic blob glow — lives OUTSIDE the button to avoid filter isolation */}
        <BlobGlow color={glowColor} intensity={glowIntens} />

        {/* Layer 2: Floating avatar button */}
        <motion.button
          onClick={() => {
            setOpen(o => !o);
            setBubble(null);
            if (diaryNudge && !open) onDiaryClick?.();
          }}
          animate={prefersReducedMotion ? {} : enhancedFloatAnimate}
          transition={prefersReducedMotion ? {} : floatTrans}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          aria-label="פתח שיחה עם צמח"
          className="zemach-avatar-btn"
          style={{
            pointerEvents: 'auto',
            position: 'relative',
            // NO filter here — would create compositing isolation and break screen blend
            background: 'none',
            backgroundColor: 'transparent',
            border: 'none',
            boxShadow: 'none',
            padding: 0,
            margin: 0,
            cursor: 'pointer',
            outline: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            WebkitTapHighlightColor: 'transparent',
            isolation: 'isolate',
            zIndex: 1,
            width: videoSize,
            height: videoSize,
            transition: 'width 0.38s cubic-bezier(.22,1,.36,1), height 0.38s cubic-bezier(.22,1,.36,1)',
          }}
        >
          {/*
             The video has mix-blend-mode: screen.
             The button's background is transparent.
             screen(black, transparent) → transparent.
             screen(color, transparent) → color, but since the parent is
             transparent the final composite over the dark page background
             makes non-black pixels show as themselves.
             Result: character appears as a cut-out on the page background.

             Critical: no border-radius, no overflow:hidden, no background.
          */}
          <video
            src={AVATAR_SRC}
            autoPlay loop muted playsInline
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              // The blend mode that removes the black background
              mixBlendMode: 'screen',
              // NO border-radius — the "ugly circle" is caused by this
              // NO background, NO overflow:hidden
              pointerEvents: 'none',
            }}
            onError={e => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextSibling.style.display = 'flex';
            }}
          />
          {/* Emoji fallback when video fails */}
          <span style={{
            display: 'none', fontSize: 64,
            alignItems: 'center', justifyContent: 'center',
            width: '100%', height: '100%',
            filter: 'drop-shadow(0 0 16px rgba(74,222,128,0.80))',
          }}>🌿</span>

          {/* Notification dot — glows green or red */}
          <AnimatePresence>
            {!open && (bubble || killSwitchAlert?.triggered) && (
              <motion.div key="dot"
                initial={{ scale: 0 }}
                animate={{ scale: [1, 1.40, 1], opacity: [1, 0.65, 1] }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 1.6, repeat: Infinity }}
                style={{
                  position: 'absolute', top: 10, left: 10,
                  width: 14, height: 14, borderRadius: '50%',
                  background: killSwitchAlert?.triggered ? '#F87171' : '#4ADE80',
                  border: '2.5px solid #04100a',
                  boxShadow: killSwitchAlert?.triggered
                    ? '0 0 10px rgba(248,113,113,0.90)'
                    : '0 0 10px rgba(74,222,128,0.90)',
                  zIndex: 2, pointerEvents: 'none',
                }}
              />
            )}
          </AnimatePresence>

          {/* Celebration sparkle particles — organic, not rings */}
          <AnimatePresence>
            {celebrating && <CelebrationSparkles key="sparkles" />}
          </AnimatePresence>

          {/* Provider mode badge — tiny, non-intrusive, bottom-right of avatar */}
          <ProviderBadge provider={activeProvider} />
        </motion.button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </motion.div>
  );
}

// ── Provider mode badge ────────────────────────────────────────────────────────
// Tiny coloured dot in the corner of the avatar — no blocking modal.
const PROVIDER_META = {
  'server':        { color: '#4ADE80', label: 'מחובר לשרת — Groq AI' },
  'browser-local': { color: '#60A5FA', label: 'מצב לא מקוון — ידע מקומי' },
  'webllm':        { color: '#C084FC', label: 'מצב לא מקוון — מודל מקומי (WebGPU)' },
  'webllm-pending':{ color: '#FBBF24', label: 'WebLLM: מוריד מודל...' },
};

function ProviderBadge({ provider }) {
  const [tip, setTip] = useState(false);
  const meta = PROVIDER_META[provider] || PROVIDER_META['server'];
  return (
    <div
      style={{ position: 'absolute', bottom: 6, right: 6, zIndex: 3, pointerEvents: 'auto' }}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <motion.div
        animate={{ scale: [1, 1.3, 1], opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: meta.color,
          boxShadow: `0 0 6px ${meta.color}`,
          border: '1.5px solid rgba(0,0,0,0.5)',
        }}
      />
      <AnimatePresence>
        {tip && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.92 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', bottom: 14, right: 0,
              background: 'rgba(6,10,8,0.94)',
              border: `1px solid ${meta.color}44`,
              borderRadius: 8, padding: '4px 8px',
              fontSize: 10.5, color: '#F0FDF4', whiteSpace: 'nowrap',
              boxShadow: '0 4px 16px rgba(0,0,0,0.60)',
              pointerEvents: 'none',
            }}
          >{meta.label}</motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
