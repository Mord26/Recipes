import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LogOut, Lock } from 'lucide-react';
import { getSessionProfile } from '@/lib/auth-helpers';
import { signOut } from '@/lib/actions/auth';

export default async function BlockedPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/login');
  if (!session.profile.blocked) redirect('/');
  const t = await getTranslations('blocked');

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-cream-100">
        <Lock size={26} strokeWidth={1.6} className="text-ink-500" />
      </div>
      <h1 className="font-display mt-5 text-2xl font-medium text-ink-900">{t('title')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">{t('body')}</p>
      <form action={signOut} className="mt-7">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-full bg-white/70 px-6 py-3.5 font-semibold text-terra-700 ring-1 ring-terra-600/25 transition-all duration-300 ease-fluid hover:bg-terra-50 active:scale-[0.97]"
        >
          <LogOut size={17} strokeWidth={1.8} className="rtl:-scale-x-100" />
          {t('signOut')}
        </button>
      </form>
    </div>
  );
}
