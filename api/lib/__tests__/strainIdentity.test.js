/**
 * strainIdentity.test.js — Step 1: normalization + batch-aware identity rules
 *
 * Tests:
 *   A. normalizeName — strips prefixes, collapses whitespace/hyphens, 0→O, lowercase
 *   B. resolveCanonicalName — Hebrew→canonical, shorthand→canonical, passthrough
 *   C. strainIdentityKey — (normalized_name, batch_id) uniqueness rules:
 *      C1. Same name + same batch → same key (upsert, no dup)
 *      C2. Same name + different batch → different keys (two rows)
 *      C3. Same name + both batch='unknown' → same key (unknown-batch collapse)
 *      C4. Unknown batch sentinel is 'unknown', not null
 */

import { describe, it, expect } from 'vitest';
import { normalizeName, resolveCanonicalName } from '../normalization.js';

// ── Shared identity key function (same logic used by catalog upsert) ──────────
// This is the pure function that maps a (raw name, raw batch) pair to the
// unique identity key. DB upserts use ON CONFLICT (normalized_name, batch_id).
function strainIdentityKey(rawName, rawBatchId) {
  const normalized = normalizeName(rawName);
  const batch      = (rawBatchId || 'unknown').toString().trim() || 'unknown';
  return `${normalized}::${batch}`;
}

// ── A. normalizeName ──────────────────────────────────────────────────────────

describe('A — normalizeName: prefix stripping + canonicalization', () => {
  it('strips leading T/C category code', () => {
    expect(normalizeName('T22/C4 Wedding Cake')).toBe('wedding cake');
  });

  it('strips trailing T/C category code', () => {
    expect(normalizeName('Wedding Cake T22/C4')).toBe('wedding cake');
  });

  it('is case-insensitive', () => {
    expect(normalizeName('GORILLA GLUE')).toBe('gorilla glue');
  });

  it('collapses hyphens to spaces', () => {
    expect(normalizeName('Gorilla-Glue-4')).toBe('gorilla glue 4');
  });

  it('collapses underscores to spaces', () => {
    expect(normalizeName('Wedding_Cake')).toBe('wedding cake');
  });

  it('collapses multiple spaces to one', () => {
    expect(normalizeName('OG   Kush')).toBe('og kush');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeName('  Blue Dream  ')).toBe('blue dream');
  });

  it('replaces mid-word digit-zero with o (OCR artefact)', () => {
    expect(normalizeName('G0AT')).toBe('goat');
  });

  it('does not replace leading/trailing zero (batch numbers)', () => {
    // Only mid-word alpha-bounded zeros are replaced
    expect(normalizeName('OG0')).toBe('og0');    // trailing — not replaced
    expect(normalizeName('0G Kush')).toBe('0g kush'); // leading — not replaced
  });

  it('handles empty string', () => {
    expect(normalizeName('')).toBe('');
  });

  it('handles undefined', () => {
    expect(normalizeName(undefined)).toBe('');
  });

  it('Hebrew characters pass through unchanged', () => {
    // normalizeName does not translate; resolveCanonicalName does
    expect(normalizeName('תכלת')).toBe('תכלת');
  });
});

// ── B. resolveCanonicalName ───────────────────────────────────────────────────

describe('B — resolveCanonicalName: translation dict + passthrough', () => {
  it('translates Hebrew brand to canonical', () => {
    const { canonical, translated } = resolveCanonicalName('תכלת');
    expect(canonical).toBe('tehelet');
    expect(translated).toBe(true);
  });

  it('translates shorthand to canonical', () => {
    expect(resolveCanonicalName('p&z').canonical).toBe('purple zkittlez');
    expect(resolveCanonicalName('wc').canonical).toBe('wedding cake');
    expect(resolveCanonicalName('gg4').canonical).toBe('gorilla glue 4');
  });

  it('passes unknown name through as normalized', () => {
    const { canonical, translated } = resolveCanonicalName('Blue Dream');
    expect(canonical).toBe('blue dream');
    expect(translated).toBe(false);
  });

  it('resolves prefix match (partial Hebrew brand)', () => {
    // "מדיקיין (יום)" → "medichain day" via dict
    const { canonical } = resolveCanonicalName('מדיקיין (יום)');
    expect(canonical).toBe('medichain day');
  });

  it('strips T/C prefix before dict lookup', () => {
    // normalizeName strips prefix; dict lookup works on the result
    const { canonical } = resolveCanonicalName('T22/C4 תכלת');
    expect(canonical).toBe('tehelet');
  });
});

// ── C. strainIdentityKey — batch-aware identity rules ────────────────────────

describe('C1 — same name + same batch → same key (no dup)', () => {
  it('identical inputs produce identical key', () => {
    const k1 = strainIdentityKey('Wedding Cake', 'SH-2024-042');
    const k2 = strainIdentityKey('Wedding Cake', 'SH-2024-042');
    expect(k1).toBe(k2);
  });

  it('case difference in name does not create dup', () => {
    const k1 = strainIdentityKey('WEDDING CAKE', 'SH-2024-042');
    const k2 = strainIdentityKey('wedding cake', 'SH-2024-042');
    expect(k1).toBe(k2);
  });

  it('hyphen vs space in name does not create dup', () => {
    const k1 = strainIdentityKey('Wedding-Cake', 'SH-2024-042');
    const k2 = strainIdentityKey('Wedding Cake', 'SH-2024-042');
    expect(k1).toBe(k2);
  });

  it('T/C prefix stripped before key', () => {
    const k1 = strainIdentityKey('T22/C4 Wedding Cake', 'SH-2024-042');
    const k2 = strainIdentityKey('Wedding Cake', 'SH-2024-042');
    expect(k1).toBe(k2);
  });
});

describe('C2 — same name + different batch → different keys (two rows)', () => {
  it('different batch IDs produce different keys', () => {
    const k1 = strainIdentityKey('Wedding Cake', 'SH-2024-042');
    const k2 = strainIdentityKey('Wedding Cake', 'SH-2024-099');
    expect(k1).not.toBe(k2);
  });

  it('known batch vs unknown batch produce different keys', () => {
    const k1 = strainIdentityKey('OG Kush', 'SH-2024-001');
    const k2 = strainIdentityKey('OG Kush', 'unknown');
    expect(k1).not.toBe(k2);
  });
});

describe('C3 — same name + both unknown → same key (unknown-batch collapse)', () => {
  it('two unknown-batch inputs collapse to one key', () => {
    const k1 = strainIdentityKey('Blue Dream', 'unknown');
    const k2 = strainIdentityKey('Blue Dream', 'unknown');
    expect(k1).toBe(k2);
  });

  it('null batch treated as unknown sentinel', () => {
    const k1 = strainIdentityKey('Blue Dream', null);
    const k2 = strainIdentityKey('Blue Dream', 'unknown');
    expect(k1).toBe(k2);
  });

  it('empty string batch treated as unknown sentinel', () => {
    const k1 = strainIdentityKey('Blue Dream', '');
    const k2 = strainIdentityKey('Blue Dream', 'unknown');
    expect(k1).toBe(k2);
  });
});

describe('C4 — sentinel is the string "unknown", not null', () => {
  it('default batch resolves to the string "unknown"', () => {
    const key = strainIdentityKey('Some Strain', null);
    expect(key).toContain('unknown');
    expect(key).not.toContain('null');
  });

  it('strainIdentityKey always returns a string with no null segment', () => {
    const key = strainIdentityKey('', null);
    expect(key).not.toContain('null');
    expect(typeof key).toBe('string');
  });
});
