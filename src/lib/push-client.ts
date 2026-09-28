'use client';

// Client helpers for Web Push: register the service worker, subscribe the browser, and
// schedule/cancel server-side timer reminders that fire even when the app is closed.

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

/**
 * Ensures the browser is subscribed to push and the subscription is stored on the server.
 * Must be called from a user gesture the first time (permission prompt). Safe to call repeatedly.
 * Returns true if a subscription is active.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return false;

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;
  }
  if (Notification.permission !== 'granted') return false;

  const registration = await getRegistration();
  if (!registration) return false;
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    } catch {
      return false;
    }
  }

  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Schedules a notification for a minute from now so the user can close the app completely and
 * confirm that pushes really arrive while it is not running. Returns true if it was accepted.
 */
export async function scheduleTestPush(label: string, body: string): Promise<boolean> {
  try {
    const res = await fetch('/api/timers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fireAt: new Date(Date.now() + 60_000).toISOString(),
        label,
        recipeTitle: body,
        kind: 'test',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Schedules a server-side reminder. Returns the reminder id, or null on failure. */
export async function scheduleTimerReminder(
  fireAt: Date,
  label: string,
  recipeTitle?: string | null
): Promise<string | null> {
  try {
    const res = await fetch('/api/timers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fireAt: fireAt.toISOString(), label, recipeTitle: recipeTitle ?? null }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  } catch {
    return null;
  }
}

export async function cancelTimerReminder(id: string): Promise<void> {
  try {
    await fetch(`/api/timers?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // best-effort; the reminder simply fires (harmless) if cancellation fails
  }
}
