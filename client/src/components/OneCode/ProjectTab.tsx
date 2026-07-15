import React from 'react';
import { Link2, RotateCw, ShieldCheck } from 'lucide-react';
import type { OneCodeProjectStatus } from '~/onecode/project';

export default function ProjectTab({
  workspace,
  status,
  message,
  onRefresh,
  onInit,
  onSyncMCP,
}: {
  workspace: string;
  status?: OneCodeProjectStatus;
  message?: string;
  onRefresh: () => void;
  onInit: () => void;
  onSyncMCP: () => void;
}) {
  return (
    <div className="space-y-3 p-3 text-sm text-text-primary">
      <section>
        <div className="text-xs font-medium text-text-secondary">Workspace</div>
        <div className="mt-1 break-all font-mono text-xs">{workspace || '未选择项目'}</div>
      </section>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-border-light p-2">
          Git: {status?.git?.present ? '已初始化' : '未初始化'}
        </div>
        <div className="rounded border border-border-light p-2">
          验证: {status?.verifier_policy?.present ? '已配置' : '未配置'}
        </div>
      </div>
      {status?.allowed_roots && (
        <section>
          <div className="text-xs font-medium text-text-secondary">Allowed roots</div>
          {status.allowed_roots.map((root) => (
            <div key={root} className="mt-1 break-all font-mono text-xs text-text-secondary">
              {root}
            </div>
          ))}
        </section>
      )}
      {message && <div className="text-xs text-text-secondary">{message}</div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-neutral btn-sm" onClick={onRefresh}>
          <RotateCw className="icon-sm" />
          刷新
        </button>
        <button
          type="button"
          className="btn btn-neutral btn-sm"
          onClick={onInit}
          disabled={!workspace}
        >
          <ShieldCheck className="icon-sm" />
          初始化
        </button>
        <button
          type="button"
          className="btn btn-neutral btn-sm"
          onClick={onSyncMCP}
          disabled={!workspace}
        >
          <Link2 className="icon-sm" />
          同步 MCP
        </button>
      </div>
    </div>
  );
}
