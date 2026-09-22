'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { signUp, type ActionState } from '@/lib/actions/auth';
import { Button, ErrorNote, Field, Input, PasswordInput, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

const initialState: ActionState = { error: null };

export function RegisterForm({ invite }: { invite: string | null }) {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const tSettings = useTranslations('settings');
  const [state, action, pending] = useActionState(signUp, initialState);
  const [locale, setLocale] = useState(useLocale());

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-10 text-center">
        <span className="mb-6 inline-block text-5xl">🥘</span>
        <p className="mb-2 text-sm font-medium tracking-wide text-terra-600">{tCommon('appName')}</p>
        <h1 className="font-display text-4xl font-medium text-ink-900">{t('registerTitle')}</h1>
        <p className="mt-2 text-ink-500">{t('registerSubtitle')}</p>
      </div>

      <div className="card-shell soft-rise">
        <form action={action} className="card-core space-y-5 p-6">
          {invite ? (
            <input type="hidden" name="invite" value={invite} />
          ) : (
            <Field label={t('inviteCode')} hint={t('inviteHint')}>
              <Input name="inviteCode" autoComplete="off" required />
            </Field>
          )}
          <Field label={t('displayName')} hint={t('displayNameHint')}>
            <Input name="displayName" autoComplete="name" maxLength={40} required />
          </Field>
          <Field label={t('username')} hint={t('usernameHint')}>
            <Input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              pattern="[a-zA-Z0-9_]{2,20}"
              placeholder="rachel"
              required
              dir="ltr"
            />
          </Field>
          <Field label={t('password')} hint={t('passwordHint')}>
            <PasswordInput name="password" autoComplete="new-password" minLength={8} required dir="ltr" defaultVisible />
          </Field>
          <Field label={t('email')} hint={t('emailHint')}>
            <Input name="email" type="email" autoComplete="email" dir="ltr" />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink-700">{t('languageChoice')}</p>
            <input type="hidden" name="locale" value={locale} />
            <div className="flex rounded-full bg-cream-100 p-1">
              {(['he', 'en'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLocale(value)}
                  className={cn(
                    'flex-1 rounded-full py-2.5 text-sm font-semibold transition-all duration-300 ease-fluid',
                    locale === value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'
                  )}
                >
                  {value === 'he' ? tSettings('hebrew') : tSettings('english')}
                </button>
              ))}
            </div>
          </div>
          {state.error ? <ErrorNote>{tErrors(state.error)}</ErrorNote> : null}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Spinner /> : null}
            {pending ? t('signingUp') : t('signUp')}
          </Button>
        </form>
      </div>

      <p className="mt-8 text-center text-ink-500">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-semibold text-terra-600 underline-offset-4 hover:underline">
          {t('loginLink')}
        </Link>
      </p>
    </main>
  );
}
