import { Bone, RecipeGridSkeleton } from '@/components/skeletons';

export default function FavoritesLoading() {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-5xl px-5 pb-32">
      <header className="pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">
        <Bone className="h-9 w-44" />
      </header>
      <RecipeGridSkeleton count={6} />
    </div>
  );
}
