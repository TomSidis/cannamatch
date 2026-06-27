/**
 * licenseOcr.js — extract monthly gram quotas from an Israeli cannabis license.
 *
 * Two entry points:
 *   ocrLicense(file, onProgress) — runs Tesseract on the image, returns raw text
 *   parseGramsFromLicense(text)  — pure regex parser; returns { gramsByCategory }
 *
 * Typical Israeli license format (Ministry of Health):
 *   T22/C4   30 גרם/חודש
 *   T10/C10  20 גרם/חודש
 *
 * Only canonical category codes (T##/C##) are extracted; freeform text is ignored.
 */

import { ocrFile } from './menuOcr.js';

/**
 * Run OCR on a license image file.
 * @param {File|Blob} file
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<string>} raw OCR text
 */
export async function ocrLicense(file, onProgress) {
  return ocrFile(file, onProgress);
}

/**
 * Parse OCR text from a cannabis license.
 * Returns { gramsByCategory, categories, rawLines }.
 * categories = array of recognized T##/C## codes (even without gram amounts).
 * gramsByCategory = { 'T22/C4': 30, ... } — only categories WITH detected grams.
 *
 * @param {string} text
 * @returns {{ gramsByCategory: Record<string,number>, categories: string[], rawLines: string[] }}
 */
export function parseGramsFromLicense(text) {
  if (!text) return { gramsByCategory: {}, categories: [], rawLines: [] };

  const gramsByCategory = {};
  const categories      = [];
  const rawLines        = [];

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Extract T##/C## category code
    const catMatch = line.match(/T(\d{1,3})\/C(\d{1,3})/i);
    if (!catMatch) continue;

    const cat = `T${catMatch[1]}/C${catMatch[2]}`;
    if (!categories.includes(cat)) categories.push(cat);
    rawLines.push(line);

    // Extract gram amount — look for a 1-3 digit number near gram keywords
    const gramsMatch =
      line.match(/(\d{1,3})\s*(?:גרם|גר׳|gr|gram)/i) ||  // "30 גרם"
      line.match(/(\d{1,3})\s*g(?:[^r]|$)/i)            ||  // "30g"
      line.match(/[:=\s](\d{1,3})\s*(?:\/|$)/);             // ": 30" or "= 30" or line-end

    if (gramsMatch) {
      const grams = parseInt(gramsMatch[1], 10);
      // Sanity: 5–200 g/month is a realistic range for Israeli licenses
      if (grams >= 5 && grams <= 200) {
        gramsByCategory[cat] = grams;
      }
    }
  }

  return { gramsByCategory, categories, rawLines };
}
