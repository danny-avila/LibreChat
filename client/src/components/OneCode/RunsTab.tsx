import React from 'react';
import { Copy, Play, Search } from 'lucide-react';
import type { OneCodeRunSummary } from '~/onecode/project';
import { oneCodeStatusTone } from '~/onecode/console';
import { cn } from '~/utils';

export default function RunsTab({
  runs,
  selectedRunId,
  onSelect,
  onInspect,
  onResume,
}: {
  runs: OneCodeRunSummary[];
  selectedRunId?: string;
  onSelect: (run: OneCodeRunSummary) => void;
  onInspect: (run: OneCodeRunSummary) => void;
  onResume: (run: OneCodeRunSummary) => void;
}) {
  if (runs.length === 0) {
    return <div className="p-3 text-sm text-text-secondary">暂无运行记录</div>;
  }
  return (
    <div className="space-y-2 p-3">
      {runs.map((run) => {
        const tone = oneCodeStatusTone(run.status);
        return (
          <div
            key={run.run_id}
            className={cn(
              'w-full rounded border border-border-light p-2 text-left text-sm hover:bg-surface-hover',
              selectedRunId === run.run_id && 'border-primary',
            )}
          >
            <button type="button" onClick={() => onSelect(run)} className="w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs">{run.run_id}</span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px]',
                    tone === 'ok' && 'bg-surface-active text-text-primary',
                    tone === 'warn' && 'bg-surface-active text-text-warning',
                    tone === 'error' && 'bg-surface-destructive/10 text-text-destructive',
                  )}
                >
                  {run.status}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-secondary">
                <span>delivery: {run.delivery_status ?? '-'}</span>
                <span>next: {run.next_action ?? '-'}</span>
                <span>checkpoints: {run.checkpoint_count ?? '-'}</span>
              </div>
            </button>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="btn btn-neutral btn-xs"
                onClick={() => onInspect(run)}
              >
                <Search className="icon-sm" aria-hidden="true" />
                inspect
              </button>
              <button
                type="button"
                className="btn btn-neutral btn-xs"
                onClick={() => {
                  void navigator.clipboard?.writeText(run.run_id).catch(() => undefined);
                }}
              >
                <Copy className="icon-sm" aria-hidden="true" />
                copy
              </button>
              {run.next_action === 'resume' && (
                <button
                  type="button"
                  className="btn btn-neutral btn-xs"
                  onClick={() => onResume(run)}
                >
                  <Play className="icon-sm" aria-hidden="true" />
                  resume
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
