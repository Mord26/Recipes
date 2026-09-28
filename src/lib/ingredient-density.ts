/**
 * Grams per US cup for common ingredients, so volume<->weight conversion is accurate.
 * A cup of flour is 120g but a cup of honey is 336g - there is no single formula.
 * Values follow the King Arthur Baking ingredient weight chart, normalized to one cup.
 * Matching is keyword based on the free-text ingredient name; unknown names return null
 * and the caller falls back to a volume-only conversion rather than inventing a number.
 */
interface DensityEntry {
  gramsPerCup: number;
  keywords: string[];
}

const DENSITIES: DensityEntry[] = [
  // flours and dry bases
  { gramsPerCup: 120, keywords: ['קמח', 'קמח לבן', 'קמח רגיל', 'קמח תופח', 'קמח כוסמין', 'all purpose flour', 'flour'] },
  { gramsPerCup: 113, keywords: ['קמח מלא', 'whole wheat flour'] },
  { gramsPerCup: 96, keywords: ['קמח שקדים', 'almond flour'] },
  { gramsPerCup: 112, keywords: ['קורנפלור', 'קמח תירס', 'cornstarch', 'corn flour'] },
  { gramsPerCup: 140, keywords: ['סולת', 'semolina'] },
  { gramsPerCup: 120, keywords: ['פירורי לחם', 'פתיתי לחם', 'breadcrumbs'] },
  // sugars and sweeteners
  { gramsPerCup: 198, keywords: ['סוכר לבן', 'סוכר רגיל', 'סוכר', 'granulated sugar', 'sugar'] },
  { gramsPerCup: 213, keywords: ['סוכר חום', 'סוכר דמררה', 'brown sugar'] },
  { gramsPerCup: 113, keywords: ['אבקת סוכר', 'סוכר אבקה', 'powdered sugar', 'confectioners sugar'] },
  { gramsPerCup: 336, keywords: ['דבש', 'honey'] },
  { gramsPerCup: 328, keywords: ['סילאן', 'סירופ מייפל', 'maple syrup', 'silan'] },
  { gramsPerCup: 340, keywords: ['ריבה', 'jam'] },
  // fats and liquids
  { gramsPerCup: 227, keywords: ['חמאה', 'מרגרינה', 'butter', 'margarine'] },
  { gramsPerCup: 198, keywords: ['שמן זית', 'שמן קנולה', 'שמן', 'olive oil', 'oil'] },
  { gramsPerCup: 237, keywords: ['מים', 'water'] },
  { gramsPerCup: 240, keywords: ['חלב', 'milk'] },
  { gramsPerCup: 227, keywords: ['שמנת מתוקה', 'שמנת חמוצה', 'שמנת', 'heavy cream', 'sour cream', 'cream'] },
  { gramsPerCup: 227, keywords: ['יוגורט', 'לבן', 'yogurt', 'yoghurt'] },
  { gramsPerCup: 227, keywords: ['גבינת שמנת', 'גבינה לבנה', 'cream cheese', 'cottage'] },
  { gramsPerCup: 245, keywords: ['רסק עגבניות', 'מחית עגבניות', 'tomato paste', 'tomato puree'] },
  // grains, nuts, add-ins
  { gramsPerCup: 198, keywords: ['אורז', 'rice'] },
  { gramsPerCup: 90, keywords: ['שיבולת שועל', 'קוואקר', 'rolled oats', 'oats'] },
  { gramsPerCup: 170, keywords: ['שוקולד צ׳יפס', 'שוקולד ציפס', 'chocolate chips'] },
  { gramsPerCup: 170, keywords: ['שוקולד מגורד', 'שוקולד קצוץ', 'chopped chocolate'] },
  { gramsPerCup: 84, keywords: ['אבקת קקאו', 'קקאו', 'cocoa'] },
  { gramsPerCup: 113, keywords: ['שקדים', 'אגוזים', 'אגוזי מלך', 'פקאן', 'almonds', 'walnuts', 'pecans', 'nuts'] },
  { gramsPerCup: 149, keywords: ['צימוקים', 'raisins'] },
  { gramsPerCup: 128, keywords: ['גבינה מגוררת', 'גבינת פרמזן', 'grated cheese', 'parmesan'] },
  { gramsPerCup: 200, keywords: ['עדשים', 'חומוס יבש', 'שעועית יבשה', 'lentils', 'dried beans'] },
  // small-quantity powders
  { gramsPerCup: 288, keywords: ['מלח', 'salt'] },
  { gramsPerCup: 192, keywords: ['אבקת אפייה', 'baking powder'] },
  { gramsPerCup: 220, keywords: ['סודה לשתייה', 'baking soda'] },
  { gramsPerCup: 136, keywords: ['שמרים יבשים', 'dry yeast', 'yeast'] },
];

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'׳״.,()]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Returns grams per cup for a free-text ingredient name, or null when unknown.
 * Longer keywords are matched first so "קמח מלא" wins over the generic "קמח".
 */
export function gramsPerCup(ingredientName: string): number | null {
  const normalized = normalizeName(ingredientName);
  if (!normalized) return null;

  let best: { length: number; grams: number } | null = null;
  for (const entry of DENSITIES) {
    for (const keyword of entry.keywords) {
      const key = normalizeName(keyword);
      if (normalized.includes(key) && (!best || key.length > best.length)) {
        best = { length: key.length, grams: entry.gramsPerCup };
      }
    }
  }
  return best?.grams ?? null;
}

export function hasKnownDensity(ingredientName: string): boolean {
  return gramsPerCup(ingredientName) !== null;
}
