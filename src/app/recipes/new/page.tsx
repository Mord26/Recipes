import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { requireSessionProfile } from '@/lib/auth-helpers';
import { fetchCategories } from '@/lib/queries';
import { RecipeEditor } from '@/components/recipe-editor';

export default async function NewRecipePage() {
  const { profile } = await requireSessionProfile();
  if (!profile.can_add_recipes) redirect('/');
  const categories = await fetchCategories();
  const t = await getTranslations('recipeForm');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const BackIcon = locale === 'he' ? ArrowRight : ArrowLeft;

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl px-5 pb-24">
      <header className="flex items-center gap-3 pt-[max(1.25rem,env(safe-area-inset-top))] pb-6">
        <Link
          href="/"
          aria-label={tCommon('back')}
          className="flex size-11 items-center justify-center rounded-full bg-white/80 text-ink-900 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid active:scale-[0.92]"
        >
          <BackIcon size={20} strokeWidth={1.8} />
        </Link>
        <h1 className="font-display text-2xl font-medium text-ink-900">{t('newTitle')}</h1>
      </header>

      <RecipeEditor mode="create" categories={categories} defaultVisibility={profile.default_visibility} />
    </div>
  );
}
