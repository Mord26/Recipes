import type { Ingredient } from './types';

const UNICODE_FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [7 / 8, '⅞'],
];

export function scaleQuantity(quantity: number, baseServings: number, targetServings: number): number {
  if (baseServings <= 0 || targetServings <= 0) return quantity;
  return (quantity * targetServings) / baseServings;
}

export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0) return '';
  const whole = Math.floor(quantity);
  const fraction = quantity - whole;

  if (fraction < 0.03) return whole > 0 ? String(whole) : '';
  if (fraction > 0.97) return String(whole + 1);

  let best: string | null = null;
  let bestDiff = 0.02;
  for (const [value, glyph] of UNICODE_FRACTIONS) {
    const diff = Math.abs(fraction - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = glyph;
    }
  }

  if (best) return whole > 0 ? `${whole}${best}` : best;

  const rounded = Math.round(quantity * 100) / 100;
  return String(rounded);
}

export function parseQuantity(input: string): number | null {
  const trimmed = input.trim().replace(',', '.');
  if (!trimmed) return null;

  for (const [value, glyph] of UNICODE_FRACTIONS) {
    if (trimmed === glyph) return value;
    const match = trimmed.match(new RegExp(`^(\\d+)\\s*${glyph}$`));
    if (match) return Number(match[1]) + value;
  }

  const fraction = trimmed.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const whole = fraction[1] ? Number(fraction[1]) : 0;
    const denominator = Number(fraction[3]);
    if (denominator === 0) return null;
    return whole + Number(fraction[2]) / denominator;
  }

  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function scaleIngredient(ingredient: Ingredient, baseServings: number, targetServings: number): Ingredient {
  if (ingredient.quantity === null) return ingredient;
  return { ...ingredient, quantity: scaleQuantity(ingredient.quantity, baseServings, targetServings) };
}
