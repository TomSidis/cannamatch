import { describe, it, expect } from 'vitest';
import { isPlausibleProductName, parseLine, normCat } from '../menuDecoder.js';

// ── Garbage — must all be rejected ───────────────────────────────────────────
describe('isPlausibleProductName — garbage rejected', () => {
  // The three examples from the spec
  it('rejects "amon fF" (camelCase OCR artifact)', () => {
    expect(isPlausibleProductName('amon fF', null)).toBe(false);
  });
  it('rejects "דליה אדומה טוגדר 5.6.00" (version/date dot notation)', () => {
    expect(isPlausibleProductName('דליה אדומה טוגדר 5.6.00', null)).toBe(false);
  });
  it('rejects "GW שיח ראגוס RG#7" (hash = lot/batch ref)', () => {
    expect(isPlausibleProductName('GW שיח ראגוס RG#7', null)).toBe(false);
  });

  // Dates
  it('rejects string containing date (15/06/2026)', () => {
    expect(isPlausibleProductName('תפריט 15/06/2026', null)).toBe(false);
  });
  it('rejects string with dot-date (.06.2026)', () => {
    expect(isPlausibleProductName('עדכון.06.2026', null)).toBe(false);
  });

  // Prices / currency
  it('rejects string with ₪ symbol', () => {
    expect(isPlausibleProductName('גל 350₪', null)).toBe(false);
  });
  it('rejects string with ש"ח', () => {
    expect(isPlausibleProductName('גל 350 ש"ח', null)).toBe(false);
  });

  // Stray garbage chars
  it('rejects string with ~ (tilde)', () => {
    expect(isPlausibleProductName('Wedding~CK', null)).toBe(false);
  });
  it('rejects string with = (equals)', () => {
    expect(isPlausibleProductName('Wedding=CK', null)).toBe(false);
  });
  it('rejects string with standalone double-quote', () => {
    expect(isPlausibleProductName('some "strain" name', null)).toBe(false);
  });

  // Too short / no letters
  it('rejects string shorter than 4 chars', () => {
    expect(isPlausibleProductName('GW', null)).toBe(false);
  });
  it('rejects string with no 3+ consecutive letters', () => {
    expect(isPlausibleProductName('12 34 56', null)).toBe(false);
  });
  it('rejects string with low letter density (< 30%)', () => {
    expect(isPlausibleProductName('1234 5678 9012 AB', null)).toBe(false);
  });

  // Too long (full menu line, not a product name)
  it('rejects string longer than 60 chars', () => {
    const long = 'Wedding CK גנטיקה מיוחדת מגדל איכותי ייחודי מאוד מאוד יפה מאד';
    expect(long.length).toBeGreaterThan(60);
    expect(isPlausibleProductName(long, null)).toBe(false);
  });

  // Barcode / ID
  it('rejects string with 5+ consecutive digits', () => {
    expect(isPlausibleProductName('גל 123456', null)).toBe(false);
  });

  // Ellipsis / truncated OCR
  it('rejects string with multiple dots (ellipsis)', () => {
    expect(isPlausibleProductName('Wedding CK...', null)).toBe(false);
  });

  // Menu header keyword
  it('rejects string containing "תפריט"', () => {
    expect(isPlausibleProductName('תפריט זנים', null)).toBe(false);
  });

  // Leading garbage bullet
  it('rejects string starting with bullet/arrow char', () => {
    expect(isPlausibleProductName('►Wedding CK', null)).toBe(false);
  });
  it('rejects string starting with #', () => {
    expect(isPlausibleProductName('#Wedding CK', null)).toBe(false);
  });
});

// ── Valid — must all pass ─────────────────────────────────────────────────────
describe('isPlausibleProductName — valid names pass', () => {
  it('passes "Wedding CK" with cat', () => {
    expect(isPlausibleProductName('Wedding CK', 'T20/C4')).toBe(true);
  });
  it('passes "גל מדיקיין" with cat', () => {
    expect(isPlausibleProductName('גל מדיקיין', 'T10/C10')).toBe(true);
  });
  it('passes "Purple Zkittlez"', () => {
    expect(isPlausibleProductName('Purple Zkittlez', 'T20/C4')).toBe(true);
  });
  it('passes "ספיישל טי" (Hebrew only, with cat)', () => {
    expect(isPlausibleProductName('ספיישל טי', 'T10/C10')).toBe(true);
  });
  it('passes "Ice Cream Cake" (8+ chars, no cat)', () => {
    expect(isPlausibleProductName('Ice Cream Cake', null)).toBe(true);
  });
  it('passes "GMO Garlic Cookies"', () => {
    expect(isPlausibleProductName('GMO Garlic Cookies', 'T20/C4')).toBe(true);
  });
  it('passes "Carbon Fiber"', () => {
    expect(isPlausibleProductName('Carbon Fiber', 'T20/C4')).toBe(true);
  });
  it('passes Hebrew name with space', () => {
    expect(isPlausibleProductName('תכלת מדיקיין', 'T20/C4')).toBe(true);
  });
  it('passes short Hebrew name with cat (>= 4 chars + cat)', () => {
    // "גלדה" is 4 chars, passes because cat is supplied
    expect(isPlausibleProductName('גלדה', 'T10/C10')).toBe(true);
  });
});
