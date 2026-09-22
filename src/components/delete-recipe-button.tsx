'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteRecipe } from '@/lib/actions/recipes';
import { Spinner } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';

export function DeleteRecipeButton({ recipeId }: { recipeId: string }) {
  const t = useTranslations('recipe');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const remove = () => {
    startTransition(async () => {
      const result = await deleteRecipe(recipeId);
      if (result.error) {
        toast.error(tErrors(result.error));
        return;
      }
      router.push('/');
      router.refresh();
    });
  };

  return (
    <ConfirmDialog
      title={t('deleteConfirm')}
      confirmLabel={tCommon('delete')}
      onConfirm={remove}
      trigger={
        <button
          type="button"
          aria-label={t('deleteConfirm')}
          disabled={pending}
          className="flex size-12 items-center justify-center rounded-full bg-white/80 text-terra-700 ring-1 ring-terra-600/20 transition-all duration-300 ease-fluid hover:bg-terra-50 active:scale-[0.9] disabled:opacity-50"
        >
          {pending ? <Spinner className="size-4" /> : <Trash2 size={18} strokeWidth={1.7} />}
        </button>
      }
    />
  );
}
