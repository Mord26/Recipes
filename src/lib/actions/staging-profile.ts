/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { stagingTurso } from '@/lib/staging/backend';
import { makeProfileCookie, PROFILE_COOKIE } from '@/lib/staging/session';
import { createStagingAdminClient } from '@/lib/staging/server-client';
import { safeNextPath } from '@/lib/recipe-url';

export async function pickProfile(formData: FormData): Promise<void> {
  if (!stagingTurso()) redirect('/login');
  const id = String(formData.get('profileId') ?? '');
  const { data } = await createStagingAdminClient().from('profiles').select('id, blocked').eq('id', id).maybeSingle();
  if (!data || data.blocked) redirect('/login');
  const cookie = await makeProfileCookie(id);
  (await cookies()).set(PROFILE_COOKIE, cookie.value, { maxAge: cookie.maxAge, path: '/', httpOnly: true, sameSite: 'lax', secure: true });
  redirect(safeNextPath(formData.get('next')));
}

export async function listPickerProfiles(): Promise<{ id: string; display_name: string; username: string }[]> {
  if (!stagingTurso()) return [];
  const { data } = await createStagingAdminClient().from('profiles').select('id, display_name, username, blocked').order('created_at');
  return ((data ?? []) as any[]).filter((p) => !p.blocked).map(({ id, display_name, username }) => ({ id, display_name, username }));
}
