import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { requireSessionProfile } from '@/lib/auth-helpers';
import { fetchAppSettings, fetchMember, fetchMemberSummaries, fetchRecipes } from '@/lib/queries';
import { BottomNav } from '@/components/bottom-nav';
import { RecipeCard } from '@/components/recipe-card';
import { MemberAvatar } from '@/components/member-avatar';

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ userId }, { id }] = await Promise.all([requireSessionProfile(), params]);
  const member = await fetchMember(id);
  if (!member) notFound();

  const [recipes, appSettings, summaries] = await Promise.all([
    fetchRecipes({ uploaderId: id }, userId),
    fetchAppSettings(),
    fetchMemberSummaries(),
  ]);

  const t = await getTranslations('members');
  const tCommon = await getTranslations('common');
  const tSettings = await getTranslations('settings');
  const locale = await getLocale();
  const BackIcon = locale === 'he' ? ArrowRight : ArrowLeft;
  const stats = summaries.find((entry) => entry.id === id);

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-5xl px-5 pb-32">
      <header className="pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Link
          href="/members"
          aria-label={tCommon('back')}
          className="flex size-11 items-center justify-center rounded-full bg-white/80 text-ink-900 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid active:scale-[0.92]"
        >
          <BackIcon size={20} strokeWidth={1.8} />
        </Link>

        <div className="animate-rise-in mt-5 flex flex-col items-center text-center">
          <MemberAvatar name={member.display_name} size="lg" />
          <h1 className="font-display mt-3 text-[1.75rem] leading-tight font-medium text-ink-900">
            {member.display_name}
          </h1>
          <p className="mt-0.5 text-sm text-ink-500">@{member.username}</p>
          {member.role === 'admin' ? (
            <span className="mt-2 rounded-full bg-terra-50 px-3 py-1 text-[11px] font-semibold text-terra-700">
              {tSettings('adminBadge')}
            </span>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <Stat value={stats?.recipeCount ?? recipes.length} label={t('recipesCount')} />
            {stats && stats.cookedCount > 0 ? <Stat value={stats.cookedCount} label={t('cookedCount')} /> : null}
          </div>
        </div>
      </header>

      {recipes.length === 0 ? (
        <div className="animate-rise-in mt-14 flex flex-col items-center gap-4 text-center">
          <span className="text-5xl">🍽️</span>
          <p className="max-w-xs text-ink-500">{t('empty')}</p>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {recipes.map((recipe, index) => (
              <div key={recipe.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}>
                <RecipeCard recipe={recipe} userId={userId} hideRatings={appSettings.hide_ratings} />
              </div>
            ))}
          </div>

          <Link
            href={`/?up=${member.id}`}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/80 px-5 py-3 text-sm font-semibold text-ink-700 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid hover:bg-white active:scale-[0.97]"
          >
            <Search size={16} strokeWidth={1.8} />
            {t('searchTheirs')}
          </Link>
        </>
      )}

      <BottomNav />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="rounded-2xl bg-white/70 px-5 py-2.5 text-center ring-1 ring-ink-900/8">
      <span className="font-display block text-xl font-semibold text-ink-900">{value}</span>
      <span className="block text-[11px] text-ink-500">{label}</span>
    </span>
  );
}
