'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signIn, type ActionState } from '@/lib/actions/auth';
import { Button, ErrorNote, Field, Input, PasswordInput, Spinner } from '@/components/ui';

const initialState: ActionState = { error: null };

export default function LoginPage() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const [state, action, pending] = useActionState(signIn, initialState);
  // Set when the middleware bounced someone here mid-action, e.g. opening a shared recipe link.
  const next = useSearchParams().get('next');

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-10 text-center">
        <Image src="/icons/icon-192.png" unoptimized alt="" width={72} height={72} className="mx-auto mb-6 size-[72px] rounded-2xl object-cover" />
        <p className="mb-2 text-sm font-medium tracking-wide text-terra-600">{tCommon('appName')}</p>
        <h1 className="font-display text-4xl font-medium text-ink-900">{t('loginTitle')}</h1>
        <p className="mt-2 text-ink-500">{t('loginSubtitle')}</p>
      </div>

      <div className="card-shell soft-rise">
        <form action={action} className="card-core space-y-5 p-6">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <Field label={t('usernameOrEmail')} hint={t('usernameLoginHint')}>
            <Input name="username" autoComplete="username" autoCapitalize="none" required dir="ltr" />
          </Field>
          <Field label={t('password')}>
            <PasswordInput name="password" autoComplete="current-password" required dir="ltr" />
          </Field>
          {state.error ? <ErrorNote>{tErrors(state.error)}</ErrorNote> : null}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Spinner /> : null}
            {pending ? t('signingIn') : t('signIn')}
          </Button>
        </form>
      </div>

      <div className="mt-8 text-center">
        <p className="mb-3 text-ink-500">{t('noAccount')}</p>
        <Link
          href="/register"
          className="inline-flex w-full items-center justify-center rounded-full bg-white/80 px-6 py-3.5 font-semibold text-terra-700 ring-1 ring-terra-600/25 transition-all duration-300 ease-fluid hover:bg-terra-50 active:scale-[0.97]"
        >
          {t('registerLink')}
        </Link>
      </div>
      <p className="mt-6 text-center text-xs text-ink-400">{t('forgotPassword')}</p>
    </main>
  );
}
