// ─────────────────────────────────────────────────────────────────────────────
//  CannaMatch — Zemach: The Empathetic Life-Guide
//
//  Zemach is not just a chatbot. He is a warm, knowledgeable peer ("חבר")
//  who accompanies users throughout their medical cannabis journey.
//
//  Architecture:
//  • Floating avatar (bottom-left) with smooth idle float animation
//  • Proactive contextual bubbles — fires based on `contextMessage` prop
//  • Kill-switch alerts — warm Hebrew warning when a dangerous terpene triggers
//  • Full chat panel — multi-turn conversation with the backend
//  • Image support — menu photo analysis via the chat
//
//  Props:
//    contextMessage  — external trigger: Zemach reacts to app state changes
//    killSwitchAlert — { triggered, terpene, indication, message }
//    userName        — personalized greeting
//    onImageAnalyze  — callback when user drops an image
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { P, G, B, SPRING, VARIANTS, FONT } from '../styles/ds.js';

// ── Avatar asset — video with emoji fallback ──────────────────────────────────
const AVATAR_SRC = '/zemach-avatar.mp4';

// ── Zemach personality: pre-scripted contextual lines ────────────────────────
const PROACTIVE_LINES = {
  welcome:     (name) => `שלום${name ? ` ${name}` : ''}, ברוכים הבאים 🌿\nאני צמח — כאן בשבילך בכל שאלה על הקנאביס הרפואי שלך. תשאל, אני יודע.`,
  returning:   (name) => `איזה כיף שחזרת${name ? `, ${name}` : ''}! 🌿\nבדקתי — יש כמה זנים חדשים בתפריט שמתאימים לפרופיל שלך ממש טוב.`,
  highMatch:   (strain) => `מצאתי לך גביע! ✨ ${strain} — ${Math.floor(85 + Math.random() * 13)}% התאמה. הגנטיקה שלו כמו מותאמת בשבילך.`,
  lowData:     () => `ה-DNA שלך עוד מתגבש 🧬\nדרג כמה זנים שניסית — ואני אהפוך את ההמלצות מדויקות בהרבה.`,
  newMenu:     () => `תפריט חדש מחכה לניתוח 📸\nגרור תמונה לכאן ואני אפענח לך כל זן תוך שניות.`,
  anxiety:     () => `שמתי לב שסמנת חרדה 🛡️\nחסמתי לך זנים מסוכנים עם טרפינולן גבוה — הראש שלך בידיים טובות.`,
  nighttime:   () => `לילה טוב 🌙\nמציע לך לסנן ל"זנים לשינה" — מירצן ולינלול הם מה שאתה צריך עכשיו.`,
  killSwitch:  (terp, ind) => `רגע, עצרתי הכל 🛑\nהזן הזה עמוס ב${terp} — וזה בדיוק מה שמדליק לך את ה${ind}. הורדתי אותו מהמסך שלך. אתה בידיים טובות, חבר 💚`,
};

// ── Typing animation hook ─────────────────────────────────────────────────────
function useTypingEffect(fullText, speed = 16) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!fullText) { setDisplayed(''); setDone(true); return; }
    setDisplayed('');
    setDone(false);
    let i = 0;
    timerRef.current = setInterval(() => {
      i++;
      setDisplayed(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(timerRef.current);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [fullText, speed]);

  return { displayed, done };
}

// ── Proactive bubble ──────────────────────────────────────────────────────────
function ProactiveBubble({ message, onDismiss }) {
  const { displayed } = useTypingEffect(message, 18);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.92 }}
      transition={SPRING.gentle}
      style={{
        maxWidth: 280,
        padding: '14px 16px',
        borderRadius: 20,
        borderBottomLeftRadius: 6,
        background: 'rgba(12,13,17,0.92)',
        backdropFilter: 'blur(20px)',
        border: `1.5px solid rgba(74,222,128,0.22)`,
        boxShadow: `${G.mint(12)}, 0 8px 32px rgba(0,0,0,0.55)`,
        marginBottom: 10,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <p style={{
          fontSize: 13, lineHeight: 1.7, color: P.hi,
          whiteSpace: 'pre-line', minHeight: 20,
        }}>
          {displayed}
        </p>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: P.lo, fontSize: 14, padding: '0 0 0 4px',
            flexShrink: 0, marginTop: -2,
          }}
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}

