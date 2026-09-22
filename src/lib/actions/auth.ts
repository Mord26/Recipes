'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { signUpSchema, signInSchema, passwordSchema } from '@/lib/validation';
import { LOCALE_COOKIE, LOCALES } from '@/i18n/request';
import { checkInvite, consumeInvite } from '@/lib/invite-token';
import { systemForLocale } from '@/lib/units';
import { safeNextPath } from '@/lib/recipe-url';

const SYNTHETIC_DOMAIN = 'family.local';

export interface ActionState {
  error: string | null;
  success?: boolean;
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    username: formData.get('username'),
    displayName: formData.get('displayName'),
    password: formData.get('password'),
    email: formData.get('email') ?? '',
    inviteCode: formData.get('inviteCode') ?? '',
  });
  if (!parsed.success) return { error: 'invalidInput' };

  const { username, displayName, password, email, inviteCode } = parsed.data;
  const chosenLocale = LOCALES.includes(formData.get('locale') as (typeof LOCALES)[number])
    ? (formData.get('locale') as (typeof LOCALES)[number])
    : 'he';

  // A personal invite link is the preferred route; the shared family code stays as a fallback so
  // anyone mid-signup with the old flow is not locked out.
  const inviteToken = String(formData.get('invite') ?? '').trim();
  let redeemedToken: string | null = null;
  if (inviteToken) {
    const check = await checkInvite(inviteToken);
    if (!check.valid) {
      return { error: check.reason === 'expired' ? 'inviteExpired' : check.reason === 'used' ? 'inviteUsed' : 'inviteCode' };
    }
    redeemedToken = inviteToken;
  } else {
    const expectedCode = process.env.FAMILY_INVITE_CODE;
    if (!expectedCode || !inviteCode || inviteCode.toLowerCase() !== expectedCode.trim().toLowerCase()) {
      return { error: 'inviteCode' };
    }
  }

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
  if (existing) return { error: 'usernameTaken' };

  const authEmail = email ?? `${username}@${SYNTHETIC_DOMAIN}`;
  const { error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName },
  });

  if (createError) {
    const message = createError.message.toLowerCase();
    if (message.includes('already')) return { error: email ? 'emailTaken' : 'usernameTaken' };
    return { error: 'generic' };
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: authEmail, password });
  if (signInError) return { error: 'generic' };

  const {
    data: { user: newUser },
  } = await supabase.auth.getUser();
  if (newUser && chosenLocale !== 'he') {
    await admin.from('profiles').update({ locale: chosenLocale }).eq('id', newUser.id);
  }
  // Spend the invite only now that the account really exists.
  if (redeemedToken && newUser) await consumeInvite(redeemedToken, newUser.id);

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, chosenLocale, { maxAge: 60 * 60 * 24 * 365, path: '/' });

  redirect('/');
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: 'loginFailed' };

  const { username, password } = parsed.data;
  let email: string;

  if (username.includes('@')) {
    email = username;
  } else {
    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
    if (!profile) return { error: 'loginFailed' };
    const { data: userData } = await admin.auth.admin.getUserById(profile.id);
    if (!userData?.user?.email) return { error: 'loginFailed' };
    email = userData.user.email;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'loginFailed' };

  redirect(safeNextPath(formData.get('next')));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = passwordSchema.safeParse(formData.get('newPassword'));
  if (!parsed.success) return { error: 'passwordTooShort' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: 'generic' };
  return { error: null, success: true };
}

export async function adminResetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get('userId') ?? '');
  const parsed = passwordSchema.safeParse(formData.get('newPassword'));
  if (!userId || !parsed.success) return { error: 'passwordTooShort' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return { error: 'notAllowed' };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: parsed.data });
  if (error) return { error: 'generic' };
  return { error: null, success: true };
}

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const displayName = String(formData.get('displayName') ?? '').trim();
  const defaultVisibility = String(formData.get('defaultVisibility') ?? '');
  const locale = String(formData.get('locale') ?? '');

  if (!displayName || displayName.length > 40) return { error: 'invalidInput' };
  if (!['private', 'family'].includes(defaultVisibility)) return { error: 'invalidInput' };
  if (!LOCALES.includes(locale as (typeof LOCALES)[number])) return { error: 'invalidInput' };

  // Measurement system now follows language, so keep the stored column consistent with locale.
  const unitSystem = systemForLocale(locale);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName, default_visibility: defaultVisibility, locale, unit_system: unitSystem })
    .eq('id', user.id);
  if (error) return { error: 'generic' };

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: '/' });

  revalidatePath('/', 'layout');
  return { error: null, success: true };
}

export async function setLocale(locale: string): Promise<void> {
  if (!LOCALES.includes(locale as (typeof LOCALES)[number])) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: '/' });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from('profiles').update({ locale }).eq('id', user.id);

  revalidatePath('/', 'layout');
}
