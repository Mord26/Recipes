'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { pretranslateRecipe } from '@/lib/queries';
import { notifyNewRecipe } from '@/lib/notify';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { recipeFormSchema, normalizeTag, type RecipeFormValues } from '@/lib/validation';
import type { PhotoKind } from '@/lib/types';
import { forceFallback } from '@/lib/fallback';

export interface RecipeActionResult {
  error: string | null;
  id?: string;
}

async function syncTaxonomy(recipeId: string, categoryIds: string[], tags: string[]) {
  const supabase = await createSupabaseServerClient();

  await supabase.from('recipe_categories').delete().eq('recipe_id', recipeId);
  if (categoryIds.length > 0) {
    await supabase
      .from('recipe_categories')
      .insert(categoryIds.map((categoryId) => ({ recipe_id: recipeId, category_id: categoryId })));
  }

  await supabase.from('recipe_tags').delete().eq('recipe_id', recipeId);
  const normalized = [...new Set(tags.map(normalizeTag).filter(Boolean))];
  const tagIds: string[] = [];
  for (const name of normalized) {
    const { data: found } = await supabase.from('tags').select('id').eq('name', name).maybeSingle();
    if (found) {
      tagIds.push(found.id);
      continue;
    }
    const { data: inserted } = await supabase.from('tags').insert({ name }).select('id').maybeSingle();
    if (inserted) {
      tagIds.push(inserted.id);
    } else {
      const { data: retry } = await supabase.from('tags').select('id').eq('name', name).maybeSingle();
      if (retry) tagIds.push(retry.id);
    }
  }
  if (tagIds.length > 0) {
    await supabase.from('recipe_tags').insert(tagIds.map((tagId) => ({ recipe_id: recipeId, tag_id: tagId })));
  }

  // Touch the recipe so the search_text trigger re-reads tag names.
  await supabase.from('recipes').update({ updated_at: new Date().toISOString() }).eq('id', recipeId);
}

export async function createRecipe(form: RecipeFormValues, source: 'manual' | 'photo'): Promise<RecipeActionResult> {
  if(await forceFallback())return {error:'readOnly'};
  const parsed = recipeFormSchema.safeParse(form);
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  // RLS blocks this insert too, but a clear message beats a generic failure.
  const { data: me } = await supabase.from('profiles').select('can_add_recipes').eq('id', user.id).single();
  if (me && me.can_add_recipes === false) return { error: 'cannotAddRecipes' };

  const values = parsed.data;
  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({
      owner_id: user.id,
      title: values.title,
      description: values.description,
      credit: values.credit,
      ingredients: values.ingredients,
      steps: values.steps,
      servings: values.servings,
      prep_minutes: values.prepMinutes,
      cook_minutes: values.cookMinutes,
      visibility: values.visibility,
      source,
    })
    .select('id')
    .single();

  if (error || !recipe) return { error: 'generic' };

  await syncTaxonomy(recipe.id, values.categoryIds, values.tags);
  // Translate into the other language now, in the background, so whoever opens this recipe next
  // gets it instantly instead of waiting for a live translation.
  after(() => pretranslateRecipe(recipe.id));
  // Tell the rest of the family there is something new to look at.
  after(() => notifyNewRecipe(recipe.id, user.id));
  revalidatePath('/');
  return { error: null, id: recipe.id };
}

export async function updateRecipe(recipeId: string, form: RecipeFormValues): Promise<RecipeActionResult> {
  if(await forceFallback())return {error:'readOnly'};
  const parsed = recipeFormSchema.safeParse(form);
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createSupabaseServerClient();
  const values = parsed.data;
  const { data: updated, error } = await supabase
    .from('recipes')
    .update({
      title: values.title,
      description: values.description,
      credit: values.credit,
      ingredients: values.ingredients,
      steps: values.steps,
      servings: values.servings,
      prep_minutes: values.prepMinutes,
      cook_minutes: values.cookMinutes,
      visibility: values.visibility,
    })
    .eq('id', recipeId)
    .select('id')
    .maybeSingle();

  if (error || !updated) return { error: 'generic' };

  await syncTaxonomy(recipeId, values.categoryIds, values.tags);
  // The text changed, so the cached translation is stale - refresh it in the background.
  after(() => pretranslateRecipe(recipeId));
  revalidatePath('/');
  revalidatePath(`/recipes/${recipeId}`);
  return { error: null, id: recipeId };
}

