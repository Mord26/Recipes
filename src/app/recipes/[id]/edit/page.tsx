import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { requireSessionProfile } from '@/lib/auth-helpers';
import { fetchCategories, fetchRecipe, fetchTags } from '@/lib/queries';
import { RecipeEditor } from '@/components/recipe-editor';

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ userId }, { id }] = await Promise.all([requireSessionProfile(), params]);
  const [recipe, categories, tags] = await Promise.all([fetchRecipe(id), fetchCategories(), fetchTags()]);
  if (!recipe) notFound();
  if (recipe.owner_id !== userId) redirect(`/recipes/${id}`);

  const t = await getTranslations('recipeForm');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const BackIcon = locale === 'he' ? ArrowRight : ArrowLeft;

  const tagNames = tags.filter((tag) => recipe.recipe_tags.some((rt) => rt.tag_id === tag.id)).map((tag) => tag.name);
  const dishPhotos = recipe.recipe_photos
    .filter((photo) => photo.kind === 'photo')
    .sort((a, b) => a.position - b.position);
  const scanPhotos = recipe.recipe_photos
    .filter((photo) => photo.kind === 'scan')
    .sort((a, b) => a.position - b.position);

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl px-5 pb-24">
      <header className="flex items-center gap-3 pt-[max(1.25rem,env(safe-area-inset-top))] pb-6">
        <Link
          href={`/recipes/${id}`}
          aria-label={tCommon('back')}
          className="flex size-11 items-center justify-center rounded-full bg-white/80 text-ink-900 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid active:scale-[0.92]"
        >
          <BackIcon size={20} strokeWidth={1.8} />
        </Link>
        <h1 className="font-display text-2xl font-medium text-ink-900">{t('editTitle')}</h1>
      </header>

      <RecipeEditor
        mode="edit"
        recipeId={recipe.id}
        categories={categories}
        defaultVisibility={recipe.visibility}
        initial={{
          title: recipe.title,
          description: recipe.description,
          credit: recipe.credit,
          ingredients: recipe.ingredients,
          steps: recipe.steps,
          servings: recipe.servings,
          prepMinutes: recipe.prep_minutes,
          cookMinutes: recipe.cook_minutes,
          visibility: recipe.visibility,
          categoryIds: recipe.recipe_categories.map((rc) => rc.category_id),
          tags: tagNames,
        }}
        existingPhotos={dishPhotos.map((photo) => ({ id: photo.id, storage_path: photo.storage_path }))}
        existingScans={scanPhotos.map((photo) => ({ id: photo.id, storage_path: photo.storage_path }))}
      />
    </div>
  );
}
