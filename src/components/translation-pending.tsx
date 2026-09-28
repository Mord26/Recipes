'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Languages } from 'lucide-react';

/**
 * A deliberately unmissable, screen-centred notice that the recipe is being translated right now.
 * It refreshes the page itself, so the translated version appears without the reader doing
 * anything - and nobody has to guess whether the app is stuck.
 */
export function TranslationPending() {
  const router = useRouter();
  const locale = useLocale();
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (tries >= 6) return;
    const id = setTimeout(() => {
      setTries((value) => value + 1);
      router.refresh();
    }, 5000);
    return () => clearTimeout(id);
  }, [tries, router]);

  const he = locale !== 'en';
  const title = he ? 'מתרגם את המתכון...' : 'Translating the recipe...';
  const body = he
    ? 'בינתיים מוצג המתכון בשפת המקור. התרגום יופיע כאן לבד תוך כמה שניות.'
    : 'The original is shown meanwhile. The translation will appear here by itself in a few seconds.';

  return (
    <div
      dir={he ? 'rtl' : 'ltr'}
      className="animate-fade-in pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-8"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-3 rounded-[1.75rem] bg-ink-900/92 px-7 py-6 text-center text-cream-50 shadow-[0_24px_60px_-16px_rgba(41,32,21,0.6)] backdrop-blur-md">
        <span className="relative flex size-12 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-terra-500/30" />
          <span className="relative flex size-12 items-center justify-center rounded-full bg-terra-600">
            <Languages size={22} strokeWidth={1.9} />
          </span>
        </span>
        <p className="font-display text-lg font-medium">{title}</p>
        <p className="text-[13px] leading-relaxed text-cream-50/70">{body}</p>
      </div>
    </div>
  );
}
