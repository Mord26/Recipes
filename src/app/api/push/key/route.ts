import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Lets the service worker re-subscribe on its own after the browser rotates a subscription. */
export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  return NextResponse.json({ key });
}
