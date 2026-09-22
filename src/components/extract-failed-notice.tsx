'use client';

import { useTranslations } from 'next-intl';
import { Camera, PenLine, ScanSearch } from 'lucide-react';
import type { RejectReason } from '@/lib/types';
import { Button } from '@/components/ui';

/** Reasons the photo route can offer a useful "take it again" suggestion for. */
const RETAKE_WORTH_IT: RejectReason[] = ['blurry', 'dark', 'cropped'];

/**
 * Replaces the bare "not recognized" toast. It names what went wrong, promises the photo is kept
 * either way, and offers the way forward - which is almost always filling it in by hand.
 */
export function ExtractFailedNotice({
  reason,
  hasPhoto,
  onManual,
  onRetake,
  onRetry,
}: {
  reason: RejectReason;
  hasPhoto: boolean;
  onManual: () => void;
  onRetake: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('extractFailed');
  const suggestRetake = hasPhoto && RETAKE_WORTH_IT.includes(reason);

  return (
    <div className="animate-rise-in rounded-[1.5rem] bg-cream-100 p-5 text-start ring-1 ring-ink-900/8">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-honey-100">
          <ScanSearch size={20} strokeWidth={1.7} className="text-terra-600" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-snug font-medium text-ink-900">{t('title')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">{t(`reason.${reason}`)}</p>
        </div>
      </div>

      {hasPhoto ? (
        <p className="mt-3.5 rounded-2xl bg-sage-100 px-3.5 py-2.5 text-xs leading-relaxed font-semibold text-sage-700">
          {t('photoKept')}
        </p>
      ) : null}

      <p className="mt-3.5 text-sm leading-relaxed text-ink-500">{t('offer')}</p>

      <div className="mt-4 space-y-2.5">
        <Button onClick={onManual} size="lg" className="w-full">
          <PenLine size={17} strokeWidth={1.8} />
          {t('manual')}
        </Button>
        <div className="flex gap-2.5">
          {suggestRetake ? (
            <Button variant="ghost" onClick={onRetake} className="flex-1">
              <Camera size={16} strokeWidth={1.8} />
              {t('retake')}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onRetry} className="flex-1">
            {t('retry')}
          </Button>
        </div>
      </div>
    </div>
  );
}
