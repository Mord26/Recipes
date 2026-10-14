export interface CompressOptions {
  maxDimension: number;
  quality: number;
  /** Hard ceiling for the output. The storage bucket rejects anything over 5MB, so stay under it. */
  maxBytes?: number;
}

/** Storage bucket limit is 5MB; keep a safety margin. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Dish photos are the hero of a recipe page, so they keep a high resolution and quality.
 * At 2400px/0.9 a typical phone photo lands around 500-700KB as WebP - still hundreds of
 * recipes inside the free 1GB bucket, but sharp on a retina screen.
 */
export const DISH_PHOTO_OPTIONS: CompressOptions = { maxDimension: 2400, quality: 0.9, maxBytes: MAX_UPLOAD_BYTES };
/** Scans must stay readable when zoomed into grandma's handwriting. */
export const SCAN_PHOTO_OPTIONS: CompressOptions = { maxDimension: 2800, quality: 0.92, maxBytes: MAX_UPLOAD_BYTES };

export async function compressImage(file: File, options: CompressOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const limit = options.maxBytes ?? MAX_UPLOAD_BYTES;
  let maxDimension = options.maxDimension;
  let quality = options.quality;
  try {
    // A busy photo (handwriting, texture) can come out far larger than a typical one at the same
    // settings. Step quality and then size down until it fits, instead of failing the upload later.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      // Never upscale: a small original stays small instead of being blown up and blurred.
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('canvas 2d context unavailable');
      // Smooth downscaling - the browser default is a fast, visibly blocky resample.
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', quality)
      );
      if (!blob) throw new Error('image compression failed');
      if (blob.size <= limit || attempt === 7) return blob;
      if (quality > 0.75) quality = Math.max(0.75, quality - 0.08);
      else maxDimension = Math.round(maxDimension * 0.85);
    }
    throw new Error('image compression failed');
  } finally {
    bitmap.close();
  }
}
