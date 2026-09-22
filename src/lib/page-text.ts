/** Reduces a recipe page to the readable text an AI can work with. */

const DROP_BLOCKS = /<(script|style|noscript|template|svg|iframe|nav|header|footer|aside|form|select)\b[^>]*>[\s\S]*?<\/\1>/gi;
const BREAK_TAGS = /<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi;

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-',
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', frac12: '1/2', frac14: '1/4', frac34: '3/4', deg: '°',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const value = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * A typical recipe page is 500KB-1MB of HTML that boils down to a couple of thousand tokens.
 * Block elements become line breaks so ingredient lists survive as separate lines.
 */
export function htmlToText(html: string, maxChars = 24_000): string {
  const text = decodeEntities(
    html
      .replace(DROP_BLOCKS, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(BREAK_TAGS, '\n')
      .replace(/<[^>]+>/g, ' ')
  );

  const lines = text
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean);

  // Collapse the runs of repeated navigation labels that survive on most sites.
  const compact: string[] = [];
  for (const line of lines) {
    if (compact[compact.length - 1] !== line) compact.push(line);
  }
  return compact.join('\n').slice(0, maxChars);
}

/** Renders a structured recipe back into plain text, so one AI pass can normalise every source. */
export function recipeToText(recipe: {
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
}): string {
  const parts = [recipe.title, recipe.description];
  if (recipe.servings) parts.push(`Servings: ${recipe.servings}`);
  if (recipe.prepMinutes) parts.push(`Prep: ${recipe.prepMinutes} minutes`);
  if (recipe.cookMinutes) parts.push(`Cook: ${recipe.cookMinutes} minutes`);
  if (recipe.ingredients.length > 0) parts.push('Ingredients:', ...recipe.ingredients);
  if (recipe.steps.length > 0) parts.push('Instructions:', ...recipe.steps.map((s, i) => `${i + 1}. ${s}`));
  return parts.filter(Boolean).join('\n');
}
