import React from 'react';
import type { OneCodeRunEvidence } from '~/onecode/project';

export default function EvidenceTab({
  evidence,
  selectedRunId,
  onLoad,
}: {
  evidence?: OneCodeRunEvidence;
  selectedRunId?: string;
  onLoad: () => void;
}) {
  return (
    <div className="space-y-3 p-3 text-sm text-text-primary">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs text-text-secondary">Selected run</div>
          <div className="font-mono text-xs">{selectedRunId || '未选择'}</div>
        </div>
        <button
          type="button"
          className="btn btn-neutral btn-sm"
          onClick={onLoad}
          disabled={!selectedRunId}
        >
          加载证据
        </button>
      </div>
      {evidence ? (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-border-light p-2">
              ledger: {evidence.ledger_error ?? 'ok'}
            </div>
            <div className="rounded border border-border-light p-2">
              manifest: {evidence.manifest_error ?? 'ok'}
            </div>
          </div>
          <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded border border-border-light bg-surface-secondary p-2 text-xs">
            {JSON.stringify(evidence, null, 2)}
          </pre>
        </>
      ) : (
        <div className="text-sm text-text-secondary">
          选择运行后加载 ledger、manifest 和 checkpoint。
        </div>
      )}
    </div>
  );
}
