'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/types';

// Two words rotate on their own gentle rhythm so the headline feels alive but calm.
const VERBS: Record<Locale, string[]> = {
  he: ['מבשלים', 'אופים', 'מכינים', 'מבשלים', 'טועמים'],
  en: ['cooking', 'baking', 'making', 'tasting'],
};

const OCCASIONS: Record<Locale, string[]> = {
  he: ['היום', 'לשבת', 'לחג', 'לארוחת ערב', 'לאורחים', 'היום'],
  en: ['today', 'for Shabbat', 'for the holiday', 'for dinner', 'for guests'],
};

function Rotator({ words, intervalMs, className }: { words: string[]; intervalMs: number; className?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => clearInterval(id);
  }, [words.length, intervalMs]);

  return (
    // The key re-mounts the span on change, replaying the swap animation.
    <span key={index} className={`animate-word-swap inline-block ${className ?? ''}`}>
      {words[index]}
    </span>
  );
}

export function AnimatedGreeting({ locale }: { locale: Locale }) {
  const verbs = VERBS[locale];
  const occasions = OCCASIONS[locale];

  if (locale === 'en') {
    return (
      <span>
        What are we <Rotator words={verbs} intervalMs={2600} className="text-terra-600" />{' '}
        <Rotator words={occasions} intervalMs={3400} className="text-terra-600" />?
      </span>
    );
  }

  return (
    <span>
      מה <Rotator words={verbs} intervalMs={2600} className="text-terra-600" />{' '}
      <Rotator words={occasions} intervalMs={3400} className="text-terra-600" />?
    </span>
  );
}
