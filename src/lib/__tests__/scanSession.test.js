/**
 * scanSession.test.js — Layer 4.2/4.3/4.4: a scan is a session of pages.
 *
 *   - a second page appends (first page's strains remain) — append, never overwrite
 *   - exact-duplicate image not added twice (Hebrew notice)
 *   - near-duplicate page flagged (keep/discard)
 *   - same strain on two pages merges once (canonical_key)
 *   - תפרחת vs שמן of one strain stay two items (format in the key)
 *   - removing a page re-merges cleanly
 *   - a failed/blurry page is retryable alone
 *   - save/load round-trips decoded pages (refresh mid-scan)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession, addPage, retryPage, removePage, mergeSession,
  saveSession, loadSession, clearSession, canonicalKeyFor, detectFormat, imageHash,
  EXACT_DUP_MESSAGE,
} from '../scanSession.js';

const ans = { cats: [] };
const scored = [];
const keys = (items) => items.map((i) => i.canonicalKey);

describe('append, never overwrite', () => {
  it('a second page adds; the first page strains remain in the merge', () => {
    const s = createSession();
    addPage(s, { imageHash: 'h1', rawText: 'P&Z T22/C4 350₪\nICC T22/C4 300₪', ans, scored });
    const firstMerge = mergeSession(s).length;
    expect(firstMerge).toBeGreaterThan(0);

    addPage(s, { imageHash: 'h2', rawText: 'WCK T22/C4 280₪', ans, scored });
    expect(s.pages).toHaveLength(2);
    const merged = mergeSession(s);
    // page-1 strains still present alongside page-2's
    expect(merged.length).toBeGreaterThan(firstMerge);
  });

  it('uploading image after image is never blocked (no cap)', () => {
    const s = createSession();
    for (let i = 0; i < 6; i++) {
      const r = addPage(s, { imageHash: `n${i}`, rawText: `אור T15/C3 ${200 + i}₪`, ans, scored });
      expect(r.ok).toBe(true);
    }
    expect(s.pages).toHaveLength(6);
  });
});

describe('exact-duplicate image', () => {
  it('same image hash is not added twice, returns Hebrew notice', () => {
    const s = createSession();
    addPage(s, { imageHash: 'same', rawText: 'P&Z T22/C4 350₪', ans, scored });
    const dup = addPage(s, { imageHash: 'same', rawText: 'P&Z T22/C4 350₪', ans, scored });
    expect(dup.ok).toBe(false);
    expect(dup.duplicate).toBe('exact');
    expect(dup.message).toBe(EXACT_DUP_MESSAGE);
    expect(s.pages).toHaveLength(1);
  });
});

describe('near-duplicate page (different shot, same content)', () => {
  it('flags nearDuplicateOf when ≥85% canonical keys overlap', () => {
    const s = createSession();
    const a = addPage(s, { imageHash: 'a', rawText: 'P&Z T22/C4 350₪\nICC T22/C4 300₪', ans, scored });
    const b = addPage(s, { imageHash: 'b', rawText: 'P&Z T22/C4 351₪\nICC T22/C4 305₪', ans, scored });
    expect(b.duplicate).toBe('near');
    expect(b.page.nearDuplicateOf).toBe(a.page.id);
  });
});

describe('strain-level dedup across pages (canonical_key)', () => {
  it('the same strain on two pages appears once', () => {
    const s = createSession();
    addPage(s, { imageHash: 'p1', rawText: 'אור T15/C3 350₪', ans, scored });
    addPage(s, { imageHash: 'p2', rawText: 'אור T15/C3 360₪', ans, scored });
    const merged = mergeSession(s);
    const aur = merged.filter((m) => /אור/.test(m.name));
    expect(aur).toHaveLength(1);
  });

  it('תפרחת vs שמן of one strain stay two separate items', () => {
    const s = createSession();
    addPage(s, { imageHash: 'flower', rawText: 'אור T15/C3 350₪', ans, scored });
    addPage(s, { imageHash: 'oil',    rawText: 'שמן אור T15/C3 300₪', ans, scored });
    const merged = mergeSession(s);
    const formats = new Set(merged.filter((m) => /אור/.test(m.name)).map((m) => m.format));
    expect(formats.has('oil')).toBe(true);
    expect(formats.has('inflorescence')).toBe(true);
    expect(merged.filter((m) => /אור/.test(m.name)).length).toBeGreaterThanOrEqual(2);
  });
});

describe('remove + retry', () => {
  it('removing a page re-merges from the rest', () => {
    const s = createSession();
    const p1 = addPage(s, { imageHash: 'r1', rawText: 'P&Z T22/C4 350₪', ans, scored });
    addPage(s, { imageHash: 'r2', rawText: 'ICC T22/C4 300₪', ans, scored });
    const before = mergeSession(s).length;
    removePage(s, p1.page.id);
    expect(s.pages).toHaveLength(1);
    expect(mergeSession(s).length).toBeLessThan(before);
  });

  it('a blurry/failed page is retryable on its own', () => {
    const s = createSession();
    const bad = addPage(s, { imageHash: 'blur', rawText: '...... ₪₪₪', ans, scored });
    expect(bad.page.status).toBe('failed');
    // other pages untouched by the retry
    addPage(s, { imageHash: 'ok', rawText: 'P&Z T22/C4 350₪', ans, scored });
    const r = retryPage(s, bad.page.id, { rawText: 'WCK T22/C4 280₪', ans, scored });
    expect(r.page.status).toBe('decoded');
    expect(s.pages).toHaveLength(2);
  });
});

describe('persistence — survive a refresh mid-scan', () => {
  // node test env has no localStorage; install a minimal memory shim (app uses the real one).
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    clearSession();
  });
  it('save/load round-trips decoded pages', () => {
    const s = createSession();
    addPage(s, { imageHash: 'x1', rawText: 'P&Z T22/C4 350₪', ans, scored });
    addPage(s, { imageHash: 'x2', rawText: 'ICC T22/C4 300₪', ans, scored });
    saveSession(s);

    const restored = loadSession();
    expect(restored).toBeTruthy();
    expect(restored.pages).toHaveLength(2);
    expect(mergeSession(restored).length).toBe(mergeSession(s).length);
  });
});

describe('pure helpers', () => {
  it('detectFormat maps oil/small/capsule, else inflorescence', () => {
    expect(detectFormat('שמן אור')).toBe('oil');
    expect(detectFormat('אור מיני')).toBe('small');
    expect(detectFormat('קפסולות אור')).toBe('capsule');
    expect(detectFormat('אור')).toBe('inflorescence');
  });
  it('canonical key separates format, merges identical', () => {
    expect(canonicalKeyFor('אור', 'oil')).not.toBe(canonicalKeyFor('אור', 'inflorescence'));
    expect(canonicalKeyFor('אור', 'oil')).toBe(canonicalKeyFor(' אור ', 'oil'));
  });
  it('imageHash is stable and differs by content', () => {
    expect(imageHash('abc')).toBe(imageHash('abc'));
    expect(imageHash('abc')).not.toBe(imageHash('abd'));
  });
});
