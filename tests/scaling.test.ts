import { describe, expect, it } from 'vitest';
import { formatQuantity, parseQuantity, scaleIngredient, scaleQuantity } from '@/lib/scaling';

describe('scaleQuantity', () => {
  it('scales linearly with servings', () => {
    expect(scaleQuantity(2, 4, 8)).toBe(4);
    expect(scaleQuantity(3, 6, 2)).toBe(1);
    expect(scaleQuantity(1.5, 3, 4)).toBe(2);
  });

  it('returns original quantity for invalid servings', () => {
    expect(scaleQuantity(2, 0, 4)).toBe(2);
    expect(scaleQuantity(2, 4, 0)).toBe(2);
  });
});

describe('formatQuantity', () => {
  it('formats whole numbers plainly', () => {
    expect(formatQuantity(3)).toBe('3');
    expect(formatQuantity(12)).toBe('12');
  });

  it('formats common fractions with unicode glyphs', () => {
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(0.25)).toBe('¼');
    expect(formatQuantity(1.5)).toBe('1½');
    expect(formatQuantity(2.75)).toBe('2¾');
    expect(formatQuantity(1 / 3)).toBe('⅓');
  });

  it('rounds near-whole values', () => {
    expect(formatQuantity(2.99)).toBe('3');
    expect(formatQuantity(3.01)).toBe('3');
  });

  it('falls back to decimals for odd fractions', () => {
    expect(formatQuantity(1.15)).toBe('1.15');
  });

  it('returns empty string for invalid input', () => {
    expect(formatQuantity(0)).toBe('');
    expect(formatQuantity(-2)).toBe('');
    expect(formatQuantity(NaN)).toBe('');
  });
});

describe('parseQuantity', () => {
  it('parses plain numbers and decimal commas', () => {
    expect(parseQuantity('2')).toBe(2);
    expect(parseQuantity('1.5')).toBe(1.5);
    expect(parseQuantity('1,5')).toBe(1.5);
  });

  it('parses slash fractions', () => {
    expect(parseQuantity('1/2')).toBe(0.5);
    expect(parseQuantity('3/4')).toBe(0.75);
    expect(parseQuantity('1 1/2')).toBe(1.5);
  });

  it('parses unicode fraction glyphs', () => {
    expect(parseQuantity('½')).toBe(0.5);
    expect(parseQuantity('1½')).toBe(1.5);
  });

  it('rejects garbage and non-positive values', () => {
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('-1')).toBeNull();
    expect(parseQuantity('1/0')).toBeNull();
  });
});

describe('scaleIngredient', () => {
  it('scales only when quantity exists', () => {
    expect(scaleIngredient({ name: 'קמח', quantity: 2, unit: 'כוס' }, 4, 8).quantity).toBe(4);
    expect(scaleIngredient({ name: 'מלח', quantity: null, unit: null }, 4, 8).quantity).toBeNull();
  });
});
