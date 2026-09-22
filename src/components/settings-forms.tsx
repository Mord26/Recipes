'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, BellRing, KeyRound, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  adminResetPassword,
  changePassword,
  updateProfile,
  type ActionState,
} from '@/lib/actions/auth';
import { setMemberFlags, setNotifyNewRecipes } from '@/lib/actions/admin';
import { ensurePushSubscription, pushSupported, scheduleTestPush } from '@/lib/push-client';
import type { FamilyMember } from '@/lib/queries';
import type { Locale, Profile, Visibility } from '@/lib/types';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button, ErrorNote, Field, Input, PasswordInput, Spinner, Toggle } from '@/components/ui';
import { cn } from '@/lib/utils';

const initialState: ActionState = { error: null };

export function ProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [state, action, pending] = useActionState(updateProfile, initialState);
  const [locale, setLocale] = useState<Locale>(profile.locale);
  const [visibility, setVisibility] = useState<Visibility>(profile.default_visibility);

  useEffect(() => {
    if (state.success) toast.success(t('saved'));
  }, [state, t]);

  return (
    <form action={action} className="card-core space-y-5 p-5">
      <Field label={t('displayName')}>
        <Input name="displayName" defaultValue={profile.display_name} maxLength={40} required />
      </Field>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink-700">{t('language')}</p>
        <input type="hidden" name="locale" value={locale} />
        <Segmented
          options={[
            { value: 'he', label: t('hebrew') },
            { value: 'en', label: t('english') },
          ]}
          value={locale}
          onChange={(value) => setLocale(value as Locale)}
        />
        <p className="mt-2 text-xs leading-relaxed text-ink-400">{t('languageHint')}</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink-700">{t('defaultVisibility')}</p>
        <input type="hidden" name="defaultVisibility" value={visibility} />
        <Segmented
          options={[
            { value: 'family', label: t('visibilityFamily') },
            { value: 'private', label: t('visibilityPrivate') },
          ]}
          value={visibility}
          onChange={(value) => setVisibility(value as Visibility)}
        />
      </div>

      {state.error ? <ErrorNote>{tErrors(state.error)}</ErrorNote> : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner /> : null}
        {pending ? tCommon('saving') : tCommon('save')}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const t = useTranslations('settings');
  const tErrors = useTranslations('errors');
  const [state, action, pending] = useActionState(changePassword, initialState);

  useEffect(() => {
    if (state.success) toast.success(t('passwordChanged'));
  }, [state, t]);

  return (
    <form action={action} className="card-core space-y-4 p-5">
      <Field label={t('newPassword')}>
        <PasswordInput name="newPassword" autoComplete="new-password" minLength={8} required dir="ltr" />
      </Field>
      {state.error ? <ErrorNote>{tErrors(state.error)}</ErrorNote> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? <Spinner /> : <KeyRound size={16} strokeWidth={1.8} />}
        {t('changePassword')}
      </Button>
    </form>
  );
}

