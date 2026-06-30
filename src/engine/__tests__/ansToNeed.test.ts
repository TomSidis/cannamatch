/**
 * ansToNeed.test.ts — Layer 3 wiring: the app's onboarding `ans` must carry `experience`
 * through ansToNeed → buildNeedVector so the engine's new-user route actually fires.
 * Without this passthrough the OnboardingV3 fork would have no effect on scoring.
 */
import { describe, it, expect } from 'vitest';
import { ansToNeed } from '../legacyBridge';

describe('ansToNeed feeds experience into the need vector', () => {
  it('first-timer ans → newUserRoute ON', () => {
    expect(ansToNeed({ reasons: ['pain'], experience: 'first' }).newUserRoute).toBe(true);
  });
  it('veteran ans without anxiety → newUserRoute OFF', () => {
    expect(ansToNeed({ reasons: ['pain'], experience: 'experienced' }).newUserRoute).toBe(false);
  });
  it('veteran ans WITH anxiety → newUserRoute ON', () => {
    expect(ansToNeed({ reasons: ['anxiety'], experience: 'experienced' }).newUserRoute).toBe(true);
  });
  it('ans without experience (legacy callers) → newUserRoute OFF', () => {
    expect(ansToNeed({ reasons: ['pain'] }).newUserRoute).toBe(false);
  });
  it('reasons flow through as conditions', () => {
    expect(ansToNeed({ reasons: ['sleep'], experience: 'first' }).conditions).toContain('sleep');
  });
});
