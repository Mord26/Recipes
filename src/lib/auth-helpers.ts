import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import { fallbackProfile, readOnlyMode } from '@/lib/fallback';

export const getSessionProfile = cache(async (): Promise<{ userId: string; profile: Profile } | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  const chosen=profile||((await readOnlyMode(error))?fallbackProfile(userId):null);
  if (!chosen) return null;
  return { userId, profile: chosen as Profile };
});

export async function requireSessionProfile() {
  const session = await getSessionProfile();
  if (!session) redirect('/login');
  // A blocked member keeps a valid session but loses the app (RLS blocks their data anyway).
  if (session.profile.blocked) redirect('/blocked');
  return session;
}
