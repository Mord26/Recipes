'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export interface AdminActionResult {
  error: string | null;
}

/**
 * Admin-only membership controls: fully block a member, or leave them view-only.
 * Runs through the service-role client because RLS deliberately forbids editing other profiles.
 */
export async function setMemberFlags(
  userId: string,
  flags: { blocked?: boolean; canAddRecipes?: boolean }
): Promise<AdminActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };
  // Locking yourself out would leave the family with no admin.
  if (userId === user.id) return { error: 'notAllowed' };

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return { error: 'notAllowed' };

  const patch: Record<string, boolean> = {};
  if (typeof flags.blocked === 'boolean') patch.blocked = flags.blocked;
  if (typeof flags.canAddRecipes === 'boolean') patch.can_add_recipes = flags.canAddRecipes;
  if (Object.keys(patch).length === 0) return { error: null };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('profiles').update(patch).eq('id', userId);
  if (error) return { error: 'generic' };

  revalidatePath('/settings');
  revalidatePath('/members');
  return { error: null };
}

/** Each member decides for themselves whether a new family recipe pushes a notification. */
export async function setNotifyNewRecipes(enabled: boolean): Promise<AdminActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const { error } = await supabase.from('profiles').update({ notify_new_recipes: enabled }).eq('id', user.id);
  if (error) return { error: 'generic' };

  revalidatePath('/settings');
  return { error: null };
}
