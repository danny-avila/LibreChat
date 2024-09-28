import React from 'react';
import { Skeleton } from '~/components/ui';

export default function AgentPanelSkeleton() {
  return (
    <div className="scrollbar-gutter-stable h-auto w-full flex-shrink-0 overflow-x-hidden">
      {/* Agent Select and Button */}
      <div className="mt-1 flex w-full gap-2">
        <Skeleton className="h-[40px] w-3/4 rounded" />
        <Skeleton className="h-[40px] w-1/4 rounded" />
      </div>

      <div className="h-auto bg-white px-4 pb-8 pt-3 dark:bg-transparent">
        {/* Avatar */}
        <div className="mb-4">
          <div className="flex w-full items-center justify-center gap-4">
            <Skeleton className="relative h-20 w-20 rounded-full" />
          </div>
          {/* Name */}
          <Skeleton className="mb-2 h-5 w-1/5 rounded" />
          <Skeleton className="mb-1 h-[40px] w-full rounded" />
          <Skeleton className="h-3 w-1/4 rounded" />
        </div>

        {/* Description */}
        <div className="mb-4">
          <Skeleton className="mb-2 h-5 w-1/4 rounded" />
          <Skeleton className="h-[40px] w-full rounded" />
        </div>

        {/* Instructions */}
        <div className="mb-6">
          <Skeleton className="mb-2 h-5 w-1/4 rounded" />
          <Skeleton className="h-[100px] w-full rounded" />
        </div>

        {/* Model and Provider */}
        <div className="mb-6">
          <Skeleton className="mb-2 h-5 w-1/4 rounded" />
          <Skeleton className="h-[40px] w-full rounded" />
        </div>

        {/* Capabilities */}
        <div className="mb-6">
          <Skeleton className="mb-2 h-5 w-1/4 rounded" />
          <Skeleton className="mb-2 h-[40px] w-full rounded" />
          <Skeleton className="h-[40px] w-full rounded" />
        </div>

        {/* Tools & Actions */}
        <div className="mb-6">
          <Skeleton className="mb-2 h-5 w-1/4 rounded" />
          <Skeleton className="mb-2 h-[40px] w-full rounded" />
          <Skeleton className="mb-2 h-[40px] w-full rounded" />
          <div className="flex space-x-2">
            <Skeleton className="h-8 w-1/2 rounded" />
            <Skeleton className="h-8 w-1/2 rounded" />
          </div>
        </div>

        {/* Bottom Buttons */}
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-[40px] w-[100px] rounded" />
          <Skeleton className="h-[40px] w-[100px] rounded" />
          <Skeleton className="h-[40px] w-[100px] rounded" />
        </div>
      </div>
    </div>
  );
}
