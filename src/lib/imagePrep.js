/**
 * imagePrep — client-side image downscale before OCR (Layer 4.1).
 * Phone photos are huge; Tesseract is slow on them. Downscale to a max dimension
 * while keeping enough resolution for menu text. Browser-only (canvas/Image).
 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
    fr.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('טעינת התמונה נכשלה'));
    img.src = src;
  });
}

/**
 * downscaleImage — returns a re-encoded JPEG no larger than maxDim on its long edge.
 * @returns {Promise<{dataUrl:string, blob:Blob, width:number, height:number}>}
 */
export async function downscaleImage(file, maxDim = 1600, quality = 0.82) {
  const img = await loadImage(await fileToDataUrl(file));
  const longEdge = Math.max(img.width, img.height) || 1;
  const scale = Math.min(1, maxDim / longEdge);            // never upscale
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  return { dataUrl, blob: blob || file, width, height };
}
