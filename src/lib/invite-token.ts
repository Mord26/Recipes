import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type InviteCheck = { valid: true } | { valid: false; reason: 'unknown' | 'expired' | 'used' };

/**
 * Validates an invite token. Uses the service-role client because the person redeeming it is not
 * signed in yet, so no RLS policy could see the row on their behalf.
 */
export async function checkInvite(token: string): Promise<InviteCheck> {
  if (!token) return { valid: false, reason: 'unknown' };
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('family_invites')
    .select('token, expires_at, used_at')
    .eq('token', token)
    .maybeSingle();

  return inviteState(data as InviteRow | null);
}

export interface InviteRow {
  expires_at: string;
  used_at: string | null;
}

/** Pure validity rules, split out so they can be tested without touching the database. */
export function inviteState(row: InviteRow | null, now: number = Date.now()): InviteCheck {
  if (!row) return { valid: false, reason: 'unknown' };
  if (row.used_at) return { valid: false, reason: 'used' };
  if (new Date(row.expires_at).getTime() < now) return { valid: false, reason: 'expired' };
  return { valid: true };
}

/** Marks the invite as spent. Called only after the account is actually created. */
export async function consumeInvite(token: string, userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from('family_invites')
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq('token', token)
    .is('used_at', null);
}
