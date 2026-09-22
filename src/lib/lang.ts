import type { Ingredient, Locale } from '@/lib/types';

const HEBREW_CHARS = /[\u0590-\u05FF]/g;
const LATIN_CHARS = /[A-Za-z]/g;

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * Decides which language a piece of text is written in by which script actually dominates it.
 *
 * Deliberately NOT "contains a Hebrew character": recipes are routinely mixed (an English recipe
 * with a Hebrew note, a Hebrew recipe naming "cream cheese"), and treating one stray character as
 * proof of language left whole recipes untranslated for the reader.
 */
export function detectLang(text: string): Locale {
  const hebrew = count(text, HEBREW_CHARS);
  const latin = count(text, LATIN_CHARS);
  // Nothing alphabetic (a numeric title, symbols): there is nothing to translate either way.
  if (hebrew === 0 && latin === 0) return 'en';
  return hebrew >= latin ? 'he' : 'en';
}

/**
 * Detects the language a recipe was written in, weighing the parts a reader actually reads. The
 * body (ingredients + steps) decides; the title only breaks a tie, since a single English brand
 * name in a Hebrew title should not flip the whole recipe.
 */
export function detectRecipeLang(recipe: {
  title: string;
  description?: string;
  ingredients: Ingredient[];
  steps: string[];
}): Locale {
  const body = [...recipe.ingredients.map((i) => i.name), ...recipe.steps, recipe.description ?? ''].join(' ');
  const hebrew = count(body, HEBREW_CHARS);
  const latin = count(body, LATIN_CHARS);
  if (hebrew === 0 && latin === 0) return detectLang(recipe.title);
  return hebrew >= latin ? 'he' : 'en';
}
