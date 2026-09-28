import { parseQuantity } from './scaling';

/**
 * Picks singular or plural for a unit label.
 * "2 כוס" and "2 cup" are both wrong; Hebrew and English both want the plural from two up,
 * while fractions stay singular ("½ כוס", "½ cup") - which is also how cookbooks write it.
 */
export function isPluralAmount(amount: string): boolean {
  const value = parseQuantity(amount);
  return value !== null && value >= 2;
}

export type UnitTranslator = (key: string) => string;

/** Returns the correctly inflected unit label, falling back to the singular key if no plural exists. */
export function unitLabel(unitId: string | null, amount: string, t: UnitTranslator): string {
  if (!unitId) return '';
  const key = isPluralAmount(amount) ? `unitsPlural.${unitId}` : `units.${unitId}`;
  const label = t(key);
  // next-intl returns the key path itself when a message is missing.
  return label.includes(`.${unitId}`) ? t(`units.${unitId}`) : label;
}