/** Records that the user cooked this recipe through to the end (powers "cooked N times"). */
export async function logCook(recipeId: string): Promise<RecipeActionResult> {
  if(await forceFallback())return {error:'readOnly'};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const { error } = await supabase.from('cook_logs').insert({ recipe_id: recipeId, user_id: user.id });
  if (error) return { error: 'generic' };

  revalidatePath(`/recipes/${recipeId}`);
  return { error: null };
}

export async function deleteRecipe(recipeId: string): Promise<RecipeActionResult> {
  if(await forceFallback())return {error:'readOnly'};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const { data: recipe } = await supabase.from('recipes').select('id, owner_id').eq('id', recipeId).maybeSingle();
  if (!recipe) return { error: 'notAllowed' };
  if (recipe.owner_id !== user.id) {
    // The family admin may delete anyone's recipe (RLS enforces this too).
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (me?.role !== 'admin') return { error: 'notAllowed' };
  }

  // Delete the row FIRST and require proof it was removed: an RLS-blocked delete reports success
  // with zero rows, and destroying the photos before that would leave a recipe with no images.
  const { data: deleted, error } = await supabase.from('recipes').delete().eq('id', recipeId).select('id').maybeSingle();
  if (error) return { error: 'generic' };
  if (!deleted) return { error: 'notAllowed' };

  const admin = createSupabaseAdminClient();
  const { data: objects } = await admin.storage.from('photos').list(recipeId, { limit: 100 });
  if (objects && objects.length > 0) {
    await admin.storage.from('photos').remove(objects.map((o) => `${recipeId}/${o.name}`));
  }

  revalidatePath('/');
  return { error: null };
}

const MAX_DISH_PHOTOS = 6;

export async function addRecipePhotos(
  recipeId: string,
  photos: { path: string; kind: PhotoKind; position: number }[]
): Promise<RecipeActionResult> {
  if(await forceFallback())return {error:'readOnly'};
  if (photos.length === 0) return { error: null };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };
  const { error } = await supabase.from('recipe_photos').insert(
    photos.map((photo) => ({
      recipe_id: recipeId,
      storage_path: photo.path,
      kind: photo.kind,
      position: photo.position,
      uploader_id: user.id,
    }))
  );
  if (error) return { error: 'generic' };
  revalidatePath(`/recipes/${recipeId}`);
  return { error: null };
}

/** Lets any family member add a single dish photo to a recipe (RLS enforces family visibility). */
export async function addDishPhoto(recipeId: string, storagePath: string): Promise<RecipeActionResult> {
  if(await forceFallback())return {error:'readOnly'};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const { count } = await supabase
    .from('recipe_photos')
    .select('id', { count: 'exact', head: true })
    .eq('recipe_id', recipeId)
    .eq('kind', 'photo');
  if ((count ?? 0) >= MAX_DISH_PHOTOS) return { error: 'tooManyPhotos' };

  const { error } = await supabase.from('recipe_photos').insert({
    recipe_id: recipeId,
    storage_path: storagePath,
    kind: 'photo',
    position: count ?? 0,
    uploader_id: user.id,
  });
  if (error) return { error: 'generic' };

  revalidatePath(`/recipes/${recipeId}`);
  return { error: null };
}

export async function deleteRecipePhoto(photoId: string): Promise<RecipeActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const { data: photo } = await supabase
    .from('recipe_photos')
    .select('id, recipe_id, storage_path, kind, uploader_id, recipes!inner(owner_id)')
    .eq('id', photoId)
    .maybeSingle();
  const ownerId = (photo as { recipes?: { owner_id?: string } } | null)?.recipes?.owner_id;
  const uploaderId = (photo as { uploader_id?: string } | null)?.uploader_id;
  // The recipe owner can remove any photo; a member can remove a dish photo they uploaded. Scans are owner-only.
  const allowed = ownerId === user.id || (photo?.kind === 'photo' && uploaderId === user.id);
  if (!photo || (photo.kind === 'scan' && ownerId !== user.id) || !allowed) return { error: 'notAllowed' };

  const { data: deleted } = await supabase
    .from('recipe_photos')
    .delete()
    .eq('id', photoId)
    .select('id')
    .maybeSingle();
  if (!deleted) return { error: 'notAllowed' };

  const admin = createSupabaseAdminClient();
  await admin.storage.from('photos').remove([photo.storage_path]);

  revalidatePath(`/recipes/${photo.recipe_id}`);
  return { error: null };
}
