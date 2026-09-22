import { describe, expect, it } from 'vitest';
import {
  extractedRecipeSchema,
  normalizeTag,
  recipeFormSchema,
  signUpSchema,
  usernameSchema,
} from '@/lib/validation';

describe('usernameSchema', () => {
  it('accepts valid usernames and lowercases them', () => {
    expect(usernameSchema.parse('Abba_123')).toBe('abba_123');
  });

  it('rejects hebrew, spaces and short names', () => {
    expect(usernameSchema.safeParse('אבא').success).toBe(false);
    expect(usernameSchema.safeParse('a b').success).toBe(false);
    expect(usernameSchema.safeParse('a').success).toBe(false);
  });
});

describe('signUpSchema', () => {
  const base = {
    username: 'ima',
    displayName: 'אמא',
    password: 'secret123',
    inviteCode: 'family',
  };

  it('turns empty email into null', () => {
    const parsed = signUpSchema.parse({ ...base, email: '' });
    expect(parsed.email).toBeNull();
  });

  it('keeps a valid email lowercased', () => {
    const parsed = signUpSchema.parse({ ...base, email: 'Mom@Example.com' });
    expect(parsed.email).toBe('mom@example.com');
  });

  it('rejects short passwords', () => {
    expect(signUpSchema.safeParse({ ...base, email: '', password: '1234567' }).success).toBe(false);
  });
});

describe('recipeFormSchema', () => {
  const valid = {
    title: 'עוגת שוקולד',
    description: '',
    ingredients: [{ name: 'קמח', quantity: 2, unit: 'כוס' }],
    steps: ['לערבב הכל'],
    servings: 8,
    prepMinutes: 15,
    cookMinutes: 40,
    visibility: 'family' as const,
    categoryIds: [],
    tags: ['פרווה'],
  };

  it('accepts a complete valid recipe', () => {
    expect(recipeFormSchema.safeParse(valid).success).toBe(true);
  });

  it('normalizes the credit field', () => {
    expect(recipeFormSchema.parse({ ...valid, credit: '  סבתא רחל ' }).credit).toBe('סבתא רחל');
    expect(recipeFormSchema.parse({ ...valid, credit: '' }).credit).toBeNull();
    expect(recipeFormSchema.parse(valid).credit).toBeNull();
  });

  it('requires at least one ingredient but allows a recipe with no steps', () => {
    expect(recipeFormSchema.safeParse({ ...valid, ingredients: [] }).success).toBe(false);
    // Ingredient-only recipes (sauces, dips, spice mixes) are valid with an empty steps list.
    expect(recipeFormSchema.safeParse({ ...valid, steps: [] }).success).toBe(true);
  });

  it('rejects an empty title', () => {
    expect(recipeFormSchema.safeParse({ ...valid, title: '  ' }).success).toBe(false);
  });
});

describe('extractedRecipeSchema (Gemini output)', () => {
  it('parses a well-formed extraction', () => {
    const parsed = extractedRecipeSchema.parse({
      title: 'מרק עוף',
      description: 'מרק של שבת',
      servings: 6,
      prep_minutes: 20,
      cook_minutes: 90,
      ingredients: [{ name: 'עוף', quantity: 1, unit: 'ק"ג' }],
      steps: ['לבשל'],
      suggested_tags: ['שבת'],
    });
    expect(parsed.title).toBe('מרק עוף');
    expect(parsed.ingredients).toHaveLength(1);
  });

  it('recovers from malformed fields instead of failing', () => {
    const parsed = extractedRecipeSchema.parse({
      title: 'עוגה',
      description: '',
      servings: 'הרבה',
      prep_minutes: -5,
      cook_minutes: null,
      ingredients: 'לא מערך',
      steps: ['לערבב'],
      suggested_tags: null,
    });
    expect(parsed.servings).toBeNull();
    expect(parsed.prep_minutes).toBeNull();
    expect(parsed.ingredients).toEqual([]);
    expect(parsed.suggested_tags).toEqual([]);
  });

  it('drops only the malformed ingredient/step and keeps the good ones', () => {
    const parsed = extractedRecipeSchema.parse({
      title: 'עוגה',
      ingredients: [
        { name: 'קמח', quantity: 2, unit: 'כוס' },
        { name: '', quantity: 1, unit: 'כוס' }, // invalid: empty name
        { name: 'סוכר', quantity: 1, unit: 'כוס' },
      ],
      steps: ['לערבב', '', '   ', 'לאפות'], // two blank steps dropped
    });
    expect(parsed.ingredients.map((i) => i.name)).toEqual(['קמח', 'סוכר']);
    expect(parsed.steps).toEqual(['לערבב', 'לאפות']);
  });

  it('keeps a known reject_reason and drops anything unexpected', () => {
    expect(extractedRecipeSchema.parse({ title: 'x', reject_reason: 'handwriting' }).reject_reason).toBe('handwriting');
    expect(extractedRecipeSchema.parse({ title: 'x', reject_reason: 'gibberish' }).reject_reason).toBeNull();
    expect(extractedRecipeSchema.parse({ title: 'x' }).reject_reason).toBeNull();
  });

  it('maps has_unreadable_parts and defaults it to false', () => {
    expect(extractedRecipeSchema.parse({ title: 'x', has_unreadable_parts: true }).has_unreadable_parts).toBe(true);
    expect(extractedRecipeSchema.parse({ title: 'x' }).has_unreadable_parts).toBe(false);
  });
});

describe('normalizeTag', () => {
  it('trims, lowercases and collapses spaces', () => {
    expect(normalizeTag('  ללא   גלוטן ')).toBe('ללא גלוטן');
    expect(normalizeTag('Parve')).toBe('parve');
  });
});
