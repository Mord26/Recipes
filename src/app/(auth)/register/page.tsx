import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { checkInvite } from '@/lib/invite-token';
import { RegisterForm } from '@/components/register-form';

/**
 * Server wrapper so a personal invite link can be validated before the form is shown - an expired
 * or already-used link says so up front instead of failing after the person fills everything in.
 */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const check = invite ? await checkInvite(invite) : null;
  const validInvite = check?.valid ? invite! : null;

  if (invite && check && !check.valid) {
    const t = await getTranslations('auth');
    const tErrors = await getTranslations('errors');
    const reason = check.reason === 'expired' ? 'inviteExpired' : check.reason === 'used' ? 'inviteUsed' : 'inviteCode';
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-12 text-center">
        <span className="mb-6 text-5xl">🔗</span>
        <h1 className="font-display text-3xl font-medium text-ink-900">{t('inviteProblemTitle')}</h1>
        <p className="mt-3 leading-relaxed text-ink-500">{tErrors(reason)}</p>
        <Link
          href="/register"
          className="mt-8 inline-block rounded-full bg-terra-600 px-6 py-3 font-semibold text-cream-50 transition-all duration-300 ease-fluid hover:bg-terra-500 active:scale-[0.97]"
        >
          {t('inviteUseCode')}
        </Link>
      </main>
    );
  }

  return <RegisterForm invite={validInvite} />;
}
