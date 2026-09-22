export type UnitCategory = 'weight' | 'volume' | 'length' | 'count';
export type UnitSystem = 'metric' | 'us';

/** Measurement system follows the reader's language: Hebrew -> metric (grams/ml/cups), English -> US (oz/lbs). */
export function systemForLocale(locale: string): UnitSystem {
  return locale === 'en' ? 'us' : 'metric';
}

export interface UnitDef {
  id: string;
  category: UnitCategory;
  /** Factor to the category base unit (weight: gram, volume: ml, length: cm). Count units have no factor. */
  toBase: number;
  /** Which measuring system the unit belongs to; 'both' units are used in Israel and the US alike. */
  system: UnitSystem | 'both';
}

export const UNITS: UnitDef[] = [
  { id: 'gram', category: 'weight', toBase: 1, system: 'metric' },
  { id: 'kg', category: 'weight', toBase: 1000, system: 'metric' },
  { id: 'ounce', category: 'weight', toBase: 28.349523125, system: 'us' },
  { id: 'pound', category: 'weight', toBase: 453.59237, system: 'us' },
  { id: 'ml', category: 'volume', toBase: 1, system: 'metric' },
  { id: 'liter', category: 'volume', toBase: 1000, system: 'metric' },
  { id: 'cup', category: 'volume', toBase: 240, system: 'both' },
  { id: 'tbsp', category: 'volume', toBase: 15, system: 'both' },
  { id: 'tsp', category: 'volume', toBase: 5, system: 'both' },
  { id: 'cm', category: 'length', toBase: 1, system: 'metric' },
  { id: 'inch', category: 'length', toBase: 2.54, system: 'us' },
  { id: 'piece', category: 'count', toBase: 1, system: 'both' },
  { id: 'package', category: 'count', toBase: 1, system: 'both' },
  { id: 'bag', category: 'count', toBase: 1, system: 'both' },
  { id: 'pinch', category: 'count', toBase: 1, system: 'both' },
  // Countable units real recipes lean on. Without these they fell through as raw free text and
  // stayed in the source language ("3 cloves שום", "1 big bunch פטרוזיליה").
  { id: 'clove', category: 'count', toBase: 1, system: 'both' },
  { id: 'bunch', category: 'count', toBase: 1, system: 'both' },
  { id: 'handful', category: 'count', toBase: 1, system: 'both' },
  { id: 'sprig', category: 'count', toBase: 1, system: 'both' },
  { id: 'stalk', category: 'count', toBase: 1, system: 'both' },
  { id: 'slice', category: 'count', toBase: 1, system: 'both' },
  { id: 'can', category: 'count', toBase: 1, system: 'both' },
  { id: 'container', category: 'count', toBase: 1, system: 'both' },
  { id: 'dash', category: 'count', toBase: 1, system: 'both' },
  { id: 'drop', category: 'count', toBase: 1, system: 'both' },
];

/**
 * Free-text units typed by the family (or returned by the AI extractor) mapped to canonical ids.
 * Keys are compared lowercased with punctuation stripped, so "ק"ג" and "קג" both land on 'kg'.
 */
const UNIT_ALIASES: Record<string, string> = {
  // volume - Hebrew
  כוס: 'cup',
  כוסות: 'cup',
  כף: 'tbsp',
  כפות: 'tbsp',
  כפית: 'tsp',
  כפיות: 'tsp',
  מל: 'ml',
  מיליליטר: 'ml',
  ליטר: 'liter',
  ליטרים: 'liter',
  // volume - English
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  ml: 'ml',
  milliliter: 'ml',
  l: 'liter',
  liter: 'liter',
  litre: 'liter',
  // weight - Hebrew
  גרם: 'gram',
  גר: 'gram',
  ג: 'gram',
  קג: 'kg',
  קילו: 'kg',
  קילוגרם: 'kg',
  אונקיה: 'ounce',
  אונקיות: 'ounce',
  ליברה: 'pound',
  פאונד: 'pound',
  // weight - English
  g: 'gram',
  gr: 'gram',
  gram: 'gram',
  grams: 'gram',
  kg: 'kg',
  kilo: 'kg',
  kilogram: 'kg',
  oz: 'ounce',
  ounce: 'ounce',
  ounces: 'ounce',
  lb: 'pound',
  lbs: 'pound',
  pound: 'pound',
  pounds: 'pound',
  // length
  סמ: 'cm',
  סנטימטר: 'cm',
  cm: 'cm',
  אינץ: 'inch',
  inch: 'inch',
  inches: 'inch',
  // count
  יחידה: 'piece',
  יחידות: 'piece',
  piece: 'piece',
  pieces: 'piece',
  חבילה: 'package',
  חבילות: 'package',
  package: 'package',
  packages: 'package',
  שקית: 'bag',
  שקיות: 'bag',
  bag: 'bag',
  bags: 'bag',
  sack: 'bag',
  קורט: 'pinch',
  pinch: 'pinch',
  // countable cooking units - Hebrew
  שן: 'clove',
  שיני: 'clove',
  שיניים: 'clove',
  צרור: 'bunch',
  צרורות: 'bunch',
  חופן: 'handful',
  חופנים: 'handful',
  ענף: 'sprig',
  ענפים: 'sprig',
  גבעול: 'stalk',
  גבעולים: 'stalk',
  פרוסה: 'slice',
  פרוסות: 'slice',
  קופסה: 'can',
  קופסת: 'can',
  קופסאות: 'can',
  מיכל: 'container',
  גביע: 'container',
  גביעים: 'container',
  טיפה: 'drop',
  טיפות: 'drop',
  // countable cooking units - English
  clove: 'clove',
  cloves: 'clove',
  bunch: 'bunch',
  bunches: 'bunch',
  handful: 'handful',
  handfuls: 'handful',
  sprig: 'sprig',
  sprigs: 'sprig',
  stalk: 'stalk',
  stalks: 'stalk',
  slice: 'slice',
  slices: 'slice',
  can: 'can',
  cans: 'can',
  tin: 'can',
  container: 'container',
  containers: 'container',
  tub: 'container',
  dash: 'dash',
  dashes: 'dash',
  drop: 'drop',
  drops: 'drop',
};

function normalizeUnitKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[."'׳״\s]/g, '');
}

/** Maps stored free-text units (legacy rows, AI output) onto a canonical unit id. */
export function resolveUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = normalizeUnitKey(raw);
  if (!key) return null;
  if (UNITS.some((unit) => unit.id === key)) return key;
  return UNIT_ALIASES[key] ?? null;
}

export function unitsIn(category: UnitCategory): UnitDef[] {
  return UNITS.filter((unit) => unit.category === category);
}

export function findUnit(id: string): UnitDef | undefined {
  return UNITS.find((unit) => unit.id === id);
}

export function convert(value: number, fromId: string, toId: string): number | null {
  if (!Number.isFinite(value)) return null;

  if (fromId === 'celsius' || toId === 'celsius' || fromId === 'fahrenheit' || toId === 'fahrenheit') {
    if (fromId === toId) return value;
    if (fromId === 'celsius' && toId === 'fahrenheit') return value * 1.8 + 32;
    if (fromId === 'fahrenheit' && toId === 'celsius') return (value - 32) / 1.8;
    return null;
  }

  const from = findUnit(fromId);
  const to = findUnit(toId);
  if (!from || !to || from.category !== to.category || from.category === 'count') return null;
  return (value * from.toBase) / to.toBase;
}

export function formatConverted(value: number, locale: 'he' | 'en' = 'he'): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return Number(value.toFixed(decimals)).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US');
}

export const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'] as const;
