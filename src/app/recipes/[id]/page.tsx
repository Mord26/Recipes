import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { ArrowRight, ArrowLeft, ChefHat, Clock, Lock, Pencil, Users } from 'lucide-react';
import { requireSessionProfile } from '@/lib/auth-helpers';
import { fetchAppSettings, fetchCategories, fetchComments, fetchCookCount, fetchRecipeForReader, fetchTags } from '@/lib/queries';
import { averageRating, categoryName, type Locale } from '@/lib/types';
import { systemForLocale } from '@/lib/units';
import { buildShareData } from '@/lib/share-data';
import { cn, formatMinutes } from '@/lib/utils';
import { publicPhotoUrl } from '@/lib/supabase/client';
import { PhotoCarousel, ScanGallery } from '@/components/photo-carousel';
import { IngredientsList } from '@/components/ingredients-list';
import { StepContent } from '@/components/step-content';
import { RatingStars } from '@/components/rating-stars';
import { FavoriteButton } from '@/components/favorite-button';
import { ShareButton } from '@/components/share-button';
import { AddDishPhoto } from '@/components/add-dish-photo';
import { TranslationPending } from '@/components/translation-pending';
import { DeleteRecipeButton } from '@/components/delete-recipe-button';
import { CommentsSection } from '@/components/comments-section';
import { LinkPending } from '@/components/nav-feedback';

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ userId, profile }, { id }, sp] = await Promise.all([requireSessionProfile(), params, searchParams]);
  const settingsLocale = (await getLocale()) as Locale;
  // The recipe is shown in `viewLocale` - a transient per-recipe override from `?lang`, defaulting
  // to the settings language. Only this page follows it; the rest of the app stays on the setting.
  const locale: Locale = sp.lang === 'he' || sp.lang === 'en' ? sp.lang : settingsLocale;
  const [reader, comments, categories, tags, appSettings, messages, cookCount] = await Promise.all([
    fetchRecipeForReader(id, locale),
    fetchComments(id),
    fetchCategories(),
    fetchTags(),
    fetchAppSettings(),
    getMessages({ locale }),
    fetchCookCount(id),
  ]);
  if (!reader) notFound();
  const { recipe, translated, translationPending } = reader;

  const t = await getTranslations({ locale, namespace: 'recipe' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const system = systemForLocale(locale);
  const dir = locale === 'he' ? 'rtl' : 'ltr';
  const BackIcon = locale === 'he' ? ArrowRight : ArrowLeft;

  const dishPhotos = recipe.recipe_photos.filter((p) => p.kind === 'photo').sort((a, b) => a.position - b.position);
  // Credit photos added by someone other than the recipe's creator, formatted here so the client
  // component never has to interpolate a message itself.
  const carouselPhotos = dishPhotos.map((p) => {
    const name = p.uploader_id && p.uploader_id !== recipe.owner_id ? p.uploader?.display_name : null;
    return { storage_path: p.storage_path, uploaderLabel: name ? t('photoBy', { name }) : null };
  });
  const scans = recipe.recipe_photos.filter((p) => p.kind === 'scan').sort((a, b) => a.position - b.position);
  const recipeCategories = categories.filter((c) => recipe.recipe_categories.some((rc) => rc.category_id === c.id));
  const recipeTags = tags.filter((tag) => recipe.recipe_tags.some((rt) => rt.tag_id === tag.id));
  const rating = averageRating(recipe.ratings);
  const myRating = recipe.ratings.find((r) => r.user_id === userId)?.stars ?? null;
  const favorited = recipe.favorites.some((f) => f.user_id === userId);
  const isOwner = recipe.owner_id === userId;
  const hasPhotos = dishPhotos.length > 0;
  const coverUrl = hasPhotos ? publicPhotoUrl(dishPhotos[0].storage_path) : undefined;
  const shareData = await buildShareData(recipe, locale);
  // Carry the view language into cook mode so it stays consistent with what is on screen.
  const cookHref = `/recipes/${recipe.id}/cook?lang=${locale}`;

  return (
   <NextIntlClientProvider locale={locale} messages={messages}>
    <div dir={dir} className="mx-auto min-h-[100dvh] w-full max-w-2xl pb-16">
      {hasPhotos ? (
        <div className="relative">
          <PhotoCarousel photos={carouselPhotos} title={recipe.title} />
          <div aria-hidden="true" className="recipe-photo-dissolve pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-24" />
          <Link
            href="/"
            aria-label={tCommon('back')}
            className="absolute top-[max(1rem,env(safe-area-inset-top))] start-4 flex size-11 items-center justify-center rounded-full bg-white/85 text-ink-900 shadow-lg backdrop-blur-md transition-all duration-300 ease-fluid active:scale-[0.92]"
          >
            <BackIcon size={20} strokeWidth={1.8} />
          </Link>
        </div>
      ) : (
        <div className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <Link
            href="/"
            aria-label={tCommon('back')}
            className="flex size-11 items-center justify-center rounded-full bg-white/80 text-ink-900 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid active:scale-[0.92]"
          >
            <BackIcon size={20} strokeWidth={1.8} />
          </Link>
        </div>
      )}

      <div
        className={cn(
          'recipe-glass-surface relative z-10 isolate space-y-5 overflow-hidden px-5 pb-8',
          hasPhotos ? '-mt-12 rounded-t-[2rem] pt-1 recipe-glass-over-photo' : 'pt-2'
        )}
      >
        <header className="recipe-glass-header animate-rise-in relative rounded-[1.65rem] px-4 pb-4 pt-7 sm:px-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {recipe.visibility === 'private' ? (
              <span className="flex items-center gap-1 rounded-full bg-cream-200 px-3 py-1 text-[11px] font-semibold text-ink-700">
                <Lock size={11} strokeWidth={2} />
                {t('privateLabel')}
              </span>
            ) : null}
            {recipe.source === 'photo' ? (
              <span className="rounded-full bg-sage-100 px-3 py-1 text-[11px] font-semibold text-sage-700">
                📷 {t('fromScan')}
              </span>
            ) : null}
            {recipeCategories.map((category) => (
              <span key={category.id} className="rounded-full bg-terra-50 px-3 py-1 text-[11px] font-semibold text-terra-700">
                {category.emoji} {categoryName(category, locale)}
              </span>
            ))}
          </div>

          <h1 className="font-display text-[2.1rem] leading-tight font-medium text-ink-900">{recipe.title}</h1>
          {recipe.credit ? (
            <p className="mt-1.5 font-medium text-terra-700">🧡 {t('creditOf', { name: recipe.credit })}</p>
          ) : null}
          <Link
            href={`/members/${recipe.owner_id}`}
            className="mt-1.5 inline-block text-sm text-ink-500 underline decoration-ink-900/15 underline-offset-4 transition-colors hover:text-terra-700"
          >
            {t('by', { name: recipe.profiles?.display_name ?? '' })}
          </Link>
          {cookCount > 0 ? (
            <p className="mt-1.5 text-sm font-medium text-sage-700">🍳 {t('cookedTimes', { count: cookCount })}</p>
          ) : null}

          {translationPending ? <TranslationPending /> : null}
          {translated ? (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-cream-100 px-2.5 py-1 text-[11px] text-ink-400">
              ✨ {t('autoTranslated')}
            </p>
          ) : null}

          {recipe.description ? (
            <p className="mt-3 leading-relaxed text-ink-700">{recipe.description}</p>
          ) : null}

          {recipeTags.length > 0 && !appSettings.hide_tags ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {recipeTags.map((tag) => (
                <span key={tag.id} className="rounded-full bg-cream-100 px-2.5 py-1 text-xs text-ink-500">
                  #{tag.name}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        <div className="animate-rise-in flex flex-wrap gap-2 px-1" style={{ animationDelay: '60ms' }}>
          {recipe.servings !== null ? (
            <MetaChip icon={<Users size={14} strokeWidth={1.8} />} label={`${recipe.servings} ${t('servings')}`} />
          ) : null}
          {recipe.prep_minutes !== null ? (
            <MetaChip icon={<Clock size={14} strokeWidth={1.8} />} label={`${t('prepTime')}: ${formatMinutes(recipe.prep_minutes, locale)}`} />
          ) : null}
          {recipe.cook_minutes !== null ? (
            <MetaChip icon={<ChefHat size={14} strokeWidth={1.8} />} label={`${t('cookTime')}: ${formatMinutes(recipe.cook_minutes, locale)}`} />
          ) : null}
        </div>

        <div className="recipe-glass-actions animate-rise-in space-y-2.5 rounded-[1.65rem] p-3" style={{ animationDelay: '120ms' }}>
          {recipe.steps.length > 0 ? (
            <Link
              href={cookHref}
              className="relative flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-terra-600 text-base font-semibold text-cream-50 shadow-[0_8px_20px_-8px_rgba(181,78,40,0.5)] transition-all duration-300 ease-fluid hover:bg-terra-500 active:scale-[0.98]"
            >
              <LinkPending />
              <ChefHat size={20} strokeWidth={1.8} />
              {t('cookMode')}
            </Link>
          ) : null}
          <div className="flex items-center justify-center gap-2.5">
            <FavoriteButton recipeId={recipe.id} favorited={favorited} />
            <ShareButton recipeId={recipe.id} locale={locale} initialData={shareData} photoUrl={coverUrl} />
            <AddDishPhoto recipeId={recipe.id} />
            {isOwner ? (
              <Link
                href={`/recipes/${recipe.id}/edit`}
                aria-label={tCommon('edit')}
                className="flex size-12 items-center justify-center rounded-full bg-white/80 text-ink-700 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid hover:bg-white active:scale-[0.9]"
              >
                <Pencil size={18} strokeWidth={1.7} />
              </Link>
            ) : null}
            {/* The family admin can remove anyone's recipe; editing stays with the owner. */}
            {isOwner || profile.role === 'admin' ? <DeleteRecipeButton recipeId={recipe.id} /> : null}
          </div>
        </div>

        <div className="animate-rise-in" style={{ animationDelay: '240ms' }}>
          <IngredientsList
            ingredients={recipe.ingredients}
            baseServings={recipe.servings}
            title={t('ingredients')}
            system={system}
            recipeId={recipe.id}
          />
        </div>

        {recipe.steps.length > 0 ? (
         <section className="animate-rise-in recipe-glass-panel" style={{ animationDelay: '300ms' }}>
          <div className="p-5">
            <h2 className="font-display mb-4 text-xl font-medium text-ink-900">{t('steps')}</h2>
            <ol className="space-y-4">
              {recipe.steps.map((step, index) => (
                <li key={index} className="flex gap-3.5">
                  <span className="font-display flex size-8 shrink-0 items-center justify-center rounded-full bg-terra-50 text-sm font-semibold text-terra-700">
                    {index + 1}
                  </span>
                  <div className="flex flex-col pt-1 leading-relaxed text-ink-700">
                    <StepContent
                      step={step}
                      ingredients={recipe.ingredients}
                      system={system}
                      baseServings={recipe.servings}
                      targetServings={recipe.servings}
                    />
                  </div>
                </li>
              ))}
            </ol>
          </div>
         </section>
        ) : null}

        <div className="animate-rise-in" style={{ animationDelay: '340ms' }}>
          <ScanGallery scans={scans} label={t('originalScan')} hint={t('originalScanHint')} />
        </div>

        {!appSettings.hide_ratings ? (
          <div className="animate-rise-in" style={{ animationDelay: '360ms' }}>
            <RatingStars recipeId={recipe.id} average={rating} count={recipe.ratings.length} myRating={myRating} />
          </div>
        ) : null}

        <div className="animate-rise-in" style={{ animationDelay: '380ms' }}>
          <CommentsSection recipeId={recipe.id} comments={comments} userId={userId} />
        </div>
      </div>
    </div>
   </NextIntlClientProvider>
  );
}

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="recipe-glass-chip flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium text-ink-700">
      {icon}
      {label}
    </span>
  );
}
