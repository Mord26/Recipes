import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendPush, TTL_STANDARD, TTL_TIMER, type PushSubscriptionRecord } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Called every minute by Supabase pg_cron (via pg_net) with the shared secret.
// Sends a push for every timer whose fire_at has passed, then marks it sent.
export async function POST(request: Request) {
  const secret = process.env.TIMER_DISPATCH_SECRET;
  const provided = request.headers.get('x-dispatch-secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'notAllowed' }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: due, error } = await supabase
    .from('timer_reminders')
    .select('id, user_id, label, recipe_title, kind')
    .eq('sent', false)
    .lte('fire_at', new Date().toISOString())
    .limit(200);
  if (error) return NextResponse.json({ error: 'generic' }, { status: 500 });
  if (!due || due.length === 0) return NextResponse.json({ sent: 0 });

  let sentCount = 0;
  const expiredEndpoints: string[] = [];

  for (const reminder of due) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', reminder.user_id);

    const isTest = reminder.kind === 'test';
    for (const sub of (subs ?? []) as PushSubscriptionRecord[]) {
      const result = await sendPush(
        sub,
        {
          title: isTest ? `✅ ${reminder.label}` : `⏲️ ${reminder.label}`,
          body: reminder.recipe_title ?? '',
          url: isTest ? '/settings' : '/',
          tag: `${isTest ? 'test' : 'timer'}-${reminder.id}`,
        },
        isTest ? TTL_STANDARD : TTL_TIMER
      );
      if (result === 'sent') sentCount += 1;
      if (result === 'expired') expiredEndpoints.push(sub.endpoint);
    }

    await supabase.from('timer_reminders').update({ sent: true }).eq('id', reminder.id);
  }

  if (expiredEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
  }

  return NextResponse.json({ processed: due.length, sent: sentCount });
}
