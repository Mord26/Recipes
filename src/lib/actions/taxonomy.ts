'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Category, Locale } from '@/lib/types';

interface CategoryResult {
  error: string | null;
  category?: Category;
}

export async function createCategory(name: string, locale: Locale): Promise<CategoryResult> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) return { error: 'invalidInput' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'notAllowed' };

  const column = locale === 'he' ? 'name_he' : 'name_en';
  const { data, error } = await supabase
    .from('categories')
    .insert({ [column]: trimmed, created_by: user.id })
    .select('id, name_he, name_en, emoji')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'categoryExists' };
    return { error: 'generic' };
  }

  revalidatePath('/');
  return { error: null, category: data as Category };
}

export async function updateCategory(id: string, name: string, emoji: string, locale: Locale): Promise<CategoryResult> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) return { error: 'invalidInput' };

  const supabase = await createSupabaseServerClient();
  const column = locale === 'he' ? 'name_he' : 'name_en';
  const { data, error } = await supabase
    .from('categories')
    .update({ [column]: trimmed, emoji: emoji.trim() || null })
    .eq('id', id)
    .select('id, name_he, name_en, emoji')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') return { error: 'categoryExists' };
    return { error: 'generic' };
  }
  if (!data) return { error: 'notAllowed' };

  revalidatePath('/');
  revalidatePath('/settings');
  return { error: null, category: data as Category };
}

export async function deleteCategory(id: string): Promise<CategoryResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('categories').delete().eq('id', id).select('id').maybeSingle();
  if (error) return { error: 'generic' };
  if (!data) return { error: 'notAllowed' };

  revalidatePath('/');
  revalidatePath('/settings');
  return { error: null };
}
