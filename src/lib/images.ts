export interface CompressOptions {
  maxDimension: number;
  quality: number;
}

/**
 * Dish photos are the hero of a recipe page, so they keep a high resolution and quality.
 * At 2400px/0.9 a typical phone photo lands around 500-700KB as WebP - still hundreds of
 * recipes inside the free 1GB bucket, but sharp on a retina screen.
 */
export const DISH_PHOTO_OPTIONS: CompressOptions = { maxDimension: 2400, quality: 0.9 };
/** Scans must stay readable when zoomed into grandma's handwriting. */
export const SCAN_PHOTO_OPTIONS: CompressOptions = { maxDimension: 2800, quality: 0.92 };

export async function compressImage(file: File, options: CompressOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  // Never upscale: a small original stays small instead of being blown up and blurred.
  const scale = Math.min(1, options.maxDimension / Math.max(bitmap.width, bitmap.height));
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
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', options.quality)
  );
  if (!blob) throw new Error('image compression failed');
  return blob;
}
