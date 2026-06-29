import { describe, it, expect, vi } from 'vitest';
import { resolveScreen } from '../resolveScreen';

// ── Helper: build a minimal storage stub ──────────────────────────────────────
function store(data: Record<string, string>) {
  return { get: (k: string) => data[k] ?? null };
}

// ── 1. Four canonical user states ─────────────────────────────────────────────
describe('resolveScreen — four canonical states', () => {
  it('no token → welcome (login/register)', () => {
    expect(resolveScreen(store({}))).toBe('welcome');
  });

  it('logged in, no welcome seen → welcome_room', () => {
    expect(resolveScreen(store({
      cm_session_token: 'tok',
      cm_user: '{"id":"u1"}',
    }))).toBe('welcome_room');
  });

  it('welcome seen, onboarding not done → onboarding', () => {
    expect(resolveScreen(store({
      cm_session_token: 'tok',
      cm_user: '{"id":"u1"}',
      cm_welcome_seen: '1',
    }))).toBe('onboarding');
  });

  it('onboarding_done flag → app', () => {
    expect(resolveScreen(store({
      cm_session_token: 'tok',
      cm_user: '{"id":"u1"}',
      cm_welcome_seen: '1',
      cm_onboarding_done: '1',
    }))).toBe('app');
  });
});

// ── 2. Profile-data fallback (no explicit flag, but profile has data) ─────────
describe('resolveScreen — profile-data as onboarding proxy', () => {
  const base = { cm_session_token: 'tok', cm_user: '{"id":"u1"}', cm_welcome_seen: '1' };

  it('profile with reasons → app', () => {
    expect(resolveScreen(store({
      ...base,
      cm_profile_v2: JSON.stringify({ ans: { reasons: ['sleep'], form: [], helped: [] } }),
    }))).toBe('app');
  });

  it('profile with form → app', () => {
    expect(resolveScreen(store({
      ...base,
      cm_profile_v2: JSON.stringify({ ans: { reasons: [], form: ['flower'], helped: [] } }),
    }))).toBe('app');
  });

  it('profile with helped strains → app', () => {
    expect(resolveScreen(store({
      ...base,
      cm_profile_v2: JSON.stringify({ ans: { reasons: [], form: [], helped: ['s1'] } }),
    }))).toBe('app');
  });

  it('empty profile (all arrays empty) → onboarding (not done)', () => {
    expect(resolveScreen(store({
      ...base,
      cm_profile_v2: JSON.stringify({ ans: { reasons: [], form: [], helped: [] } }),
    }))).toBe('onboarding');
  });

  it('malformed cm_profile_v2 JSON → onboarding (not app)', () => {
    expect(resolveScreen(store({
      ...base,
      cm_profile_v2: 'not-json{{{',
    }))).toBe('onboarding');
  });
});

// ── 3. New-user full sequence ─────────────────────────────────────────────────
describe('resolveScreen — new user end-to-end sequence', () => {
  it('traverses login → welcome_room → onboarding → app in order', () => {
    // Step 1: no session
    expect(resolveScreen(store({}))).toBe('welcome');

    // Step 2: after successful login (token set, user set, no welcome seen)
    expect(resolveScreen(store({
      cm_session_token: 'tok',
      cm_user: '{"id":"u1"}',
    }))).toBe('welcome_room');

    // Step 3: after user sees welcome (welcome_seen set)
    expect(resolveScreen(store({
      cm_session_token: 'tok',
      cm_user: '{"id":"u1"}',
      cm_welcome_seen: '1',
    }))).toBe('onboarding');

    // Step 4: after completing onboarding (onboarding_done set)
    expect(resolveScreen(store({
      cm_session_token: 'tok',
      cm_user: '{"id":"u1"}',
      cm_welcome_seen: '1',
      cm_onboarding_done: '1',
    }))).toBe('app');
  });
});

// ── 4. Returning user (refresh) ───────────────────────────────────────────────
describe('resolveScreen — returning user', () => {
  it('refresh with all flags → app (no regression)', () => {
    const s = store({
      cm_session_token: 'tok',
      cm_user: '{"id":"u1"}',
      cm_welcome_seen: '1',
      cm_onboarding_done: '1',
    });
    // Two calls simulate two page loads
    expect(resolveScreen(s)).toBe('app');
    expect(resolveScreen(s)).toBe('app');
  });
});

// ── 5. Logout resets correctly ────────────────────────────────────────────────
describe('resolveScreen — after logout', () => {
  it('empty store (all flags cleared) → welcome', () => {
    // handleLogout removes: cm_session_token, cm_user, cm_welcome_seen, cm_onboarding_done
    expect(resolveScreen(store({}))).toBe('welcome');
  });
});

// ── 6. Corrupt storage ────────────────────────────────────────────────────────
describe('resolveScreen — corrupt storage', () => {
  it('corrupt cm_user JSON → welcome + calls onCorrupt', () => {
    const onCorrupt = vi.fn();
    const result = resolveScreen(
      store({ cm_session_token: 'tok', cm_user: 'not-valid-json{{{' }),
      onCorrupt,
    );
    expect(result).toBe('welcome');
    expect(onCorrupt).toHaveBeenCalledOnce();
  });

  it('missing token but valid user JSON → welcome (not welcome_room)', () => {
    // Token missing — must not proceed past the first check
    expect(resolveScreen(store({ cm_user: '{"id":"u1"}' }))).toBe('welcome');
  });

  it('token present but missing cm_user → welcome', () => {
    expect(resolveScreen(store({ cm_session_token: 'tok' }))).toBe('welcome');
  });
});
