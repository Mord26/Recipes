'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createCategory, deleteCategory, updateCategory } from '@/lib/actions/taxonomy';
import { categoryName, type Category, type Locale } from '@/lib/types';
import { Input, Spinner } from '@/components/ui';

export function CategoriesManager({ categories: initial }: { categories: Category[] }) {
  const t = useTranslations('settings');
  const tErrors = useTranslations('errors');
  const locale = useLocale() as Locale;
  const [categories, setCategories] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, { name: string; emoji: string }>>({});
  const [newName, setNewName] = useState('');
  const [pending, startTransition] = useTransition();

  const draftFor = (category: Category) =>
    drafts[category.id] ?? { name: categoryName(category, locale), emoji: category.emoji ?? '' };

  const isDirty = (category: Category) => {
    const draft = drafts[category.id];
    if (!draft) return false;
    return draft.name !== categoryName(category, locale) || draft.emoji !== (category.emoji ?? '');
  };

  const saveRow = (category: Category) => {
    const draft = draftFor(category);
    startTransition(async () => {
      const result = await updateCategory(category.id, draft.name, draft.emoji, locale);
      if (result.error || !result.category) {
        toast.error(tErrors(result.error ?? 'generic'));
        return;
      }
      setCategories((prev) => prev.map((c) => (c.id === category.id ? result.category! : c)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[category.id];
        return next;
      });
      toast.success(t('saved'));
    });
  };

  const removeRow = (category: Category) => {
    if (!confirm(t('categoryDeleteConfirm'))) return;
    startTransition(async () => {
      const result = await deleteCategory(category.id);
      if (result.error) {
        toast.error(tErrors(result.error));
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
    });
  };

  const addRow = () => {
    if (!newName.trim()) return;
    startTransition(async () => {
      const result = await createCategory(newName, locale);
      if (result.error || !result.category) {
        toast.error(tErrors(result.error ?? 'generic'));
        return;
      }
      setCategories((prev) => [...prev, result.category!]);
      setNewName('');
    });
  };

  return (
    <div className="card-core space-y-2 p-4">
      {categories.map((category) => {
        const draft = draftFor(category);
        return (
          <div key={category.id} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2">
            <Input
              value={draft.emoji}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [category.id]: { ...draft, emoji: e.target.value } }))}
              placeholder={t('categoryEmojiPlaceholder')}
              className="px-1 py-2.5 text-center"
              maxLength={4}
            />
            <Input
              value={draft.name}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [category.id]: { ...draft, name: e.target.value } }))}
              placeholder={t('categoryNamePlaceholder')}
              className="min-w-0 py-2.5"
              maxLength={40}
            />
            {isDirty(category) ? (
              <button
                type="button"
                aria-label={t('saved')}
                onClick={() => saveRow(category)}
                disabled={pending}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sage-600 text-white transition-all duration-300 ease-fluid active:scale-[0.92]"
              >
                {pending ? <Spinner className="size-4" /> : <Check size={17} strokeWidth={2} />}
              </button>
            ) : (
              <button
                type="button"
                aria-label={t('categoryDeleteConfirm')}
                onClick={() => removeRow(category)}
                disabled={pending}
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-300 transition-colors hover:text-terra-600"
              >
                <Trash2 size={17} strokeWidth={1.7} />
              </button>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-2 border-t border-ink-900/8 pt-3">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('categoryAdd')}
          className="min-w-0 flex-1 py-2.5"
          maxLength={40}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addRow();
          }}
        />
        <button
          type="button"
          aria-label={t('categoryAdd')}
          onClick={addRow}
          disabled={pending || !newName.trim()}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-terra-600 text-cream-50 transition-all duration-300 ease-fluid active:scale-[0.92] disabled:opacity-40"
        >
          <Plus size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
