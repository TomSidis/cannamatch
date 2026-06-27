/**
 * phase3ProveIt.test.js — PROVE IT gate for Phase 3 (Recurring Daily Scraper).
 *
 * Checks all PROVE IT requirements from the master document:
 *   P1. htmlCatalog on Solo → ≥20 strains parsed
 *   P2. htmlPerProduct on Seach/Tchelet → lineage Shark's Breath×Skunk#1 + terpenes, provenance=declared
 *   P3. pdfBatch on Tikun Olam COA → lot+THC/CBD, provenance=measured
 *   P4. cron once → counts (mocked); cron twice → diff works (zero new on 2nd run)
 *   P5. Simulate failure → isolates + manual list + continues
 *   P6. NO aggregator fetched (static registry check)
 *   P7. provenance enum = exactly 'measured' | 'declared' across all parsers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSoloCatalogHTML, SOLO_CATALOG_FIXTURE_HTML }              from '../soloParser.js';
import { parseSeachHTML, TCHELET_PRODUCT_FIXTURE_HTML, SHAPO_FIXTURE_HTML } from '../seachParser.js';
import { parseTikunOlamPDF, TIKUN_OLAM_COA_TEXT }                          from '../tikunOlamParser.js';
import { parseCOA }                                         from '../parseCOA.js';
import { runFullIngestion }                                 from '../../batchIngestor.js';

// ══════════════════════════════════════════════════════════════════════════════
// P1. htmlCatalog — Solo (≥20 strains)
// ══════════════════════════════════════════════════════════════════════════════

describe('P1 — Solo htmlCatalog: ≥20 strains', () => {
  let result;
  beforeEach(() => { result = parseSoloCatalogHTML(SOLO_CATALOG_FIXTURE_HTML); });

  it('returns zero warnings for valid catalog HTML', () => {
    expect(result.warnings).toHaveLength(0);
  });

  it('parses at least 20 strains from the catalog page', () => {
    expect(result.batches.length).toBeGreaterThanOrEqual(20);
  });

  it('every strain has a genetics/cross string', () => {
    const missingGenetics = result.batches.filter(b => !b.genetics);
    expect(missingGenetics).toHaveLength(0);
  });

  it('every strain has at least one terpene', () => {
    const noTerps = result.batches.filter(b => Object.keys(b.terpenes).length === 0);
    expect(noTerps).toHaveLength(0);
  });

  it('all strains have provenance=declared (catalog, not a signed COA)', () => {
    const nonDeclared = result.batches.filter(b => b.provenance !== 'declared');
    expect(nonDeclared).toHaveLength(0);
  });

  it('first strain is Solo AKA with Biscotti × Gelato genetics', () => {
    const aka = result.batches.find(b => b.commercial === 'Solo AKA');
    expect(aka).toBeDefined();
    expect(aka.genetics).toMatch(/Biscotti/i);
    expect(aka.genetics).toMatch(/Gelato/i);
  });

  it('parseCOA dispatcher routes "solo" → parseSoloCatalogHTML', () => {
    const dispatched = parseCOA('solo', SOLO_CATALOG_FIXTURE_HTML, 'https://solo-cannabis.co.il/batches');
    expect(dispatched.batches.length).toBeGreaterThanOrEqual(20);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P2. htmlPerProduct — Seach/Tchelet (lineage Shark's Breath × Skunk#1, provenance=declared)
// ══════════════════════════════════════════════════════════════════════════════

describe("P2 — Seach/Tchelet htmlPerProduct: lineage + terpenes, provenance=declared", () => {
  let result;
  beforeEach(() => { result = parseSeachHTML(TCHELET_PRODUCT_FIXTURE_HTML); });

  it('parses the Tchelet product page without fatal warnings', () => {
    const fatal = result.warnings.filter(w => /no batches found/i.test(w));
    expect(fatal).toHaveLength(0);
  });

  it('finds exactly one batch entry', () => {
    expect(result.batches).toHaveLength(1);
  });

  it('extracts lineage with Shark’s Breath parent', () => {
    const batch = result.batches[0];
    const parentStr = batch.parents?.join(' × ') ?? '';
    expect(parentStr).toMatch(/Shark'?s?\s*Breath/i);
  });

  it('extracts lineage with Skunk#1 parent', () => {
    const batch = result.batches[0];
    const parentStr = batch.parents?.join(' × ') ?? '';
    expect(parentStr).toMatch(/Skunk/i);
  });

  it('has at least 2 terpenes', () => {
    expect(Object.keys(result.batches[0].terpenes).length).toBeGreaterThanOrEqual(2);
  });

  it('provenance is declared (product page, no signed COA value)', () => {
    expect(result.batches[0].provenance).toBe('declared');
  });

  it('parseCOA dispatcher routes "seach" → parseSeachHTML', () => {
    const dispatched = parseCOA('seach', TCHELET_PRODUCT_FIXTURE_HTML);
    expect(dispatched.batches).toHaveLength(1);
    expect(dispatched.batches[0].provenance).toBe('declared');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P3. pdfBatch — Tikun Olam COA (lot + THC/CBD, provenance=measured)
// ══════════════════════════════════════════════════════════════════════════════

describe('P3 — Tikun Olam pdfBatch: lot + THC/CBD, provenance=measured', () => {
  let result;
  beforeEach(() => { result = parseTikunOlamPDF(TIKUN_OLAM_COA_TEXT); });

  it('returns exactly one batch', () => {
    expect(result.batches).toHaveLength(1);
  });

  it('extracts lot number TKO-A-2024-089', () => {
    expect(result.batches[0].batchNo).toBe('TKO-A-2024-089');
  });

  it('extracts THC = 19.2%', () => {
    expect(result.batches[0].thcPct).toBeCloseTo(19.2, 1);
  });

  it('extracts CBD = 0.3%', () => {
    expect(result.batches[0].cbdPct).toBeCloseTo(0.3, 1);
  });

  it('provenance is measured (signed lab COA)', () => {
    expect(result.batches[0].provenance).toBe('measured');
  });

  it('cultivator is Tikun Olam', () => {
    expect(result.batches[0].cultivator).toBe('Tikun Olam');
  });

  it('parseCOA dispatcher routes "tikun-olam" → parseTikunOlamPDF', () => {
    const dispatched = parseCOA('tikun-olam', TIKUN_OLAM_COA_TEXT);
    expect(dispatched.batches[0].provenance).toBe('measured');
    expect(dispatched.batches[0].batchNo).toBe('TKO-A-2024-089');
  });

  it('handles empty text gracefully', () => {
    const empty = parseTikunOlamPDF('');
    expect(empty.batches).toHaveLength(0);
    expect(empty.warnings.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P4. Cron once → counts; cron twice → diff (zero new batches on 2nd run)
// ══════════════════════════════════════════════════════════════════════════════

describe('P4 — Cron diff: first run inserts, second run skips', () => {
  // makePool tracks which batchNos have been stored (simulates DB state across runs).
  // runFullIngestion(pool) fails on manufacturer_registry query → falls back to Seach.
  function makePool(initialBatchIds = []) {
    const stored = new Set(initialBatchIds);
    return {
      query: vi.fn(async (sql, params) => {
        if (/SELECT id FROM grow_batch/.test(sql)) {
          return { rows: [...stored].map(id => ({ id })) };
        }
        if (/FROM genetics_node/.test(sql)) return { rows: [] };
        if (/INSERT INTO grow_batch/.test(sql)) {
          if (params?.[0]) stored.add(params[0]);
          return { rowCount: 1 };
        }
        if (/UPDATE manufacturer_registry/.test(sql)) return { rowCount: 1 };
        if (/INSERT INTO scrape_run_log/.test(sql)) return { rowCount: 1 };
        return { rows: [], rowCount: 0 }; // manufacturer_registry → empty → fallback to Seach
      }),
    };
  }

  it('first run: totalNew > 0 and measured+declared > 0', async () => {
    const pool = makePool();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SHAPO_FIXTURE_HTML,
    });

    const result = await runFullIngestion(pool);
    expect(result.totalNew).toBeGreaterThan(0);
    expect(result.measured + result.declared).toBeGreaterThan(0);
  });

  it('second run: diff sees existing batchNo → totalNew = 0', async () => {
    const pool = makePool(['SHA-2024-031']); // pre-seeded with SHAPO batch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SHAPO_FIXTURE_HTML,
    });

    const result = await runFullIngestion(pool);
    expect(result.totalNew).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P5. Failure isolation — one manufacturer fails, others continue
// ══════════════════════════════════════════════════════════════════════════════

describe('P5 — Failure isolation', () => {
  // fetchWithRetry does MAX_RETRIES=2 with 2s+4s backoff for the failing URL → needs >6s
  it('failing manufacturer is in failed[]; run continues and inserts from working one', async () => {
    const FAILING = {
      id: 'failing-mfr', display_name: 'Always Fails',
      batches_url: 'http://127.0.0.1:19999/unreachable', parser_type: 'html',
    };
    const SEACH_MFR = {
      id: 'seach', display_name: 'Seach',
      batches_url: 'https://seach.co.il/ok', parser_type: 'html',
    };

    const pool = {
      query: vi.fn(async (sql) => {
        // Return both manufacturers from registry so runFullIngestion doesn't use fallback
        if (/FROM manufacturer_registry/.test(sql)) return { rows: [FAILING, SEACH_MFR] };
        if (/SELECT id FROM grow_batch/.test(sql)) return { rows: [] };
        if (/FROM genetics_node/.test(sql)) return { rows: [] };
        if (/INSERT INTO grow_batch/.test(sql)) return { rowCount: 1 };
        if (/UPDATE manufacturer_registry/.test(sql)) return { rowCount: 1 };
        if (/INSERT INTO scrape_run_log/.test(sql)) return { rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    };

    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (url.includes('unreachable')) throw new Error('ECONNREFUSED');
      return { ok: true, text: async () => SHAPO_FIXTURE_HTML };
    });

    const result = await runFullIngestion(pool);

    // Failing manufacturer's displayName appears in the failed array
    expect(result.failed).toContain('Always Fails');
    // Run continued — Seach inserted at least one batch
    expect(result.totalNew).toBeGreaterThan(0);
  }, 15000); // fetchWithRetry: 2s + 4s backoff for ECONNREFUSED × 2 retries
});

// ══════════════════════════════════════════════════════════════════════════════
// P6. NO aggregator fetched (registry check)
// ══════════════════════════════════════════════════════════════════════════════

describe('P6 — No aggregator in manufacturer_registry', () => {
  it('registry seed has no aggregator URLs (cannabiz, cannalist, jane)', async () => {
    // Read the SQL migration and verify no aggregator domains are present
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const sql = readFileSync(
      join(process.cwd(), 'api/db/migrations/007_batch_ingestion.sql'),
      'utf8',
    );
    const BANNED_DOMAINS = ['cannabiz', 'cannalist', 'jane.app', 'leafly', 'weedmaps'];
    for (const domain of BANNED_DOMAINS) {
      expect(sql.toLowerCase()).not.toContain(domain);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P7. provenance enum = exactly 'measured' | 'declared' in scraper output
// ══════════════════════════════════════════════════════════════════════════════

describe('P7 — provenance enum: only measured|declared from scrapers', () => {
  it('Solo parser only emits declared', () => {
    const { batches } = parseSoloCatalogHTML(SOLO_CATALOG_FIXTURE_HTML);
    for (const b of batches) {
      expect(['measured', 'declared']).toContain(b.provenance);
    }
  });

  it('Seach parser only emits measured or declared (never inferred/derived)', () => {
    const { batches } = parseSeachHTML(SHAPO_FIXTURE_HTML);
    for (const b of batches) {
      expect(['measured', 'declared']).toContain(b.provenance);
    }
  });

  it('Tikun Olam parser only emits measured', () => {
    const { batches } = parseTikunOlamPDF(TIKUN_OLAM_COA_TEXT);
    for (const b of batches) {
      expect(b.provenance).toBe('measured');
    }
  });
});
