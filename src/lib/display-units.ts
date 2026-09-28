import { formatQuantity, scaleQuantity } from './scaling';
import { convert, findUnit, resolveUnit, type UnitSystem } from './units';
import type { Ingredient } from './types';

export interface DisplayedIngredient {
  /** Ready-to-render amount, e.g. "1½" or "120". Empty when the ingredient has no quantity. */
  amount: string;
  /** Canonical unit id to translate, or null when the original unit was free text. */
  unitId: string | null;
  /** Original free-text unit, kept when it could not be resolved. */
  rawUnit: string | null;
  /** True when the value was converted between measuring systems (so the UI can mark it as approximate). */
  converted: boolean;
}

/** Picks the friendliest metric weight unit: 1200g reads better as 1.2kg. */
function metricWeight(grams: number): { value: number; unitId: string } {
  return grams >= 1000 ? { value: grams / 1000, unitId: 'kg' } : { value: grams, unitId: 'gram' };
}

/** Picks the friendliest US weight unit. */
function usWeight(grams: number): { value: number; unitId: string } {
  const ounces = grams / 28.349523125;
  return ounces >= 16 ? { value: ounces / 16, unitId: 'pound' } : { value: ounces, unitId: 'ounce' };
}

function rounded(value: number): number {
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 2) / 2;
  return Math.round(value * 100) / 100;
}

/**
 * Renders one ingredient in the reader's language, already scaled to the target servings.
 *
 * The recipe is shown as written - the unit word is just translated (cup -> כוס) and the amount
 * formatted as a clean fraction. The ONLY cross-system conversion is weight: a Hebrew reader sees
 * grams/kg (ounces/pounds converted), an English reader sees ounces/pounds (grams/kg converted).
 * Volume (cups, spoons, ml), length and count units are always kept exactly as written, so
 * "¼ cup olive oil" stays "¼ כוס שמן זית" instead of a confusing "49.5 גרם".
 */
export function displayIngredient(
  ingredient: Ingredient,
  system: UnitSystem,
  baseServings: number | null,
  targetServings: number | null
): DisplayedIngredient {
  const scaled =
    ingredient.quantity !== null && baseServings !== null && targetServings !== null
      ? scaleQuantity(ingredient.quantity, baseServings, targetServings)
      : ingredient.quantity;

  const unitId = resolveUnit(ingredient.unit);
  const passthrough: DisplayedIngredient = {
    amount: scaled !== null ? formatQuantity(scaled) : '',
    unitId,
    rawUnit: unitId ? null : (ingredient.unit ?? null),
    converted: false,
  };

  if (scaled === null || unitId === null) return passthrough;

  const unit = findUnit(unitId);
  // Count units keep the family's own wording ("יחידות") rather than the canonical label.
  if (!unit || unit.category === 'count') {
    return { ...passthrough, unitId: null, rawUnit: ingredient.unit ?? null };
  }

  // Weight is the only category we convert between systems; everything else is kept as written.
  if (unit.category === 'weight' && unit.system !== system && unit.system !== 'both') {
    const grams = convert(scaled, unitId, 'gram');
    if (grams === null) return passthrough;
    const picked = system === 'metric' ? metricWeight(grams) : usWeight(grams);
    return { amount: formatQuantity(rounded(picked.value)), unitId: picked.unitId, rawUnit: null, converted: true };
  }

  return passthrough;
}
