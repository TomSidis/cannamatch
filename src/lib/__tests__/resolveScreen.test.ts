import { describe, it, expect, vi } from 'vitest';
import { resolveScreen } from '../resolveScreen';

// ── Helper: build a minimal storage stub ──────────────────────────────────────
function store(data: Record<string, string>) {
  return { get: (k: string) => data[k] ?? null };
}

const SEEN_INTRO = { cm_intro_seen: '1' };
const LOGGED = { ...SEEN_INTRO, cm_session_token: 'tok', cm_user: '{"id":"u1"}' };

// ── 1. Intro gate (pre-login, shown once) ─────────────────────────────────────
describe('resolveScreen — intro gate', () => {
  it('nothing seen → intro', () => {
    expect(resolveScreen(store({}))).toBe('intro');
  });
  it('intro not seen takes priority even over a token', () => {
    expect(resolveScreen(store({ cm_session_token: 'tok', cm_user: '{"id":"u1"}' }))).toBe('intro');
  });
  it('intro seen, no token → welcome (login/register)', () => {
    expect(resolveScreen(store(SEEN_INTRO))).toBe('welcome');
  });
});

// ── 2. Canonical states (new order: intro → welcome → onboarding → welcome_room → app) ──
describe('resolveScreen — canonical states', () => {
  it('logged in, onboarding not done → onboarding', () => {
    expect(resolveScreen(store(LOGGED))).toBe('onboarding');
  });
  it('onboarding done, welcome not seen → welcome_room (ספיץ׳ after DNA)', () => {
    expect(resolveScreen(store({ ...LOGGED, cm_onboarding_done: '1' }))).toBe('welcome_room');
  });
  it('onboarding done + welcome seen → app', () => {
    expect(resolveScreen(store({ ...LOGGED, cm_onboarding_done: '1', cm_welcome_seen: '1' }))).toBe('app');
  });
});

// ── 3. Onboarding-done via profile data proxy ─────────────────────────────────
describe('resolveScreen — profile-data as onboarding proxy', () => {
  it('profile with reasons → past onboarding (→ welcome_room)', () => {
    expect(resolveScreen(store({
      ...LOGGED,
      cm_profile_v2: JSON.stringify({ ans: { reasons: ['sleep'], form: [], helped: [] } }),
    }))).toBe('welcome_room');
  });
  it('empty profile → still onboarding', () => {
    expect(resolveScreen(store({
      ...LOGGED,
      cm_profile_v2: JSON.stringify({ ans: { reasons: [], form: [], helped: [] } }),
    }))).toBe('onboarding');
  });
  it('malformed profile JSON → onboarding (not done)', () => {
    expect(resolveScreen(store({ ...LOGGED, cm_profile_v2: 'not-json{{{' }))).toBe('onboarding');
  });
});

// ── 4. Full new-user sequence in order ────────────────────────────────────────
describe('resolveScreen — new user end-to-end', () => {
  it('intro → welcome → onboarding → welcome_room → app', () => {
    expect(resolveScreen(store({}))).toBe('intro');
    expect(resolveScreen(store(SEEN_INTRO))).toBe('welcome');
    expect(resolveScreen(store(LOGGED))).toBe('onboarding');
    expect(resolveScreen(store({ ...LOGGED, cm_onboarding_done: '1' }))).toBe('welcome_room');
    expect(resolveScreen(store({ ...LOGGED, cm_onboarding_done: '1', cm_welcome_seen: '1' }))).toBe('app');
  });
});

// ── 5. Returning user (refresh) ───────────────────────────────────────────────
describe('resolveScreen — returning user', () => {
  it('refresh with all flags → app (no regression)', () => {
    const s = store({ ...LOGGED, cm_onboarding_done: '1', cm_welcome_seen: '1' });
    expect(resolveScreen(s)).toBe('app');
    expect(resolveScreen(s)).toBe('app');
  });
});

// ── 6. Corrupt storage ────────────────────────────────────────────────────────
describe('resolveScreen — corrupt storage', () => {
  it('corrupt cm_user JSON → welcome + calls onCorrupt', () => {
    const onCorrupt = vi.fn();
    const result = resolveScreen(
      store({ ...SEEN_INTRO, cm_session_token: 'tok', cm_user: 'not-valid-json{{{' }),
      onCorrupt,
    );
    expect(result).toBe('welcome');
    expect(onCorrupt).toHaveBeenCalledOnce();
  });
  it('intro seen, token present but missing cm_user → welcome', () => {
    expect(resolveScreen(store({ ...SEEN_INTRO, cm_session_token: 'tok' }))).toBe('welcome');
  });
});
