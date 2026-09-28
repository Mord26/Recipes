import { cn } from '@/lib/utils';

export function Bone({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-cream-200/70', className)} />;
}

export function RecipeGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card-shell">
          <div className="card-core overflow-hidden">
            <Bone className="aspect-[4/3] rounded-none" />
            <div className="space-y-2 p-3.5">
              <Bone className="h-4 w-4/5" />
              <Bone className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
