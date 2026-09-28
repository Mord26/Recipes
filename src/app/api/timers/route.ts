import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface CreateBody {
  fireAt?: string;
  label?: string;
  recipeTitle?: string | null;
  kind?: string;
}

// Register a timer reminder that will be pushed at fire_at even if the app is closed.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'notAllowed' }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'invalidInput' }, { status: 400 });
  }

  const fireAt = body.fireAt ? new Date(body.fireAt) : null;
  const label = (body.label ?? '').toString().slice(0, 120);
  if (!fireAt || Number.isNaN(fireAt.getTime()) || !label) {
    return NextResponse.json({ error: 'invalidInput' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('timer_reminders')
    .insert({
      user_id: user.id,
      fire_at: fireAt.toISOString(),
      label,
      recipe_title: body.recipeTitle ? body.recipeTitle.toString().slice(0, 160) : null,
      kind: body.kind === 'test' ? 'test' : 'timer',
    })
    .select('id')
    .single();
  if (error || !data) return NextResponse.json({ error: 'generic' }, { status: 500 });

  return NextResponse.json({ id: data.id });
}

// Cancel a reminder (timer paused/reset before it fired).
export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'notAllowed' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'invalidInput' }, { status: 400 });

  // RLS also scopes to the owner; the explicit filter keeps intent clear.
  await supabase.from('timer_reminders').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
