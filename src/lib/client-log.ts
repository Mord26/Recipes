'use client';

/**
 * Reports what happened in the browser to the server, so a failure on someone's phone can be
 * investigated afterwards instead of being lost the moment they close the app.
 */

export type ClientEvent =
  | 'photo_upload_failed'
  | 'photo_upload_retry'
  | 'photo_upload_ok'
  | 'recipe_saved_without_photos'
  | 'extract_not_recognized'
  | 'extract_failed'
  | 'manual_fallback_used';

export function logEvent(
  event: ClientEvent,
  detail: Record<string, unknown> = {},
  recipeId?: string | null
): void {
  try {
    const body = JSON.stringify({ event, detail, recipeId: recipeId ?? null });
    // keepalive so the report still leaves the phone when this fires right before navigating away.
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Diagnostics must never break the thing they are diagnosing.
  }
}

/** Turns anything thrown into something readable in the events table. */
export function describeError(error: unknown): Record<string, unknown> {
  if (!error) return { message: 'unknown' };
  if (error instanceof Error) {
    const withStatus = error as Error & { status?: number; statusCode?: number; name?: string };
    return {
      message: error.message.slice(0, 300),
      name: error.name,
      status: withStatus.status ?? withStatus.statusCode,
    };
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      message: String(record.message ?? JSON.stringify(record)).slice(0, 300),
      status: record.status ?? record.statusCode,
      name: record.name,
    };
  }
  return { message: String(error).slice(0, 300) };
}

/** Rough network picture at the moment of failure - the usual suspect on a phone. */
export function networkSnapshot(): Record<string, unknown> {
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number };
  }).connection;
  return {
    online: navigator.onLine,
    effectiveType: connection?.effectiveType,
    downlink: connection?.downlink,
    rtt: connection?.rtt,
    visibility: typeof document !== 'undefined' ? document.visibilityState : undefined,
  };
}
