'use client';

import { useTranslations } from 'next-intl';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('errorPage');
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="text-6xl">🍳</span>
      <h1 className="font-display text-3xl font-medium text-ink-900">{t('title')}</h1>
      <p className="text-ink-500">{t('hint')}</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-terra-600 px-7 py-3.5 font-semibold text-cream-50 shadow-[0_8px_20px_-8px_rgba(181,78,40,0.5)] transition-all duration-300 ease-fluid hover:bg-terra-500 active:scale-[0.97]"
        >
          {t('retry')}
        </button>
        <a
          href="/"
          className="rounded-full bg-white/80 px-7 py-3.5 font-semibold text-ink-900 ring-1 ring-ink-900/10 transition-all duration-300 ease-fluid hover:bg-white active:scale-[0.97]"
        >
          {t('backHome')}
        </a>
      </div>
    </main>
  );
}
