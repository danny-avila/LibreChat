import React from 'react';
import { Skeleton } from '@librechat/client';

export default function MCPPanelSkeleton() {
  return (
    <div className="space-y-6 p-2">
      {[1, 2].map((serverIdx) => (
        <div key={serverIdx} className="space-y-4">
          <Skeleton className="h-6 w-1/3 rounded-lg" /> {/* Server Name */}
          {[1, 2].map((varIdx) => (
            <div key={varIdx} className="space-y-2">
              <Skeleton className="h-5 w-1/4 rounded-lg" /> {/* Variable Title */}
              <Skeleton className="h-8 w-full rounded-lg" /> {/* Input Field */}
              <Skeleton className="h-4 w-2/3 rounded-lg" /> {/* Description */}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
