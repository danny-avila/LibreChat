import React from 'react';
import type { OneCodeDiagnostic } from '~/onecode/project';

function DiagnosticBlock({ title, result }: { title: string; result?: OneCodeDiagnostic }) {
  return (
    <section className="rounded border border-border-light p-2 text-xs">
      <div className="font-medium text-text-secondary">{title}</div>
      <div className="mt-1">{result ? `${title}: ${result.status}` : '未运行'}</div>
      {result && (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-secondary p-2 font-mono">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  );
}

export default function DiagnosticsTab({
  doctor,
  selfAudit,
  onDoctor,
  onSelfAudit,
}: {
  doctor?: OneCodeDiagnostic;
  selfAudit?: OneCodeDiagnostic;
  onDoctor: () => void;
  onSelfAudit: () => void;
}) {
  return (
    <div className="space-y-3 p-3 text-sm text-text-primary">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-neutral btn-sm" onClick={onDoctor}>
          运行 doctor
        </button>
        <button type="button" className="btn btn-neutral btn-sm" onClick={onSelfAudit}>
          运行 self-audit
        </button>
      </div>
      <DiagnosticBlock title="doctor" result={doctor} />
      <DiagnosticBlock title="self-audit" result={selfAudit} />
    </div>
  );
}
