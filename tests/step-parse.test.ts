import { describe, expect, it } from 'vitest';
import { annotateStep, findOvenTemp, findTimers, formatDuration } from '@/lib/step-parse';
import type { Ingredient } from '@/lib/types';

describe('findTimers', () => {
  it('finds minutes in Hebrew', () => {
    expect(findTimers('לאפות 40 דקות בתנור')[0]).toMatchObject({ seconds: 2400 });
  });

  it('finds hours in Hebrew', () => {
    expect(findTimers('לבשל 2 שעות')[0].seconds).toBe(7200);
  });

  it('understands Hebrew idioms without digits', () => {
    expect(findTimers('להתפיח שעה וחצי')[0].seconds).toBe(5400);
    expect(findTimers('לקרר חצי שעה')[0].seconds).toBe(1800);
    expect(findTimers('להשרות שעתיים')[0].seconds).toBe(7200);
  });

  it('finds English durations', () => {
    expect(findTimers('bake for 45 minutes')[0].seconds).toBe(2700);
    expect(findTimers('rest 1.5 hours')[0].seconds).toBe(5400);
  });

  it('finds several distinct timers in one step', () => {
    const timers = findTimers('לטגן 5 דקות ואז לאפות 30 דקות');
    expect(timers.map((timer) => timer.seconds)).toEqual([300, 1800]);
  });

  it('ignores text without durations and absurd values', () => {
    expect(findTimers('לערבב היטב')).toEqual([]);
    expect(findTimers('לחכות 100 שעות')).toEqual([]);
  });
});

describe('findOvenTemp', () => {
  it('reads Celsius written in Hebrew', () => {
    expect(findOvenTemp('לחמם תנור ל-180 מעלות')).toEqual({ celsius: 180, fahrenheit: 356, source: 'celsius' });
  });

  it('reads Fahrenheit', () => {
    const result = findOvenTemp('preheat to 350°F');
    expect(result?.source).toBe('fahrenheit');
    expect(result?.celsius).toBe(177);
  });

  it('returns null when there is no temperature', () => {
    expect(findOvenTemp('לערבב את הבצק')).toBeNull();
  });
});

describe('annotateStep', () => {
  const ingredients: Ingredient[] = [
    { name: 'קמח', quantity: 2, unit: 'כוס' },
    { name: 'סוכר', quantity: 1, unit: 'כוס' },
  ];
  const amountFor = (ingredient: Ingredient) => `${ingredient.quantity} ${ingredient.unit}`;

  it('marks an ingredient mentioned with the definite article', () => {
    const segments = annotateStep('מוסיפים את הקמח ומערבבים', ingredients, amountFor);
    const marked = segments.filter((segment) => segment.amount);
    expect(marked).toHaveLength(1);
    expect(marked[0].text).toBe('קמח');
    expect(marked[0].amount).toBe('2 כוס');
  });

  it('marks several ingredients in one step', () => {
    const segments = annotateStep('מערבבים קמח וסוכר', ingredients, amountFor);
    expect(segments.filter((segment) => segment.amount)).toHaveLength(2);
  });

  it('rebuilds the original text exactly', () => {
    const step = 'מוסיפים את הקמח ואז סוכר לקערה';
    const segments = annotateStep(step, ingredients, amountFor);
    expect(segments.map((segment) => segment.text).join('')).toBe(step);
  });

  it('does not mark an ingredient twice', () => {
    const segments = annotateStep('קמח, עוד קמח ושוב קמח', ingredients, amountFor);
    expect(segments.filter((segment) => segment.amount)).toHaveLength(1);
  });

  it('leaves steps without ingredients untouched', () => {
    const segments = annotateStep('מחממים את התנור', ingredients, amountFor);
    expect(segments).toEqual([{ text: 'מחממים את התנור' }]);
  });

  it('does not match a term inside an unrelated word', () => {
    const segments = annotateStep('מפזרים שוקולד', [{ name: 'קול', quantity: 1, unit: null }], amountFor);
    expect(segments.filter((segment) => segment.amount)).toHaveLength(0);
  });
});

describe('formatDuration', () => {
  it('formats mm:ss', () => {
    expect(formatDuration(2400)).toBe('40:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
  });
});
