import React from 'react';
import type { OneCodeVerifierPolicy, OneCodeVerifierPreset } from '~/onecode/project';

export default function VerifierTab({
  presets,
  policy,
  onLoad,
  onWriteDefault,
  onOverwriteDefault,
}: {
  presets: OneCodeVerifierPreset[];
  policy?: OneCodeVerifierPolicy;
  onLoad: () => void;
  onWriteDefault: () => void;
  onOverwriteDefault: () => void;
}) {
  return (
    <div className="space-y-3 p-3 text-sm text-text-primary">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-neutral btn-sm" onClick={onLoad}>
          刷新验证
        </button>
        <button type="button" className="btn btn-neutral btn-sm" onClick={onWriteDefault}>
          初始化策略
        </button>
        <button type="button" className="btn btn-neutral btn-sm" onClick={onOverwriteDefault}>
          覆盖验证策略
        </button>
      </div>
      <section className="rounded border border-border-light p-2">
        <div className="text-xs font-medium text-text-secondary">当前策略</div>
        <div className="mt-1 text-xs">
          {policy?.exists
            ? policy.valid
              ? 'valid'
              : `invalid: ${policy.error ?? '-'}`
            : 'missing'}
        </div>
        <div className="mt-1 break-all font-mono text-xs text-text-secondary">{policy?.path}</div>
      </section>
      <section>
        <div className="text-xs font-medium text-text-secondary">Presets</div>
        <div className="mt-2 space-y-2">
          {presets.map((preset) => (
            <div key={preset.id} className="rounded border border-border-light p-2 text-xs">
              <div className="font-mono">{preset.id}</div>
              <div className="mt-1 break-all text-text-secondary">{preset.command.join(' ')}</div>
            </div>
          ))}
          {presets.length === 0 && <div className="text-xs text-text-secondary">暂无 preset</div>}
        </div>
      </section>
    </div>
  );
}
