import React, { memo } from 'react';
import { Loader2, Check } from 'lucide-react';
import { Progress } from '@librechat/client';
import type { WebSearchStatus } from '~/common';
import { cn } from '~/utils';

interface WebSearchStatusBarProps {
  statuses: WebSearchStatus[];
}

const WebSearchStatusBar: React.FC<WebSearchStatusBarProps> = ({ statuses }) => {
  if (!statuses || statuses.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 w-full space-y-2" data-testid="web-search-status-bar">
      {statuses.map((status) => {
        const { total, current } = status;
        const hasProgress =
          typeof total === 'number' && total > 0 && typeof current === 'number' && current >= 0;
        const progressValue =
          hasProgress && total
            ? Math.min(Math.max((current / total) * 100, 0), 100)
            : hasProgress
              ? 0
              : undefined;
        const isComplete = Boolean(status.done) || status.phase === 'complete';

        return (
          <div
            key={status.id}
            className="flex flex-col gap-1 rounded-lg bg-surface-secondary/70 px-3 py-2 text-xs text-text-secondary shadow-inner"
          >
            <div className="flex items-center gap-2">
              {isComplete ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Loader2 className="h-3 w-3 animate-spin text-text-tertiary" />
              )}
              <span className={cn('text-text-secondary', isComplete && 'text-text-tertiary')}>
                {status.message}
              </span>
            </div>
            {hasProgress && progressValue !== undefined && (
              <div className="flex items-center gap-2">
                <Progress className="h-1 flex-1" value={progressValue} />
                <span className="w-12 text-right text-[0.7rem] text-text-tertiary">
                  {Math.min(current ?? 0, total ?? 0)}/{total}
                </span>
              </div>
            )}
            {status.url && (
              <span className="break-all pl-5 text-[0.7rem] text-text-tertiary">{status.url}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default memo(WebSearchStatusBar);
