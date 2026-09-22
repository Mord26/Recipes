import { convert } from './units';
import type { Ingredient } from './types';

export interface StepTimer {
  seconds: number;
  /** The matched text, e.g. "40 דקות" - shown on the timer button. */
  label: string;
}

export interface OvenTemp {
  celsius: number;
  fahrenheit: number;
  /** Which unit the step itself was written in. */
  source: 'celsius' | 'fahrenheit';
}

const HOUR_WORDS = ['שעה', 'שעות', 'hour', 'hours'];
const MINUTE_WORDS = ['דקה', 'דקות', 'minute', 'minutes', 'min'];

/**
 * Finds cooking durations inside a step so the UI can offer a one-tap timer.
 * Handles "40 דקות", "שעה וחצי", "1.5 hours", "45 minutes".
 */
export function findTimers(step: string): StepTimer[] {
  const timers: StepTimer[] = [];
  const seen = new Set<string>();

  const push = (seconds: number, label: string) => {
    if (seconds <= 0 || seconds > 24 * 3600) return;
    const key = `${seconds}`;
    if (seen.has(key)) return;
    seen.add(key);
    timers.push({ seconds, label: label.trim() });
  };

  // "שעה וחצי" / "שעתיים" - Hebrew idioms that carry no digit.
  if (/שעה\s+וחצי/.test(step)) push(5400, 'שעה וחצי');
  if (/שעתיים/.test(step)) push(7200, 'שעתיים');
  if (/חצי\s+שעה/.test(step)) push(1800, 'חצי שעה');

  // No \b here: JS word boundaries are Latin-only, so they never fire after Hebrew letters.
  const numeric = /(\d+(?:[.,]\d+)?)\s*(שעות|שעה|דקות|דקה|hours|hour|minutes|minute|min)(?![א-תa-z])/gi;
  let match: RegExpExecArray | null;
  while ((match = numeric.exec(step)) !== null) {
    const value = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    const word = match[2].toLowerCase();
    const isHour = HOUR_WORDS.includes(word);
    const isMinute = MINUTE_WORDS.includes(word);
    if (!isHour && !isMinute) continue;
    push(Math.round(value * (isHour ? 3600 : 60)), match[0]);
  }

  return timers;
}

/** Finds an oven temperature so it can be shown in the reader's preferred system. */
export function findOvenTemp(step: string): OvenTemp | null {
  const fahrenheit = step.match(/(\d{2,3})\s*(?:°\s*f|פרנהייט)\b/i);
  if (fahrenheit) {
    const value = Number(fahrenheit[1]);
    const celsius = convert(value, 'fahrenheit', 'celsius');
    if (celsius !== null) return { celsius: Math.round(celsius), fahrenheit: value, source: 'fahrenheit' };
  }

  const celsius = step.match(/(\d{2,3})\s*(?:°\s*c|מעלות|צלזיוס)/i);
  if (celsius) {
    const value = Number(celsius[1]);
    const f = convert(value, 'celsius', 'fahrenheit');
    if (f !== null) return { celsius: value, fahrenheit: Math.round(f), source: 'celsius' };
  }

  return null;
}

export interface StepSegment {
  text: string;
  /** Set when this segment names an ingredient - the UI renders the amount next to it. */
  amount?: string;
}

/**
 * Splits a step into segments, marking where a recipe ingredient is mentioned,
 * so the cook does not have to scroll back to the ingredient list mid-step.
 * Matching is prefix based so Hebrew definite articles ("הקמח") still match "קמח".
 */
export function annotateStep(
  step: string,
  ingredients: Ingredient[],
  amountFor: (ingredient: Ingredient) => string
): StepSegment[] {
  const candidates = ingredients
    .map((ingredient) => ({ ingredient, term: ingredient.name.trim().split(/\s+/)[0] ?? '' }))
    .filter((entry) => entry.term.length >= 3)
    .sort((a, b) => b.term.length - a.term.length);

  if (candidates.length === 0) return [{ text: step }];

  const segments: StepSegment[] = [];
  const used = new Set<string>();
  let rest = step;

  while (rest.length > 0) {
    let hit: { index: number; term: string; amount: string } | null = null;

    for (const { ingredient, term } of candidates) {
      if (used.has(term)) continue;
      const index = findTerm(rest, term);
      if (index < 0) continue;
      if (hit && index >= hit.index) continue;
      const amount = amountFor(ingredient);
      if (amount) hit = { index, term, amount };
    }

    if (!hit) {
      segments.push({ text: rest });
      break;
    }

    if (hit.index > 0) segments.push({ text: rest.slice(0, hit.index) });
    segments.push({ text: rest.slice(hit.index, hit.index + hit.term.length), amount: hit.amount });
    used.add(hit.term);
    rest = rest.slice(hit.index + hit.term.length);
  }

  return segments;
}

/** Hebrew has no regex word boundary, so a match must start a word or follow a one-letter prefix. */
const HEBREW_PREFIXES = new Set(['ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ']);

function findTerm(text: string, term: string): number {
  let from = 0;
  while (from <= text.length - term.length) {
    const index = text.indexOf(term, from);
    if (index < 0) return -1;
    const before = index > 0 ? text[index - 1] : '';
    const beforeBefore = index > 1 ? text[index - 2] : '';
    const atWordStart =
      index === 0 ||
      /[\s,.()"'־-]/.test(before) ||
      (HEBREW_PREFIXES.has(before) && (index === 1 || /[\s,.()"'־-]/.test(beforeBefore)));
    if (atWordStart) return index;
    from = index + 1;
  }
  return -1;
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
