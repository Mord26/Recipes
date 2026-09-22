'use client';

import { useOptimistic, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { updateAppSettings, type AppSettings } from '@/lib/actions/app-settings';
import { cn } from '@/lib/utils';

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 py-2 text-start"
    >
      <span className="text-[15px] font-medium text-ink-900">{label}</span>
      <span
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ease-fluid',
          on ? 'bg-sage-600' : 'bg-cream-200'
        )}
      >
        <span
          className={cn(
            'absolute top-1 size-5 rounded-full bg-white shadow-sm transition-all duration-300 ease-fluid',
            on ? 'start-6' : 'start-1'
          )}
        />
      </span>
    </button>
  );
}

export function AppSettingsManager({ settings }: { settings: AppSettings }) {
  const t = useTranslations('settings');
  const tErrors = useTranslations('errors');
  const [optimistic, setOptimistic] = useOptimistic(settings);
  const [, startTransition] = useTransition();

  const change = (patch: Partial<AppSettings>) => {
    startTransition(async () => {
      setOptimistic({ ...optimistic, ...patch });
      const result = await updateAppSettings(patch);
      if (result.error) toast.error(tErrors(result.error));
    });
  };

  return (
    <div className="card-core space-y-1 p-4">
      <p className="mb-1 text-xs leading-relaxed text-ink-500">{t('familyControlsHint')}</p>
      <Toggle
        on={optimistic.hide_ratings}
        onToggle={() => change({ hide_ratings: !optimistic.hide_ratings })}
        label={t('hideRatings')}
      />
      <div className="border-t border-ink-900/5" />
      <Toggle on={optimistic.hide_tags} onToggle={() => change({ hide_tags: !optimistic.hide_tags })} label={t('hideTags')} />
    </div>
  );
}
