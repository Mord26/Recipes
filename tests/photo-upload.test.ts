import { describe, expect, it, vi } from 'vitest';
import { uploadRecipePhotos, type PendingPhoto, type StorageLike } from '@/lib/photo-upload';

const photo = (kind: 'photo' | 'scan', position = 0, size = 1000): PendingPhoto => ({
  blob: { size } as Blob,
  kind,
  position,
});

/** Storage stub whose per-call outcome is scripted; `null` means success. */
function storageThatFails(script: (unknown | null)[]): StorageLike & { calls: number } {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async upload() {
      const error = script[calls] ?? null;
      calls += 1;
      return { error };
    },
  } as StorageLike & { calls: number };
}

const hooks = (overrides = {}) => {
  let n = 0;
  return {
    newPath: () => `recipe/${(n += 1)}.webp`,
    wait: async () => {},
    ...overrides,
  };
};

describe('uploadRecipePhotos', () => {
  it('uploads everything when storage cooperates', async () => {
    const storage = storageThatFails([]);
    const report = await uploadRecipePhotos(storage, [photo('photo', 0), photo('scan', 0)], hooks());

    expect(report.uploaded).toHaveLength(2);
    expect(report.failed).toHaveLength(0);
    expect(report.uploaded.map((u) => u.kind)).toEqual(['photo', 'scan']);
    expect(storage.calls).toBe(2);
  });

  it('keeps the photos that DID upload when a later one fails', async () => {
    // The original bug: one failure threw, the database write was skipped, and photos that had
    // reached storage were never recorded - they looked saved and then vanished.
    const storage = storageThatFails([null, { message: 'network' }, { message: 'network' }, { message: 'network' }]);
    const report = await uploadRecipePhotos(storage, [photo('photo', 0), photo('scan', 0)], hooks());

    expect(report.uploaded).toHaveLength(1);
    expect(report.uploaded[0].kind).toBe('photo');
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].kind).toBe('scan');
  });

  it('retries a transient failure and succeeds', async () => {
    const storage = storageThatFails([{ message: 'timeout' }, null]);
    const onRetry = vi.fn();
    const report = await uploadRecipePhotos(storage, [photo('scan', 0)], hooks({ onRetry }));

    expect(report.uploaded).toHaveLength(1);
    expect(report.failed).toHaveLength(0);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ kind: 'scan', attempt: 1 });
  });

  it('gives up after three attempts and reports the failure once', async () => {
    const storage = storageThatFails([{ message: 'nope' }, { message: 'nope' }, { message: 'nope' }]);
    const onFailure = vi.fn();
    const report = await uploadRecipePhotos(storage, [photo('photo', 0)], hooks({ onFailure }));

    expect(report.uploaded).toHaveLength(0);
    expect(report.failed).toHaveLength(1);
    expect(storage.calls).toBe(3);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][0]).toMatchObject({ attempts: 3 });
  });

  it('treats a thrown exception like a returned error', async () => {
    let calls = 0;
    const storage: StorageLike = {
      async upload() {
        calls += 1;
        if (calls === 1) throw new Error('connection reset');
        return { error: null };
      },
    };
    const report = await uploadRecipePhotos(storage, [photo('scan', 0)], hooks());

    expect(report.uploaded).toHaveLength(1);
    expect(report.failed).toHaveLength(0);
  });

  it('uses a fresh path for every attempt so a retry cannot collide', async () => {
    const storage = storageThatFails([{ message: 'x' }, null]);
    const paths: string[] = [];
    await uploadRecipePhotos(storage, [photo('photo', 0)], {
      newPath: () => {
        const path = `recipe/${paths.length}.webp`;
        paths.push(path);
        return path;
      },
      wait: async () => {},
    });

    expect(new Set(paths).size).toBe(paths.length);
  });

  it('does nothing at all for an empty list', async () => {
    const storage = storageThatFails([]);
    const report = await uploadRecipePhotos(storage, [], hooks());

    expect(report.uploaded).toHaveLength(0);
    expect(report.failed).toHaveLength(0);
    expect(storage.calls).toBe(0);
  });
});
