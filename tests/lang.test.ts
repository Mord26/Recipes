import { describe, expect, it } from 'vitest';
import { detectLang, detectRecipeLang } from '@/lib/lang';

describe('detectLang', () => {
  it('detects the dominant script, not merely the presence of one', () => {
    expect(detectLang('עוגת שוקולד')).toBe('he');
    // Mostly English with one Hebrew word is an English sentence - the old "any Hebrew char"
    // rule read this as Hebrew and left such recipes untranslated.
    expect(detectLang('Mix the flour and קמח')).toBe('en');
  });

  it('detects English when no Hebrew letters present', () => {
    expect(detectLang('Chocolate cake')).toBe('en');
    expect(detectLang('Preheat to 180C, add 2 eggs')).toBe('en');
    expect(detectLang('123 !@#')).toBe('en');
  });
});

describe('detectRecipeLang', () => {
  it('samples title, ingredients and steps', () => {
    expect(
      detectRecipeLang({
        title: 'Chocolate cake',
        ingredients: [{ name: 'flour', quantity: 2, unit: 'cup' }],
        steps: ['Mix everything'],
      })
    ).toBe('en');

    expect(
      detectRecipeLang({
        title: 'עוגה',
        ingredients: [{ name: 'קמח', quantity: 2, unit: 'כוס' }],
        steps: ['לערבב'],
      })
    ).toBe('he');
  });

  it('lets the body decide when the title is in the other language', () => {
    expect(
      detectRecipeLang({
        title: 'Grandma cake',
        ingredients: [{ name: 'סוכר', quantity: 1, unit: 'cup' }],
        steps: ['מערבבים הכל ואופים בתנור עד שהעוגה מזהיבה'],
      })
    ).toBe('he');
  });
});

describe('mixed-language recipes', () => {
  it('does not call an English recipe Hebrew because of one Hebrew word', () => {
    expect(
      detectRecipeLang({
        title: 'Sourdough Bagels',
        description: 'המתכון של אינסטגרם',
        ingredients: [
          { name: 'water', quantity: 464, unit: 'gram' },
          { name: 'active starter', quantity: 332, unit: 'gram' },
          { name: 'flour', quantity: 1112, unit: 'gram' },
        ],
        steps: ['Mix water and starter, then add maple syrup, sugar, flour and salt until shaggy.'],
      })
    ).toBe('en');
  });

  it('still calls a Hebrew recipe Hebrew when it names an English ingredient', () => {
    expect(
      detectRecipeLang({
        title: 'עוגת גבינה',
        ingredients: [
          { name: 'גבינת שמנת (cream cheese)', quantity: 500, unit: 'גרם' },
          { name: 'סוכר', quantity: 1, unit: 'כוס' },
        ],
        steps: ['מערבבים את הגבינה עם הסוכר עד לקבלת תערובת אחידה וחלקה.'],
      })
    ).toBe('he');
  });

  it('detectLang weighs the dominant script', () => {
    expect(detectLang('Sourdough Bagels')).toBe('en');
    expect(detectLang('בייגלס ממחמצת')).toBe('he');
    expect(detectLang('Bagels בייגלס ממחמצת טעימים')).toBe('he');
  });
});
