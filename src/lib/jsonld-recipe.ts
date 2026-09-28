/**
 * Reads the schema.org/Recipe block that most recipe sites embed for Google.
 * When it is there the import needs no AI at all, which makes it instant and exact.
 */

export interface JsonLdRecipe {
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  image: string | null;
  author: string | null;
}

const asArray = <T>(value: T | T[] | undefined | null): T[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

type Node = Record<string, unknown>;

function typesOf(node: Node): string[] {
  return asArray(node['@type'] as string | string[] | undefined).map((t) => String(t).toLowerCase());
}

/** Walks the whole document - the Recipe sits at an unpredictable depth inside @graph or nested arrays. */
function findRecipeNode(value: unknown, seen = new Set<unknown>()): Node | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item, seen);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);

  const node = value as Node;
  if (typesOf(node).includes('recipe')) return node;

  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
    const found = findRecipeNode(node[key], seen);
    if (found) return found;
  }
  return null;
}

/**
 * ISO 8601 duration to minutes. Handles the plain `PT1H30M` and the long
 * `P0Y0M0DT1H30M0.000S` some sites emit, which a naive regex silently misreads.
 */
export function isoDurationToMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 0 ? Math.round(value) : null;
  if (typeof value !== 'string') return null;
  const match = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
    value.trim()
  );
  if (!match) return null;
  const [, years, months, weeks, days, hours, minutes, seconds] = match.map((v) => (v ? Number(v) : 0));
  const total =
    years * 525600 + months * 43200 + weeks * 10080 + days * 1440 + hours * 60 + minutes + seconds / 60;
  const rounded = Math.round(total);
  return rounded > 0 ? rounded : null;
}

/** recipeInstructions comes as plain strings, HowToStep objects, or HowToSection groups. */
function collectSteps(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === 'string') {
    return value
      .replace(/<[^>]+>/g, '\n')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 1);
  }
  if (Array.isArray(value)) return value.flatMap((item) => collectSteps(item, depth + 1));
  if (!value || typeof value !== 'object') return [];

  const node = value as Node;
  if (node.itemListElement) return collectSteps(node.itemListElement, depth + 1);
  const text = node.text ?? node.name ?? node.description;
  return typeof text === 'string' ? collectSteps(text, depth + 1) : [];
}

function firstImage(value: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  if (typeof value === 'string') return value.startsWith('http') ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImage(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') return firstImage((value as Node).url ?? (value as Node).contentUrl, depth + 1);
  return null;
}

function parseServings(value: unknown): number | null {
  for (const candidate of asArray(value as string | string[] | undefined)) {
    const match = /\d+/.exec(String(candidate));
    if (match) {
      const n = Number(match[0]);
      if (n >= 1 && n <= 100) return n;
    }
  }
  return null;
}

function authorName(value: unknown): string | null {
  const first = asArray(value as unknown[])[0];
  if (typeof first === 'string') return first.trim() || null;
  if (first && typeof first === 'object') {
    const name = (first as Node).name;
    if (typeof name === 'string') return name.trim() || null;
  }
  return null;
}

/** Extracts every ld+json block from a page and returns the recipe, if one is there. */
export function parseJsonLdRecipe(html: string): JsonLdRecipe | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim().replace(/^\uFEFF/, ''));
    } catch {
      continue;
    }
    const node = findRecipeNode(parsed);
    if (!node) continue;

    const ingredients = asArray(node.recipeIngredient as string[] | undefined)
      .map((item) => String(item).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const steps = collectSteps(node.recipeInstructions);
    if (ingredients.length === 0 && steps.length === 0) continue;

    const title = typeof node.name === 'string' ? node.name.trim() : '';
    const description = typeof node.description === 'string' ? node.description.trim() : '';
    return {
      title,
      description: description.slice(0, 2000),
      ingredients,
      steps,
      servings: parseServings(node.recipeYield),
      prepMinutes: isoDurationToMinutes(node.prepTime),
      cookMinutes: isoDurationToMinutes(node.cookTime ?? node.totalTime),
      image: firstImage(node.image),
      author: authorName(node.author),
    };
  }
  return null;
}

/** Fallback for the image when a page has no Recipe block. */
export function parseOgImage(html: string): string | null {
  const match =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
  return match && match[1].startsWith('http') ? match[1] : null;
}
