'use client';

import { useLinkStatus } from 'next/link';
import { Spinner } from '@/components/ui';

export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className="animate-fade-in absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-cream-50/70 opacity-0 backdrop-blur-[2px] [animation-delay:250ms] [animation-fill-mode:forwards]">
      <Spinner className="size-6 text-terra-600" />
    </span>
  );
}
