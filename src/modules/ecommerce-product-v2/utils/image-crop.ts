/**
 * Client-side image crop/resize (images I4 — docs/images/04 §3).
 *
 * The Step-2 image editor produces channel-sized **derivatives** on the client (canvas), then uploads
 * them as new files — the master image is never mutated (non-destructive override model). This module
 * has no channel knowledge: the aspect / target-width it applies come from the runtime
 * {@link ChannelImageSpec} (DATA), not literals.
 *
 * CORS note: exporting a canvas that has drawn a cross-origin image taints it and `toBlob` throws a
 * SecurityError. Freshly-picked local files (object URLs) are always safe; re-cropping an already
 * uploaded/remote URL requires the storage/CDN to send permissive CORS headers. Callers should treat
 * a thrown error as "can't crop this source" and fall back to using the image as-is.
 */
import type { ChannelImageSpec } from "../step2-channel-fields/types/channelStore";

export interface CropPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Load an <img> from a URL with CORS enabled so the canvas can be exported when the host allows it. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for cropping"));
    img.src = src;
  });
}

/**
 * Crop `src` to `crop` (natural pixels), optionally downscaling so the output width ≤ `maxWidth`
 * (never upscales). Returns an encoded Blob. Defaults to JPEG with a white matte (channels such as
 * Amazon require a white background and JPEG has no alpha); pass `mimeType: "image/png"` to preserve
 * transparency.
 */
export async function getCroppedBlob(
  src: string,
  crop: CropPixels,
  opts: { maxWidth?: number; mimeType?: string; quality?: number } = {},
): Promise<Blob> {
  const { maxWidth, mimeType = "image/jpeg", quality = 0.92 } = opts;
  const img = await loadImage(src);

  let outW = Math.max(1, Math.round(crop.width));
  let outH = Math.max(1, Math.round(crop.height));
  if (maxWidth && outW > maxWidth) {
    const scale = maxWidth / outW;
    outW = Math.max(1, Math.round(outW * scale));
    outH = Math.max(1, Math.round(outH * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  if (mimeType === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, outW, outH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
      mimeType,
      quality,
    );
  });
}

/** Wrap a Blob as a File so it can go through the existing multipart / presign upload path. */
export function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

/**
 * The aspect ratio (width / height) the cropper should lock to for a channel, derived from the spec:
 * `requireSquare` → 1, else the first `allowedAspectRatios` entry, else undefined (free crop).
 */
export function specAspect(spec?: ChannelImageSpec | null): number | undefined {
  if (!spec) return undefined;
  if (spec.requireSquare) return 1;
  const first = spec.allowedAspectRatios?.[0];
  if (first) {
    const [w, h] = first.split(":").map((n) => Number(n.trim()));
    if (w > 0 && h > 0) return w / h;
  }
  return undefined;
}

/** Upper bound for a cropped derivative's width, from the spec's maxWidth (undefined = no cap). */
export function specMaxWidth(spec?: ChannelImageSpec | null): number | undefined {
  return spec?.maxWidth && spec.maxWidth > 0 ? spec.maxWidth : undefined;
}
