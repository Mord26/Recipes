import { cache } from 'react';
import { after } from 'next/server';
import { getLocale } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { averageRating, totalMinutes, type Category, type Ingredient, type Locale, type RecipeComment, type RecipeListItem, type Profile, type Tag } from '@/lib/types';
import { detectLang, detectRecipeLang } from '@/lib/lang';
import { fallbackRecipes, fallbackTable, readOnlyMode } from '@/lib/fallback';
import { GeminiQuotaError, translateRecipe, translateTitles } from '@/lib/gemini';

// Courtesy cap shared by extraction and translation. The no-billing key cannot be charged, so this
// only guards against runaway loops; Gemini's own free-tier limit is the real ceiling.
const DAILY_AI_LIMIT = 500;
/**
 * How long a page load may wait for a fresh translation. Beyond this the reader gets the original
 * immediately and the translation is finished in the background - waiting ~90s on a blank skeleton
 * looked like the app had frozen.
 */
const ON_DEMAND_TRANSLATE_MS = 22_000;
/**
 * Remembers recipes we just tried to translate, so a reload (including the auto-refresh the
 * "translating" note performs) does not start the work again, bump the daily cap again, and queue
 * another background job. Per server instance, which is all this needs to be.
 */
const translateAttempts = new Map<string, number>();
const TRANSLATE_RETRY_AFTER_MS = 90_000;

function recentlyAttempted(key: string): boolean {
  const last = translateAttempts.get(key);
  if (last && Date.now() - last < TRANSLATE_RETRY_AFTER_MS) return true;
  translateAttempts.set(key, Date.now());
  // Keep the map from growing without bound on a long-lived instance.
  if (translateAttempts.size > 200) {
    for (const [entry, at] of translateAttempts) {
      if (Date.now() - at > TRANSLATE_RETRY_AFTER_MS) translateAttempts.delete(entry);
    }
  }
  return false;
}

export interface RecipeFilters {
  q?: string;
  categoryId?: string;
  tagId?: string;
  uploaderId?: string;
  mine?: boolean;
  favoritesOnly?: boolean;
  minRating?: number;
  maxMinutes?: number;
  sort?: 'newest' | 'top';
}

const LIST_SELECT = `
  *,
  profiles!recipes_owner_id_fkey(username, display_name),
  recipe_photos(id, storage_path, kind, position, uploader_id, uploader:profiles!recipe_photos_uploader_id_fkey(display_name)),
  recipe_categories(category_id),
  recipe_tags(tag_id),
  ratings(user_id, stars),
  favorites(user_id)
`;

export async function fetchRecipes(filters: RecipeFilters, userId: string): Promise<RecipeListItem[]> {
  const supabase = await createSupabaseServerClient();

  let select = LIST_SELECT;
  if (filters.categoryId) select = select.replace('recipe_categories(category_id)', 'recipe_categories!inner(category_id)');
  if (filters.tagId) select = select.replace('recipe_tags(tag_id)', 'recipe_tags!inner(tag_id)');
  if (filters.favoritesOnly) select = select.replace('favorites(user_id)', 'favorites!inner(user_id)');

  let query = supabase.from('recipes').select(select).order('created_at', { ascending: false }).limit(120);

  if (filters.q) query = query.ilike('search_text', `%${filters.q.trim().toLowerCase()}%`);
  if (filters.categoryId) query = query.eq('recipe_categories.category_id', filters.categoryId);
  if (filters.tagId) query = query.eq('recipe_tags.tag_id', filters.tagId);
  if (filters.uploaderId) query = query.eq('owner_id', filters.uploaderId);
  if (filters.mine) query = query.eq('owner_id', userId);
  if (filters.favoritesOnly) query = query.eq('favorites.user_id', userId);

  const { data, error } = await query;
  let recipes = (data as unknown as RecipeListItem[])||[];
  if((error||!data)&&await readOnlyMode(error))recipes=fallbackRecipes(userId) as RecipeListItem[];
  else if(error||!data)return [];

  if (filters.minRating) {
    recipes = recipes.filter((recipe) => (averageRating(recipe.ratings) ?? 0) >= filters.minRating!);
  }
  if (filters.maxMinutes) {
    recipes = recipes.filter((recipe) => {
      const total = totalMinutes(recipe);
      return total !== null && total <= filters.maxMinutes!;
    });
  }
  if (filters.sort === 'top') {
    recipes = [...recipes].sort((a, b) => (averageRating(b.ratings) ?? 0) - (averageRating(a.ratings) ?? 0));
  }

  return attachTranslatedTitles(recipes);
}

