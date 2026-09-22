'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Thermometer } from 'lucide-react';
import { annotateStep, findOvenTemp, findTimers } from '@/lib/step-parse';
import { displayIngredient } from '@/lib/display-units';
import { unitLabel } from '@/lib/unit-label';
import type { Ingredient } from '@/lib/types';
import type { UnitSystem } from '@/lib/units';
import { StepTimerButton } from '@/components/step-timer';

interface StepContentProps {
  step: string;
  ingredients: Ingredient[];
  system: UnitSystem;
  baseServings: number | null;
  targetServings: number | null;
  tone?: 'light' | 'dark';
}

/**
 * Renders a step with inline ingredient amounts, an oven-temperature hint and one-tap timers.
 * Both call sites wrap this in a <div>, so the timer/temperature row is a block element.
 */
export function StepContent({
  step,
  ingredients,
  system,
  baseServings,
  targetServings,
  tone = 'light',
}: StepContentProps) {
  const tUnits = useTranslations('converter');

  const amountFor = useMemo(
    () => (ingredient: Ingredient) => {
      const shown = displayIngredient(ingredient, system, baseServings, targetServings);
      if (!shown.amount) return '';
      const unit = shown.unitId ? unitLabel(shown.unitId, shown.amount, tUnits) : (shown.rawUnit ?? '');
      return `${shown.amount}${unit ? ` ${unit}` : ''}`;
    },
    [system, baseServings, targetServings, tUnits]
  );

  const segments = useMemo(() => annotateStep(step, ingredients, amountFor), [step, ingredients, amountFor]);
  const timers = useMemo(() => findTimers(step), [step]);
  const temp = useMemo(() => findOvenTemp(step), [step]);

  const showTemp =
    temp !== null && ((system === 'metric' && temp.source === 'fahrenheit') || (system === 'us' && temp.source === 'celsius'));
  const tempLabel = temp ? (system === 'metric' ? `${temp.celsius}°C` : `${temp.fahrenheit}°F`) : '';

  const amountClass =
    tone === 'dark'
      ? 'rounded-md bg-white/15 px-1.5 py-0.5 text-[0.85em] font-semibold'
      : 'rounded-md bg-terra-50 px-1.5 py-0.5 text-[0.85em] font-semibold text-terra-700';

  return (
    <>
      <span>
        {segments.map((segment, index) =>
          segment.amount ? (
            <span key={index}>
              <b className="font-semibold">{segment.text}</b> <span className={amountClass}>{segment.amount}</span>
            </span>
          ) : (
            <span key={index}>{segment.text}</span>
          )
        )}
      </span>

      {showTemp || timers.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 print:hidden">
          {showTemp ? (
            <span
              className={
                tone === 'dark'
                  ? 'inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold'
                  : 'inline-flex items-center gap-1.5 rounded-full bg-honey-100 px-3 py-1.5 text-sm font-semibold text-ink-700'
              }
            >
              <Thermometer size={14} strokeWidth={1.9} />
              {tempLabel}
            </span>
          ) : null}
          {timers.map((timer) => (
            <StepTimerButton key={timer.seconds} timer={timer} />
          ))}
        </div>
      ) : null}
    </>
  );
}
