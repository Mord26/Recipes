'use client';

import { useOptimistic, useTransition } from 'react';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { rateRecipe } from '@/lib/actions/social';
import { cn } from '@/lib/utils';

export function RatingStars({
  recipeId,
  average,
  count,
  myRating,
}: {
  recipeId: string;
  average: number | null;
  count: number;
  myRating: number | null;
}) {
  const t = useTranslations('recipe');
  const [optimistic, setOptimistic] = useOptimistic(myRating);
  const [, startTransition] = useTransition();

  const rate = (stars: number) => {
    startTransition(async () => {
      setOptimistic(stars);
      const result = await rateRecipe(recipeId, stars);
      if (!result.error) toast.success(t('ratingSaved'));
    });
  };

  return (
    <div className="card-shell">
      <div className="card-core flex items-center justify-between gap-4 px-5 py-4">
        <div>
          {average !== null ? (
            <p className="flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-medium text-ink-900">{average.toFixed(1)}</span>
              <span className="text-xs text-ink-500">{t('ratingCount', { count })}</span>
            </p>
          ) : (
            <p className="text-sm text-ink-500">{t('noRating')}</p>
          )}
          <p className="mt-0.5 text-xs text-ink-500">{t('yourRating')}</p>
        </div>
        <div className="flex" dir="ltr">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star}`}
              onClick={() => rate(star)}
              className="p-2 transition-transform duration-300 ease-fluid active:scale-125"
            >
              <Star
                size={26}
                strokeWidth={1.4}
                className={cn(
                  'transition-colors duration-300',
                  optimistic !== null && star <= optimistic ? 'text-honey-500' : 'text-ink-300'
                )}
                fill={optimistic !== null && star <= optimistic ? '#d99a2b' : 'none'}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
