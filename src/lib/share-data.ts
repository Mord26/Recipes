import 'server-only';
import { getTranslations } from 'next-intl/server';
import { displayIngredient } from '@/lib/display-units';
import { unitLabel } from '@/lib/unit-label';
import { systemForLocale } from '@/lib/units';
import { formatMinutes } from '@/lib/utils';
import type { Locale, RecipeListItem } from '@/lib/types';

export interface ShareData {
  title: string;
  /** Localized "The recipe of X" line, or null when there is no credit. */
  creditLine: string | null;
  servings: number | null;
  ingredientLines: string[];
  steps: string[];
  /** Localized share caption used with the link. */
  linkText: string;
  /** Writing direction of the shared language, so the image is laid out RTL or LTR. */
  dir: 'rtl' | 'ltr';
  /** Short intro, printed as a note on the shared image. */
  note: string | null;
  /** Pre-formatted times for the meta row ("15 דק׳"), null when not set. */
  prepText: string | null;
  cookText: string | null;
  labels: { ingredients: string; steps: string; servings: string; appName: string; prep: string; cook: string };
}

/**
 * Builds everything the share sheet needs for a recipe in a specific language: the recipe text
 * (already translated by the caller via fetchRecipeForReader), unit-formatted ingredient lines
 * for that language's measuring system, and all UI labels in that language.
 */
export async function buildShareData(recipe: RecipeListItem, locale: Locale): Promise<ShareData> {
  const system = systemForLocale(locale);
  const [tRecipe, tCommon, tUnits] = await Promise.all([
    getTranslations({ locale, namespace: 'recipe' }),
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'converter' }),
  ]);

  const ingredientLines = recipe.ingredients.map((ingredient) => {
    const shown = displayIngredient(ingredient, system, recipe.servings, recipe.servings);
    const unit = shown.unitId ? unitLabel(shown.unitId, shown.amount, tUnits) : (shown.rawUnit ?? '');
    return `${shown.amount}${unit ? ` ${unit}` : ''} ${ingredient.name}`.trim();
  });

  return {
    title: recipe.title,
    creditLine: recipe.credit ? tRecipe('creditOf', { name: recipe.credit }) : null,
    servings: recipe.servings,
    ingredientLines,
    steps: recipe.steps,
    linkText: tRecipe('shareText', { title: recipe.title }),
    dir: locale === 'he' ? 'rtl' : 'ltr',
    note: recipe.description?.trim() ? recipe.description.trim() : null,
    prepText: recipe.prep_minutes !== null ? formatMinutes(recipe.prep_minutes, locale) : null,
    cookText: recipe.cook_minutes !== null ? formatMinutes(recipe.cook_minutes, locale) : null,
    labels: {
      ingredients: tRecipe('ingredients'),
      steps: tRecipe('steps'),
      servings: tRecipe('servings'),
      appName: tCommon('appName'),
      prep: tRecipe('prepTime'),
      cook: tRecipe('cookTime'),
    },
  };
}
