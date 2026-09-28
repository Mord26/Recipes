import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChefHat, Utensils } from 'lucide-react';
import { requireSessionProfile } from '@/lib/auth-helpers';
import { fetchMemberSummaries } from '@/lib/queries';
import { BottomNav } from '@/components/bottom-nav';
import { LinkPending } from '@/components/nav-feedback';
import { MemberAvatar } from '@/components/member-avatar';
import { InviteCard } from '@/components/invite-card';

export default async function MembersPage() {
  const [{ userId }, members] = await Promise.all([requireSessionProfile(), fetchMemberSummaries()]);
  const t = await getTranslations('members');

  const total = members.reduce((sum, member) => sum + member.recipeCount, 0);

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl px-5 pb-32">
      <header className="pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">
        <h1 className="font-display text-[2rem] leading-tight font-medium text-ink-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-500">{t('subtitle', { count: total })}</p>
      </header>

      <ul className="space-y-2.5">
        {members.map((member, index) => (
          <li key={member.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}>
            <Link
              href={`/members/${member.id}`}
              className="card-shell relative block transition-all duration-300 ease-fluid hover:-translate-y-0.5 active:scale-[0.99]"
            >
              <LinkPending />
              <div className="card-core flex items-center gap-3.5 p-3.5">
                <MemberAvatar name={member.display_name} rank={index} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-ink-900">
                    {member.display_name}
                    {member.id === userId ? <span className="text-xs font-normal text-ink-400">({t('you')})</span> : null}
                  </p>
                  <p className="truncate text-xs text-ink-500">@{member.username}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs font-semibold text-ink-700">
                  <span className="flex items-center gap-1">
                    <Utensils size={13} strokeWidth={1.9} className="text-terra-600" />
                    {member.recipeCount}
                  </span>
                  {member.cookedCount > 0 ? (
                    <span className="flex items-center gap-1 text-ink-500">
                      <ChefHat size={13} strokeWidth={1.9} className="text-sage-600" />
                      {member.cookedCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <InviteCard />

      <BottomNav />
    </div>
  );
}
