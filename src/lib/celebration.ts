/** How many congratulation lines exist per language in the message files (celebrate1..celebrateN). */
export const CELEBRATION_COUNT = 8;

const LAST_KEY = 'recipe-celebration-last';

/** Picks a congratulation line, avoiding an immediate repeat so the praise never feels canned. */
export function pickCelebration(previous?: number | null, random: () => number = Math.random): number {
  if (CELEBRATION_COUNT <= 1) return 1;
  const candidates: number[] = [];
  for (let i = 1; i <= CELEBRATION_COUNT; i += 1) {
    if (i !== previous) candidates.push(i);
  }
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

/** Browser-side wrapper that remembers the previous line across saves. */
export function nextCelebration(): number {
  let previous: number | null = null;
  try {
    const stored = Number(localStorage.getItem(LAST_KEY));
    if (Number.isInteger(stored) && stored >= 1 && stored <= CELEBRATION_COUNT) previous = stored;
  } catch {
    // private mode - a repeat is harmless
  }
  const picked = pickCelebration(previous);
  try {
    localStorage.setItem(LAST_KEY, String(picked));
  } catch {
    // ignore
  }
  return picked;
}
