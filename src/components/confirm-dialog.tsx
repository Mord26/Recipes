'use client';

import { useState, type ReactNode } from 'react';
import { AlertDialog } from 'radix-ui';
import { useTranslations } from 'next-intl';

/**
 * A styled confirmation dialog replacing the browser's native confirm(), whose
 * "localhost says" chrome instantly reads as unfinished on a destructive action.
 */
export function ConfirmDialog({
  trigger,
  title,
  confirmLabel,
  destructive = true,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="animate-fade-in fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <AlertDialog.Content className="animate-fade-in fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] bg-cream-50 p-6 shadow-2xl">
          <AlertDialog.Title className="font-display text-xl font-medium text-ink-900">{title}</AlertDialog.Title>
          <div className="mt-5 flex gap-2.5">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className="flex-1 rounded-full bg-white/80 py-3 font-semibold text-ink-700 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid hover:bg-white active:scale-[0.97]"
              >
                {tCommon('cancel')}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                onClick={onConfirm}
                className={
                  destructive
                    ? 'flex-1 rounded-full bg-terra-600 py-3 font-semibold text-cream-50 transition-all duration-300 ease-fluid hover:bg-terra-500 active:scale-[0.97]'
                    : 'flex-1 rounded-full bg-ink-900 py-3 font-semibold text-cream-50 transition-all duration-300 ease-fluid hover:bg-ink-700 active:scale-[0.97]'
                }
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
