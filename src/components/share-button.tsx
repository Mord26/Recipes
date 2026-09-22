'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { FileText, Image as ImageIcon, Link2, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { renderShareCard } from '@/lib/share-card';
import { getShareData } from '@/lib/actions/share';
import type { ShareData } from '@/lib/share-data';
import type { Locale } from '@/lib/types';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

interface ShareButtonProps {
  recipeId: string;
  locale: Locale;
  initialData: ShareData;
  photoUrl?: string;
}

const LANGS: { id: Locale; emoji: string; label: string }[] = [
  { id: 'he', emoji: '🇮🇱', label: 'עברית' },
  { id: 'en', emoji: '🇺🇸', label: 'English' },
];

export function ShareButton({ recipeId, locale, initialData, photoUrl }: ShareButtonProps) {
  const t = useTranslations('recipe');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [rendering, startRendering] = useTransition();
  const [lang, setLang] = useState<Locale>(locale);
  const [cache, setCache] = useState<Record<string, ShareData>>({ [locale]: initialData });
  const [loadingLang, setLoadingLang] = useState<Locale | null>(null);

  const data = cache[lang];

  const pickLang = (next: Locale) => {
    if (next === lang) return;
    if (cache[next]) {
      setLang(next);
      return;
    }
    setLoadingLang(next);
    getShareData(recipeId, next)
      .then((result) => {
        if (result) {
          setCache((prev) => ({ ...prev, [next]: result }));
          setLang(next);
        } else {
          toast.error(t('shareImageFailed'));
        }
      })
      .catch(() => toast.error(t('shareImageFailed')))
      .finally(() => setLoadingLang(null));
  };

  const shareOrWhatsApp = async (text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // user cancelled or unsupported - fall through
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareLink = async () => {
    setOpen(false);
    await shareOrWhatsApp(`${data.linkText}\n${window.location.href}`);
  };

  const shareFullText = async () => {
    setOpen(false);
    const lines: string[] = [`🍲 *${data.title}*`];
    if (data.creditLine) lines.push(data.creditLine);
    lines.push('', `*${data.labels.ingredients}:*`);
    for (const line of data.ingredientLines) lines.push(`• ${line}`);
    if (data.steps.length > 0) {
      lines.push('', `*${data.labels.steps}:*`);
      data.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
    }
    lines.push('', window.location.href);
    await shareOrWhatsApp(lines.join('\n'));
  };

  const shareImage = () => {
    startRendering(async () => {
      try {
        const blob = await renderShareCard({
          title: data.title,
          credit: data.creditLine,
          servings: data.servings,
          ingredientLines: data.ingredientLines,
          steps: data.steps,
          photoUrl,
          url: window.location.origin,
          dir: data.dir,
          note: data.note,
          prepText: data.prepText,
          cookText: data.cookText,
          labels: data.labels,
        });
        const file = new File([blob], `${data.title}.png`, { type: 'image/png' });
        setOpen(false);
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: data.title });
            return;
          } catch {
            // cancelled - offer a download instead
          }
        }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${data.title}.png`;
        anchor.click();
        URL.revokeObjectURL(url);
        toast.success(t('shareImageSaved'));
      } catch {
        toast.error(t('shareImageFailed'));
      }
    });
  };

  const options = [
    { icon: FileText, label: t('shareFullText'), hint: t('shareFullTextHint'), action: shareFullText },
    { icon: ImageIcon, label: t('shareImage'), hint: t('shareImageHint'), action: shareImage },
    { icon: Link2, label: t('shareLink'), hint: t('shareLinkHint'), action: shareLink },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={t('share')}
          className="flex size-12 items-center justify-center rounded-full bg-white/80 text-ink-700 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid hover:bg-white active:scale-[0.9]"
        >
          <Share2 size={19} strokeWidth={1.7} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/30 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg rounded-t-[2rem] bg-cream-50 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-sheet-up">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink-900/15" />
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="font-display text-2xl font-medium text-ink-900">{t('shareTitle')}</Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label={tCommon('close')} className="flex size-9 items-center justify-center rounded-full bg-white text-ink-700 ring-1 ring-ink-900/8">
                <X size={17} strokeWidth={1.8} />
              </button>
            </Dialog.Close>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-ink-500">{t('shareLanguage')}</p>
            <div className="flex rounded-full bg-cream-100 p-1">
              {LANGS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => pickLang(option.id)}
                  disabled={loadingLang !== null || rendering}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-all duration-300 ease-fluid active:scale-[0.97] disabled:opacity-70',
                    lang === option.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'
                  )}
                >
                  {loadingLang === option.id ? <Spinner className="size-4" /> : <span>{option.emoji}</span>}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {options.map(({ icon: Icon, label, hint, action }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                disabled={rendering || loadingLang !== null}
                className="flex w-full items-center gap-4 rounded-2xl bg-white/80 p-4 text-start ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid hover:bg-white active:scale-[0.98] disabled:opacity-60"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-terra-50 text-terra-700">
                  {rendering && Icon === ImageIcon ? <Spinner className="size-5" /> : <Icon size={20} strokeWidth={1.7} />}
                </span>
                <span>
                  <span className="block font-semibold text-ink-900">{label}</span>
                  <span className="block text-xs text-ink-500">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
