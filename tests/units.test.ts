import { describe, expect, it } from 'vitest';
import { convert, formatConverted, systemForLocale, unitsIn } from '@/lib/units';

describe('systemForLocale', () => {
  it('maps English to US measures', () => {
    expect(systemForLocale('en')).toBe('us');
  });

  it('maps Hebrew (and anything else) to metric', () => {
    expect(systemForLocale('he')).toBe('metric');
    expect(systemForLocale('')).toBe('metric');
    expect(systemForLocale('fr')).toBe('metric');
  });
});

describe('convert', () => {
  it('converts weight units', () => {
    expect(convert(1, 'kg', 'gram')).toBe(1000);
    expect(convert(500, 'gram', 'kg')).toBe(0.5);
    expect(convert(1, 'pound', 'gram')).toBeCloseTo(453.592, 2);
    expect(convert(1, 'ounce', 'gram')).toBeCloseTo(28.35, 2);
  });

  it('converts volume units', () => {
    expect(convert(1, 'liter', 'ml')).toBe(1000);
    expect(convert(1, 'cup', 'ml')).toBe(240);
    expect(convert(3, 'tsp', 'tbsp')).toBe(1);
    expect(convert(1, 'cup', 'tbsp')).toBe(16);
  });

  it('converts length units', () => {
    expect(convert(1, 'inch', 'cm')).toBeCloseTo(2.54, 5);
    expect(convert(2.54, 'cm', 'inch')).toBeCloseTo(1, 5);
  });

  it('has no units outside the Israeli and US systems', () => {
    expect(convert(10, 'mm', 'cm')).toBeNull();
    expect(convert(1, 'flOz', 'ml')).toBeNull();
  });

  it('refuses to convert count units', () => {
    expect(convert(2, 'piece', 'gram')).toBeNull();
  });

  it('converts oven temperatures', () => {
    expect(convert(180, 'celsius', 'fahrenheit')).toBe(356);
    expect(convert(350, 'fahrenheit', 'celsius')).toBeCloseTo(176.67, 2);
    expect(convert(0, 'celsius', 'fahrenheit')).toBe(32);
    expect(convert(200, 'celsius', 'celsius')).toBe(200);
  });

  it('refuses cross-category conversion', () => {
    expect(convert(1, 'kg', 'cup')).toBeNull();
    expect(convert(1, 'cm', 'gram')).toBeNull();
    expect(convert(1, 'celsius', 'gram')).toBeNull();
  });

  it('rejects non-finite input', () => {
    expect(convert(NaN, 'kg', 'gram')).toBeNull();
  });
});

describe('formatConverted', () => {
  it('scales decimals to magnitude', () => {
    expect(formatConverted(1000)).toBe('1,000');
    expect(formatConverted(12.345)).toBe('12.3');
    expect(formatConverted(2.5)).toBe('2.5');
    expect(formatConverted(0.125)).toBe('0.125');
  });
});

describe('unitsIn', () => {
  it('groups units by category', () => {
    expect(unitsIn('weight').map((u) => u.id)).toContain('kg');
    expect(unitsIn('volume').map((u) => u.id)).toContain('cup');
    expect(unitsIn('weight').every((u) => u.category === 'weight')).toBe(true);
  });
});
