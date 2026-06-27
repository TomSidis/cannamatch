/**
 * parseCOA.js — Central dispatcher: manufacturer ID → correct parser.
 *
 * Adding a new manufacturer parser:
 *   1. Create api/lib/coa/<name>Parser.js exporting parse(content, url)
 *   2. Add an entry to PARSERS below.
 *   3. That's it — no other file needs to change.
 */

import { parseSeachHTML }               from './seachParser.js';
import { parseSoloCatalogHTML }          from './soloParser.js';
import { parseTikunOlamPDF }             from './tikunOlamParser.js';
import { parseGenericText, parseGenericCSV } from './genericParser.js';

// ── Parser registry ────────────────────────────────────────────────────────────
// Each entry: manufacturerId → parse function (html, url) → COAParseResult
const PARSERS = {
  seach:          (content, url) => parseSeachHTML(content, url),
  solo:           (content, url) => parseSoloCatalogHTML(content, url),
  'tikun-olam':   (content, url) => parseTikunOlamPDF(content, url),
  'peace-naturals': (content, url) => parseGenericText(content, 'Peace Naturals', url),
  canndoc:        (content, url) => parseGenericText(content, 'Canndoc', url),
  bazelet:        (content, url) => parseGenericText(content, 'Bazelet', url),
  imc:            (content, url) => parseGenericText(content, 'IMC', url),
  cnc:            (content, url) => parseGenericText(content, 'CNC', url),
  canabeer:       (content, url) => parseGenericText(content, 'Canabeer', url),
  together:       (content, url) => parseGenericText(content, 'Together', url),
  pharma:         (content, url) => parseGenericText(content, 'Pharma Seach', url),
  // PDF-based manufacturers use the same interface — content is pre-extracted text
  greenmediterra: (content, url) => parseGenericText(content, 'Green MediTerra', url),
  'teva-natur':   (content, url) => parseGenericText(content, 'Teva Natur', url),
};

/**
 * Parse COA content for a given manufacturer.
 * Falls back to generic parser if no manufacturer-specific parser exists.
 *
 * @param {string} manufacturerId  - slug matching manufacturer_registry.id
 * @param {string} content         - HTML or extracted text
 * @param {string} [url]           - source URL for provenance tracking
 * @returns {{ batches: ParsedCOA[], warnings: string[] }}
 */
export function parseCOA(manufacturerId, content, url = '') {
  const parser = PARSERS[manufacturerId];
  if (!parser) {
    const result = parseGenericText(content, manufacturerId, url);
    result.warnings.unshift(`No specific parser for "${manufacturerId}" — used generic parser`);
    return result;
  }
  return parser(content, url);
}

/**
 * Parse an uploaded file (Buffer) as a COA.
 * Extracts text from images/PDFs automatically via ocrExtractor.
 *
 * @param {Buffer}  fileBuffer
 * @param {string}  mimeType
 * @param {string}  manufacturerId
 * @param {string}  [url]
 * @returns {Promise<{ batches: ParsedCOA[], warnings: string[] }>}
 */
export async function parseCOAFile(fileBuffer, mimeType, manufacturerId, url = '') {
  const { extractText } = await import('./ocrExtractor.js');
  const text = await extractText(fileBuffer, mimeType);

  if (!text.trim()) {
    return { batches: [], warnings: ['Text extraction failed — file may be unsupported or corrupted'] };
  }

  // CSV files: delegate to CSV parser
  if (mimeType === 'text/csv' || url.endsWith('.csv')) {
    return parseGenericCSV(text.toString('utf8'), manufacturerId);
  }

  return parseCOA(manufacturerId, text, url);
}
