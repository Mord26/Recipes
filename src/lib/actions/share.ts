'use server';

import { fetchRecipeForReader } from '@/lib/queries';
import { buildShareData, type ShareData } from '@/lib/share-data';
import type { Locale } from '@/lib/types';

/** Returns share content for a recipe in the requested language (translating and caching on demand). */
export async function getShareData(recipeId: string, locale: Locale): Promise<ShareData | null> {
  const reader = await fetchRecipeForReader(recipeId, locale);
  if (!reader) return null;
  return buildShareData(reader.recipe, locale);
}