/**
 * Replaces each recipe's title with a cached (or freshly generated) translation into the reader's
 * app language, so names read correctly in every list. Foreign-language titles are batched into one
 * Gemini call and cached in recipe_title_i18n. Any failure/quota leaves the original title in place.
 */
async function attachTranslatedTitles(recipes: RecipeListItem[]): Promise<RecipeListItem[]> {
  if (recipes.length === 0) return recipes;
  const locale = (await getLocale()) as Locale;

  const foreign = recipes.filter((r) => r.title && detectLang(r.title) !== locale);
  if (foreign.length === 0) return recipes;

  const supabase = await createSupabaseServerClient();
  const { data: cachedRows } = await supabase
    .from('recipe_title_i18n')
    .select('recipe_id, title, source_title')
    .eq('locale', locale)
    .in('recipe_id', foreign.map((r) => r.id));

  const cacheMap = new Map<string, { title: string; source_title: string }>();
  for (const row of (cachedRows ?? []) as { recipe_id: string; title: string; source_title: string }[]) {
    cacheMap.set(row.recipe_id, { title: row.title, source_title: row.source_title });
  }

  const translated = new Map<string, string>();
  const misses: { id: string; title: string }[] = [];
  for (const r of foreign) {
    const hit = cacheMap.get(r.id);
    if (hit && hit.source_title === r.title) translated.set(r.id, hit.title);
    else misses.push({ id: r.id, title: r.title });
  }

  // Generate the missing translations AFTER the response is sent, so a list never waits on Gemini.
  // Those recipes render with their original title once and are translated from the next visit on.
  if (misses.length > 0) after(() => cacheTitleTranslations(misses, locale));

  if (translated.size === 0) return recipes;
  return recipes.map((r) => (translated.has(r.id) ? { ...r, title: translated.get(r.id)! } : r));
}

/**
 * Background job: translates titles and stores them in recipe_title_i18n. Runs outside the request
 * response via `after()`, so it uses the service-role client (no cookies are available there). The
 * recipes were already RLS-filtered for the caller, so this only caches names the user could see.
 */
async function cacheTitleTranslations(misses: { id: string; title: string }[], locale: Locale): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: underLimit, error: usageError } = await admin.rpc('bump_ai_usage', { daily_limit: DAILY_AI_LIMIT });
    if (usageError || underLimit !== true) return;

    const fresh = await translateTitles(misses, locale);
    const rows = misses
      .filter((miss) => fresh.has(miss.id))
      .map((miss) => ({ recipe_id: miss.id, locale, title: fresh.get(miss.id)!, source_title: miss.title }));
    if (rows.length > 0) await admin.from('recipe_title_i18n').upsert(rows, { onConflict: 'recipe_id,locale' });
  } catch (error) {
    if (!(error instanceof GeminiQuotaError)) console.error('cacheTitleTranslations failed:', error);
  }
}

export async function fetchRecipe(id: string): Promise<RecipeListItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('recipes').select(LIST_SELECT).eq('id', id).maybeSingle();
  if(data)return data as unknown as RecipeListItem;
  return (await readOnlyMode(error)?fallbackRecipes('').find(x=>x.id===id):null) as RecipeListItem|null;
}

interface CachedTranslation {
  title: string;
  description: string;
  credit: string | null;
  ingredients: Ingredient[];
  steps: string[];
  source_updated_at: string;
}

