'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Switches the language of the CURRENT recipe only, transiently, via a `?lang=` URL param.
 * It does not touch the persisted app language (that lives in settings); leaving the recipe
 * drops the param and the app returns to the settings language. Because measurement system and
 * translation both follow this locale, one toggle changes language, units and text together.
 */
export function LanguageToggle() {
  const t = useTranslations('units');
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [pendingLang, setPendingLang] = useState<string | null>(null);

  const pick = (next: string) => {
    if (next === current || pending) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('lang', next);
    setPendingLang(next);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const options: { id: string; emoji: string; label: string }[] = [
    { id: 'he', emoji: '🇮🇱', label: 'עברית' },
    { id: 'en', emoji: '🇺🇸', label: 'English' },
  ];

  // The status is written in the language being switched TO, so the reader sees it in the language
  // they just asked for. Hardcoded here because the page's messages are still in the old locale.
  const translatingText = pendingLang === 'en' ? 'Translating the recipe...' : 'מתרגם את המתכון...';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-ink-500">{t('showIn')}</span>
      <div className="flex rounded-full bg-cream-100 p-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => pick(option.id)}
            disabled={pending}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-300 ease-fluid active:scale-[0.96] disabled:opacity-70',
              current === option.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'
            )}
          >
            {pending && pendingLang === option.id ? <Spinner className="size-3.5" /> : <span>{option.emoji}</span>}
            {option.label}
          </button>
        ))}
      </div>
      {pending ? (
        <span
          dir={pendingLang === 'en' ? 'ltr' : 'rtl'}
          className="animate-fade-in flex items-center gap-1.5 text-xs font-medium text-terra-700"
        >
          <Spinner className="size-3.5" />
          {translatingText}
        </span>
      ) : null}
    </div>
  );
}
