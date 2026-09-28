'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { ArrowLeftRight, Calculator, X } from 'lucide-react';
import { convert, formatConverted, unitsIn, type UnitCategory } from '@/lib/units';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';

const CATEGORIES: { id: UnitCategory | 'temperature'; emoji: string }[] = [
  { id: 'weight', emoji: '⚖️' },
  { id: 'volume', emoji: '🥛' },
  { id: 'temperature', emoji: '🌡️' },
  { id: 'length', emoji: '📏' },
];

const DEFAULTS: Record<string, [string, string]> = {
  weight: ['cup', 'gram'],
  volume: ['cup', 'ml'],
  temperature: ['celsius', 'fahrenheit'],
  length: ['inch', 'cm'],
};

export function UnitConverter() {
  const t = useTranslations('converter');
  const tCommon = useTranslations('common');
  const [category, setCategory] = useState<string>('weight');
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState('kg');
  const [to, setTo] = useState('gram');

  const options = useMemo(() => {
    if (category === 'temperature') return ['celsius', 'fahrenheit'];
    return unitsIn(category as UnitCategory)
      .filter((unit) => unit.category !== 'count')
      .map((unit) => unit.id);
  }, [category]);

  const pickCategory = (next: string) => {
    setCategory(next);
    const [defFrom, defTo] =
      next === 'weight' ? ['kg', 'gram'] : (DEFAULTS[next] ?? ['cup', 'ml']);
    setFrom(defFrom);
    setTo(defTo);
  };

  const numeric = Number(amount.replace(',', '.'));
  const result = Number.isFinite(numeric) && amount.trim() ? convert(numeric, from, to) : null;

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/80 text-ink-700 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid hover:bg-white active:scale-[0.94]"
          aria-label={t('title')}
        >
          <Calculator size={19} strokeWidth={1.7} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/30 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-cream-50 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-sheet-up">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink-900/15" />
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="font-display text-2xl font-medium text-ink-900">{t('title')}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label={tCommon('close')}
                className="flex size-9 items-center justify-center rounded-full bg-white text-ink-700 ring-1 ring-ink-900/8"
              >
                <X size={17} strokeWidth={1.8} />
              </button>
            </Dialog.Close>
          </div>

          <div className="mb-5 grid grid-cols-4 gap-2">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pickCategory(item.id)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl py-3 text-xs font-semibold transition-all duration-300 ease-fluid active:scale-[0.96]',
                  category === item.id
                    ? 'bg-ink-900 text-cream-50 shadow-[0_6px_16px_-6px_rgba(41,32,21,0.5)]'
                    : 'bg-white/70 text-ink-700 ring-1 ring-ink-900/8'
                )}
              >
                <span className="text-lg">{item.emoji}</span>
                {t(item.id)}
              </button>
            ))}
          </div>

          <div className="card-shell">
            <div className="card-core space-y-3 p-4">
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.,-]/g, ''))}
                  inputMode="decimal"
                  className="text-lg font-semibold"
                  aria-label={t('amount')}
                />
                <select
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-[52px] rounded-2xl bg-white/80 px-3 text-[15px] font-medium text-ink-900 ring-1 ring-ink-900/8 focus:ring-2 focus:ring-terra-500/50 focus:outline-none"
                >
                  {options.map((unit) => (
                    <option key={unit} value={unit}>
                      {t(`units.${unit}`)}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={swap}
                aria-label={t('swap')}
                className="mx-auto flex size-10 items-center justify-center rounded-full bg-terra-50 text-terra-700 transition-all duration-300 ease-fluid active:scale-[0.9] active:rotate-180"
              >
                <ArrowLeftRight size={18} strokeWidth={1.8} />
              </button>

              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <div className="flex h-[52px] items-center rounded-2xl bg-cream-100 px-4 text-lg font-bold text-ink-900">
                  {result !== null ? formatConverted(result) : '—'}
                </div>
                <select
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-[52px] rounded-2xl bg-white/80 px-3 text-[15px] font-medium text-ink-900 ring-1 ring-ink-900/8 focus:ring-2 focus:ring-terra-500/50 focus:outline-none"
                >
                  {options.map((unit) => (
                    <option key={unit} value={unit}>
                      {t(`units.${unit}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs leading-relaxed text-ink-500">{t('hint')}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
