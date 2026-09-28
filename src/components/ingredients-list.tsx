'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { displayIngredient } from '@/lib/display-units';
import { unitLabel } from '@/lib/unit-label';
import type { Ingredient } from '@/lib/types';
import type { UnitSystem } from '@/lib/units';
import { LanguageToggle } from '@/components/language-toggle';
import { cn } from '@/lib/utils';

export function IngredientsList({
  ingredients,
  baseServings,
  title,
  system,
  recipeId,
}: {
  ingredients: Ingredient[];
  baseServings: number | null;
  title: string;
  system: UnitSystem;
  recipeId: string;
}) {
  const t = useTranslations('scale');
  const tUnits = useTranslations('converter');
  const tSystem = useTranslations('units');
  const [servings, setServings] = useState(baseServings);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  // Remember the chosen servings so cook mode opens at the same amount.
  const changeServings = (next: number) => {
    setServings(next);
    try {
      localStorage.setItem(`cook-servings-${recipeId}`, String(next));
    } catch {
      // private mode / storage full - not critical
    }
  };

  const toggle = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const rows = ingredients.map((ingredient) => displayIngredient(ingredient, system, baseServings, servings));
  const anyConverted = rows.some((row) => row.converted);

  return (
    <section className="recipe-glass-panel">
      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-medium text-ink-900">{title}</h2>
          {baseServings !== null && servings !== null ? (
            <div className="flex items-center gap-1 rounded-full bg-cream-100 p-1">
              <button
                type="button"
                aria-label="-"
                onClick={() => changeServings(Math.max(1, servings - 1))}
                className="flex size-10 items-center justify-center rounded-full bg-white text-ink-700 shadow-sm transition-all duration-300 ease-fluid active:scale-[0.9]"
              >
                <Minus size={15} strokeWidth={2} />
              </button>
              <span className="min-w-[4.5rem] text-center text-sm font-semibold text-ink-900">
                {t('servings', { count: servings })}
              </span>
              <button
                type="button"
                aria-label="+"
                onClick={() => changeServings(Math.min(100, servings + 1))}
                className="flex size-10 items-center justify-center rounded-full bg-white text-ink-700 shadow-sm transition-all duration-300 ease-fluid active:scale-[0.9]"
              >
                <Plus size={15} strokeWidth={2} />
              </button>
            </div>
          ) : null}
        </div>

        <div className="mb-4 print:hidden">
          <LanguageToggle />
        </div>

        <ul className="divide-y divide-ink-900/5">
          {ingredients.map((ingredient, index) => {
            const isChecked = checked.has(index);
            const row = rows[index];
            const label = row.unitId ? unitLabel(row.unitId, row.amount, tUnits) : (row.rawUnit ?? '');
            return (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  className="flex w-full items-center gap-3 py-3 text-start transition-opacity duration-300"
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ease-fluid',
                      isChecked ? 'border-sage-600 bg-sage-600 text-white' : 'border-ink-300 bg-white'
                    )}
                  >
                    {isChecked ? '✓' : ''}
                  </span>
                  <span
                    className={cn(
                      'text-[15px] text-ink-900 transition-all duration-300',
                      isChecked && 'text-ink-300 line-through'
                    )}
                  >
                    {row.amount ? (
                      <b className="font-semibold">
                        {row.amount}
                        {label ? ` ${label}` : ''}{' '}
                      </b>
                    ) : label ? (
                      <b className="font-semibold">{label} </b>
                    ) : null}
                    {ingredient.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {anyConverted ? (
          <p className="mt-3 text-[11px] leading-relaxed text-ink-400">{tSystem('convertedHint')}</p>
        ) : null}
      </div>
    </section>
  );
}
