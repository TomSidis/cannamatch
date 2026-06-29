/**
 * menuRanking.test.js — Layer 5 main-route ranking.
 *   - full merged menu shown, sorted high→low
 *   - 70% line is visual only (a 55% strain still appears, tier 'partial')
 *   - empty-community strain shows awaiting-data, not a number
 *   - rows carry NO price (never beside the match %)
 *   - anxiolytic "why" appears for a first-timer, not for a veteran
 */
import { describe, it, expect } from 'vitest';
import { rankMenu, buildWhy, communityStatus, AWAITING_TEXT, SOFT_LINE } from '../menuRanking.js';

const items = [
  { name: 'A', match: 90, cat: 'T22/C4', known: { id: 'a', terps: { myrcene: 0.7 } } },
  { name: 'B', match: 55, cat: 'T15/C3', known: { id: 'b', terps: { pinene: 0.6 } } },
  { name: 'C', match: 80, cat: 'T10/C10', known: { id: 'c', terps: { linalool: 0.8 } } },
  { name: 'D (unknown)', match: null, unknown: true },
];

describe('main route shows all, sorted high→low', () => {
  const rows = rankMenu(items, {});
  it('keeps every strain', () => { expect(rows).toHaveLength(4); });
  it('sorts scored desc, unknown last', () => {
    expect(rows.map((r) => r.name).slice(0, 3)).toEqual(['A', 'C', 'B']);
    expect(rows[3].name).toBe('D (unknown)');
  });
});

describe('soft 70% line is visual only', () => {
  const rows = rankMenu(items, {});
  it('a 55% strain still appears, below the line (tier partial)', () => {
    const b = rows.find((r) => r.name === 'B');
    expect(b).toBeTruthy();
    expect(b.matchPct).toBe(55);
    expect(b.tier).toBe('partial');
  });
  it('a 90% strain is above the line (tier high)', () => {
    expect(rows.find((r) => r.name === 'A').tier).toBe('high');
  });
  it('SOFT_LINE is 70', () => { expect(SOFT_LINE).toBe(70); });
});

describe('empty community → awaiting, never a number', () => {
  it('no community reports → awaiting text', () => {
    expect(communityStatus({})).toBe(AWAITING_TEXT);
    expect(rankMenu(items, {})[0].community).toBe(AWAITING_TEXT);
  });
  it('with real reports → no awaiting banner', () => {
    expect(communityStatus({ communityN: 25 })).toBeNull();
  });
});

describe('no price beside the match %', () => {
  it('ranked rows carry no price field', () => {
    for (const r of rankMenu([{ name: 'X', match: 80, price: 280, cat: 'T22/C4', known: { id: 'x', terps: {} } }], {})) {
      expect('price' in r).toBe(false);
    }
  });
});

describe('anxiolytic why — first-timer vs veteran', () => {
  const linaloolItem = { name: 'C', match: 80, cat: 'T10/C10', known: { id: 'c', terps: { linalool: 0.8 } } };
  it('first-timer gets the calming reason in the why', () => {
    expect(buildWhy(linaloolItem, { experience: 'first', reasons: ['sleep'] })).toMatch(/הרגעה/);
  });
  it('veteran (no anxiety indication) does NOT get the anxiolytic reason', () => {
    expect(buildWhy(linaloolItem, { experience: 'experienced', reasons: ['pain'] })).not.toMatch(/הרגעה/);
  });
  it('terpinolene-dominant shows the demotion reason for a first-timer', () => {
    const terp = { name: 'T', match: 60, cat: 'T22/C4', known: { id: 't', terps: { terpinolene: 0.9 } } };
    expect(buildWhy(terp, { experience: 'first', reasons: ['focus'] })).toMatch(/טרפינולן/);
  });
});
