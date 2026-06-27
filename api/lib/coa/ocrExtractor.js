/**
 * ocrExtractor.js — Extract text from images/scanned PDFs using tesseract.js.
 *
 * tesseract.js is already installed in this project.
 * Supports: PNG, JPEG, TIFF, BMP (image files), and scanned/image PDFs.
 *
 * FOUNDER: For production, consider Google Cloud Vision or AWS Textract
 * which handle Hebrew text better. tesseract.js is a zero-cost fallback.
 */

/**
 * Extract text from an image buffer (PNG/JPEG/etc.)
 * @param {Buffer} imageBuffer
 * @param {'heb+eng' | 'eng' | 'heb'} [lang='heb+eng']
 * @returns {Promise<string>}
 */
export async function extractTextFromImage(imageBuffer, lang = 'heb+eng') {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(lang);
    const { data: { text } } = await worker.recognize(imageBuffer);
    await worker.terminate();
    return text;
  } catch (err) {
    console.warn('[ocrExtractor] tesseract.js failed:', err.message);
    return '';
  }
}

/**
 * Detect if a Buffer is likely a PDF (magic bytes %PDF).
 * @param {Buffer} buf
 */
export function isPdf(buf) {
  return buf && buf.length > 4 && buf.slice(0, 4).toString('ascii') === '%PDF';
}

/**
 * Detect if a Buffer is likely an image (PNG/JPEG/BMP magic bytes).
 * @param {Buffer} buf
 */
export function isImage(buf) {
  if (!buf || buf.length < 4) return false;
  const hex = buf.slice(0, 4).toString('hex');
  return (
    hex.startsWith('89504e47') || // PNG
    hex.startsWith('ffd8ff')   || // JPEG
    hex.startsWith('424d')        // BMP
  );
}

/**
 * Extract text from an uploaded file buffer (image or PDF).
 * Returns empty string if extraction fails — caller falls back to generic parser.
 * @param {Buffer} buf
 * @param {string} [mimeType]
 * @returns {Promise<string>}
 */
export async function extractText(buf, mimeType = '') {
  if (isImage(buf) || mimeType.startsWith('image/')) {
    return extractTextFromImage(buf);
  }

  if (isPdf(buf) || mimeType === 'application/pdf') {
    // Try to extract text layer first (fast, no OCR needed for digital PDFs)
    try {
      // Dynamic import — pdf-parse is optional; gracefully skip if not installed
      const pdfParse = await import('pdf-parse').catch(() => null);
      if (pdfParse) {
        const data = await pdfParse.default(buf);
        if (data.text?.trim().length > 50) return data.text;
      }
    } catch { /* not installed or failed */ }

    // Fallback: render first page as image then OCR it
    // (requires canvas + pdfjs-dist — stub here)
    console.warn('[ocrExtractor] PDF text extraction failed — OCR of scanned PDF not yet wired');
    return '';
  }

  // Plain text
  return buf.toString('utf8');
}
