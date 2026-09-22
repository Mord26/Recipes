'use client';

import { useTranslations } from 'next-intl';
import { Heart, PartyPopper } from 'lucide-react';

const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 5.5 + ((i * 37) % 9)) % 100}%`,
  delay: `${(i % 6) * 0.12}s`,
  duration: `${1.6 + ((i * 7) % 8) * 0.09}s`,
  color: ['#b54e28', '#6e7f5e', '#e0a33a', '#c96a3f'][i % 4],
  size: 7 + (i % 3) * 3,
}));

/** Celebratory overlay shown right after a recipe is saved - the whole point is to make sharing feel good. */
export function RecipeSavedCelebration({ variant }: { variant: number }) {
  const t = useTranslations('celebrate');

  return (
    <div className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-cream-50/92 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {CONFETTI.map((piece, index) => (
          <span
            key={index}
            className="animate-confetti absolute -top-6 rounded-[2px]"
            style={{
              left: piece.left,
              width: piece.size,
              height: piece.size * 1.8,
              background: piece.color,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
            }}
          />
        ))}
      </div>

      <div className="animate-pop-in relative px-8 text-center">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-honey-100 shadow-[0_18px_40px_-14px_rgba(181,78,40,0.45)]">
          <PartyPopper size={34} strokeWidth={1.6} className="text-terra-600" />
        </div>
        <p className="font-display mt-5 text-2xl leading-snug font-medium text-balance text-ink-900">
          {t(`line${variant}`)}
        </p>
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-sm text-ink-500">
          <Heart size={14} strokeWidth={2} className="text-terra-600" />
          {t('thanks')}
        </p>
      </div>
    </div>
  );
}
