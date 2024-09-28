import React from 'react';
import { Skeleton } from '~/components/ui';

export default function AgentPanelSkeleton() {
  return (
    <div className="my-1 h-auto w-full flex-shrink-0 overflow-x-hidden">
      <div className="flex w-full flex-wrap">
        <Skeleton className="h-[40px] w-[200px] rounded" />
        <Skeleton className="ml-2 h-[40px] w-[100px] rounded" />
      </div>
      <div className="mt-4 space-y-4">
        <Skeleton className="h-[40px] w-full rounded" />
        <Skeleton className="h-[40px] w-full rounded" />
        <Skeleton className="h-[40px] w-full rounded" />
        <Skeleton className="h-[100px] w-full rounded" />
        <Skeleton className="h-[40px] w-full rounded" />
        <Skeleton className="h-[40px] w-full rounded" />
        <Skeleton className="h-[40px] w-full rounded" />
      </div>
    </div>
  );
}
