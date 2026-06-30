import { describe, it, expect, vi } from 'vitest';
import { resolveScreen } from '../resolveScreen';

function store(data: Record<string, string>) {
  return { get: (k: string) => data[k] ?? null };
}

const LOGGED = { cm_session_token: 'tok', cm_user: '{"id":"u1"}' };

// Order: intro (logged out) → onboarding → welcome_room → app
describe('resolveScreen — merged intro is the logged-out landing', () => {
  it('no token → intro', () => {
    expect(resolveScreen(store({}))).toBe('intro');
  });
  it('token but no user → intro', () => {
    expect(resolveScreen(store({ cm_session_token: 'tok' }))).toBe('intro');
  });
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

describe('resolveScreen — full new-user sequence', () => {
  it('intro → onboarding → welcome_room → app', () => {
    expect(resolveScreen(store({}))).toBe('intro');
    expect(resolveScreen(store(LOGGED))).toBe('onboarding');
    expect(resolveScreen(store({ ...LOGGED, cm_onboarding_done: '1' }))).toBe('welcome_room');
    expect(resolveScreen(store({ ...LOGGED, cm_onboarding_done: '1', cm_welcome_seen: '1' }))).toBe('app');
  });
});

describe('resolveScreen — returning user (refresh)', () => {
  it('all flags → app, stable across reloads', () => {
    const s = store({ ...LOGGED, cm_onboarding_done: '1', cm_welcome_seen: '1' });
    expect(resolveScreen(s)).toBe('app');
    expect(resolveScreen(s)).toBe('app');
  });
});

describe('resolveScreen — corrupt storage', () => {
  it('corrupt cm_user JSON → intro + calls onCorrupt', () => {
    const onCorrupt = vi.fn();
    const result = resolveScreen(store({ cm_session_token: 'tok', cm_user: 'not-valid-json{{{' }), onCorrupt);
    expect(result).toBe('intro');
    expect(onCorrupt).toHaveBeenCalledOnce();
  });
});
