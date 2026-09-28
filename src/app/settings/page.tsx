import { getTranslations } from 'next-intl/server';
import { LogOut } from 'lucide-react';
import { requireSessionProfile } from '@/lib/auth-helpers';
import { fetchAppSettings, fetchCategories, fetchFamilyMembers, fetchRecentIssues } from '@/lib/queries';
import { signOut } from '@/lib/actions/auth';
import { BottomNav } from '@/components/bottom-nav';
import { MembersList, NotificationsForm, PasswordForm, ProfileForm } from '@/components/settings-forms';
import { CategoriesManager } from '@/components/settings-categories';
import { AppSettingsManager } from '@/components/app-settings-manager';
import { InstallApp } from '@/components/install-app';
import { HealthSummary } from '@/components/health-summary';

export default async function SettingsPage() {
  const { userId, profile } = await requireSessionProfile();
  const t = await getTranslations('settings');
  const tHealth = await getTranslations('health');
  const [members, categories, appSettings, issues] = await Promise.all([
    fetchFamilyMembers(),
    fetchCategories(),
    fetchAppSettings(),
    profile.role === 'admin' ? fetchRecentIssues() : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl px-5 pb-32">
      <header className="pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">
        <h1 className="font-display text-[2rem] leading-tight font-medium text-ink-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-500">{t('loggedInAs', { name: `${profile.display_name} (@${profile.username})` })}</p>
      </header>

      <div className="space-y-6">
        <section>
          <h2 className="mb-2.5 text-sm font-bold tracking-wide text-ink-500 uppercase">{t('profile')}</h2>
          <div className="card-shell">
            <ProfileForm profile={profile} />
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-sm font-bold tracking-wide text-ink-500 uppercase">{t('security')}</h2>
          <div className="card-shell">
            <PasswordForm />
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-sm font-bold tracking-wide text-ink-500 uppercase">{t('notificationsTitle')}</h2>
          <div className="card-shell">
            <NotificationsForm enabled={profile.notify_new_recipes} />
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-sm font-bold tracking-wide text-ink-500 uppercase">{t('installTitle')}</h2>
          <div className="card-shell">
            <InstallApp />
          </div>
        </section>

        {profile.role === 'admin' ? (
          <>
            <section>
              <h2 className="mb-2.5 text-sm font-bold tracking-wide text-ink-500 uppercase">{t('familyControlsTitle')}</h2>
              <div className="card-shell">
                <AppSettingsManager settings={appSettings} />
              </div>
            </section>

            <section>
              <h2 className="mb-2.5 text-sm font-bold tracking-wide text-ink-500 uppercase">{tHealth('title')}</h2>
              <div className="card-shell">
                <HealthSummary issues={issues} />
              </div>
            </section>

            <section>
              <h2 className="mb-2.5 text-sm font-bold tracking-wide text-ink-500 uppercase">{t('categoriesTitle')}</h2>
              <div className="card-shell">
                <CategoriesManager categories={categories} />
              </div>
            </section>
          </>
        ) : null}

        <section>
          <h2 className="mb-2.5 text-sm font-bold tracking-wide text-ink-500 uppercase">{t('members')}</h2>
          <div className="card-shell">
            {profile.role === 'admin' ? (
              <MembersList members={members} currentUserId={userId} />
            ) : (
              <div className="card-core divide-y divide-ink-900/5 p-2">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3">
                    <p className="font-semibold text-ink-900">{member.display_name}</p>
                    <p className="text-xs text-ink-500" dir="ltr">
                      @{member.username}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <form action={signOut} className="pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full bg-white/70 px-6 py-3.5 font-semibold text-terra-700 ring-1 ring-terra-600/25 transition-all duration-300 ease-fluid hover:bg-terra-50 active:scale-[0.97]"
          >
            <LogOut size={17} strokeWidth={1.8} className="rtl:-scale-x-100" />
            {t('signOut')}
          </button>
        </form>
      </div>

      <BottomNav />
    </div>
  );
}
