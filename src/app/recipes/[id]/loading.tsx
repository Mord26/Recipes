import { Bone } from '@/components/skeletons';

export default function RecipeLoading() {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl pb-16">
      <Bone className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-5 px-5 pt-6">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Bone className="h-6 w-20 rounded-full" />
            <Bone className="h-6 w-24 rounded-full" />
          </div>
          <Bone className="h-9 w-3/4" />
          <Bone className="h-4 w-1/3" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-9 w-24 rounded-full" />
          <Bone className="h-9 w-28 rounded-full" />
          <Bone className="h-9 w-24 rounded-full" />
        </div>
        <Bone className="h-12 w-full rounded-full" />
        <Bone className="h-40 w-full rounded-[1.75rem]" />
        <Bone className="h-56 w-full rounded-[1.75rem]" />
      </div>
    </div>
  );
}
