/**
 * tikunOlamParser.js — pdfBatch adapter for Tikun Olam (תיקון עולם).
 *
 * Site structure: per-batch PDFs at tikun-olam.co.il/batch-specifications/.
 * Each PDF is one lot → content is MEASURED data (signed lab COA).
 * provenance is always 'measured' — no fallback to 'declared'.
 *
 * The input to parse() is text extracted from the PDF (by pdf-parse or Tesseract OCR).
 * Tikun Olam PDFs typically contain:
 *   - Strain name in Hebrew + transliterated English
 *   - Lot / batch number labelled מספר לוט / Lot No
 *   - THC%, CBD% as point values
 *   - Terpene profile (varies: present on newer batches, absent on older)
 *   - Cultivation method and irradiation status
 *   - Lab signature / stamp (confirms "measured" status)
 */

const TERP_CANONICAL = {
  myrcene: 'myrcene', 'β-myrcene': 'myrcene', 'beta-myrcene': 'myrcene', מירצן: 'myrcene',
  limonene: 'limonene', 'd-limonene': 'limonene', לימונן: 'limonene',
  linalool: 'linalool', לינלול: 'linalool',
  caryophyllene: 'caryophyllene', 'β-caryophyllene': 'caryophyllene', קריופילן: 'caryophyllene',
  'alpha-pinene': 'pinene', 'α-pinene': 'pinene', pinene: 'pinene', פינן: 'pinene',
  terpinolene: 'terpinolene', terpinolene: 'terpinolene',
  humulene: 'humulene', 'α-humulene': 'humulene',
  ocimene: 'ocimene', 'β-ocimene': 'ocimene',
};

function normalizeTerp(raw) {
  return TERP_CANONICAL[raw.trim().toLowerCase()] ?? null;
}

function parsePct(s) {
  const m = String(s ?? '').replace(',', '.').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function parseCultivationMethod(raw) {
  const s = (raw || '').toLowerCase();
  if (/greenhouse|חממה/.test(s)) return 'greenhouse';
  if (/indoor|אינדור|פנים/.test(s)) return 'indoor';
  if (/outdoor|חוץ/.test(s)) return 'outdoor';
  if (/hybrid|היברידי/.test(s)) return 'hybrid_grow';
  return undefined;
}

/**
 * Parse text extracted from a Tikun Olam COA PDF.
 * Always returns provenance='measured' (signed per-batch laboratory document).
 *
 * @param {string} text        - Extracted PDF text (from pdf-parse or OCR)
 * @param {string} [sourceUrl] - URL of the PDF for provenance tracking
 * @returns {{ batches: ParsedCOA[], warnings: string[] }}
 */
export function parseTikunOlamPDF(text, sourceUrl = '') {
  const warnings = [];

  if (!text || typeof text !== 'string') {
    return { batches: [], warnings: ['Empty or non-string text received'] };
  }

  // Normalise: collapse multi-space but preserve newlines for line-scoped regexes
  const t = text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\r\n?/g, '\n');

  // ── Lot / batch number ───────────────────────────────────────────────────────
  const lotMatch =
    t.match(/(?:מספר\s*לוט|lot\s*no\.?|מספר\s*אצווה|batch\s*(?:no\.?|number))\s*:?\s*([A-Z0-9\-]{3,20})/i) ||
    t.match(/\b(TKO[\-][A-Z0-9\-]{3,16})\b/i);

  if (!lotMatch) {
    warnings.push('tikunOlamParser: no lot number found — may be a non-batch page');
    return { batches: [], warnings };
  }
  const batchNo = lotMatch[1].trim();

  // ── Strain / product name ────────────────────────────────────────────────────
  const strainMatch =
    t.match(/(?:שם\s*המוצר|שם\s*הזן|מוצר|product\s*name|strain\s*name)\s*:?\s*([^\n,;]{3,60})/im) ||
    t.match(/(?:Tikun Olam\s*[\-—]\s*)([^\n,;]{3,50})/im);
  const genetics = strainMatch?.[1]?.trim() ?? null;

  // ── THC / CBD ────────────────────────────────────────────────────────────────
  const thcMatch = t.match(/THC\s*:?\s*([\d.,]+)\s*%/i);
  const cbdMatch = t.match(/CBD\s*:?\s*([\d.,]+)\s*%/i);
  const thcPct = parsePct(thcMatch?.[1]);
  const cbdPct = parsePct(cbdMatch?.[1]);

  if (thcPct === null) {
    warnings.push(`tikunOlamParser: no THC value found for lot ${batchNo}`);
  }

  // ── Terpenes ─────────────────────────────────────────────────────────────────
  const terpenes = {};
  const TERP_RE = /([א-תa-zA-Zα-β][א-תa-zA-Z\- \t]{1,28}?)\s*:?\s*([\d.,]+)\s*%/g;
  let m;
  while ((m = TERP_RE.exec(t)) !== null) {
    const canonical = normalizeTerp(m[1]);
    if (canonical) {
      const pct = parsePct(m[2]);
      if (pct !== null && pct > 0 && pct < 10) terpenes[canonical] = pct;
    }
  }

  // ── Cultivation ──────────────────────────────────────────────────────────────
  const cultivationMatch = t.match(
    /(?:שיטת\s*גידול|cultivation|grow\s*method)\s*:?\s*([^\n,;]{3,30})/i,
  );
  const cultivationMethod = parseCultivationMethod(cultivationMatch?.[1]);

  // ── Irradiation ──────────────────────────────────────────────────────────────
  const irradiationMatch = t.match(/(?:הקרנה|irradiat(?:ed|ion))\s*:?\s*(yes|no|כן|לא)/i);
  const irradiation = irradiationMatch
    ? /yes|כן/.test(irradiationMatch[1]) : undefined;

  // Always 'measured': Tikun Olam PDFs are signed MOH-compliant lab COAs
  return {
    batches: [{
      batchNo,
      genetics,
      cultivator: 'Tikun Olam',
      cultivationMethod,
      irradiation,
      thcPct,
      cbdPct,
      terpenes,
      provenance: 'measured',
      coaUrl: sourceUrl,
      rawText: t.slice(0, 2000),
    }],
    warnings,
  };
}

// ── Fixture: Tikun Olam COA PDF text (as extracted by pdf-parse) ──────────────
// Based on the standard Israeli MOH COA format used by Tikun Olam.
// Contains lot number, strain name, THC/CBD point values → provenance='measured'.
export const TIKUN_OLAM_COA_TEXT = `
תיקון עולם Cannabis
תעודת בדיקה — Batch Certificate of Analysis

שם המוצר: אגורה (Agora)
מספר לוט: TKO-A-2024-089
תאריך ייצור: 15/03/2024
שיטת גידול: Greenhouse
הקרנה: לא

ניתוח קנאבינואידים
THC: 19.2%
CBD: 0.3%
CBN: 0.1%

פרופיל טרפנים
Myrcene: 0.74%
β-Caryophyllene: 0.52%
Humulene: 0.31%
Limonene: 0.28%

החתימה הדיגיטלית מאמתת תוצאות אלו כמדודות במעבדה מוסמכת.
Tikun Olam Ltd | ת.ד 1234 | www.tikun-olam.co.il
`;
