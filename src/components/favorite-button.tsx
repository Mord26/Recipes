'use client';

import { useOptimistic, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { toggleFavorite } from '@/lib/actions/social';
import { cn } from '@/lib/utils';

export function FavoriteButton({ recipeId, favorited }: { recipeId: string; favorited: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(favorited);
  const [, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      setOptimistic(!optimistic);
      await toggleFavorite(recipeId);
    });
  };

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      onClick={toggle}
      className={cn(
        'flex size-12 items-center justify-center rounded-full ring-1 transition-all duration-300 ease-fluid active:scale-[0.9]',
        optimistic
          ? 'bg-terra-600 text-cream-50 ring-terra-600 shadow-[0_8px_20px_-6px_rgba(181,78,40,0.55)]'
          : 'bg-white/80 text-ink-700 ring-ink-900/8 hover:bg-white'
      )}
    >
      <Heart size={20} strokeWidth={1.8} fill={optimistic ? 'currentColor' : 'none'} />
    </button>
  );
}
