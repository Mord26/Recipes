'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { EyeOff, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { addComment, deleteComment } from '@/lib/actions/social';
import type { CommentVisibility, Locale, RecipeComment } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { Chip, Spinner, Textarea } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';

const AUTHOR_TINTS = [
  'bg-cream-100',
  'bg-sage-100/70',
  'bg-terra-50',
  'bg-honey-100/60',
  'bg-cream-200/60',
] as const;

function authorTint(authorId: string): string {
  let hash = 0;
  for (let i = 0; i < authorId.length; i += 1) hash = (hash * 31 + authorId.charCodeAt(i)) % 997;
  return AUTHOR_TINTS[hash % AUTHOR_TINTS.length];
}

export function CommentsSection({
  recipeId,
  comments,
  userId,
}: {
  recipeId: string;
  comments: RecipeComment[];
  userId: string;
}) {
  const t = useTranslations('comments');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const locale = useLocale() as Locale;
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<CommentVisibility>('everyone');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!body.trim() || pending) return;
    startTransition(async () => {
      const result = await addComment(recipeId, body, visibility);
      if (result.error) {
        toast.error(tErrors(result.error));
        return;
      }
      setBody('');
      toast.success(t('posted'));
    });
  };

  const remove = (commentId: string) => {
    startTransition(async () => {
      await deleteComment(commentId, recipeId);
    });
  };

  return (
    <section className="card-shell">
      <div className="card-core p-5">
        <h2 className="font-display mb-4 text-xl font-medium text-ink-900">💬 {t('title')}</h2>

        {comments.length === 0 ? (
          <p className="mb-5 text-sm leading-relaxed text-ink-500">{t('empty')}</p>
        ) : (
          <ul className="mb-5 space-y-4">
            {comments.map((comment) => (
              <li key={comment.id} className={`rounded-2xl p-4 ring-1 ring-ink-900/5 ${authorTint(comment.author_id)}`}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900">{comment.profiles?.display_name}</span>
                    <span className="text-[11px] text-ink-500">{formatDate(comment.created_at, locale)}</span>
                    {comment.visibility === 'private' ? (
                      <span className="flex items-center gap-1 rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-semibold text-sage-700">
                        <EyeOff size={10} strokeWidth={2} />
                        {t('privateBadge')}
                      </span>
                    ) : null}
                  </div>
                  {comment.author_id === userId ? (
                    <ConfirmDialog
                      title={t('deleteConfirm')}
                      confirmLabel={tCommon('delete')}
                      onConfirm={() => remove(comment.id)}
                      trigger={
                        <button
                          type="button"
                          aria-label={t('deleteConfirm')}
                          className="flex size-9 items-center justify-center text-ink-400 transition-colors hover:text-terra-600"
                        >
                          <Trash2 size={16} strokeWidth={1.7} />
                        </button>
                      }
                    />
                  ) : null}
                </div>
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-ink-700">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t('placeholder')}
            rows={3}
            maxLength={2000}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-ink-500">{t('visibilityLabel')}</span>
              <Chip active={visibility === 'everyone'} onClick={() => setVisibility('everyone')} className="px-3 py-1.5 text-xs">
                {t('everyone')}
              </Chip>
              <Chip active={visibility === 'private'} onClick={() => setVisibility('private')} className="px-3 py-1.5 text-xs">
                {t('onlyMe')}
              </Chip>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={pending || !body.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-cream-50 transition-all duration-300 ease-fluid hover:bg-ink-700 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"
            >
              {pending ? <Spinner className="size-4" /> : <Send size={15} strokeWidth={1.8} />}
              {pending ? t('posting') : t('post')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