export interface ReaderRecipe {
  recipe: RecipeListItem;
  /** Whether the recipe is currently being shown translated (reader locale differs from source). */
  translated: boolean;
  sourceLocale: Locale;
  /** True when a translation was wanted but couldn't be produced (quota/error); original shown instead. */
  translationUnavailable: boolean;
  /**
   * The translation didn't finish inside the page-load budget and is being completed in the
   * background. The UI shows a "translating" note and refreshes itself shortly.
   */
  translationPending: boolean;
}

/**
 * Fetches a recipe rendered in the reader's language. If the reader's locale matches the language
 * the recipe was written in, the original is returned. Otherwise a cached translation is used, or one
 * is generated once via Gemini (counted against the daily cap) and cached. On quota/error the original
 * is returned with translationUnavailable=true so nothing ever breaks or costs money.
 */
export async function fetchRecipeForReader(id: string, locale: Locale): Promise<ReaderRecipe | null> {
  const recipe = await fetchRecipe(id);
  if (!recipe) return null;

  const sourceLocale = detectRecipeLang(recipe);
  if (locale === sourceLocale) {
    return { recipe, translated: false, sourceLocale, translationUnavailable: false, translationPending: false };
  }

  const supabase = await createSupabaseServerClient();

  // 1) Serve a fresh cached translation if one exists.
  const { data: cached } = await supabase
    .from('recipe_translations')
    .select('title, description, credit, ingredients, steps, source_updated_at')
    .eq('recipe_id', id)
    .eq('locale', locale)
    .maybeSingle();

  const fresh =
    cached && new Date((cached as CachedTranslation).source_updated_at).getTime() >= new Date(recipe.updated_at).getTime();
  if (fresh) {
    return {
      recipe: applyTranslation(recipe, cached as CachedTranslation),
      translated: true,
      sourceLocale,
      translationUnavailable: false,
      translationPending: false,
    };
  }

  // 2) Generate on demand, but never let the page hang on it. If Gemini is slow or overloaded the
  //    reader gets the original straight away plus a "translating" note, the work finishes in the
  //    background via after(), and the next render serves it from cache.
  // A reload while a background translation is still running must not start a second one.
  if (recentlyAttempted(`${id}:${locale}`)) {
    return { recipe, translated: false, sourceLocale, translationUnavailable: false, translationPending: true };
  }

  try {
    const { data: underLimit, error: usageError } = await supabase.rpc('bump_ai_usage', { daily_limit: DAILY_AI_LIMIT });
    if (usageError || underLimit !== true) {
      return { recipe, translated: false, sourceLocale, translationUnavailable: true, translationPending: false };
    }

    const translated = await translateRecipe(toTranslatable(recipe), locale, ON_DEMAND_TRANSLATE_MS);
    await saveTranslation(supabase, id, locale, translated, recipe.updated_at);
    return {
      recipe: applyTranslation(recipe, translated),
      translated: true,
      sourceLocale,
      translationUnavailable: false,
      translationPending: false,
    };
  } catch (error) {
    const quota = error instanceof GeminiQuotaError;
    if (!quota) console.error('translateRecipe failed, finishing in background:', error);
    // Quota is a hard stop; anything else is worth one unhurried background attempt.
    if (!quota) after(() => finishTranslationInBackground(id, locale, recipe));
    return {
      recipe,
      translated: false,
      sourceLocale,
      translationUnavailable: quota,
      translationPending: !quota,
    };
  }
}

/**
 * Translates a recipe into the OTHER language right after it is saved, so the first family member
 * who opens it in that language gets it instantly instead of waiting for a live translation.
 * Fire-and-forget from a server action via after().
 */
