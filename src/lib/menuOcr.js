/**
 * menuOcr — Tesseract.js v7 browser OCR wrapper.
 * No API key. No server. Runs entirely in a Web Worker.
 * Supports Hebrew + English (pharmacy menus use both).
 *
 * Uses dynamic import so Tesseract.js is NOT bundled into the main chunk.
 */

/**
 * ocrFile — run OCR on a File/Blob/HTMLImageElement/data-URL.
 * @param {File|Blob|string} source
 * @param {(pct: number) => void} [onProgress] — called 0-100 during recognition
 * @returns {Promise<string>} extracted plain text
 */
export async function ocrFile(source, onProgress) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["heb", "eng"], 1, {
    logger: ({ status, progress }) => {
      if (status === "recognizing text" && onProgress) {
        onProgress(Math.round((progress || 0) * 100));
      }
    },
  });
  try {
    const { data: { text } } = await worker.recognize(source);
    return text || "";
  } finally {
    await worker.terminate();
  }
}
