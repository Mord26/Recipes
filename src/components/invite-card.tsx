'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Share2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { createInvite } from '@/lib/actions/invites';
import { Button, Spinner } from '@/components/ui';

/** Creates a personal, single-use invite link and makes it easy to send to the new member. */
export function InviteCard() {
  const t = useTranslations('members');
  const tErrors = useTranslations('errors');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const generate = () =>
    start(async () => {
      const result = await createInvite();
      if (result.error || !result.url) {
        toast.error(tErrors(result.error ?? 'generic'));
        return;
      }
      setLink(result.url);
      setCopied(false);
    });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(t('inviteCopied'));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(tErrors('generic'));
    }
  };

  const share = async () => {
    if (!link) return;
    const text = `${t('inviteMessage')}\n${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // cancelled - fall through to WhatsApp
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <section className="card-shell mt-8">
      <div className="card-core space-y-4 p-5">
        <div>
          <h2 className="font-display flex items-center gap-2 text-xl font-medium text-ink-900">
            <UserPlus size={19} strokeWidth={1.8} className="text-terra-600" />
            {t('inviteTitle')}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-500">{t('inviteSubtitle')}</p>
        </div>

        {link ? (
          <div className="space-y-3">
            <p dir="ltr" className="rounded-2xl bg-cream-100 px-4 py-3 text-center text-xs break-all text-ink-700">
              {link}
            </p>
            <div className="flex gap-2.5">
              <Button onClick={share} className="flex-1">
                <Share2 size={17} strokeWidth={1.8} />
                {t('inviteShare')}
              </Button>
              <Button variant="ghost" onClick={copy} className="flex-1">
                {copied ? <Check size={17} strokeWidth={2} /> : <Copy size={17} strokeWidth={1.8} />}
                {copied ? t('inviteCopied') : t('inviteCopy')}
              </Button>
            </div>
            <p className="text-center text-[11px] text-ink-400">{t('inviteExpiry')}</p>
          </div>
        ) : (
          <Button onClick={generate} disabled={pending} size="lg" className="w-full">
            {pending ? <Spinner /> : <UserPlus size={18} strokeWidth={1.8} />}
            {t('inviteCreate')}
          </Button>
        )}

        <div className="rounded-2xl bg-cream-100/70 p-4">
          <p className="mb-2 text-xs font-semibold text-ink-700">{t('inviteHowTitle')}</p>
          <ol className="space-y-1.5 text-xs leading-relaxed text-ink-500">
            <li>1. {t('inviteHow1')}</li>
            <li>2. {t('inviteHow2')}</li>
            <li>3. {t('inviteHow3')}</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
