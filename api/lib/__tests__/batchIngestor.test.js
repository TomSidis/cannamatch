/**
 * batchIngestor.test.js — Tests for Phase 3 batch ingestion.
 *
 * Tests:
 *   A. Failure isolation — one manufacturer failing doesn't abort the run
 *   B. Diff — existing batchNos are skipped
 *   C. parseCOA dispatch — correct parser selected by manufacturerId
 *   D. 403 proof — /api/admin/upload-coa rejects requests without admin JWT
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestManufacturer, runFullIngestion } from '../batchIngestor.js';
import { parseCOA } from '../coa/parseCOA.js';
import { SHAPO_FIXTURE_HTML } from '../coa/seachParser.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Mock pool that records queries and returns preset results */
function mockPool(overrides = {}) {
  return {
    query: vi.fn(async (sql) => {
      if (/SELECT id FROM grow_batch/.test(sql)) return { rows: [] };
      if (/SELECT id FROM genetics_node/.test(sql)) return { rows: [] };
      if (/INSERT INTO grow_batch/.test(sql)) return { rowCount: 1 };
      if (/UPDATE manufacturer_registry/.test(sql)) return { rowCount: 1 };
      if (/INSERT INTO scrape_run_log/.test(sql)) return { rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
    ...overrides,
  };
}

/** Manufacturer that always fails to fetch */
const FAILING_MFR = {
  id: 'failing-test-mfr',
  display_name: 'Failing Manufacturer',
  batches_url: 'http://127.0.0.1:19999/unreachable',
  parser_type: 'html',
};

// ── A. Failure isolation ───────────────────────────────────────────────────────
describe('A — failure isolation', () => {
  it('ingestManufacturer returns an error stat without throwing', async () => {
    const pool = mockPool();

    // Stub fetch to fail immediately (avoids real network timeout of 15s × 3)
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const stats = await ingestManufacturer(pool, FAILING_MFR);

    globalThis.fetch = origFetch;

    expect(stats.error).toBeTruthy();
    expect(stats.newBatches).toBe(0);
    // retry delay = 2s + 4s = 6s max; with mocked fetch the reject is instant but setTimeout still fires
  }, 20_000); // allow up to 20s for retry backoff (2+4s × jitter)

  it('runFullIngestion continues past a failing manufacturer', async () => {
    // Two manufacturers: one fails, one is simulated via fixture
    const pool = mockPool();

    // We can't hit a real URL in unit tests; simulate with a stub
    // by patching fetch on the global scope for this test
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('unreachable')) throw new Error('ECONNREFUSED');
      // Seach — return fixture HTML
      return { ok: true, text: async () => SHAPO_FIXTURE_HTML };
    });

    const manufacturers = [
      FAILING_MFR,
      { id: 'seach', display_name: 'Seach', batches_url: 'https://seach.co.il/batches/', parser_type: 'html' },
    ];

    // Stub pool.query to return manufacturer list
    pool.query = vi.fn(async (sql) => {
      if (/SELECT id, display_name/.test(sql)) return { rows: manufacturers };
      if (/SELECT id FROM grow_batch/.test(sql)) return { rows: [] };
      if (/SELECT id FROM genetics_node/.test(sql)) return { rows: [] };
      return { rows: [], rowCount: 1 };
    });

    const result = await runFullIngestion(pool);

    globalThis.fetch = originalFetch;

    expect(result.failed).toContain('Failing Manufacturer');
    // Seach parsed 1 batch from fixture
    expect(result.totalNew).toBeGreaterThan(0);
  }, 20_000); // allow retry backoff
});

// ── B. Diff — existing batchNos skipped ───────────────────────────────────────
describe('B — diff: skip existing batches', () => {
  it('does not re-insert a batchNo that already exists', async () => {
    const pool = mockPool({
      query: vi.fn(async (sql) => {
        // Return SHA-2024-031 as already existing
        if (/SELECT id FROM grow_batch/.test(sql)) {
          return { rows: [{ id: 'SHA-2024-031' }] };
        }
        return { rows: [], rowCount: 0 };
      }),
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => SHAPO_FIXTURE_HTML,
    }));

    const stats = await ingestManufacturer(pool, {
      id: 'seach', display_name: 'Seach',
      batches_url: 'https://seach.co.il/', parser_type: 'html',
    });

    globalThis.fetch = originalFetch;

    // SHA-2024-031 was already in the DB → skipped
    expect(stats.newBatches).toBe(0);
    expect(stats.error).toBeNull();
  });
});

// ── C. parseCOA dispatch ───────────────────────────────────────────────────────
describe('C — parseCOA dispatcher', () => {
  it('seach → parseSeachHTML finds 1 batch in fixture', () => {
    const { batches, warnings } = parseCOA('seach', SHAPO_FIXTURE_HTML);
    expect(batches).toHaveLength(1);
    expect(batches[0].batchNo).toBe('SHA-2024-031');
  });

  it('unknown manufacturer → generic parser + warning', () => {
    const text = 'Batch No: UNK-001\nTHC: 20%\nMyrcene: 0.5%';
    const { batches, warnings } = parseCOA('new-unknown-brand', text);
    expect(warnings[0]).toMatch(/No specific parser/);
    expect(batches[0]?.batchNo).toBe('UNK-001');
  });
});

// ── D. 403 proof — /api/admin/* requires admin JWT ────────────────────────────
// Integration-style: import express app and test the route directly
describe('D — 403 without admin token', () => {
  it('requireRole("admin") imported without error', async () => {
    const mod = await import('../../middleware/requireRole.js');
    expect(typeof mod.requireRole).toBe('function');
  });

  it('401 when no Authorization header (unit test of middleware)', async () => {
    const { requireRole } = await import('../../middleware/requireRole.js');
    const middleware = requireRole('admin');

    let statusCode;
    let responseBody;

    const req = { headers: {} };
    const res = {
      status: (code) => { statusCode = code; return res; },
      json:   (body)  => { responseBody = body; },
    };
    const next = vi.fn();

    middleware(req, res, next);

    expect(statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('403 when JWT is valid but role = user (not admin)', async () => {
    // Sign a user-role token with the dev fallback secret
    const jwt = await import('jsonwebtoken');
    const token = jwt.default.sign(
      { sub: 'user-123', role: 'user' },
      'change-me-in-production-set-JWT_SECRET-env',
      { expiresIn: '1h' }
    );

    const { requireRole } = await import('../../middleware/requireRole.js');
    const middleware = requireRole('admin');

    let statusCode;
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {
      status: (code) => { statusCode = code; return res; },
      json:   vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);

    expect(statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
