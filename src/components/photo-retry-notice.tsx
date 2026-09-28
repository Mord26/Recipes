'use client';

import { useTranslations } from 'next-intl';
import { ImageOff, RefreshCw } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';

/**
 * Shown when the recipe saved but a photo did not. It replaces a toast that disappeared after a
 * few seconds and left people believing the picture had been saved.
 */
export function PhotoRetryNotice({
  count,
  pending,
  onRetry,
  onSkip,
}: {
  count: number;
  pending: boolean;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const t = useTranslations('recipeForm');

  return (
    <div className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-ink-900/45 p-5 backdrop-blur-sm">
      <div className="animate-pop-in w-full max-w-sm rounded-[1.5rem] bg-cream-50 p-6 text-center shadow-2xl">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-honey-100">
          <ImageOff size={24} strokeWidth={1.7} className="text-terra-600" />
        </div>
        <h2 className="font-display mt-4 text-xl font-medium text-ink-900">{t('photoFailedTitle')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{t('photoFailedBody', { count })}</p>

        <div className="mt-6 space-y-2.5">
          <Button onClick={onRetry} disabled={pending} size="lg" className="w-full">
            {pending ? <Spinner /> : <RefreshCw size={17} strokeWidth={1.8} />}
            {t('photoFailedRetry')}
          </Button>
          <button
            type="button"
            onClick={onSkip}
            disabled={pending}
            className="w-full rounded-full py-3 text-sm font-semibold text-ink-500 transition-all duration-300 ease-fluid hover:text-ink-900 disabled:opacity-50"
          >
            {t('photoFailedSkip')}
          </button>
        </div>
      </div>
    </div>
  );
}