// ── Kill-switch alert ────────────────────────────────────────────────────────
function KillSwitchAlert({ alert, onDismiss }) {
  if (!alert?.triggered) return null;
  const msg = PROACTIVE_LINES.killSwitch(alert.terpene, alert.indication);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10 }}
      transition={SPRING.gentle}
      style={{
        maxWidth: 300,
        padding: '14px 16px',
        borderRadius: 20,
        borderBottomLeftRadius: 6,
        background: 'rgba(12,5,5,0.95)',
        backdropFilter: 'blur(20px)',
        border: `1.5px solid rgba(248,113,113,0.40)`,
        boxShadow: `${G.rose(14)}, 0 8px 32px rgba(0,0,0,0.65)`,
        marginBottom: 10,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>🛑</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: P.hi, whiteSpace: 'pre-line' }}>
            {msg}
          </p>
          {alert.companionMessage && (
            <p style={{ fontSize: 11, color: 'rgba(248,113,113,0.85)', marginTop: 6 }}>
              {alert.companionMessage}
            </p>
          )}
          <button
            onClick={onDismiss}
            style={{
              marginTop: 10, padding: '6px 14px', borderRadius: 10,
              background: 'rgba(248,113,113,0.15)',
              border: `1px solid rgba(248,113,113,0.35)`,
              color: P.danger, fontSize: 11, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            הבנתי, תודה 💚
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Chat message ──────────────────────────────────────────────────────────────
function ChatMessage({ msg, isLast }) {
  const isUser = msg.role === 'user';
  const { displayed } = useTypingEffect(
    isLast && !isUser ? msg.content : null, 14
  );
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
        background: isUser
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(74,222,128,0.10)',
        border: isUser
          ? B.subtle
          : `1px solid rgba(74,222,128,0.20)`,
        fontSize: 13.5,
        lineHeight: 1.65,
        color: P.hi,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {text}
      </div>
    </motion.div>
  );
}

// ── Thinking indicator ────────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div style={{
      display: 'flex', justifyContent: 'flex-end', marginBottom: 10,
    }}>
      <div style={{
        padding: '10px 16px', borderRadius: '18px 18px 4px 18px',
        background: 'rgba(74,222,128,0.08)',
        border: `1px solid rgba(74,222,128,0.15)`,
        display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            style={{ width: 7, height: 7, borderRadius: '50%', background: P.sage }}
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
            transition={{ duration: 1.1, delay: i * 0.18, repeat: Infinity }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Zemach component ─────────────────────────────────────────────────────
export default function ZemachAvatarChat({
  contextMessage,
  killSwitchAlert,
  userName,
  onImageAnalyze,
}) {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState([{
    role: 'assistant',
    content: `שלום${userName ? ` ${userName}` : ''}! אני צמח 🌿\nשאל אותי כל דבר על הקנאביס הרפואי שלך — גנטיקה, טרפנים, מינונים, כל דבר.`,
  }]);
  const [input, setInput]         = useState('');
  const [busy, setBusy]           = useState(false);
  const [bubble, setBubble]       = useState(null);
  const [killDismissed, setKillDismissed] = useState(false);
  const [pendingImg, setPendingImg] = useState(null);
  const [imgPreview, setImgPreview] = useState(null);

  const scrollRef  = useRef(null);
  const fileRef    = useRef(null);
  const inputRef   = useRef(null);

  // Scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  // Show contextual proactive bubble
  useEffect(() => {
    if (!contextMessage || open) return;
    setBubble(contextMessage);
    const t = setTimeout(() => setBubble(null), 8000);
    return () => clearTimeout(t);
  }, [contextMessage]);

  // Reset kill-switch dismissed state when alert changes
  useEffect(() => {
    if (killSwitchAlert?.triggered) setKillDismissed(false);
  }, [killSwitchAlert]);

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
ענה תמיד בעברית, בטון חם ובגובה העיניים — כמו חבר מנוסה.
אל תיתן ייעוץ רפואי. הפנה תמיד לרופא לגבי החלטות טיפוליות.
שם המשתמש${userName ? ` הוא ${userName}` : ' לא ידוע'}.`,
        messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        ...(pendingImg ? {
          messages: [
            ...nextHistory.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
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

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const reply = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n') || 'מצטער, לא הצלחתי לענות כרגע — נסה שוב בעוד רגע.';

      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant', content: 'שגיאת חיבור — בדקו אינטרנט ונסו שוב 🙏',
      }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, pendingImg, userName]);

  const handleFile = useCallback((file) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      setPendingImg({ data: base64, type: file.type });
      setImgPreview(e.target.result);
      onImageAnalyze?.(base64, file.type);
    };
    reader.readAsDataURL(file);
  }, [onImageAnalyze]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  // ── Avatar glow & state
  const avatarState = busy ? 'thinking' : open ? 'active' : 'idle';
  const glowColor   = avatarState === 'thinking' ? '#38bdf8' : P.mint;

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed', bottom: 0, left: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        fontFamily: FONT,
        pointerEvents: 'none',
      }}
    >
      {/* Kill-switch alert */}
      <div style={{ pointerEvents: 'auto' }}>
        <AnimatePresence>
          {killSwitchAlert?.triggered && !killDismissed && (
            <KillSwitchAlert
              key="kill"
              alert={killSwitchAlert}
              onDismiss={() => setKillDismissed(true)}
            />
          )}
        </AnimatePresence>

        {/* Proactive bubble */}
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

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 30, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.93 }}
            transition={SPRING.smooth}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            style={{
              pointerEvents: 'auto',
              width: '88vw', maxWidth: 360,
              maxHeight: '55vh',
              display: 'flex', flexDirection: 'column',
              borderRadius: 24,
              overflow: 'hidden',
              background: 'rgba(10,13,17,0.95)',
              backdropFilter: 'blur(24px)',
              border: `1.5px solid rgba(74,222,128,0.20)`,
              boxShadow: `${G.mint(16)}, 0 16px 48px rgba(0,0,0,0.70)`,
              marginBottom: 12,
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px',
              borderBottom: `1px solid rgba(74,222,128,0.10)`,
              background: 'rgba(74,222,128,0.04)',
              flexShrink: 0,
            }}>
              <motion.div
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 2.2, repeat: Infinity }}
                style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: P.mint,
                  boxShadow: G.mint(6),
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: P.hi }}>
                צמח — העוזר האישי
              </span>
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
                  color: P.lo, fontSize: 16, padding: '0 2px',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              style={{
                flex: 1, overflowY: 'auto', padding: '14px 14px 6px',
                scrollbarWidth: 'none',
              }}
            >
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
              }}>
                <img src={imgPreview} alt=""
                  style={{ height: 44, borderRadius: 8, objectFit: 'cover' }} />
                <span style={{ fontSize: 11, color: P.mid }}>תמונה מצורפת</span>
                <button
                  onClick={() => { setPendingImg(null); setImgPreview(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                           color: P.lo, fontSize: 13 }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Input row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px 14px',
              borderTop: `1px solid rgba(74,222,128,0.08)`,
              background: 'rgba(0,0,0,0.20)',
              flexShrink: 0,
            }}>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: B.subtle,
                  borderRadius: 12, padding: '9px 11px',
                  cursor: 'pointer', color: P.lo, fontSize: 15,
                  flexShrink: 0,
                }}
                title="צרף תמונת תפריט"
              >
                📸
              </button>
              <input
                ref={inputRef}
                dir="rtl"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={busy}
                placeholder="שאל אותי כל דבר..."
                style={{
                  flex: 1, minWidth: 0,
                  background: 'rgba(255,255,255,0.05)',
                  border: `1.5px solid rgba(74,222,128,0.18)`,
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
                whileTap={busy ? {} : { scale: 0.94 }}
                style={{
                  background: P.mint, border: 'none',
                  borderRadius: 14, padding: '10px 16px',
                  color: P.inv, fontSize: 12, fontWeight: 800,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: (busy || (!input.trim() && !pendingImg)) ? 0.40 : 1,
                  flexShrink: 0,
                }}
              >
                שלח
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar button */}
      <motion.button
        onClick={() => { setOpen((o) => !o); setBubble(null); }}
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 4.0, repeat: Infinity, ease: 'easeInOut' }}
        whileHover={{ scale: 1.10, rotate: -3 }}
        whileTap={{ scale: 0.92 }}
        aria-label="פתח שיחה עם צמח"
        style={{
          pointerEvents: 'auto',
          width: 128, height: 128,
          background: 'none', border: 'none',
          cursor: 'pointer', outline: 'none', padding: 0,
          filter: `drop-shadow(0 14px 22px rgba(0,0,0,0.5))
                   drop-shadow(0 0 ${avatarState === 'thinking' ? 22 : 12}px ${glowColor}${avatarState === 'idle' ? '40' : '70'})`,
          transition: 'filter 0.5s ease',
        }}
      >
        <video
          src={AVATAR_SRC}
          autoPlay loop muted playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', borderRadius: 16 }}
          onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='flex'; }}
        />
        <span style={{ display:'none', fontSize:72, alignItems:'center', justifyContent:'center', width:'100%', height:'100%' }}>🌿</span>

        {/* Status dot */}
        <AnimatePresence>
          {!open && (bubble || killSwitchAlert?.triggered) && (
            <motion.div
              key="dot"
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
              exit={{ scale: 0 }}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{
                position: 'absolute', top: 10, left: 6,
                width: 14, height: 14, borderRadius: '50%',
                background: killSwitchAlert?.triggered ? P.danger : P.mint,
                border: `2.5px solid ${P.void}`,
                boxShadow: killSwitchAlert?.triggered ? G.rose(8) : G.mint(8),
              }}
            />
          )}
        </AnimatePresence>
      </motion.button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
