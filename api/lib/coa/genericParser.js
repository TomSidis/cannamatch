/**
 * genericParser.js — Fallback COA parser for unknown or changed manufacturer formats.
 * Also handles CSV and plain-text COA exports.
 *
 * Used when:
 *   1. No manufacturer-specific parser exists
 *   2. A manufacturer-specific parser fails (format change)
 *   3. The admin uploads a text/CSV file manually
 */

const TERPENE_MAP = {
  myrcene: 'myrcene', 'β-myrcene': 'myrcene', 'b-myrcene': 'myrcene',
  limonene: 'limonene', 'd-limonene': 'limonene',
  caryophyllene: 'caryophyllene', 'β-caryophyllene': 'caryophyllene',
  linalool: 'linalool',
  pinene: 'pinene', 'α-pinene': 'pinene', 'β-pinene': 'pinene',
  terpinolene: 'terpinolene',
  humulene: 'humulene', 'α-humulene': 'humulene',
  ocimene: 'ocimene', 'β-ocimene': 'ocimene',
  'מירצן': 'myrcene', 'לימונן': 'limonene', 'קריופילן': 'caryophyllene',
  'לינלול': 'linalool', 'פינן': 'pinene', 'טרפינולן': 'terpinolene',
  'הומולן': 'humulene', 'אוצימן': 'ocimene',
};

function normalizeTerpene(raw) {
  return TERPENE_MAP[raw.trim().toLowerCase()] ?? null;
}

function parsePct(s) {
  const m = String(s || '').replace(',', '.').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function parseCultivationMethod(raw) {
  const s = (raw || '').toLowerCase();
  if (/greenhouse|חממה/.test(s)) return 'greenhouse';
  if (/indoor|אינדור/.test(s)) return 'indoor';
  if (/outdoor|חוץ/.test(s)) return 'outdoor';
  if (/hybrid/.test(s)) return 'hybrid_grow';
  return undefined;
}

/**
 * Parse any plain-text COA (or strip HTML → text from an unknown manufacturer page).
 *
 * @param {string} text          - Plain text content (HTML will be stripped first)
 * @param {string} [cultivator]  - Manufacturer name to embed in output
 * @param {string} [sourceUrl]
 * @returns {{ batches: import('./types.js').ParsedCOA[], warnings: string[] }}
 */
export function parseGenericText(text, cultivator = 'Unknown', sourceUrl = '') {
  const batches = [];
  const warnings = [];

  // Strip HTML tags if present
  const plain = typeof text === 'string'
    ? text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ')
    : '';

  if (!plain.trim()) return { batches: [], warnings: ['Empty content'] };

  // Try to extract batch number
  const batchMatch = plain.match(
    /(?:batch\s*(?:no\.?|number|#)|lot\s*(?:no\.?|#)?|מספר אצווה|אצווה)\s*:?\s*([A-Z0-9\-]{3,20})/i,
  );
  const batchNo = batchMatch?.[1]?.trim();

  if (!batchNo) {
    warnings.push('Could not extract batch number — content may require a manufacturer-specific parser');
    return { batches: [], warnings };
  }

  // THC / CBD
  const thcMatch = plain.match(/THC\s*:?\s*([\d.,]+)\s*%?/i);
  const cbdMatch = plain.match(/CBD\s*:?\s*([\d.,]+)\s*%?/i);
  const thcPct = parsePct(thcMatch?.[1]);
  const cbdPct = parsePct(cbdMatch?.[1]);

  // Terpenes
  const terpenes = {};
  // space/tab only (not \s) so names never span newlines
  const terpRe = /([א-תa-zA-Zα-βΑ-Ωα-ω][א-תa-zA-Z\- \t]{1,30}?)\s*:?\s*([\d.,]+)\s*%/g;
  let m;
  while ((m = terpRe.exec(plain)) !== null) {
    const canonical = normalizeTerpene(m[1]);
    if (canonical) {
      const pct = parsePct(m[2]);
      if (pct !== null && pct <= 5.0) terpenes[canonical] = pct;
    }
  }

  // Genetics
  const geneticsMatch = plain.match(
    /(?:strain|זן|genetics)\s*:?\s*([^\n,;|]{3,60})/i,
  );
  const genetics = geneticsMatch?.[1]?.trim();

  // Cultivation
  const cultivationMatch = plain.match(
    /(?:cultivation|grow\s*method|שיטת גידול)\s*:?\s*([^\n,;|]{3,30})/i,
  );

  // Provenance determination
  const provenance = (thcPct !== null && Object.keys(terpenes).length > 0)
    ? 'measured' : 'declared';

  batches.push({
    batchNo,
    genetics,
    parents: [],
    cultivator,
    cultivationMethod: parseCultivationMethod(cultivationMatch?.[1]),
    thcPct,
    cbdPct,
    terpenes,
    provenance,
    coaUrl: sourceUrl,
    rawText: plain.slice(0, 2000),
  });

  return { batches, warnings };
}

/**
 * Parse a CSV COA (headers in first row, one batch per row).
 * Expected columns: batch_no, strain, thc_pct, cbd_pct, myrcene, limonene, …
 */
export function parseGenericCSV(csvText, cultivator = 'Unknown') {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { batches: [], warnings: ['CSV has fewer than 2 rows'] };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["\s]/g, ''));
  const batches = [];
  const warnings = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = Object.fromEntries(headers.map((h, j) => [h, values[j]]));

    const batchNo = row.batch_no || row.batchno || row.lot || row.lot_no;
    if (!batchNo) { warnings.push(`Row ${i}: no batch number`); continue; }

    const terpenes = {};
    for (const [key, val] of Object.entries(row)) {
      const canonical = normalizeTerpene(key);
      if (canonical) {
        const pct = parsePct(val);
        if (pct !== null) terpenes[canonical] = pct;
      }
    }

    batches.push({
      batchNo,
      genetics:           row.strain || row.genetics,
      parents:            [],
      cultivator,
      cultivationMethod:  parseCultivationMethod(row.cultivation || row.method),
      thcPct:             parsePct(row.thc_pct || row.thc),
      cbdPct:             parsePct(row.cbd_pct || row.cbd),
      terpenes,
      provenance:         Object.keys(terpenes).length > 0 ? 'measured' : 'declared',
      rawText:            lines[i],
    });
  }

  return { batches, warnings };
}
