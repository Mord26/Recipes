'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Heart, House, Plus, Settings, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNavBar({ canAdd }: { canAdd: boolean }) {
  const pathname = usePathname();
  const t = useTranslations('nav');

  const items = [
    { href: '/', icon: House, label: t('home') },
    { href: '/favorites', icon: Heart, label: t('favorites') },
    // A view-only member has no "new recipe" button; the server rejects the action too.
    ...(canAdd ? [{ href: '/recipes/new', icon: Plus, label: t('add'), primary: true }] : []),
    { href: '/members', icon: Users, label: t('members') },
    { href: '/settings', icon: Settings, label: t('settings') },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-1 rounded-full border border-ink-900/8 bg-white/85 p-1.5 shadow-[0_16px_40px_-12px_rgba(41,32,21,0.25)] backdrop-blur-xl">
        {items.map(({ href, icon: Icon, label, primary }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 transition-all duration-300 ease-fluid active:scale-[0.94]',
                primary
                  ? 'bg-terra-600 text-cream-50 shadow-[0_8px_20px_-6px_rgba(181,78,40,0.55)] hover:bg-terra-500'
                  : cn('text-ink-500 hover:text-ink-900', active && 'bg-cream-100 text-ink-900')
              )}
            >
              <Icon size={20} strokeWidth={active || primary ? 2 : 1.6} />
              <span className="text-[10px] font-semibold">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
