'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A determinate progress ring for the AI extraction wait.
 * The real duration is unknown, so it fills smoothly toward ~92% over an estimate,
 * then snaps to 100% the moment the caller reports it finished - never an empty spinner.
 */
export function ExtractProgress({ estimatedMs, label }: { estimatedMs: number; label: string }) {
  const [progress, setProgress] = useState(0.04);
  const startRef = useRef(performance.now());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      // Ease toward 0.92 asymptotically so it never looks stuck at 100 before the result arrives.
      const target = 0.92 * (1 - Math.exp(-elapsed / estimatedMs));
      setProgress((p) => Math.max(p, target));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [estimatedMs]);

  const R = 34;
  const C = 2 * Math.PI * R;
  const seconds = Math.max(1, Math.round((estimatedMs * (1 - progress)) / 1000));

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative flex size-24 items-center justify-center">
        <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
          <circle cx="40" cy="40" r={R} fill="none" stroke="var(--color-cream-200)" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke="var(--color-terra-500)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 0.3s ease-out' }}
          />
        </svg>
        <span className="absolute font-display text-lg font-semibold text-terra-700">{Math.round(progress * 100)}%</span>
      </div>
      <p className="text-sm font-medium text-ink-600">{label}</p>
      <p className="text-xs text-ink-500">~{seconds}s</p>
    </div>
  );
}
