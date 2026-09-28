'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

const INVITE_DAYS = 7;

export interface InviteResult {
  error: string | null;
  /** Full URL to hand to the new member. */
  url?: string;
  expiresAt?: string;
}

/**
 * Creates a personal, single-use invite link. It expires after a week, so a link that gets
 * forwarded around cannot quietly let strangers into the family cookbook forever.
 */
export async function createInvite(): Promise<InviteResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('family_invites')
    .insert({ token, created_by: user.id, expires_at: expiresAt });
  if (error) return { error: 'generic' };

  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://hamitkonim.vercel.app';
  return { error: null, url: `${base}/register?invite=${token}`, expiresAt };
}
