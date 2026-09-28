import { describe, expect, it } from 'vitest';
import { formatQuantity, parseQuantity } from '@/lib/scaling';

/**
 * The quantity picker composes a whole number with a fraction and stores the result
 * via formatQuantity, so the fraction always follows the whole ("1½", never "½1").
 * This locks that behaviour independently of the React component.
 */
describe('quantity picker composition', () => {
  const compose = (whole: number, fraction: number) => formatQuantity(whole + fraction);

  it('renders the fraction after the whole number', () => {
    expect(compose(1, 0.5)).toBe('1½');
    expect(compose(2, 0.25)).toBe('2¼');
    expect(compose(3, 0.75)).toBe('3¾');
    expect(compose(1, 1 / 3)).toBe('1⅓');
    expect(compose(2, 2 / 3)).toBe('2⅔');
  });

  it('renders a bare fraction with no whole number', () => {
    expect(compose(0, 0.5)).toBe('½');
    expect(compose(0, 0.25)).toBe('¼');
  });

  it('renders a bare whole with no fraction', () => {
    expect(compose(2, 0)).toBe('2');
    expect(compose(12, 0)).toBe('12');
  });

  it('round-trips through parseQuantity so saved recipes keep the value', () => {
    for (const [w, f] of [
      [1, 0.5],
      [2, 0.25],
      [0, 1 / 3],
      [4, 0],
    ] as const) {
      const text = compose(w, f);
      expect(parseQuantity(text)).toBeCloseTo(w + f, 5);
    }
  });

  it('seeds the picker from existing typed text', () => {
    // The picker reads the current field with parseQuantity to preselect whole+fraction.
    expect(parseQuantity('1½')).toBeCloseTo(1.5, 5);
    expect(parseQuantity('2 1/4')).toBeCloseTo(2.25, 5);
    expect(parseQuantity('½')).toBeCloseTo(0.5, 5);
  });
});
