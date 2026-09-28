'use client';

import { useRef, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { compressImage, DISH_PHOTO_OPTIONS } from '@/lib/images';
import { addDishPhoto } from '@/lib/actions/recipes';
import { Spinner } from '@/components/ui';

/** Lets any family member add a dish photo to a recipe from the recipe page. */
export function AddDishPhoto({ recipeId }: { recipeId: string }) {
  const t = useTranslations('recipe');
  const tErrors = useTranslations('errors');
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    start(async () => {
      try {
        const blob = await compressImage(file, DISH_PHOTO_OPTIONS);
        const supabase = createSupabaseBrowserClient();
        const path = `${recipeId}/${crypto.randomUUID()}.webp`;
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(path, blob, { contentType: 'image/webp' });
        if (uploadError) {
          toast.error(tErrors('photoUploadFailed'));
          return;
        }
        const result = await addDishPhoto(recipeId, path);
        if (result.error) toast.error(tErrors(result.error));
        else toast.success(t('photoAdded'));
      } catch {
        toast.error(tErrors('photoUploadFailed'));
      }
    });
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="flex size-12 items-center justify-center rounded-full bg-white/80 text-ink-700 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid hover:bg-white active:scale-[0.9] disabled:opacity-60"
        aria-label={t('addPhoto')}
        title={t('addPhoto')}
      >
        {pending ? <Spinner className="size-5" /> : <Camera size={19} strokeWidth={1.7} />}
      </button>
    </>
  );
}
