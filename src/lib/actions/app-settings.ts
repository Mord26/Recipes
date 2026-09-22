'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AppSettings {
  hide_ratings: boolean;
  hide_tags: boolean;
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return { error: 'notAllowed' };

  // RLS also enforces admin; this update simply fails closed for non-admins.
  const { error } = await supabase
    .from('app_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return { error: 'generic' };

  revalidatePath('/', 'layout');
  return { error: null };
}
