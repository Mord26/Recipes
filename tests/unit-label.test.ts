import { describe, expect, it } from 'vitest';
import { isPluralAmount, unitLabel } from '@/lib/unit-label';
import he from '../messages/he.json';
import en from '../messages/en.json';

/** Mimics next-intl: returns the key path itself when a message is missing. */
function translator(messages: Record<string, unknown>) {
  return (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object' && part in acc) return (acc as Record<string, unknown>)[part];
      return undefined;
    }, messages);
    return typeof value === 'string' ? value : key;
  };
}

const tHe = translator(he.converter as unknown as Record<string, unknown>);
const tEn = translator(en.converter as unknown as Record<string, unknown>);

describe('isPluralAmount', () => {
  it('treats two and above as plural', () => {
    expect(isPluralAmount('2')).toBe(true);
    expect(isPluralAmount('3')).toBe(true);
    expect(isPluralAmount('240')).toBe(true);
  });

  it('treats one and fractions as singular', () => {
    expect(isPluralAmount('1')).toBe(false);
    expect(isPluralAmount('½')).toBe(false);
    expect(isPluralAmount('1½')).toBe(false);
    expect(isPluralAmount('')).toBe(false);
  });
});

describe('unitLabel in Hebrew', () => {
  it('inflects countable units', () => {
    expect(unitLabel('cup', '1', tHe)).toBe('כוס');
    expect(unitLabel('cup', '2', tHe)).toBe('כוסות');
    expect(unitLabel('tbsp', '3', tHe)).toBe('כפות');
    expect(unitLabel('tsp', '1', tHe)).toBe('כפית');
    expect(unitLabel('piece', '3', tHe)).toBe('יחידות');
    expect(unitLabel('bag', '1', tHe)).toBe('שקית');
    expect(unitLabel('bag', '3', tHe)).toBe('שקיות');
    expect(unitLabel('package', '2', tHe)).toBe('חבילות');
  });

  it('keeps abbreviations unchanged', () => {
    expect(unitLabel('gram', '240', tHe)).toBe('גרם');
    expect(unitLabel('ml', '500', tHe)).toBe('מ״ל');
  });

  it('keeps fractions singular', () => {
    expect(unitLabel('cup', '½', tHe)).toBe('כוס');
  });
});

describe('unitLabel in English', () => {
  it('inflects countable units', () => {
    expect(unitLabel('cup', '1', tEn)).toBe('cup');
    expect(unitLabel('cup', '2', tEn)).toBe('cups');
    expect(unitLabel('inch', '9', tEn)).toBe('inches');
    expect(unitLabel('piece', '3', tEn)).toBe('pieces');
  });

  it('keeps abbreviations unchanged', () => {
    expect(unitLabel('tbsp', '3', tEn)).toBe('tbsp');
    expect(unitLabel('kg', '2', tEn)).toBe('kg');
  });
});

describe('unitLabel edge cases', () => {
  it('returns an empty string without a unit', () => {
    expect(unitLabel(null, '2', tHe)).toBe('');
  });

  it('falls back to the singular when no plural message exists', () => {
    expect(unitLabel('celsius', '2', tHe)).toBe('צלזיוס');
  });
});

describe('translation files stay in sync', () => {
  it('has a plural for every unit in both languages', () => {
    const heUnits = Object.keys((he.converter as { units: Record<string, string> }).units);
    const enUnits = Object.keys((en.converter as { units: Record<string, string> }).units);
    expect(heUnits).toEqual(enUnits);

    const hePlural = Object.keys((he.converter as { unitsPlural: Record<string, string> }).unitsPlural);
    const enPlural = Object.keys((en.converter as { unitsPlural: Record<string, string> }).unitsPlural);
    expect(hePlural).toEqual(enPlural);
    // Temperatures are the only units that never take a plural.
    expect(heUnits.filter((key) => !hePlural.includes(key))).toEqual(['celsius', 'fahrenheit']);
  });
});
