/**
 * Client-side image compression for inline project images (#215, decision 1A).
 *
 * Images are downscaled + re-encoded to a base64 data URL and embedded directly
 * in the project's rich-text document (no object storage in V1). A hard size cap
 * keeps a single image — and therefore the synced row — bounded.
 */

export const MAX_IMAGE_BYTES = 500 * 1024; // 500KB ceiling per image (V1)
export const MAX_IMAGE_DIM = 1280; // longest edge after downscale

/**
 * Scale (w, h) so the longest edge is at most `maxDim`, preserving aspect ratio.
 * Never upscales. Pure + deterministic so it can be unit-tested without a canvas.
 */
export function fitDimensions(w: number, h: number, maxDim: number): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const longest = Math.max(w, h);
  if (longest <= maxDim) return { w: Math.round(w), h: Math.round(h) };
  const scale = maxDim / longest;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Approximate decoded byte size of a base64 data URL (without the header). */
export function dataUrlByteSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  // 4 base64 chars → 3 bytes, minus padding.
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("file read failed"));
    r.readAsDataURL(file);
  });
}

/**
 * Compress an image File to a base64 data URL whose decoded size is ≤ maxBytes.
 * Downscales to MAX_IMAGE_DIM then steps JPEG quality down until it fits. Returns
 * null if the image still can't be brought under the cap (caller surfaces a toast).
 * Requires a DOM canvas — runs in the browser, not under unit tests.
 */
export async function compressImageToDataUrl(
  file: File,
  maxBytes: number = MAX_IMAGE_BYTES,
  maxDim: number = MAX_IMAGE_DIM,
): Promise<string | null> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const { w, h } = fitDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, maxDim);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);

  for (const quality of [0.85, 0.7, 0.55, 0.4, 0.3]) {
    const out = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlByteSize(out) <= maxBytes) return out;
  }
  return null;
}
