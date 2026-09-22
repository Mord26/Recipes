import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { requireSessionProfile } from '@/lib/auth-helpers';
import { fetchRecipeForReader } from '@/lib/queries';
import { systemForLocale } from '@/lib/units';
import type { Locale } from '@/lib/types';
import { CookMode } from '@/components/cook-mode';

export default async function CookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [, { id }, sp] = await Promise.all([requireSessionProfile(), params, searchParams]);
  const settingsLocale = (await getLocale()) as Locale;
  // Cook mode follows the same transient per-recipe language as the recipe page (via ?lang).
  const locale: Locale = sp.lang === 'he' || sp.lang === 'en' ? sp.lang : settingsLocale;
  const [reader, messages] = await Promise.all([fetchRecipeForReader(id, locale), getMessages({ locale })]);
  if (!reader) notFound();
  const recipe = reader.recipe;
  const dir = locale === 'he' ? 'rtl' : 'ltr';

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div dir={dir}>
        <CookMode
          title={recipe.title}
          steps={recipe.steps}
          ingredients={recipe.ingredients}
          recipeId={recipe.id}
          system={systemForLocale(locale)}
          baseServings={recipe.servings}
        />
      </div>
    </NextIntlClientProvider>
  );
}
