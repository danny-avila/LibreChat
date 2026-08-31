import { Skeleton } from '@librechat/client';

/** Mirrors the schedule card's title controls, agent, cadence, and next-run rows. */
export default function ScheduleCardSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="rounded-lg border border-border-light bg-transparent px-3 py-2.5"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 min-w-0 flex-1 rounded" />
            <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
            <Skeleton className="size-7 shrink-0 rounded-md" />
          </div>
          <Skeleton className="mt-1 h-3 w-2/5 rounded" />
          <Skeleton className="mt-2 h-4 w-3/4 rounded" />
          <Skeleton className="mt-1 h-3 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}
