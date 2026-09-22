'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { ChevronLeft, ChevronRight, ListChecks, Minus, Plus, X } from 'lucide-react';
import { displayIngredient } from '@/lib/display-units';
import { unitLabel } from '@/lib/unit-label';
import { logCook } from '@/lib/actions/recipes';
import type { Ingredient } from '@/lib/types';
import type { UnitSystem } from '@/lib/units';
import { StepContent } from '@/components/step-content';
import { cn } from '@/lib/utils';

interface WakeLockSentinel {
  release: () => Promise<void>;
}

const SWIPE_MIN = 55;

export function CookMode({
  title,
  steps,
  ingredients,
  recipeId,
  system,
  baseServings,
}: {
  title: string;
  steps: string[];
  ingredients: Ingredient[];
  recipeId: string;
  system: UnitSystem;
  baseServings: number | null;
}) {
  const t = useTranslations('cook');
  const tRecipe = useTranslations('recipe');
  const tScale = useTranslations('scale');
  const tUnits = useTranslations('converter');
  const router = useRouter();
  const locale = useLocale();
  const rtl = locale === 'he';
  const [current, setCurrent] = useState(0);
  const [wakeActive, setWakeActive] = useState(false);
  const [servings, setServings] = useState(baseServings);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const loggedRef = useRef(false);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const isDone = current >= steps.length;
  const nextStep = !isDone && current + 1 < steps.length ? steps[current + 1] : null;

  // Open at the servings the cook chose in the ingredient list.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`cook-servings-${recipeId}`);
      if (stored) setServings(Number(stored));
    } catch {
      // ignore
    }
  }, [recipeId]);

  const changeServings = (next: number) => {
    setServings(next);
    try {
      localStorage.setItem(`cook-servings-${recipeId}`, String(next));
    } catch {
      // private mode / storage full - not critical
    }
  };

  const go = useCallback(
    (delta: number) => setCurrent((value) => Math.min(steps.length, Math.max(0, value + delta))),
    [steps.length]
  );

  // Arrow keys follow the reading direction, so "forward" is always the intuitive side.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(rtl ? -1 : 1);
      else if (event.key === 'ArrowLeft') go(rtl ? 1 : -1);
      else if (event.key === ' ' || event.key === 'Enter') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, rtl]);

  // Record the cook once the last step is done - this is what "cooked N times" counts.
  useEffect(() => {
    if (!isDone || loggedRef.current || steps.length === 0) return;
    loggedRef.current = true;
    void logCook(recipeId);
  }, [isDone, recipeId, steps.length]);

  useEffect(() => {
    const acquire = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel & { addEventListener?: (t: string, cb: () => void) => void }> };
        };
        if (!nav.wakeLock) {
          setWakeActive(false);
          return;
        }
        const sentinel = await nav.wakeLock.request('screen');
        wakeLockRef.current = sentinel;
        setWakeActive(true);
        sentinel.addEventListener?.('release', () => setWakeActive(false));
      } catch {
        setWakeActive(false);
      }
    };
    acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      wakeLockRef.current?.release().catch(() => undefined);
    };
  }, []);

  const exit = () => router.push(`/recipes/${recipeId}?lang=${locale}`);

  const toggleIngredient = (index: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  // Horizontal swipes move between steps; vertical drags are left to the page.
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
    const forward = rtl ? dx > 0 : dx < 0;
    go(forward ? 1 : -1);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink-900 text-cream-50">
      <header className="flex items-center justify-between gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="truncate text-sm text-cream-50/60">{title}</p>
          <p className="font-display text-lg font-medium">
            {isDone ? t('done') : t('stepOf', { current: current + 1, total: steps.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button
                aria-label={t('ingredientsButton')}
                className="flex size-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-md transition-all duration-300 ease-fluid active:scale-[0.92]"
              >
                <ListChecks size={19} strokeWidth={1.7} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm animate-fade-in" />
              <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[75dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-cream-50 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink-900 animate-sheet-up">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <Dialog.Title className="font-display text-xl font-medium">{tRecipe('ingredients')}</Dialog.Title>
                  {baseServings !== null && servings !== null ? (
                    <div className="flex items-center gap-1 rounded-full bg-cream-100 p-1">
                      <button
                        type="button"
                        aria-label="-"
                        onClick={() => changeServings(Math.max(1, servings - 1))}
                        className="flex size-9 items-center justify-center rounded-full bg-white text-ink-700 shadow-sm active:scale-[0.9]"
                      >
                        <Minus size={14} strokeWidth={2} />
                      </button>
                      <span className="min-w-[4.25rem] text-center text-sm font-semibold">
                        {tScale('servings', { count: servings })}
                      </span>
                      <button
                        type="button"
                        aria-label="+"
                        onClick={() => changeServings(Math.min(100, servings + 1))}
                        className="flex size-9 items-center justify-center rounded-full bg-white text-ink-700 shadow-sm active:scale-[0.9]"
                      >
                        <Plus size={14} strokeWidth={2} />
                      </button>
                    </div>
                  ) : null}
                </div>
                <ul className="divide-y divide-ink-900/5">
                  {ingredients.map((ingredient, index) => {
                    const shown = displayIngredient(ingredient, system, baseServings, servings);
                    const label = shown.unitId ? unitLabel(shown.unitId, shown.amount, tUnits) : (shown.rawUnit ?? '');
                    const isChecked = checked.has(index);
                    return (
                      <li key={index}>
                        <button
                          type="button"
                          onClick={() => toggleIngredient(index)}
                          className="flex w-full items-center gap-3 py-3 text-start"
                        >
                          <span
                            className={cn(
                              'flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] transition-all duration-300',
                              isChecked ? 'border-sage-600 bg-sage-600 text-white' : 'border-ink-300 bg-white'
                            )}
                          >
                            {isChecked ? '✓' : ''}
                          </span>
                          <span className={cn('text-[15px] transition-all duration-300', isChecked && 'text-ink-300 line-through')}>
                            {shown.amount ? (
                              <b className="font-semibold">
                                {shown.amount}
                                {label ? ` ${label}` : ''}{' '}
                              </b>
                            ) : null}
                            {ingredient.name}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <button
            aria-label={t('exit')}
            onClick={exit}
            className="flex size-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-md transition-all duration-300 ease-fluid active:scale-[0.92]"
          >
            <X size={19} strokeWidth={1.7} />
          </button>
        </div>
      </header>

      {/* Tap any segment to jump straight to that step. */}
      <div className="mt-5 flex gap-1 px-5">
        {steps.map((_, index) => (
          <button
            key={index}
            type="button"
            aria-label={tRecipe('stepNumber', { number: index + 1 })}
            onClick={() => setCurrent(index)}
            className="group flex-1 py-2"
          >
            <span
              className={cn(
                'block h-1.5 rounded-full transition-all duration-500 ease-fluid',
                index < current ? 'bg-sage-600' : index === current && !isDone ? 'bg-terra-500' : 'bg-white/15'
              )}
            />
          </button>
        ))}
      </div>

      <main
        className="flex flex-1 flex-col justify-center px-6 py-8"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {isDone ? (
          <div className="animate-rise-in mx-auto text-center">
            <span className="mb-6 block text-7xl">🎉</span>
            <p className="font-display text-3xl font-medium">{t('done')}</p>
          </div>
        ) : (
          <div key={current} className="animate-rise-in mx-auto w-full max-w-xl">
            <div className="rounded-[2rem] bg-white/5 p-7 ring-1 ring-white/10">
              <span className="font-display mb-4 flex size-12 items-center justify-center rounded-full bg-terra-600 text-xl font-semibold text-cream-50">
                {current + 1}
              </span>
              <div className="flex flex-col text-[1.75rem] leading-relaxed font-light">
                <StepContent
                  step={steps[current]}
                  ingredients={ingredients}
                  system={system}
                  baseServings={baseServings}
                  targetServings={servings}
                  tone="dark"
                />
              </div>
            </div>
            {nextStep ? (
              <p className="mt-5 truncate px-2 text-sm text-cream-50/45">{t('next', { step: nextStep })}</p>
            ) : null}
          </div>
        )}
      </main>

      <footer className="grid grid-cols-2 gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          onClick={() => go(-1)}
          disabled={current === 0}
          className="flex items-center justify-center rounded-full bg-white/10 py-4 text-base font-semibold backdrop-blur-md transition-all duration-300 ease-fluid active:scale-[0.97] disabled:opacity-30"
        >
          <ChevronLeft size={24} strokeWidth={2} className="rtl:-scale-x-100" />
        </button>
        {isDone ? (
          <button
            onClick={exit}
            className="rounded-full bg-sage-600 py-4 text-base font-semibold transition-all duration-300 ease-fluid active:scale-[0.97]"
          >
            {t('exit')}
          </button>
        ) : (
          <button
            onClick={() => go(1)}
            className="flex items-center justify-center rounded-full bg-terra-600 py-4 text-base font-semibold shadow-[0_8px_24px_-8px_rgba(199,96,47,0.6)] transition-all duration-300 ease-fluid active:scale-[0.97]"
          >
            <ChevronRight size={24} strokeWidth={2} className="rtl:-scale-x-100" />
          </button>
        )}
      </footer>

      <p className="pb-3 text-center text-[11px] text-cream-50/40">{wakeActive ? t('wakeOn') : t('wakeOff')}</p>
    </div>
  );
}
