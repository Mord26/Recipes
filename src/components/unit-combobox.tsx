'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Popover } from 'radix-ui';
import { Check } from 'lucide-react';
import { resolveUnit, UNITS } from '@/lib/units';
import { cn } from '@/lib/utils';

interface UnitComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const GROUP_ORDER: { id: 'volume' | 'weight' | 'count'; }[] = [
  { id: 'volume' },
  { id: 'weight' },
  { id: 'count' },
];

/**
 * Unit picker that filters as you type, like a city selector.
 * Free text is always allowed - family recipes contain "חופן" and "קורט של סבתא".
 */
export function UnitCombobox({ value, onChange, placeholder, className }: UnitComboboxProps) {
  const t = useTranslations('converter');
  const tForm = useTranslations('recipeForm');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const label = (unitId: string) => t(`units.${unitId}`);

  // The typed text is matched against both the canonical id and the translated label.
  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    const all = UNITS.filter((unit) => unit.category !== 'length');
    if (!query) return all;
    const resolved = resolveUnit(query);
    return all.filter(
      (unit) =>
        unit.id === resolved ||
        label(unit.id).toLowerCase().includes(query) ||
        t(`unitsPlural.${unit.id}`).toLowerCase().includes(query) ||
        unit.id.includes(query)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, t]);

  const grouped = GROUP_ORDER.map((group) => ({
    id: group.id,
    units: matches.filter((unit) => unit.category === group.id),
  })).filter((group) => group.units.length > 0);

  const flat = grouped.flatMap((group) => group.units);
  const resolvedCurrent = resolveUnit(value);

  const commit = (unitId: string) => {
    onChange(label(unitId));
    setOpen(false);
    setHighlight(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlight((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        if (next < 0) return flat.length - 1;
        if (next >= flat.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === 'Enter' && open && flat[highlight]) {
      event.preventDefault();
      commit(flat[highlight].id);
      return;
    }
    if (event.key === 'Escape') setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setHighlight(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={tForm('unit')}
          autoComplete="off"
          className={cn(
            'w-full rounded-2xl bg-white/80 px-2 py-3.5 text-[15px] text-ink-900 shadow-[inset_0_1px_2px_rgba(41,32,21,0.04)] ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid placeholder:text-ink-300 focus:bg-white focus:ring-2 focus:ring-terra-500/50 focus:outline-none',
            className
          )}
        />
      </Popover.Anchor>
      {flat.length > 0 ? (
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={6}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            className="animate-fade-in z-50 max-h-64 w-[11rem] overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(41,32,21,0.3)] ring-1 ring-ink-900/10"
          >
            {grouped.map((group) => (
              <div key={group.id}>
                <p className="px-2.5 pt-2 pb-1 text-[10px] font-bold tracking-wide text-ink-300 uppercase">
                  {tForm(`unitGroup_${group.id}`)}
                </p>
                {group.units.map((unit) => {
                  const index = flat.findIndex((item) => item.id === unit.id);
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => commit(unit.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-start text-[15px] transition-colors',
                        index === highlight ? 'bg-cream-100 text-ink-900' : 'text-ink-700'
                      )}
                    >
                      {label(unit.id)}
                      {resolvedCurrent === unit.id ? <Check size={15} strokeWidth={2.2} className="text-sage-600" /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}
