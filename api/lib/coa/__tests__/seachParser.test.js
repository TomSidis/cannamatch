/**
 * seachParser.test.js — Tests for the Seach COA parser.
 * Uses the embedded SHAPO_FIXTURE_HTML (Shap-O / Donkey Ballz batch).
 * No network calls — pure unit tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseSeachHTML, SHAPO_FIXTURE_HTML } from '../seachParser.js';

describe('parseSeachHTML — Shap-O / Donkey Ballz fixture', () => {
  let result;
  let batch;

  beforeAll(() => {
    result = parseSeachHTML(SHAPO_FIXTURE_HTML, 'https://seach.co.il/test');
    batch  = result.batches[0];
  });

  it('parses exactly 1 batch', () => {
    expect(result.batches).toHaveLength(1);
  });

  it('extracts batch number SHA-2024-031', () => {
    expect(batch.batchNo).toBe('SHA-2024-031');
  });

  it('extracts genetics: Shap-O (Donkey Ballz)', () => {
    expect(batch.genetics).toMatch(/Shap|Donkey/i);
  });

  it('extracts parents [Blackberry Breath, Animal Crasher]', () => {
    expect(batch.parents).toContain('Blackberry Breath');
    expect(batch.parents).toContain('Animal Crasher');
  });

  it('extracts THC 22.4%', () => {
    expect(batch.thcPct).toBeCloseTo(22.4, 1);
  });

  it('extracts CBD 0.8%', () => {
    expect(batch.cbdPct).toBeCloseTo(0.8, 1);
  });

  it('extracts 5 terpenes', () => {
    expect(Object.keys(batch.terpenes)).toHaveLength(5);
  });

  it('limonene ≈ 0.72%', () => {
    expect(batch.terpenes.limonene).toBeCloseTo(0.72, 2);
  });

  it('linalool ≈ 0.48%', () => {
    expect(batch.terpenes.linalool).toBeCloseTo(0.48, 2);
  });

  it('myrcene ≈ 0.41%', () => {
    expect(batch.terpenes.myrcene).toBeCloseTo(0.41, 2);
  });

  it('pinene ≈ 0.31%', () => {
    expect(batch.terpenes.pinene).toBeCloseTo(0.31, 2);
  });

  it('caryophyllene ≈ 0.28%', () => {
    expect(batch.terpenes.caryophyllene).toBeCloseTo(0.28, 2);
  });

  it('cultivationMethod = indoor', () => {
    expect(batch.cultivationMethod).toBe('indoor');
  });

  it('irradiation = true (כן)', () => {
    expect(batch.irradiation).toBe(true);
  });

  it('provenance = measured (has THC + terpenes)', () => {
    expect(batch.provenance).toBe('measured');
  });

  it('cultivator = Seach', () => {
    expect(batch.cultivator).toBe('Seach');
  });

  it('coaUrl set to provided sourceUrl', () => {
    expect(batch.coaUrl).toBe('https://seach.co.il/test');
  });
});

describe('parseSeachHTML — edge cases', () => {
  it('returns empty batches + warning for empty HTML', () => {
    const { batches, warnings } = parseSeachHTML('');
    expect(batches).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('returns empty batches + warning for null input', () => {
    const { batches, warnings } = parseSeachHTML(null);
    expect(batches).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('handles HTML with no batch number gracefully', () => {
    const { batches } = parseSeachHTML('<div>Some content without a lot number</div>');
    expect(batches).toHaveLength(0);
  });
});
