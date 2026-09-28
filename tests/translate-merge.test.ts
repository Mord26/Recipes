import { describe, expect, it } from 'vitest';
import { mergeTranslation, type RecipeToTranslate } from '@/lib/gemini';

const base: RecipeToTranslate = {
  title: 'עוגה',
  description: 'טעימה',
  credit: 'סבתא',
  ingredients: [
    { name: 'קמח', quantity: 2, unit: 'כוס' },
    { name: 'סוכר', quantity: 1, unit: 'כוס' },
  ],
  steps: ['לערבב', 'לאפות'],
};

describe('mergeTranslation', () => {
  it('applies a complete translation, preserving quantity and unit', () => {
    const out = mergeTranslation(base, {
      title: 'Cake',
      description: 'Tasty',
      credit: 'Grandma',
      ingredient_names: ['flour', 'sugar'],
      steps: ['mix', 'bake'],
    });
    expect(out.title).toBe('Cake');
    expect(out.credit).toBe('Grandma');
    expect(out.ingredients).toEqual([
      { name: 'flour', quantity: 2, unit: 'כוס' },
      { name: 'sugar', quantity: 1, unit: 'כוס' },
    ]);
    expect(out.steps).toEqual(['mix', 'bake']);
  });

  it('keeps the original for missing tail items instead of dropping all translation', () => {
    const out = mergeTranslation(base, {
      title: 'Cake',
      ingredient_names: ['flour'], // short by one
      steps: ['mix'], // short by one
    });
    expect(out.title).toBe('Cake');
    expect(out.ingredients.map((i) => i.name)).toEqual(['flour', 'סוכר']);
    expect(out.steps).toEqual(['mix', 'לאפות']);
  });

  it('ignores extra returned items and falls back to originals for blanks', () => {
    const out = mergeTranslation(base, {
      ingredient_names: ['flour', '', 'extra'],
      steps: ['  ', 'bake'],
    });
    expect(out.title).toBe('עוגה'); // no title returned -> original
    expect(out.ingredients.map((i) => i.name)).toEqual(['flour', 'סוכר']);
    expect(out.steps).toEqual(['לערבב', 'bake']);
  });
});

describe('mergeTranslation - measurement words', () => {
  const withUnits: RecipeToTranslate = {
    title: 'Green dip',
    description: '',
    credit: null,
    ingredients: [
      { name: 'parsley with the stems', quantity: 1, unit: 'big bunch' },
      { name: 'garlic', quantity: 3, unit: 'cloves' },
      { name: 'salt and pepper', quantity: null, unit: null },
    ],
    steps: ['Blend everything.'],
  };

  it('translates free-text units that the unit table cannot resolve', () => {
    const out = mergeTranslation(withUnits, {
      ingredient_names: ['פטרוזיליה עם הגבעולים', 'שום', 'מלח ופלפל'],
      ingredient_units: ['צרור גדול', 'שיני', ''],
      steps: ['טוחנים הכל.'],
    });
    expect(out.ingredients[0].unit).toBe('צרור גדול');
    expect(out.ingredients[1].unit).toBe('שיני');
  });

  it('leaves a unitless ingredient unitless', () => {
    const out = mergeTranslation(withUnits, { ingredient_units: ['צרור גדול', 'שיני', 'קורט'] });
    expect(out.ingredients[2].unit).toBeNull();
  });

  it('keeps the original unit when the model omits one', () => {
    const out = mergeTranslation(withUnits, { ingredient_units: ['צרור גדול'] });
    expect(out.ingredients[1].unit).toBe('cloves');
  });
});
