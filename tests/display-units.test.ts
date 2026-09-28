import { describe, expect, it } from 'vitest';
import { displayIngredient } from '@/lib/display-units';
import { resolveUnit } from '@/lib/units';
import type { Ingredient } from '@/lib/types';

const ing = (name: string, quantity: number | null, unit: string | null): Ingredient => ({ name, quantity, unit });

describe('resolveUnit', () => {
  it('maps Hebrew free text onto canonical ids', () => {
    expect(resolveUnit('כוס')).toBe('cup');
    expect(resolveUnit('כוסות')).toBe('cup');
    expect(resolveUnit('כפות')).toBe('tbsp');
    expect(resolveUnit('כפית')).toBe('tsp');
    expect(resolveUnit('ק"ג')).toBe('kg');
    expect(resolveUnit('גר׳')).toBe('gram');
    expect(resolveUnit('מ"ל')).toBe('ml');
  });

  it('maps English free text and canonical ids', () => {
    expect(resolveUnit('Cups')).toBe('cup');
    expect(resolveUnit('tbsp')).toBe('tbsp');
    expect(resolveUnit('lbs')).toBe('pound');
    expect(resolveUnit('gram')).toBe('gram');
  });

  it('resolves the countable units real recipes use', () => {
    expect(resolveUnit('cloves')).toBe('clove');
    expect(resolveUnit('שיני')).toBe('clove');
    expect(resolveUnit('bunch')).toBe('bunch');
    expect(resolveUnit('צרור')).toBe('bunch');
    expect(resolveUnit('חופן')).toBe('handful');
    expect(resolveUnit('slices')).toBe('slice');
  });

  it('returns null for unknown or empty units', () => {
    expect(resolveUnit('קמצוץ-ענק')).toBeNull();
    expect(resolveUnit('')).toBeNull();
    expect(resolveUnit(null)).toBeNull();
  });
});

describe('displayIngredient - volume/spoons kept exactly as written', () => {
  it('keeps cups as cups for a Hebrew reader (¼ כוס, not grams)', () => {
    const r = displayIngredient(ing('שמן זית', 0.25, 'cup'), 'metric', null, null);
    expect(r.amount).toBe('¼');
    expect(r.unitId).toBe('cup');
    expect(r.converted).toBe(false);
  });

  it('keeps cups as cups for an English reader', () => {
    const r = displayIngredient(ing('flour', 2, 'cup'), 'us', null, null);
    expect(r.amount).toBe('2');
    expect(r.unitId).toBe('cup');
    expect(r.converted).toBe(false);
  });

  it('keeps spoons and millilitres untouched in both systems', () => {
    expect(displayIngredient(ing('מלח', 0.5, 'כפית'), 'metric', null, null).unitId).toBe('tsp');
    expect(displayIngredient(ing('קמח', 3, 'כף'), 'us', null, null).unitId).toBe('tbsp');
    expect(displayIngredient(ing('חלב', 200, 'מ"ל'), 'us', null, null).unitId).toBe('ml');
    expect(displayIngredient(ing('קמח', 3, 'כף'), 'us', null, null).converted).toBe(false);
  });
});

describe('displayIngredient - weight converts between systems', () => {
  it('metric reader: pounds/ounces become grams/kg', () => {
    const lb = displayIngredient(ing('בשר', 1, 'pound'), 'metric', null, null);
    expect(lb.unitId).toBe('gram');
    expect(Number(lb.amount)).toBeCloseTo(454, 0);
    expect(lb.converted).toBe(true);

    const big = displayIngredient(ing('בשר', 3, 'pound'), 'metric', null, null);
    expect(big.unitId).toBe('kg');
  });

  it('english reader: grams/kg become ounces/pounds', () => {
    const g = displayIngredient(ing('גבינה', 200, 'גרם'), 'us', null, null);
    expect(g.unitId).toBe('ounce');
    expect(g.converted).toBe(true);

    const kg = displayIngredient(ing('בשר', 1, 'ק"ג'), 'us', null, null);
    expect(kg.unitId).toBe('pound');
  });

  it('leaves weight already in the reader system untouched', () => {
    const m = displayIngredient(ing('קמח', 500, 'גרם'), 'metric', null, null);
    expect(m.unitId).toBe('gram');
    expect(m.amount).toBe('500');
    expect(m.converted).toBe(false);

    const u = displayIngredient(ing('beef', 8, 'oz'), 'us', null, null);
    expect(u.unitId).toBe('ounce');
    expect(u.converted).toBe(false);
  });
});

describe('displayIngredient - passthrough and scaling', () => {
  it('passes unresolved units through untouched', () => {
    const result = displayIngredient(ing('פטרוזיליה', 1, 'חופן'), 'metric', null, null);
    expect(result.amount).toBe('1');
    expect(result.unitId).toBeNull();
    expect(result.rawUnit).toBe('חופן');
    expect(result.converted).toBe(false);
  });

  it('keeps the family wording for count units', () => {
    const result = displayIngredient(ing('ביצים', 3, 'יחידות'), 'us', null, null);
    expect(result.amount).toBe('3');
    expect(result.rawUnit).toBe('יחידות');
    expect(result.unitId).toBeNull();
    expect(result.converted).toBe(false);
  });

  it('handles ingredients without a quantity', () => {
    const result = displayIngredient(ing('מלח לפי הטעם', null, null), 'metric', null, null);
    expect(result.amount).toBe('');
  });

  it('scales the amount while keeping the volume unit', () => {
    const result = displayIngredient(ing('קמח', 1, 'כוס'), 'metric', 4, 8);
    expect(result.amount).toBe('2');
    expect(result.unitId).toBe('cup');
  });

  it('scales metric weight without converting', () => {
    const result = displayIngredient(ing('קמח', 200, 'גרם'), 'metric', 4, 2);
    expect(result.amount).toBe('100');
    expect(result.unitId).toBe('gram');
  });
});
