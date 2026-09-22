'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { commentSchema } from '@/lib/validation';

interface SocialResult {
  error: string | null;
}

export async function toggleFavorite(recipeId: string): Promise<SocialResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const { data: existing } = await supabase
    .from('favorites')
    .select('recipe_id')
    .eq('user_id', user.id)
    .eq('recipe_id', recipeId)
    .maybeSingle();

  if (existing) {
    await supabase.from('favorites').delete().eq('user_id', user.id).eq('recipe_id', recipeId);
  } else {
    await supabase.from('favorites').insert({ user_id: user.id, recipe_id: recipeId });
  }

  revalidatePath('/');
  revalidatePath('/favorites');
  revalidatePath(`/recipes/${recipeId}`);
  return { error: null };
}

export async function rateRecipe(recipeId: string, stars: number): Promise<SocialResult> {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: 'invalidInput' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const { error } = await supabase
    .from('ratings')
    .upsert({ user_id: user.id, recipe_id: recipeId, stars }, { onConflict: 'user_id,recipe_id' });
  if (error) return { error: 'generic' };

  revalidatePath(`/recipes/${recipeId}`);
  return { error: null };
}

export async function addComment(recipeId: string, body: string, visibility: string): Promise<SocialResult> {
  const parsed = commentSchema.safeParse({ recipeId, body, visibility });
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const { error } = await supabase.from('comments').insert({
    recipe_id: parsed.data.recipeId,
    author_id: user.id,
    body: parsed.data.body,
    visibility: parsed.data.visibility,
  });
  if (error) return { error: 'generic' };

  revalidatePath(`/recipes/${recipeId}`);
  return { error: null };
}

export async function deleteComment(commentId: string, recipeId: string): Promise<SocialResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  if (error) return { error: 'generic' };

  revalidatePath(`/recipes/${recipeId}`);
  return { error: null };
}
