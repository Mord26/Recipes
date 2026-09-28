import Image from 'next/image';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Clock, Heart, Images, Lock, Star } from 'lucide-react';
import { publicPhotoUrl } from '@/lib/supabase/client';
import { LinkPending } from '@/components/nav-feedback';
import { averageRating, totalMinutes, type Locale, type RecipeListItem } from '@/lib/types';
import { formatMinutes } from '@/lib/utils';

export async function RecipeCard({
  recipe,
  userId,
  hideRatings = false,
}: {
  recipe: RecipeListItem;
  userId: string;
  hideRatings?: boolean;
}) {
  const t = await getTranslations('recipe');
  const locale = (await getLocale()) as Locale;

  const dishPhotos = recipe.recipe_photos
    .filter((photo) => photo.kind === 'photo')
    .sort((a, b) => a.position - b.position);
  const cover = dishPhotos[0] ?? null;
  const rating = averageRating(recipe.ratings);
  const minutes = totalMinutes(recipe);
  const favorited = recipe.favorites.some((f) => f.user_id === userId);

  const meta = (
    <div className="flex items-center gap-3 pt-0.5 text-xs text-ink-500">
      {rating !== null && !hideRatings ? (
        <span className="flex items-center gap-1 font-semibold text-ink-700">
          <Star size={13} strokeWidth={0} fill="#d99a2b" />
          {rating.toFixed(1)}
        </span>
      ) : null}
      {minutes !== null ? (
        <span className="flex items-center gap-1">
          <Clock size={13} strokeWidth={1.8} />
          {formatMinutes(minutes, locale)}
        </span>
      ) : null}
    </div>
  );

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="group card-shell relative block transition-all duration-500 ease-fluid hover:-translate-y-1 hover:shadow-[0_20px_44px_-16px_rgba(41,32,21,0.25)] active:scale-[0.98]"
    >
      <LinkPending />
      <div className="card-core overflow-hidden">
        {cover ? (
          <div className="relative aspect-[4/5] overflow-hidden bg-cream-100">
            <Image
              src={publicPhotoUrl(cover.storage_path)}
              alt={recipe.title}
              fill
              quality={85}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-700 ease-fluid group-hover:scale-[1.04]"
            />
            <div className="absolute inset-x-2 top-2 z-10 flex items-start justify-between">
              {recipe.visibility === 'private' ? (
                <span className="flex size-7 items-center justify-center rounded-full bg-white/80 text-ink-700 backdrop-blur-md">
                  <Lock size={13} strokeWidth={2} />
                </span>
              ) : (
                <span />
              )}
              <span className="flex items-center gap-1.5">
                {dishPhotos.length > 1 ? (
                  <span className="flex items-center gap-1 rounded-full bg-ink-900/55 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                    <Images size={11} strokeWidth={2} />
                    {dishPhotos.length}
                  </span>
                ) : null}
                {favorited ? (
                  <span className="flex size-7 items-center justify-center rounded-full bg-white/80 text-terra-600 backdrop-blur-md">
                    <Heart size={13} strokeWidth={2.4} fill="currentColor" />
                  </span>
                ) : null}
              </span>
            </div>
            {/* The glow fades in over the photo, with no hard top border on the glass. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[9] h-36 bg-gradient-to-b from-transparent via-[#fffdf9]/25 to-[#fffdf9]/50" />
            <div className="absolute inset-x-0 bottom-0 z-10 flex h-28 flex-col justify-center bg-[#fffdf9]/70 px-3 py-2 text-ink-900 backdrop-blur-xl backdrop-saturate-150 [mask-image:linear-gradient(to_bottom,transparent,black_36%)]">
              <h3 className="font-display line-clamp-2 text-[17px] leading-snug font-medium text-ink-900">
                {recipe.title}
              </h3>
              <p className="mt-1 text-xs text-ink-700">{t('by', { name: recipe.profiles?.display_name ?? '' })}</p>
              {meta}
            </div>
          </div>
        ) : (
          // Clean text-first card for recipes without a photo - reads as intentional, not empty.
          <div className="flex aspect-[4/5] flex-col justify-between bg-gradient-to-br from-cream-50 to-cream-100 p-4">
            <div className="flex items-start justify-between">
              <span aria-hidden className="text-2xl opacity-80">🥘</span>
              <span className="flex gap-1.5">
                {recipe.visibility === 'private' ? (
                  <span className="flex size-6 items-center justify-center rounded-full bg-white/70 text-ink-500">
                    <Lock size={12} strokeWidth={2} />
                  </span>
                ) : null}
                {favorited ? (
                  <span className="flex size-6 items-center justify-center rounded-full bg-white/70 text-terra-600">
                    <Heart size={12} strokeWidth={2.4} fill="currentColor" />
                  </span>
                ) : null}
              </span>
            </div>
            <div className="space-y-1.5">
              <h3 className="font-display line-clamp-3 text-[19px] leading-tight font-medium text-ink-900">
                {recipe.title}
              </h3>
              <p className="text-xs text-ink-500">{t('by', { name: recipe.profiles?.display_name ?? '' })}</p>
              {meta}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
