import { cn } from '@/lib/utils';

/** Initial-circle avatar. The top three sharers get a warmer ring so the list reads as a podium. */
export function MemberAvatar({ name, rank, size = 'md' }: { name: string; rank?: number; size?: 'md' | 'lg' }) {
  const initial = name.trim().charAt(0) || '?';
  const podium = rank !== undefined && rank < 3;

  return (
    <span
      className={cn(
        'font-display flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'lg' ? 'size-20 text-3xl' : 'size-12 text-lg',
        podium ? 'bg-terra-50 text-terra-700 ring-2 ring-terra-500/35' : 'bg-cream-100 text-ink-700 ring-1 ring-ink-900/8'
      )}
      aria-hidden
    >
      {initial}
    </span>
  );
}
