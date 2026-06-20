# CannaMatch 🌿

> **The precision cannabis matching platform built for verified medical patients in Israel.**
> Powered by a proprietary botanical intelligence engine — not commercial names.

---

## What Is CannaMatch?

The Israeli cannabis market offers hundreds of strains, each sold under marketing names that reveal nothing about actual effect, chemistry, or personal fit. Patients aged 21 to 80 walk into a pharmacy with a valid prescription and are handed a catalogue of brand names with no meaningful guidance.

**CannaMatch cuts through this entirely.**

Rather than searching by strain name, users complete a gentle, non-intrusive preference flow — then receive a ranked list of strains from every licensed pharmacy in Israel, each scored against their personal botanical fingerprint. The system calculates a live **DNA Match %** for each product, derived purely from the patient's expressed cannabis preferences and sensory profile.

No medical questionnaires. No clinical diagnoses. No stigma. Just precise, personalized guidance grounded in published terpene and cannabinoid science.

---

## The Premium Disruption

Commercial strain names — OG Kush, Blue Dream, Amnesia — communicate lineage to connoisseurs but nothing to the average patient. A first-time user or a 72-year-old with a chronic pain prescription has no idea what these names mean or which one is right for them.

CannaMatch replaces the confusion with a **visual, calm, and guided journey**:

- A multi-step cannabis-preference wizard captures what the patient *actually wants* — better sleep, pain relief, focus, creativity, appetite, relaxation, or mood uplift
- The platform derives a personal botanical signature under the hood — invisible to the user
- Every strain in the CannaMatch database is scored against that signature in real time
- The result is a **ranked, personalized pharmacy menu** — the right strains, at the right dispensaries, at the best available prices

The matching engine is entirely blackboxed from the interface. Users never encounter formulas, weights, or algorithms. They experience a premium, calming lifestyle product.

---

## UX Manifesto: No-Scroll, Full-Viewport Design

CannaMatch is engineered on a strict **zero-scroll architecture** across every auth and onboarding screen:

```
height: 100dvh   →  dynamic viewport lock — Safari-safe
overflow: hidden  →  eliminates all outer-page scroll axes
```

The `dvh` unit (dynamic viewport height) is used instead of `vh` so that iOS Safari's floating address bar never triggers overflow. Every screen — Splash, Login, Register, and all five onboarding stages — is designed to fill exactly one screen without scrolling.

**Visual system:** The entire auth shell uses a cinematic cross-fading backdrop of local cannabis plant imagery. The images fade smoothly every 7 seconds using Framer Motion. Three compositing layers sit over the photo:

| Layer | Treatment |
|-------|-----------|
| Photo | `saturate(1.65) brightness(0.82)` — vivid, trichome-visible |
| Gradient overlay | Linear, ≈ 20% opacity — structural depth |
| Radial vignette | Edge darkening — cinematic framing |

Interactive cards use **organic glassmorphism**: `backdrop-filter: blur(32px)`, deep green-tinted dark backgrounds, and luminous green borders. All body text carries shadow depth for legibility against the bright botanical backdrop.

Typography is set in **Heebo** — an RTL-optimized Hebrew sans-serif at weights 300–900. The entire product is rendered `dir="rtl"`.

---

## Inclusive Onboarding: Cannabis Preferences Only

The CannaMatch onboarding wizard builds a precise botanical profile from cannabis preferences — and *nothing else*. There are no medical history questions, no psychiatric intake screens, no diagnosis fields, and no medication warnings.

**Five stages, every one skippable:**

| Stage | Content |
|-------|---------|
| **מטרות** — Goals | Which effects are you looking for? (8 goal tiles) |
| **חושי** — Sensory | Which aromas resonate? (sensory wheel, 8 flavor tiles) |
| **שגרה** — Routine | When and how do you typically use? |
| **גנטיקה** — Heritage | Any classic genetics you've experienced before? |
| **תצוגה** — Preview | Live visualization of your botanical fingerprint |

**Every stage (1–4) shows a "דילוג על שלב זה" skip button** — visually understated but always accessible. Adjacent to every skip control is a friendly, non-intrusive disclaimer:

> *"חבר, אפשר לדלג, אך ללא העדפות הצריכה שלך המערכת לא תדע לחשב ולדייק את אחוזי התאמת ה-DNA של הגנטיקות עבורך."*

