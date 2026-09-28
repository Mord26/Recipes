import { describe, expect, it } from 'vitest';
import { averageRating, categoryName, totalMinutes } from '@/lib/types';

describe('averageRating', () => {
  it('returns null when there are no ratings', () => {
    expect(averageRating([])).toBeNull();
  });

  it('averages stars', () => {
    expect(averageRating([{ stars: 4 }, { stars: 5 }])).toBe(4.5);
  });
});

describe('totalMinutes', () => {
  it('returns null when both times are missing', () => {
    expect(totalMinutes({ prep_minutes: null, cook_minutes: null })).toBeNull();
  });

  it('sums available times', () => {
    expect(totalMinutes({ prep_minutes: 15, cook_minutes: 45 })).toBe(60);
    expect(totalMinutes({ prep_minutes: 10, cook_minutes: null })).toBe(10);
  });
});

describe('categoryName', () => {
  const category = { id: '1', name_he: 'מרקים', name_en: 'Soups', emoji: '🥣' };

  it('prefers the requested locale', () => {
    expect(categoryName(category, 'he')).toBe('מרקים');
    expect(categoryName(category, 'en')).toBe('Soups');
  });

  it('falls back to the existing name', () => {
    expect(categoryName({ ...category, name_en: null }, 'en')).toBe('מרקים');
    expect(categoryName({ ...category, name_he: null }, 'he')).toBe('Soups');
  });
});