export function MembersList({
  members,
  currentUserId,
}: {
  members: FamilyMember[];
  currentUserId: string;
}) {
  const t = useTranslations('settings');
  const tErrors = useTranslations('errors');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();

  const reset = (userId: string) => {
    if (password.length < 8) {
      toast.error(tErrors('passwordTooShort'));
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set('userId', userId);
      formData.set('newPassword', password);
      const result = await adminResetPassword(initialState, formData);
      if (result.error) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t('passwordChanged'));
      setResetFor(null);
      setPassword('');
    });
  };

  return (
    <div className="card-core divide-y divide-ink-900/5 p-2">
      {members.map((member) => (
        <div key={member.id} className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-semibold text-ink-900">
                {member.display_name}
                {member.role === 'admin' ? (
                  <span className="rounded-full bg-honey-100 px-2 py-0.5 text-[10px] font-bold text-ink-700">
                    {t('adminBadge')}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-ink-500" dir="ltr">
                @{member.username}
              </p>
            </div>
            {member.id !== currentUserId ? (
              <button
                type="button"
                onClick={() => {
                  setResetFor(resetFor === member.id ? null : member.id);
                  setPassword('');
                }}
                className="rounded-full bg-cream-100 px-3.5 py-2 text-xs font-semibold text-ink-700 transition-all duration-300 ease-fluid hover:bg-cream-200 active:scale-[0.96]"
              >
                {t('resetPasswordFor')}
              </button>
            ) : null}
          </div>
          {member.id !== currentUserId ? <MemberControls member={member} /> : null}
          {resetFor === member.id ? (
            <div className="mt-3 space-y-2.5">
              <p className="text-xs text-ink-500">{t('resetHint')}</p>
              <div className="flex gap-2">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="text"
                  dir="ltr"
                  minLength={8}
                  className="flex-1 py-2.5"
                  placeholder={t('newPassword')}
                />
                <Button size="sm" onClick={() => reset(member.id)} disabled={pending}>
                  {pending ? <Spinner className="size-4" /> : null}
                  {t('resetPasswordFor')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Admin switches: full access, and permission to add recipes. Restricting asks for confirmation. */
function MemberControls({ member }: { member: FamilyMember }) {
  const t = useTranslations('settings');
  const tErrors = useTranslations('errors');
  const [pending, startTransition] = useTransition();

  const apply = (flags: { blocked?: boolean; canAddRecipes?: boolean }) =>
    startTransition(async () => {
      const result = await setMemberFlags(member.id, flags);
      if (result.error) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t('saved'));
    });

  const rows = [
    {
      key: 'access',
      icon: Ban,
      label: t('accessToggle'),
      hint: t('accessHint'),
      allowed: !member.blocked,
      confirm: t('confirmBlock', { name: member.display_name }),
      restrict: () => apply({ blocked: true }),
      restore: () => apply({ blocked: false }),
    },
    {
      key: 'adding',
      icon: Plus,
      label: t('addRecipesToggle'),
      hint: t('addRecipesHint'),
      allowed: member.can_add_recipes,
      confirm: t('confirmBlockAdding', { name: member.display_name }),
      restrict: () => apply({ canAddRecipes: false }),
      restore: () => apply({ canAddRecipes: true }),
    },
  ];

  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-cream-100/70 p-3">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3">
          <row.icon size={15} strokeWidth={1.8} className="shrink-0 text-ink-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink-700">{row.label}</p>
            <p className="text-[11px] leading-snug text-ink-400">{row.hint}</p>
          </div>
          {row.allowed ? (
            <ConfirmDialog
              trigger={<Toggle checked disabled={pending} label={row.label} />}
              title={row.confirm}
              confirmLabel={t('blockConfirmLabel')}
              onConfirm={row.restrict}
            />
          ) : (
            <Toggle checked={false} disabled={pending} onClick={row.restore} label={row.label} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Opt in or out of a push notification whenever someone shares a new recipe. */
export function NotificationsForm({ enabled }: { enabled: boolean }) {
  const t = useTranslations('settings');
  const tErrors = useTranslations('errors');
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const next = !on;
      // Turning it on is pointless without a live push subscription, so ask for permission first.
      if (next && pushSupported()) {
        const subscribed = await ensurePushSubscription();
        if (!subscribed) {
          toast.error(t('notifyDenied'));
          return;
        }
      }
      const result = await setNotifyNewRecipes(next);
      if (result.error) {
        toast.error(tErrors(result.error));
        return;
      }
      setOn(next);
      toast.success(next ? t('notifyOn') : t('notifyOff'));
    });

  const test = () =>
    startTransition(async () => {
      const subscribed = await ensurePushSubscription();
      if (!subscribed) {
        toast.error(t('notifyDenied'));
        return;
      }
      const ok = await scheduleTestPush(t('testPushLabel'), t('testPushBody'));
      toast[ok ? 'success' : 'error'](ok ? t('testPushSent') : tErrors('generic'));
    });

  return (
    <div className="card-core space-y-4 p-5">
      <div className="flex items-center gap-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-honey-100">
          <BellRing size={18} strokeWidth={1.8} className="text-terra-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900">{t('notifyNewRecipes')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{t('notifyNewRecipesHint')}</p>
        </div>
        <Toggle checked={on} disabled={pending} onClick={toggle} label={t('notifyNewRecipes')} />
      </div>

      <div className="rounded-2xl bg-cream-100/70 p-4">
        <p className="text-xs font-semibold text-ink-700">{t('testPushTitle')}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{t('testPushHint')}</p>
        <Button size="sm" variant="ghost" onClick={test} disabled={pending} className="mt-3">
          {pending ? <Spinner className="size-4" /> : <BellRing size={15} strokeWidth={1.8} />}
          {t('testPushButton')}
        </Button>
      </div>
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex rounded-full bg-cream-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 rounded-full px-3 py-2.5 text-sm font-semibold transition-all duration-300 ease-fluid',
            value === option.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
