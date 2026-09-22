import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { requireSessionProfile } from '@/lib/auth-helpers';
import {
  fetchAppSettings,
  fetchCategories,
  fetchFamilyMembers,
  fetchRecipes,
  fetchTags,
  type RecipeFilters,
} from '@/lib/queries';
import { BottomNav } from '@/components/bottom-nav';
import { RecipeCard } from '@/components/recipe-card';
import { CategoryRow, SearchControls } from '@/components/search-filters';
import { AnimatedGreeting } from '@/components/animated-greeting';

interface HomeSearchParams {
  q?: string;
  cat?: string;
  tag?: string;
  up?: string;
  mine?: string;
  fav?: string;
  time?: string;
  rating?: string;
  sort?: string;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<HomeSearchParams> }) {
  const [{ profile, userId }, params] = await Promise.all([requireSessionProfile(), searchParams]);
  const t = await getTranslations('home');

  const filters: RecipeFilters = {
    q: params.q,
    categoryId: params.cat,
    tagId: params.tag,
    uploaderId: params.up,
    mine: params.mine === '1',
    favoritesOnly: params.fav === '1',
    maxMinutes: params.time ? Number(params.time) : undefined,
    minRating: params.rating ? Number(params.rating) : undefined,
    sort: params.sort === 'top' ? 'top' : 'newest',
  };

  const [recipes, categories, tags, members, appSettings] = await Promise.all([
    fetchRecipes(filters, userId),
    fetchCategories(),
    fetchTags(),
    fetchFamilyMembers(),
    fetchAppSettings(),
  ]);

  const fallbackMode=recipes.some((r:any)=>r.__fallback);

    const hasFilters = Boolean(
    params.q || params.cat || params.tag || params.up || params.mine || params.fav || params.time || params.rating
  );

  return (
    <>
    {fallbackMode?<div id="read-only-banner" className="sticky top-0 z-[1000] bg-[#762b18] px-4 py-3 text-center text-sm font-bold text-white shadow-lg">מצב קריאה בלבד · בסיס הנתונים אינו זמין. אי אפשר לשמור שינויים כרגע.</div>:null}
    <div className="mx-auto min-h-[100dvh] w-full max-w-5xl px-5 pb-32">
      <header className="pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">
        <p className="text-sm font-medium text-terra-600">{profile.display_name} 👋</p>
        <h1 className="font-display mt-1 text-[2rem] leading-tight font-medium text-ink-900">
          <AnimatedGreeting locale={profile.locale} />
        </h1>
      </header>

      <div className="space-y-4">
        <Suspense>
          <SearchControls
            categories={categories}
            tags={tags}
            members={members}
            hideRatings={appSettings.hide_ratings}
            hideTags={appSettings.hide_tags}
          />
          <CategoryRow categories={categories} />
        </Suspense>
      </div>

      {recipes.length === 0 ? (
        <div className="animate-rise-in mt-16 flex flex-col items-center gap-5 text-center">
          <span className="text-6xl">{hasFilters ? '🔍' : '🥧'}</span>
          <p className="max-w-xs text-lg text-ink-500">{hasFilters ? t('emptyFiltered') : t('empty')}</p>
          {hasFilters ? (
            <Link
              href="/"
              className="rounded-full bg-ink-900 px-6 py-3 font-semibold text-cream-50 transition-all duration-300 ease-fluid hover:bg-ink-700 active:scale-[0.97]"
            >
              {t('clearFilters')}
            </Link>
          ) : null}
          {!hasFilters ? (
            <Link
              href="/recipes/new"
              className="inline-flex items-center gap-2 rounded-full bg-terra-600 px-6 py-3 font-semibold text-cream-50 shadow-[0_8px_20px_-8px_rgba(181,78,40,0.5)] transition-all duration-300 ease-fluid hover:bg-terra-500 active:scale-[0.97]"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-white/15">
                <Plus size={16} strokeWidth={2.2} />
              </span>
              {t('addFirst')}
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {recipes.map((recipe, index) => (
            <div key={recipe.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}>
              <RecipeCard recipe={recipe} userId={userId} hideRatings={appSettings.hide_ratings} />
            </div>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
    </>
  );
}
