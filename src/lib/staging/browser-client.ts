// Browser side of the staging bridge: photo uploads go to our own API, which stores the bytes in
// Turso and records them in the outbox for later replay to Supabase Storage.
export function createStagingBrowserClient() {
  return {
    auth: { async getSession() { return { data: { session: null }, error: null }; } },
    storage: {
      from: (bucket: string) => ({
        async upload(path: string, body: Blob, opts?: { contentType?: string }) {
          try {
            const res = await fetch('/api/staging/storage', {
              method: 'POST',
              headers: { 'x-bucket': bucket, 'x-path': encodeURIComponent(path), 'content-type': opts?.contentType ?? body.type ?? 'application/octet-stream' },
              body,
            });
            if (!res.ok) return { data: null, error: { message: `upload failed (${res.status})`, statusCode: String(res.status) } };
            return { data: { path }, error: null };
          } catch (e) {
            return { data: null, error: { message: String(e) } };
          }
        },
      }),
    },
  };
}
