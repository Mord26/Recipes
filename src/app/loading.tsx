import { Bone, RecipeGridSkeleton } from '@/components/skeletons';

export default function HomeLoading() {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-5xl px-5 pb-32">
      <header className="space-y-2 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">
        <Bone className="h-4 w-24" />
        <Bone className="h-9 w-56" />
      </header>
      <div className="mb-6 space-y-4">
        <Bone className="h-12 w-full rounded-full" />
        <div className="flex gap-2">
          <Bone className="h-9 w-16 rounded-full" />
          <Bone className="h-9 w-24 rounded-full" />
          <Bone className="h-9 w-20 rounded-full" />
          <Bone className="h-9 w-24 rounded-full" />
        </div>
      </div>
      <RecipeGridSkeleton count={8} />
    </div>
  );
}
