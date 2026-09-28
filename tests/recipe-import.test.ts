import { describe, expect, it } from 'vitest';
import { isoDurationToMinutes, parseJsonLdRecipe, parseOgImage } from '@/lib/jsonld-recipe';
import { firstUrlIn, parseSharedUrl, safeNextPath } from '@/lib/recipe-url';

const wrap = (data: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head><body></body></html>`;

describe('isoDurationToMinutes', () => {
  it('reads the common forms', () => {
    expect(isoDurationToMinutes('PT30M')).toBe(30);
    expect(isoDurationToMinutes('PT1H30M')).toBe(90);
    expect(isoDurationToMinutes('P1DT2H')).toBe(1560);
  });

  it('reads the long form some sites emit', () => {
    // Food Network style - a naive /PT(\d+)H(\d+)M/ regex silently misreads this.
    expect(isoDurationToMinutes('P0Y0M0DT1H30M0.000S')).toBe(90);
  });

  it('returns null for zero, junk and missing values', () => {
    expect(isoDurationToMinutes('PT0S')).toBeNull();
    expect(isoDurationToMinutes('half an hour')).toBeNull();
    expect(isoDurationToMinutes(undefined)).toBeNull();
  });
});

describe('parseJsonLdRecipe', () => {
  it('finds a recipe nested inside @graph', () => {
    const html = wrap({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Blog' },
        { '@type': 'BreadcrumbList' },
        {
          '@type': ['Recipe', 'Thing'],
          name: 'עוגת גבינה',
          description: 'קלאסיקה',
          recipeIngredient: ['2 כוסות קמח', '1 כוס סוכר'],
          recipeInstructions: [{ '@type': 'HowToStep', text: 'לערבב' }, { '@type': 'HowToStep', text: 'לאפות' }],
          recipeYield: ['8', '8 servings'],
          prepTime: 'PT10M',
          cookTime: 'PT1H',
          image: [{ '@type': 'ImageObject', url: 'https://example.com/cake.jpg' }],
          author: [{ '@type': 'Person', name: 'סבתא' }],
        },
      ],
    });
    const recipe = parseJsonLdRecipe(html);
    expect(recipe?.title).toBe('עוגת גבינה');
    expect(recipe?.ingredients).toEqual(['2 כוסות קמח', '1 כוס סוכר']);
    expect(recipe?.steps).toEqual(['לערבב', 'לאפות']);
    expect(recipe?.servings).toBe(8);
    expect(recipe?.prepMinutes).toBe(10);
    expect(recipe?.cookMinutes).toBe(60);
    expect(recipe?.image).toBe('https://example.com/cake.jpg');
    expect(recipe?.author).toBe('סבתא');
  });

  it('flattens HowToSection groups into a plain step list', () => {
    const html = wrap({
      '@type': 'Recipe',
      name: 'Burger',
      recipeIngredient: ['1 bun'],
      recipeInstructions: [
        { '@type': 'HowToSection', name: 'Sauce', itemListElement: [{ '@type': 'HowToStep', text: 'Mix it' }] },
        { '@type': 'HowToStep', text: 'Grill it' },
      ],
    });
    expect(parseJsonLdRecipe(html)?.steps).toEqual(['Mix it', 'Grill it']);
  });

  it('splits a single HTML instruction blob into steps', () => {
    const html = wrap({
      '@type': 'Recipe',
      name: 'Soup',
      recipeIngredient: ['water'],
      recipeInstructions: '<p>Boil the water.</p><p>Add salt.</p>',
    });
    expect(parseJsonLdRecipe(html)?.steps).toEqual(['Boil the water.', 'Add salt.']);
  });

  it('ignores a page with no recipe and survives malformed json', () => {
    expect(parseJsonLdRecipe(wrap({ '@type': 'Article', name: 'Not a recipe' }))).toBeNull();
    expect(parseJsonLdRecipe('<script type="application/ld+json">{oops</script>')).toBeNull();
  });

  it('reads og:image in either attribute order', () => {
    expect(parseOgImage('<meta property="og:image" content="https://a.com/x.jpg">')).toBe('https://a.com/x.jpg');
    expect(parseOgImage('<meta content="https://a.com/y.jpg" property="og:image">')).toBe('https://a.com/y.jpg');
    expect(parseOgImage('<meta property="og:title" content="hi">')).toBeNull();
  });
});

describe('firstUrlIn', () => {
  it('pulls the link out of shared text, which is where Android puts it', () => {
    expect(firstUrlIn(null, 'תראי מה מצאתי https://www.instagram.com/reel/ABC123/ שווה לנסות')).toBe(
      'https://www.instagram.com/reel/ABC123/'
    );
  });

  it('prefers the first non-empty candidate and trims trailing punctuation', () => {
    expect(firstUrlIn('', 'see https://a.com/recipe.')).toBe('https://a.com/recipe');
    expect(firstUrlIn('no link here', 'still none')).toBeNull();
  });
});

describe('parseSharedUrl', () => {
  it('classifies social links', () => {
    expect(parseSharedUrl('https://www.instagram.com/reel/ABC/')?.kind).toBe('social');
    expect(parseSharedUrl('https://vt.tiktok.com/XYZ/')?.kind).toBe('social');
    expect(parseSharedUrl('https://youtu.be/abc')?.kind).toBe('social');
    expect(parseSharedUrl('https://www.10dakot.co.il/recipe/x/')?.kind).toBe('web');
    expect(parseSharedUrl('https://www.pinterest.com/pin/123/')?.kind).toBe('unsupported');
  });

  it('strips tracking parameters but keeps real ones', () => {
    const parsed = parseSharedUrl('https://a.com/r?id=7&igshid=1&utm_source=ig&fbclid=2#frag');
    expect(parsed?.url).toBe('https://a.com/r?id=7');
  });

  it('refuses anything that is not a public http address', () => {
    expect(parseSharedUrl('javascript:alert(1)')).toBeNull();
    expect(parseSharedUrl('http://localhost:3000/admin')).toBeNull();
    expect(parseSharedUrl('http://169.254.169.254/latest/meta-data/')).toBeNull();
    expect(parseSharedUrl('http://192.168.1.1/')).toBeNull();
    expect(parseSharedUrl('not a url')).toBeNull();
  });
});

describe('safeNextPath', () => {
  it('keeps an in-app destination', () => {
    expect(safeNextPath('/share-target?url=https%3A%2F%2Fa.com')).toBe('/share-target?url=https%3A%2F%2Fa.com');
    expect(safeNextPath('/recipes/new')).toBe('/recipes/new');
  });

  it('refuses anything that could leave the app', () => {
    expect(safeNextPath('//evil.com')).toBe('/');
    expect(safeNextPath('https://evil.com')).toBe('/');
    expect(safeNextPath('')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
  });
});
