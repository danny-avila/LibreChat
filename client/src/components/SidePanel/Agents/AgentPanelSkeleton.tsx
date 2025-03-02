import React from 'react';
import { Skeleton } from '~/components/ui';

export default function AgentPanelSkeleton() {
  return (
    <div className="h-auto bg-white px-4 pb-8 pt-3 dark:bg-transparent">
      {/* Avatar */}
      <div className="mb-4">
        <div className="flex w-full items-center justify-center gap-4">
          <Skeleton className="relative h-20 w-20 rounded-full" />
        </div>
        {/* Name */}
        <Skeleton className="mb-2 h-5 w-1/5 rounded-lg" />
        <Skeleton className="mb-1 h-[40px] w-full rounded-lg" />
        <Skeleton className="h-3 w-1/4 rounded-lg" />
      </div>

      {/* Description */}
      <div className="mb-4">
        <Skeleton className="mb-2 h-5 w-1/4 rounded-lg" />
        <Skeleton className="h-[40px] w-full rounded-lg" />
      </div>

      {/* Instructions */}
      <div className="mb-6">
        <Skeleton className="mb-2 h-5 w-1/4 rounded-lg" />
        <Skeleton className="h-[100px] w-full rounded-lg" />
      </div>

      {/* Model and Provider */}
      <div className="mb-6">
        <Skeleton className="mb-2 h-5 w-1/4 rounded-lg" />
        <Skeleton className="h-[40px] w-full rounded-lg" />
      </div>

      {/* Capabilities */}
      <div className="mb-6">
        <Skeleton className="mb-2 h-5 w-1/4 rounded-lg" />
        <Skeleton className="mb-2 h-5 w-36 rounded-lg" />
        <Skeleton className="mb-4 h-[35px] w-full rounded-lg" />
        <Skeleton className="mb-2 h-5 w-24 rounded-lg" />
        <Skeleton className="h-[35px] w-full rounded-lg" />
      </div>

      {/* Tools & Actions */}
      <div className="mb-6">
        <Skeleton className="mb-2 h-5 w-1/4 rounded-lg" />
        <Skeleton className="mb-2 h-[35px] w-full rounded-lg" />
        <Skeleton className="mb-2 h-[35px] w-full rounded-lg" />
        <div className="flex space-x-2">
          <Skeleton className="h-8 w-1/2 rounded-lg" />
          <Skeleton className="h-8 w-1/2 rounded-lg" />
        </div>
      </div>

      {/* Admin Settings */}
      <div className="mb-6">
        <Skeleton className="h-[35px] w-full rounded-lg" />
      </div>

      {/* Bottom Buttons */}
      <div className="flex items-center justify-end gap-2">
        <Skeleton className="h-[35px] w-16 rounded-lg" />
        <Skeleton className="h-[35px] w-16 rounded-lg" />
        <Skeleton className="h-[35px] w-16 rounded-lg" />
        <Skeleton className="h-[35px] w-full rounded-lg" />
      </div>
    </div>
  );
}