export async function pretranslateRecipe(recipeId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from('recipes')
      .select('id, title, description, credit, ingredients, steps, updated_at')
      .eq('id', recipeId)
      .maybeSingle();
    if (!data) return;

    const recipe = data as unknown as RecipeListItem;
    const target: Locale = detectRecipeLang(recipe) === 'he' ? 'en' : 'he';

    const { data: underLimit, error: usageError } = await admin.rpc('bump_ai_usage', { daily_limit: DAILY_AI_LIMIT });
    if (usageError || underLimit !== true) return;

    const translated = await translateRecipe(toTranslatable(recipe), target);
    await saveTranslation(admin, recipeId, target, translated, recipe.updated_at);
    // The list views read titles from their own small cache, so seed that too.
    await admin
      .from('recipe_title_i18n')
      .upsert(
        { recipe_id: recipeId, locale: target, title: translated.title, source_title: recipe.title },
        { onConflict: 'recipe_id,locale' }
      );
  } catch (error) {
    if (!(error instanceof GeminiQuotaError)) console.error('pretranslateRecipe failed:', error);
  }
}

/** Shared shape for the translator. */
function toTranslatable(recipe: RecipeListItem) {
  return {
    title: recipe.title,
    description: recipe.description,
    credit: recipe.credit,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
  };
}

type TranslationRow = { title: string; description: string; credit: string | null; ingredients: Ingredient[]; steps: string[] };
/** Either the cookie-scoped client or the service-role one - both expose the same upsert here. */
type SupabaseLike = Awaited<ReturnType<typeof createSupabaseServerClient>> | ReturnType<typeof createSupabaseAdminClient>;

async function saveTranslation(
  client: SupabaseLike,
  recipeId: string,
  locale: Locale,
  translated: TranslationRow,
  sourceUpdatedAt: string
) {
  await client.from('recipe_translations').upsert(
    {
      recipe_id: recipeId,
      locale,
      title: translated.title,
      description: translated.description,
      credit: translated.credit,
      ingredients: translated.ingredients,
      steps: translated.steps,
      source_updated_at: sourceUpdatedAt,
    },
    { onConflict: 'recipe_id,locale' }
  );
}

/**
 * Runs after the response is sent, so it can take its time. Uses the service-role client because
 * request APIs (cookies) are not available inside after() in a Server Component.
 */
async function finishTranslationInBackground(id: string, locale: Locale, recipe: RecipeListItem): Promise<void> {
  try {
    const translated = await translateRecipe(toTranslatable(recipe), locale);
    await saveTranslation(createSupabaseAdminClient(), id, locale, translated, recipe.updated_at);
  } catch (error) {
    if (!(error instanceof GeminiQuotaError)) console.error('background translation failed:', error);
  }
}

function applyTranslation(
  recipe: RecipeListItem,
  t: Pick<CachedTranslation, 'title' | 'description' | 'credit' | 'ingredients' | 'steps'>
): RecipeListItem {
  return { ...recipe, title: t.title, description: t.description, credit: t.credit, ingredients: t.ingredients, steps: t.steps };
}

export async function fetchComments(recipeId: string): Promise<RecipeComment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('comments')
    .select('*, profiles!comments_author_id_fkey(username, display_name)')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: true });
  if(data)return data as unknown as RecipeComment[];
  return await readOnlyMode(error)?fallbackTable<RecipeComment>('comments').filter(x=>x.recipe_id===recipeId):[];
}

// These lookups are read on nearly every page; cache() dedupes them within a single request render.
export const fetchCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createSupabaseServerClient();
  const { data,error } = await supabase.from('categories').select('id, name_he, name_en, emoji').order('created_at');
  return (data as Category[]) ?? (await readOnlyMode(error)?fallbackTable<Category>('categories'):[]);
});

export const fetchTags = cache(async (): Promise<Tag[]> => {
  const supabase = await createSupabaseServerClient();
  const { data,error } = await supabase.from('tags').select('id, name').order('name');
  return (data as Tag[]) ?? (await readOnlyMode(error)?fallbackTable<Tag>('tags'):[]);
});

export type FamilyMember = Pick<
  Profile,
  'id' | 'username' | 'display_name' | 'role' | 'blocked' | 'can_add_recipes'
>;

