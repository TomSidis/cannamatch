/**
 * onboardingV3.logic.test.js — Layer 3 frontend logic (pure, no DOM).
 *
 * Covers the spec's UI-flow + microcopy requirements:
 *   - experienced user must pick BOTH liked and disliked before continuing
 *   - first-time user never sees the past-strain screen (screen3 = guidance)
 *   - indication is mandatory for everyone (incl. first-timers) before the fork
 *   - day-part maps so a day-only user gets no night slots (→ engine won't boost myrcene)
 *   - microcopy is the exact partner-tone string, with no first-person-plural
 */
import { describe, it, expect } from 'vitest';
import {
  READY_MICROCOPY, EXPERIENCE_OPTIONS, INDICATION_OPTIONS,
  dayPartToTimes, experienceToTolerance,
  screen2Complete, screen3Mode, pastStrainComplete, deriveProfileBatch, indicationReasons,
} from '../onboardingV3Logic.js';

describe('experience options (#2 wording)', () => {
  it('labels are exactly ותיק / יש ניסיון / חדש', () => {
    expect(EXPERIENCE_OPTIONS.map((o) => o.label)).toEqual(['ותיק', 'יש ניסיון', 'חדש']);
  });
  it('only חדש (first) → guidance; ותיק + יש ניסיון → past-strain', () => {
    expect(screen3Mode('first')).toBe('guidance');
    expect(screen3Mode('experienced')).toBe('past_strain'); // ותיק
    expect(screen3Mode('little')).toBe('past_strain');       // יש ניסיון
  });
});

describe('indications full set (#3)', () => {
  it('exposes the full list (≥18) and maps each to engine reason slugs', () => {
    expect(INDICATION_OPTIONS.length).toBeGreaterThanOrEqual(18);
    for (const o of INDICATION_OPTIONS) expect(o.reasons.length).toBeGreaterThan(0);
  });
  it('indicationReasons flattens + dedups selected → engine slugs', () => {
    expect(indicationReasons(['fibro', 'ms']).sort()).toEqual(['pain', 'sleep']); // both map pain+sleep, deduped
    expect(indicationReasons(['sleep', 'anxiety'])).toEqual(['sleep', 'anxiety']);
  });
});

describe('screen 2 gate — indication mandatory for everyone', () => {
  it('blocks when no indication, even with experience chosen', () => {
    expect(screen2Complete({ experience: 'experienced', indications: [] })).toBe(false);
  });
  it('blocks a first-timer with no indication (hard-required anchor)', () => {
    expect(screen2Complete({ experience: 'first', indications: [] })).toBe(false);
  });
  it('blocks when indication chosen but no experience', () => {
    expect(screen2Complete({ experience: null, indications: ['sleep'] })).toBe(false);
  });
  it('passes with experience + at least one indication', () => {
    expect(screen2Complete({ experience: 'first', indications: ['anxiety'] })).toBe(true);
  });
});

describe('screen 3 fork', () => {
  it('first-timer → guidance, never the past-strain screen', () => {
    expect(screen3Mode('first')).toBe('guidance');
  });
  it('experienced → past-strain screen', () => {
    expect(screen3Mode('experienced')).toBe('past_strain');
  });
  it('"a little" → past-strain screen', () => {
    expect(screen3Mode('little')).toBe('past_strain');
  });
});

describe('past-strain screen requires BOTH picks', () => {
  it('liked only → not complete', () => {
    expect(pastStrainComplete({ liked: 's1', disliked: null })).toBe(false);
  });
  it('disliked only → not complete', () => {
    expect(pastStrainComplete({ liked: null, disliked: 's2' })).toBe(false);
  });
  it('both → complete', () => {
    expect(pastStrainComplete({ liked: 's1', disliked: 's2' })).toBe(true);
  });

  // Multi-select arrays (unlimited)
  it('empty arrays → not complete', () => {
    expect(pastStrainComplete({ liked: [], disliked: [] })).toBe(false);
    expect(pastStrainComplete({ liked: [{ id: 'a' }], disliked: [] })).toBe(false);
  });
  it('arrays with ≥1 each (any count) → complete', () => {
    expect(pastStrainComplete({ liked: [{ id: 'a' }, { id: 'b' }], disliked: [{ id: 'c' }] })).toBe(true);
  });
});

describe('day-part → engine timing', () => {
  it('day-only window contains no evening/night (myrcene will not be boosted)', () => {
    const t = dayPartToTimes('day');
    expect(t).not.toContain('night');
    expect(t).not.toContain('evening');
  });
  it('night window covers night', () => {
    expect(dayPartToTimes('night')).toContain('night');
  });
  it('all-day covers both day and night', () => {
    const t = dayPartToTimes('allday');
    expect(t).toContain('morning');
    expect(t).toContain('night');
  });
});

describe('experience → tolerance', () => {
  it('maps the three experience levels', () => {
    expect(experienceToTolerance('first')).toBe('new');
    expect(experienceToTolerance('little')).toBe('medium');
    expect(experienceToTolerance('experienced')).toBe('veteran');
  });
});

describe('deriveProfileBatch — DNA reveal profile from answers', () => {
  it('terpenes come from the chosen indications, ratio from experience', () => {
    const b = deriveProfileBatch(['anxiety'], 'first');           // anxiety → linalool, limonene
    expect(b.terpenes.map((t) => t.terpene)).toEqual(expect.arrayContaining(['linalool', 'limonene']));
    expect(b.thcPct).toBe(10); expect(b.cbdPct).toBe(10);         // first-timer balanced/low-THC
  });
  it('veteran gets a higher-THC shape', () => {
    expect(deriveProfileBatch(['pain'], 'experienced').thcPct).toBe(22);
  });
  it('no indications → non-empty fallback profile (never crashes the reveal)', () => {
    const b = deriveProfileBatch([], 'first');
    expect(b.terpenes.length).toBeGreaterThan(0);
  });
});

describe('microcopy — partner tone', () => {
  it('is the exact required string', () => {
    expect(READY_MICROCOPY).toBe('מספיק כדי להתחיל. ככל שתשתף יותר, ההצעות יתאימו טוב יותר.');
  });
  it('uses no first-person-plural (no אנחנו / נדע / נמליץ / נבנה)', () => {
    expect(READY_MICROCOPY).not.toMatch(/אנחנו|נדע|נמליץ|נבנה/);
  });
});
