import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Search } from 'lucide-react';
import { requireSessionProfile } from '@/lib/auth-helpers';
import { fetchAppSettings, fetchRecipes } from '@/lib/queries';
import { BottomNav } from '@/components/bottom-nav';
import { RecipeCard } from '@/components/recipe-card';

export default async function FavoritesPage() {
  const { userId } = await requireSessionProfile();
  const t = await getTranslations();

  const [recipes, appSettings] = await Promise.all([
    fetchRecipes({ favoritesOnly: true }, userId),
    fetchAppSettings(),
  ]);

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-5xl px-5 pb-32">
      <header className="pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">
        <h1 className="font-display text-[2rem] leading-tight font-medium text-ink-900">{t('nav.favorites')} ❤️</h1>
      </header>

      {recipes.length === 0 ? (
        <div className="animate-rise-in mt-16 flex flex-col items-center gap-5 text-center">
          <span className="text-6xl">🤍</span>
          <p className="max-w-xs text-lg leading-relaxed text-ink-500">{t('favoritesPage.empty')} ❤️</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-terra-600 px-6 py-3 font-semibold text-cream-50 shadow-[0_8px_20px_-8px_rgba(181,78,40,0.5)] transition-all duration-300 ease-fluid hover:bg-terra-500 active:scale-[0.97]"
          >
            <Search size={17} strokeWidth={1.8} />
            {t('favoritesPage.browse')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {recipes.map((recipe, index) => (
            <div key={recipe.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}>
              <RecipeCard recipe={recipe} userId={userId} hideRatings={appSettings.hide_ratings} />
            </div>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
