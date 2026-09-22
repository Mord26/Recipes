import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{2,20}$/);

export const passwordSchema = z.string().min(8).max(72);

export const signUpSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(40),
  password: passwordSchema,
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email()]).transform((v) => (v === '' ? null : v)),
  // Either a personal invite token or the shared family code must be supplied.
  inviteCode: z.string().trim().default(''),
});

export const signInSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

export const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(100000).nullable(),
  unit: z.string().trim().max(30).nullable().transform((v) => (v === '' ? null : v)),
});

export const recipeFormSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000),
  credit: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .default(null)
    .transform((v) => (v ? v : null)),
  ingredients: z.array(ingredientSchema).min(1).max(100),
  steps: z.array(z.string().trim().min(1).max(2000)).max(50),
  servings: z.number().int().min(1).max(100).nullable(),
  prepMinutes: z.number().int().min(0).max(6000).nullable(),
  cookMinutes: z.number().int().min(0).max(6000).nullable(),
  visibility: z.enum(['private', 'family']),
  categoryIds: z.array(z.string().uuid()).max(10),
  tags: z.array(z.string().trim().min(1).max(30)).max(15),
});

export type RecipeFormValues = z.infer<typeof recipeFormSchema>;

export const commentSchema = z.object({
  recipeId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
  visibility: z.enum(['everyone', 'private']),
});

const extractedIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(100000).nullable().catch(null),
  unit: z.string().trim().max(30).nullable().catch(null),
});
const extractedStepSchema = z.string().trim().min(1).max(2000);

// Parse ingredients/steps item-by-item and keep only the valid ones, so a single malformed row
// (e.g. an empty name) can never collapse the whole array and sink an otherwise-good extraction.
export const extractedRecipeSchema = z.object({
  is_recipe: z.boolean().catch(true),
  has_unreadable_parts: z.boolean().catch(false),
  reject_reason: z
    .enum(['handwriting', 'blurry', 'dark', 'cropped', 'notRecipe', 'empty', 'other'])
    .nullable()
    .catch(null),
  title: z.string().trim().min(1).max(120).catch('מתכון'),
  description: z.string().trim().max(2000).catch(''),
  servings: z.number().int().min(1).max(100).nullable().catch(null),
  prep_minutes: z.number().int().min(0).max(6000).nullable().catch(null),
  cook_minutes: z.number().int().min(0).max(6000).nullable().catch(null),
  ingredients: z
    .array(z.unknown())
    .catch([])
    .transform((items) => items.flatMap((item) => {
      const result = extractedIngredientSchema.safeParse(item);
      return result.success ? [result.data] : [];
    })),
  steps: z
    .array(z.unknown())
    .catch([])
    .transform((items) => items.flatMap((item) => {
      const result = extractedStepSchema.safeParse(item);
      return result.success ? [result.data] : [];
    })),
  suggested_tags: z.array(z.string().trim().min(1).max(30)).max(15).catch([]),
});

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ');
}
