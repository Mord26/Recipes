import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const KNOWN_EVENTS = new Set([
  'photo_upload_failed',
  'photo_upload_retry',
  'photo_upload_ok',
  'recipe_saved_without_photos',
  'extract_not_recognized',
  'extract_failed',
  'manual_fallback_used',
]);

const MAX_DETAIL_BYTES = 4000;

/** Receives a diagnostic event from the browser. Best effort: never fails the caller. */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    event?: string;
    detail?: Record<string, unknown>;
    recipeId?: string | null;
  } | null;

  const event = String(body?.event ?? '');
  if (!KNOWN_EVENTS.has(event)) return NextResponse.json({ ok: false }, { status: 400 });

  let detail = body?.detail && typeof body.detail === 'object' ? body.detail : {};
  if (JSON.stringify(detail).length > MAX_DETAIL_BYTES) detail = { truncated: true };

  const recipeId = typeof body?.recipeId === 'string' && /^[0-9a-f-]{36}$/i.test(body.recipeId) ? body.recipeId : null;

  // Also to the server console, so a failure is visible while tailing a deployment.
  console.log(`[client] event=${event} user=${user.id.slice(0, 8)} ${JSON.stringify(detail)}`);

  await supabase.from('client_events').insert({
    user_id: user.id,
    event,
    recipe_id: recipeId,
    detail,
    user_agent: (request.headers.get('user-agent') ?? '').slice(0, 400),
  });

  return NextResponse.json({ ok: true });
}
