import { Skeleton } from '@librechat/client';

/** Mirrors the healthy schedule row: a state marker, a title line with its trailing
 *  state, and one detail line. The row's actions appear on interaction, so the
 *  placeholder reserves no space for them, and a healthy row shows no chip. */
export default function ScheduleCardSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-lg bg-transparent px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <Skeleton className="mt-1.5 size-2 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-5 min-w-0 flex-1 rounded" />
                <Skeleton className="h-3 w-12 shrink-0 rounded" />
              </div>
              <Skeleton className="mt-1 h-3.5 w-2/3 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
