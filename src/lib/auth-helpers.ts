import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

export const getSessionProfile = cache(async (): Promise<{ userId: string; profile: Profile } | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (!profile) return null;

  return { userId, profile: profile as Profile };
});

export async function requireSessionProfile() {
  const session = await getSessionProfile();
  if (!session) redirect('/login');
  // A blocked member keeps a valid session but loses the app (RLS blocks their data anyway).
  if (session.profile.blocked) redirect('/blocked');
  return session;
}
