/**
 * Uploading recipe photos without losing them.
 *
 * The old flow threw on the first failed upload, which skipped the database write entirely - so
 * photos that HAD reached storage were never recorded and simply vanished from the app. Here every
 * photo is retried on its own, and whatever succeeded is always reported back to be saved.
 */

export type PhotoKind = 'photo' | 'scan';

export interface PendingPhoto {
  blob: Blob;
  kind: PhotoKind;
  position: number;
}

export interface UploadedPhoto {
  path: string;
  kind: PhotoKind;
  position: number;
}

export interface UploadReport {
  uploaded: UploadedPhoto[];
  failed: PendingPhoto[];
  attempts: number;
  lastError: unknown;
}

/** The slice of the Supabase storage client this needs, so the retry logic stays testable. */
export interface StorageLike {
  upload(path: string, blob: Blob, options: { contentType: string }): Promise<{ error: unknown }>;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 700;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface UploadHooks {
  newPath: () => string;
  onRetry?: (info: { kind: PhotoKind; attempt: number; error: unknown; bytes: number }) => void;
  onFailure?: (info: { kind: PhotoKind; attempts: number; error: unknown; bytes: number }) => void;
  wait?: (ms: number) => Promise<void>;
}

/**
 * Uploads every photo, retrying each one a few times. A phone on a weak connection fails
 * transiently far more often than permanently, so one retry usually turns a lost photo into a
 * saved one. Never throws: the caller decides what to do with a partial result.
 */
export async function uploadRecipePhotos(
  storage: StorageLike,
  photos: PendingPhoto[],
  hooks: UploadHooks
): Promise<UploadReport> {
  const uploaded: UploadedPhoto[] = [];
  const failed: PendingPhoto[] = [];
  const wait = hooks.wait ?? sleep;
  let attempts = 0;
  let lastError: unknown = null;

  for (const photo of photos) {
    let saved = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !saved; attempt += 1) {
      attempts += 1;
      // A fresh path each attempt, so a half-written object can never collide with the retry.
      const path = hooks.newPath();
      let error: unknown = null;
      try {
        ({ error } = await storage.upload(path, photo.blob, { contentType: 'image/webp' }));
      } catch (thrown) {
        error = thrown;
      }

      if (!error) {
        uploaded.push({ path, kind: photo.kind, position: photo.position });
        saved = true;
        break;
      }

      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        hooks.onRetry?.({ kind: photo.kind, attempt, error, bytes: photo.blob.size });
        await wait(BASE_DELAY_MS * attempt);
      } else {
        hooks.onFailure?.({ kind: photo.kind, attempts: MAX_ATTEMPTS, error, bytes: photo.blob.size });
        failed.push(photo);
      }
    }
  }

  return { uploaded, failed, attempts, lastError };
}
