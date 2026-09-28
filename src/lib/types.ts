export type Visibility = 'private' | 'family';
export type CommentVisibility = 'everyone' | 'private';
export type PhotoKind = 'photo' | 'scan';
export type Locale = 'he' | 'en';

export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: 'member' | 'admin';
  default_visibility: Visibility;
  locale: Locale;
  unit_system: 'metric' | 'us';
  /** Admin controls: a blocked member loses access; can_add_recipes false leaves them view-only. */
  blocked: boolean;
  can_add_recipes: boolean;
  notify_new_recipes: boolean;
}

export interface RecipePhoto {
  id: string;
  recipe_id: string;
  storage_path: string;
  kind: PhotoKind;
  position: number;
  uploader_id: string | null;
}

export interface Category {
  id: string;
  name_he: string | null;
  name_en: string | null;
  emoji: string | null;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Recipe {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  credit: string | null;
  ingredients: Ingredient[];
  steps: string[];
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  visibility: Visibility;
  source: 'manual' | 'photo';
  created_at: string;
  updated_at: string;
}

export interface RecipeListItem extends Recipe {
  profiles: Pick<Profile, 'username' | 'display_name'> | null;
  recipe_photos: (Pick<RecipePhoto, 'id' | 'storage_path' | 'kind' | 'position' | 'uploader_id'> & {
    uploader: Pick<Profile, 'display_name'> | null;
  })[];
  recipe_categories: { category_id: string }[];
  recipe_tags: { tag_id: string }[];
  ratings: { user_id: string; stars: number }[];
  favorites: { user_id: string }[];
}

export interface RecipeComment {
  id: string;
  recipe_id: string;
  author_id: string;
  body: string;
  visibility: CommentVisibility;
  created_at: string;
  profiles: Pick<Profile, 'username' | 'display_name'> | null;
}

/** Why the AI could not read a recipe, so the app can say something useful instead of "failed". */
export type RejectReason = 'handwriting' | 'blurry' | 'dark' | 'cropped' | 'notRecipe' | 'empty' | 'other';

export interface ExtractedRecipe {
  is_recipe: boolean;
  has_unreadable_parts: boolean;
  reject_reason: RejectReason | null;
  title: string;
  description: string;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  suggested_tags: string[];
}

export function categoryName(category: Category, locale: Locale): string {
  const primary = locale === 'he' ? category.name_he : category.name_en;
  return primary ?? category.name_he ?? category.name_en ?? '';
}

export function averageRating(ratings: { stars: number }[]): number | null {
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length;
}

export function totalMinutes(recipe: Pick<Recipe, 'prep_minutes' | 'cook_minutes'>): number | null {
  if (recipe.prep_minutes === null && recipe.cook_minutes === null) return null;
  return (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
}