export const fetchFamilyMembers = cache(async (): Promise<FamilyMember[]> => {
  const supabase = await createSupabaseServerClient();
  const { data,error } = await supabase
    .from('profiles')
    .select('id, username, display_name, role, blocked, can_add_recipes')
    .order('display_name');
  return (data as FamilyMember[]) ?? (await readOnlyMode(error)?fallbackTable<FamilyMember>('profiles'):[]);
});

export type MemberSummary = Pick<Profile, 'id' | 'username' | 'display_name' | 'role'> & {
  recipeCount: number;
  cookedCount: number;
};

/**
 * Family members with how many recipes each has shared, most prolific first - the list is meant to
 * make sharing visible and a little competitive. Counts come from rows RLS already made visible.
 */
export const fetchMemberSummaries = cache(async (): Promise<MemberSummary[]> => {
  const supabase = await createSupabaseServerClient();
  const [members, recipes, cooks] = await Promise.all([
    fetchFamilyMembers(),
    supabase.from('recipes').select('owner_id'),
    supabase.from('cook_logs').select('recipe_id, recipes!inner(owner_id)'),
  ]);

  const recipeCounts = new Map<string, number>();
  for (const row of (recipes.data ?? []) as { owner_id: string }[]) {
    recipeCounts.set(row.owner_id, (recipeCounts.get(row.owner_id) ?? 0) + 1);
  }
  const cookedCounts = new Map<string, number>();
  for (const row of (cooks.data ?? []) as { recipes?: { owner_id?: string } }[]) {
    const owner = row.recipes?.owner_id;
    if (owner) cookedCounts.set(owner, (cookedCounts.get(owner) ?? 0) + 1);
  }

  return members
    // A blocked member disappears from the family list; the admin still sees them in settings.
    .filter((member) => !member.blocked)
    .map((member) => ({
      ...member,
      recipeCount: recipeCounts.get(member.id) ?? 0,
      cookedCount: cookedCounts.get(member.id) ?? 0,
    }))
    .sort((a, b) => b.recipeCount - a.recipeCount || a.display_name.localeCompare(b.display_name));
});

export const fetchMember = cache(
  async (id: string): Promise<Pick<Profile, 'id' | 'username' | 'display_name' | 'role'> | null> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from('profiles').select('id, username, display_name, role').eq('id', id).maybeSingle();
    return (data as Pick<Profile, 'id' | 'username' | 'display_name' | 'role'>) ?? null;
  }
);

/** How many times this recipe has been cooked through to the end. */
export const fetchCookCount = cache(async (recipeId: string): Promise<number> => {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from('cook_logs')
    .select('id', { count: 'exact', head: true })
    .eq('recipe_id', recipeId);
  return count ?? 0;
});

export interface AppSettingsRow {
  hide_ratings: boolean;
  hide_tags: boolean;
}

export const fetchAppSettings = cache(async (): Promise<AppSettingsRow> => {
  const supabase = await createSupabaseServerClient();
  const { data,error } = await supabase.from('app_settings').select('hide_ratings, hide_tags').eq('id', 1).maybeSingle();
  return (data as AppSettingsRow) ?? (await readOnlyMode(error)?fallbackTable<AppSettingsRow>('app_settings')[0]:null) ?? { hide_ratings: false, hide_tags: false };
});

export interface IssueSummary {
  event: string;
  count: number;
  lastAt: string;
}

/**
 * A plain-language health check for the admin: what went wrong on people's phones this week.
 * Reads the diagnostics table that the browser reports failures into.
 */
export const fetchRecentIssues = cache(async (): Promise<IssueSummary[]> => {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('client_events')
    .select('event, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);

  const byEvent = new Map<string, IssueSummary>();
  for (const row of (data ?? []) as { event: string; created_at: string }[]) {
    const existing = byEvent.get(row.event);
    if (existing) existing.count += 1;
    else byEvent.set(row.event, { event: row.event, count: 1, lastAt: row.created_at });
  }
  return [...byEvent.values()].sort((a, b) => b.count - a.count);
});
