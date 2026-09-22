'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
import { formatQuantity, parseQuantity } from '@/lib/scaling';
import { cn } from '@/lib/utils';

interface QuantityPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const WHOLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12];
/** Common cooking fractions, rendered after the whole number ("1½"). */
const FRACTIONS: { value: number; glyph: string }[] = [
  { value: 0.25, glyph: '¼' },
  { value: 1 / 3, glyph: '⅓' },
  { value: 0.5, glyph: '½' },
  { value: 2 / 3, glyph: '⅔' },
  { value: 0.75, glyph: '¾' },
];

const LONG_PRESS_MS = 450;

/**
 * Free-text quantity field with an optional preset picker.
 * The field always accepts typing (parseQuantity understands "1½", "1 1/2", glyphs).
 * The picker opens on long-press or on the small chevron, and composes a whole number
 * with a fraction so the fraction always follows the whole ("1½", never "½1").
 */
export function QuantityPicker({ value, onChange, placeholder }: QuantityPickerProps) {
  const tForm = useTranslations('recipeForm');
  const [open, setOpen] = useState(false);
  const [whole, setWhole] = useState(0);
  const [fraction, setFraction] = useState(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const preview = formatQuantity(whole + fraction);

  const openPicker = () => {
    // Seed the picker from whatever is already typed.
    const parsed = parseQuantity(value);
    if (parsed !== null) {
      const w = Math.floor(parsed);
      setWhole(w);
      const nearest = FRACTIONS.reduce<{ value: number } | null>((best, f) => {
        const diff = Math.abs(parsed - w - f.value);
        return diff < 0.06 && (!best || diff < Math.abs(parsed - w - best.value)) ? f : best;
      }, null);
      setFraction(nearest?.value ?? 0);
    } else {
      setWhole(0);
      setFraction(0);
    }
    setOpen(true);
  };

  const clearTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const confirm = () => {
    onChange(formatQuantity(whole + fraction));
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className="relative">
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onPointerDown={() => {
              clearTimer();
              pressTimer.current = setTimeout(openPicker, LONG_PRESS_MS);
            }}
            onPointerUp={clearTimer}
            onPointerMove={clearTimer}
            onPointerLeave={clearTimer}
            placeholder={placeholder ?? '2'}
            inputMode="decimal"
            autoComplete="off"
            aria-label={tForm('quantity')}
            className="w-full rounded-2xl bg-white/80 py-3.5 ps-1 pe-6 text-center text-[15px] text-ink-900 shadow-[inset_0_1px_2px_rgba(41,32,21,0.04)] ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid placeholder:text-ink-300 focus:bg-white focus:ring-2 focus:ring-terra-500/50 focus:outline-none"
          />
          <button
            type="button"
            aria-label={tForm('quantityPicker')}
            onClick={openPicker}
            className="absolute inset-y-0 end-0.5 flex w-5 items-center justify-center text-ink-300 transition-colors hover:text-terra-600"
          >
            <ChevronDown size={14} strokeWidth={2} />
          </button>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="animate-fade-in z-50 w-[16rem] rounded-2xl bg-white p-3 shadow-[0_16px_40px_-12px_rgba(41,32,21,0.3)] ring-1 ring-ink-900/10"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-ink-500">{tForm('quantityWhole')}</span>
            <span className="font-display text-2xl font-medium text-terra-700">{preview || '0'}</span>
          </div>
          <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {WHOLES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setWhole(n)}
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl text-[15px] font-semibold transition-colors',
                  whole === n ? 'bg-ink-900 text-cream-50' : 'bg-cream-100 text-ink-700'
                )}
              >
                {n}
              </button>
            ))}
          </div>

          <p className="mt-3 mb-1.5 text-xs font-semibold text-ink-500">{tForm('quantityFraction')}</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFraction(0)}
              className={cn(
                'rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                fraction === 0 ? 'bg-ink-900 text-cream-50' : 'bg-cream-100 text-ink-700'
              )}
            >
              {tForm('quantityNoFraction')}
            </button>
            {FRACTIONS.map((f) => (
              <button
                key={f.glyph}
                type="button"
                onClick={() => setFraction(f.value)}
                className={cn(
                  'flex size-10 items-center justify-center rounded-xl text-lg font-semibold transition-colors',
                  Math.abs(fraction - f.value) < 0.01 ? 'bg-ink-900 text-cream-50' : 'bg-cream-100 text-ink-700'
                )}
              >
                {f.glyph}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={confirm}
            disabled={!preview}
            className="mt-3 w-full rounded-full bg-terra-600 py-2.5 text-sm font-semibold text-cream-50 transition-all duration-300 ease-fluid active:scale-[0.97] disabled:opacity-40"
          >
            {tForm('quantityConfirm', { value: preview || '0' })}
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
