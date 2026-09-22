import 'server-only';
import webpush from 'web-push';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/**
 * How long the push service keeps trying, in seconds. The old 120s meant any phone that was
 * asleep or offline for two minutes lost the message for good.
 */
export const TTL_TIMER = 15 * 60;
export const TTL_STANDARD = 24 * 60 * 60;

export type PushResult = 'sent' | 'expired' | 'error';

/** Sends one Web Push message. Returns 'expired' for dead subscriptions so the caller can prune them. */
export async function sendPush(
  sub: PushSubscriptionRecord,
  payload: PushPayload,
  ttl: number = TTL_STANDARD
): Promise<PushResult> {
  if (!ensureConfigured()) return 'error';
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      // 'high' urgency is what makes FCM wake a dozing Android device instead of parking the
      // message until the user next opens the app. The default, 'normal', is explicitly deferrable.
      { TTL: ttl, urgency: 'high' }
    );
    return 'sent';
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) return 'expired';
    console.error('sendPush failed:', statusCode, (error as Error).message);
    return 'error';
  }
}