Skipping is always permitted. The platform degrades gracefully — showing results with reduced specificity rather than blocking the user's path.

There is no avatar selection. No profile lock. No gamification gate. The flow respects user autonomy from the very first interaction.

---

## Gateway Control: 5-Way Social Auth + Community License Gate

### Premium 5-Platform Social Authentication

CannaMatch presents a polished icon row of five social authentication controls, each with individual brand color treatment and glow animation:

| Platform | Visual Identity |
|----------|----------------|
| **Gmail (Google)** | Google G multicolour mark · red-tinted hover glow |
| **Apple** | White Apple silhouette · soft white glow |
| **Facebook** | Facebook F in deep blue · blue luminance |
| **Instagram** | Gradient camera mark (gold → orange → magenta) · warm glow |
| **X / Twitter** | Clean white X on matte black · neutral shimmer |

Clicking any icon **immediately creates an active session** — no OTP, no email confirmation code, no SMS 2FA prompt. The session is persisted to `localStorage` in the same tick and the user transitions directly to the welcome room. Zero friction. Zero waiting.

Standard email/password registration remains available and routes through a secure OTP verification step for users who prefer it.

### Community Access: Verified License Gate

The community discussion feed is the one space in CannaMatch that requires a verified medical cannabis license before entry. This is a deliberate, privacy-forward safeguard:

> The community exists to protect authentic patient experiences from commercial bias and PR contamination (יחצ) — marketing representatives, brand promoters, and pharmaceutical interests have no place here.

When a user navigates to the community tab without a verified license, they encounter a full-screen gate card that explains:

- ✅ Only verified medical patients can post and reply
- 🚫 No advertising, brand promotion, or commercial interests
- 🛡️ Identity verified at entry — all posts published anonymously by default

License verification happens entirely **inline, without leaving the app**. A simulated document scan identifies the user's product categories, monthly quantity allowance, and license validity date. Upon confirmation, access is permanently unlocked and the state persists across sessions.

For all other features — strain search, DNA matching, pharmacy browsing, the AI assistant, personal journal, and the market — **no license is required**.

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| **UI Framework** | React 18 — functional components with hooks |
| **Build Tool** | Vite 5 — ESM-first, production builds under 30 seconds |
| **Styling** | Tailwind CSS utility classes + inline style system |
| **Animation** | Framer Motion — `AnimatePresence`, `motion.*`, spring physics |
| **State Management** | `useState` + `useCallback` + `useMemo` — no external store |
| **Session Persistence** | `localStorage` — synchronous lazy init, zero flash |
| **Typography** | Heebo (Google Fonts, RTL Hebrew, weights 300–900) |
| **Icons** | Handcrafted inline SVG — zero icon-library dependency |
| **Viewport Architecture** | `100dvh` + `overflow:hidden` — strict no-scroll everywhere |
| **Text Direction** | Full `dir="rtl"` across all surfaces |

### Running Locally

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Production build (outputs to /dist)
npm run build

# Preview the production build locally
npm run preview
```

The dev server starts at `http://localhost:5173`. The API backend (if active) runs on port `3001` and is proxied transparently through Vite.

---

## Foundational Engineering Principles

**Synchronous session restore:** Session state is initialized via lazy `useState` initializers that read `localStorage` synchronously — the app never renders a logged-out flash before restoring an active session.

**Defensive array access:** All user preference fields use optional chaining (`?.`) and `|| []` fallback initialization throughout. No post-onboarding screen transition can crash from an undefined dataset.

**No medical data:** The platform does not store, transmit, or process any medical diagnoses, prescriptions, or clinical health history. Botanical matching vectors are derived entirely from cannabis preference expressions. This is a core design principle, not a technical constraint.

**Community integrity:** All community posts pass through a moderation layer before publication. Commercial language, brand promotion, and personally identifying information are handled before display.

---

## Compliance & Eligibility

CannaMatch is designed exclusively for holders of a valid Israeli medical cannabis license aged 18 and above.

The information displayed does not constitute medical advice and does not replace consultation with a licensed physician. All match percentages and strain rankings are informational guidance based on botanical science — not clinical recommendations.

Not for commercial sale. Not intended for minors. For personal, licensed medical use only.

---

*CannaMatch — Where botanical science meets personal precision.*
