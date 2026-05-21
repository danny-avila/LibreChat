import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import type { ReviewTagGroup, RunStatus, Workflow, WorkflowOutput, WorkflowRun, WorkflowStep } from './types';

const TAG_COLOR_CLASSES: Record<ReviewTagGroup['color'], { border: string; bg: string; title: string; chip: string }> = {
  green:  { border: 'border-green-200 dark:border-green-800/40',   bg: 'bg-green-50 dark:bg-green-900/10',   title: 'text-green-700 dark:text-green-400',   chip: 'bg-green-100 text-green-700 dark:bg-green-800/30 dark:text-green-300' },
  amber:  { border: 'border-amber-200 dark:border-amber-800/40',   bg: 'bg-amber-50 dark:bg-amber-900/10',   title: 'text-amber-700 dark:text-amber-400',   chip: 'bg-amber-100 text-amber-700 dark:bg-amber-800/30 dark:text-amber-300' },
  red:    { border: 'border-red-200 dark:border-red-800/40',       bg: 'bg-red-50 dark:bg-red-900/10',       title: 'text-red-700 dark:text-red-400',       chip: 'bg-red-100 text-red-700 dark:bg-red-800/30 dark:text-red-300' },
  blue:   { border: 'border-blue-200 dark:border-blue-800/40',     bg: 'bg-blue-50 dark:bg-blue-900/10',     title: 'text-blue-700 dark:text-blue-400',     chip: 'bg-blue-100 text-blue-700 dark:bg-blue-800/30 dark:text-blue-300' },
  purple: { border: 'border-purple-200 dark:border-purple-800/40', bg: 'bg-purple-50 dark:bg-purple-900/10', title: 'text-purple-700 dark:text-purple-400', chip: 'bg-purple-100 text-purple-700 dark:bg-purple-800/30 dark:text-purple-300' },
  gray:   { border: 'border-border-light',                         bg: 'bg-surface-secondary',               title: 'text-text-secondary',                  chip: 'bg-surface-tertiary text-text-secondary' },
};

const STATUS_LABEL: Record<RunStatus, string> = {
  pending: 'Queued',
  running: 'Running',
  awaiting_user: 'Awaiting Review',
  awaiting_oauth: 'Needs Reconnect',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_BADGE: Record<RunStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  awaiting_user: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  awaiting_oauth: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'text-text-secondary bg-surface-secondary',
};


// ── Helpers ───────────────────────────────────────────────────────────────────

function completedStepMap(run: WorkflowRun): Record<string, { output: unknown }> {
  return (run.outputs?.['_completed_steps'] ?? {}) as Record<string, { output: unknown }>;
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

// ── Template resolver ─────────────────────────────────────────────────────────

function resolveTemplate(
  template: string,
  completedSteps: Record<string, { output: unknown }>,
  inputs: Record<string, unknown> = {},
): string {
  return template.replace(/\$\{([^}]+)\}/g, (_, path: string) => {
    if (path.startsWith('inputs.')) {
      return String(inputs[path.slice('inputs.'.length)] ?? '');
    }
    if (path.startsWith('steps.')) {
      const parts = path.slice('steps.'.length).split('.');
      let value: unknown = completedSteps;
      for (const part of parts) {
        if (value == null || typeof value !== 'object') return '';
        const m = part.match(/^([^\[]*)\[(\d+)\]$/);
        if (m) {
          const key = m[1];
          const idx = parseInt(m[2], 10);
          if (key) value = (value as Record<string, unknown>)[key];
          if (!Array.isArray(value)) return '';
          value = (value as unknown[])[idx];
        } else {
          value = (value as Record<string, unknown>)[part];
        }
      }
      if (Array.isArray(value)) return JSON.stringify(value);
      return value != null ? String(value) : '';
    }
    const [stepId, ...rest] = path.split('.');
    const out = completedSteps[stepId]?.output;
    return out ? String((out as Record<string, unknown>)[rest.join('.')] ?? '') : '';
  });
}

// ── Output renderers ──────────────────────────────────────────────────────────

function FieldValue({ raw, kind }: { raw: string; kind?: string }) {
  if (kind === 'list') {
    let items: string[] = [];
    try { items = JSON.parse(raw); } catch { items = raw.split(',').map((s) => s.trim()); }
    if (!Array.isArray(items) || !items.length) return <span className="text-text-secondary">—</span>;
    return (
      <ul className="mt-1 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary" />
            {String(item)}
          </li>
        ))}
      </ul>
    );
  }
  return <span className="text-sm text-text-primary">{raw}</span>;
}

function resolveListItems(
  items: string[],
  completedSteps: Record<string, { output: unknown }>,
  inputs: Record<string, unknown>,
): string[] {
  const result: string[] = [];
  for (const tpl of items) {
    const resolved = resolveTemplate(tpl, completedSteps, inputs);
    try {
      const parsed = JSON.parse(resolved);
      if (Array.isArray(parsed)) {
        result.push(...parsed.map(String));
        continue;
      }
    } catch { /* fall through */ }
    if (resolved.trim()) result.push(resolved);
  }
  return result;
}

function ReportOutput({
  output,
  completedSteps,
  inputs,
}: {
  output: WorkflowOutput;
  completedSteps: Record<string, { output: unknown }>;
  inputs: Record<string, unknown>;
}) {
  if ('sections' in output && output.sections?.length) {
    return (
      <div className="space-y-4">
        {output.sections.map((section, i) => {
          if (section.type === 'key_value') {
            const resolved = section.fields
              .map((f) => ({ ...f, resolved: resolveTemplate(f.value, completedSteps, inputs) }))
              .filter((f) => f.resolved.trim() !== '');
            if (!resolved.length) return null;
            return (
              <div key={i} className="rounded-2xl border border-border-light bg-surface-primary p-5">
                {section.title && (
                  <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    {section.title}
                  </p>
                )}
                <dl className="space-y-4">
                  {resolved.map((f) => (
                    <div key={f.label}>
                      <dt className="text-xs font-medium text-text-secondary">{f.label}</dt>
                      <dd className="mt-0.5">
                        <FieldValue raw={f.resolved} kind={f.kind} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          }
          if (section.type === 'list') {
            const listItems = resolveListItems(section.items ?? [], completedSteps, inputs);
            if (!listItems.length) return null;
            return (
              <div key={i} className="rounded-2xl border border-border-light bg-surface-primary p-5">
                {section.title && (
                  <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    {section.title}
                  </p>
                )}
                <ul className="space-y-2">
                  {listItems.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-text-primary">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  }
  const fields = ('fields' in output ? output.fields : undefined) ?? [];
  const resolved = fields
    .map((f) => ({ ...f, resolved: resolveTemplate(f.value, completedSteps, inputs) }))
    .filter((f) => f.resolved.trim() !== '');
  if (!resolved.length) return null;
  return (
    <div className="rounded-2xl border border-border-light bg-surface-primary p-5">
      {'title' in output && output.title && (
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-secondary">{output.title}</p>
      )}
      <dl className="space-y-4">
        {resolved.map((f) => (
          <div key={f.label}>
            <dt className="text-xs font-medium text-text-secondary">{f.label}</dt>
            <dd className="mt-0.5">
              <FieldValue raw={f.resolved} kind={f.kind} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Pending prompt renderer ───────────────────────────────────────────────────

function PendingPromptView({ raw }: { raw: string }) {
  let parsed: Record<string, unknown> | null = null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object' && !Array.isArray(p)) parsed = p as Record<string, unknown>;
  } catch { /* raw string */ }

  if (!parsed) {
    return <p className="text-sm text-text-primary whitespace-pre-wrap">{raw}</p>;
  }

  return (
    <div className="space-y-3">
      {Object.entries(parsed).map(([key, value]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return (
          <div key={key}>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</p>
            {Array.isArray(value) ? (
              <ul className="mt-1 space-y-1">
                {(value as unknown[]).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary" />
                    {String(item)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-sm text-text-primary">{String(value ?? '—')}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step output detail view ───────────────────────────────────────────────────

function StepOutputView({ step, output }: { step: WorkflowStep; output: unknown }) {
  const data = output as Record<string, unknown>;

  if (step.type === 'scrub') {
    const entities = (data?.entities ?? []) as Array<{ token: string; label: string; display_value: string }>;
    return (
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Masked Entities · {entities.length}
        </p>
        {entities.length === 0 ? (
          <p className="text-sm text-text-secondary">No entities masked.</p>
        ) : (
          <div className="divide-y divide-border-light rounded-xl border border-border-light">
            {entities.map((e, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <code className="shrink-0 rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-xs text-text-secondary">
                  {e.token}
                </code>
                <span className="text-xs text-text-secondary">{e.label}</span>
                <span className="ml-auto text-sm text-text-primary">{e.display_value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step.type === 'file_extract') {
    const text = String(data?.text ?? data?.content ?? '');
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Extracted Text · {text.length.toLocaleString()} chars
        </p>
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border-light bg-surface-primary p-4 text-xs text-text-primary">
          {text || '—'}
        </pre>
      </div>
    );
  }

  if (step.type === 'llm') {
    if (typeof output === 'string') {
      return <p className="whitespace-pre-wrap text-sm text-text-primary">{output}</p>;
    }
    const text = data?.result ?? data?.text ?? data?.output ?? data?.content;
    if (typeof text === 'string') {
      return <p className="whitespace-pre-wrap text-sm text-text-primary">{text}</p>;
    }
    const entries = Object.entries(data ?? {});
    return (
      <dl className="space-y-4">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium capitalize text-text-secondary">{k.replace(/_/g, ' ')}</dt>
            <dd className="mt-0.5">
              {Array.isArray(v) ? (
                <ul className="mt-1 space-y-1">
                  {(v as unknown[]).map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary" />
                      {String(item)}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-sm text-text-primary">{String(v ?? '—')}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  const entries = Object.entries(data ?? {});
  if (!entries.length) return <p className="text-sm text-text-secondary">No output recorded.</p>;
  return (
    <dl className="space-y-4">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium capitalize text-text-secondary">{k.replace(/_/g, ' ')}</dt>
          <dd className="mt-0.5">
            {Array.isArray(v) ? (
              <ul className="mt-1 space-y-1">
                {(v as unknown[]).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary" />
                    {String(item)}
                  </li>
                ))}
              </ul>
            ) : typeof v === 'object' && v !== null ? (
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-text-secondary">
                {JSON.stringify(v, null, 2)}
              </pre>
            ) : (
              <span className="text-sm text-text-primary">{String(v ?? '—')}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── Completed output fallback ─────────────────────────────────────────────────

function ResultFallback({ outputs }: { outputs: Record<string, unknown> }) {
  const entries = Object.entries(outputs).filter(([k]) => k !== '_completed_steps');
  if (!entries.length) return null;
  return (
    <div className="space-y-4">
      {entries.map(([key, value]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return (
          <div key={key} className="rounded-2xl border border-border-light bg-surface-primary p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</p>
            {typeof value === 'string' ? (
              <p className="text-sm text-text-primary whitespace-pre-wrap">{value}</p>
            ) : Array.isArray(value) ? (
              <ul className="space-y-1">
                {(value as unknown[]).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary" />
                    {String(item)}
                  </li>
                ))}
              </ul>
            ) : typeof value === 'object' && value !== null ? (
              <div className="space-y-3">
                {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs text-text-tertiary">{k.replace(/_/g, ' ')}</p>
                    <p className="mt-0.5 text-sm text-text-primary">
                      {typeof v === 'string' ? v : JSON.stringify(v)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-primary">{String(value)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── SSE hook ──────────────────────────────────────────────────────────────────

function useRunStream(
  runId: string | undefined,
  token: string | undefined,
  streamKey: number,
  onUpdate: (run: WorkflowRun) => void,
  onDone: () => void,
) {
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(async () => {
    if (!runId || !token) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/aivion/workflow/runs/${runId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) { onDone(); return; }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6)) as WorkflowRun;
              onUpdate(data);
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    } finally {
      onDone();
    }
  }, [runId, token, streamKey, onUpdate, onDone]);

  useEffect(() => {
    void connect();
    return () => abortRef.current?.abort();
  }, [connect]);
}

// ── Review-gate constants ─────────────────────────────────────────────────────

const REC_LABELS: Record<string, string> = {
  screen_call: 'Screen Call',
  technical_interview: 'Tech Interview',
  hold: 'Hold',
  request_more_info: 'More Info',
  reject: 'Reject',
};

const REC_OPTS = [
  { value: 'screen_call', label: 'Screen Call', active: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700' },
  { value: 'technical_interview', label: 'Tech Interview', active: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700' },
  { value: 'hold', label: 'Hold', active: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700' },
  { value: 'request_more_info', label: 'More Info', active: 'bg-gray-200 text-gray-700 border-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-500' },
  { value: 'reject', label: 'Reject', active: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700' },
];

const PRIORITY_OPTS = [
  { value: 'high', label: 'High', active: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700' },
  { value: 'medium', label: 'Medium', active: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700' },
  { value: 'low', label: 'Low', active: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600' },
];

function splitDots(val: string | undefined): string[] {
  if (!val || val === '—') return [];
  return val.replace(/ …$/, '').split(' · ').filter(Boolean);
}

// ── Fit-score ring ────────────────────────────────────────────────────────────

function FitScoreRing({ score }: { score: number }) {
  const clamped = Math.min(10, Math.max(0, score));
  const r = 34;
  const circ = 2 * Math.PI * r;
  const filled = (clamped / 10) * circ;
  const color = clamped >= 7 ? '#22c55e' : clamped >= 5 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" aria-label={`Fit score ${clamped}/10`} className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-surface-secondary" />
      <circle
        cx="44" cy="44" r={r} fill="none"
        stroke={color} strokeWidth="7"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text x="44" y="50" textAnchor="middle" fontSize="22" fontWeight="700" fill={color}>{clamped}</text>
      <text x="44" y="64" textAnchor="middle" fontSize="10" fill="#9ca3af">/10</text>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WorkflowRunPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const { token } = useAuthContext();

  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [resumeValues, setResumeValues] = useState<Record<string, string>>({});
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState(0);
  // Tracks which runId we've already done a completion re-fetch for to avoid loops
  const completionFetchedRef = useRef<string | null>(null);

  const onUpdate = useCallback((data: WorkflowRun) => {
    setRun((prev) => {
      if (!prev) return data;
      // Pub/sub events only carry {run_id, status} — preserve existing outputs
      // and pending fields that the new partial event omits (null/undefined).
      const merged: WorkflowRun = { ...prev, ...data };
      if (data.outputs == null && prev.outputs != null) merged.outputs = prev.outputs;
      if (data.pending_input_schema == null && prev.pending_input_schema != null) {
        merged.pending_input_schema = prev.pending_input_schema;
      }
      if (data.pending_step_id == null && prev.pending_step_id != null) {
        merged.pending_step_id = prev.pending_step_id;
      }
      if (data.pending_prompt == null && prev.pending_prompt != null) {
        merged.pending_prompt = prev.pending_prompt;
      }
      return merged;
    });
    setLoading(false);
  }, []);

  const onDone = useCallback(() => {
    setLoading(false);
  }, []);

  useRunStream(runId, token, streamKey, onUpdate, onDone);

  // Initial REST fetch — seeds full run state (including outputs + pending fields).
  // SSE alone can deliver partial pub/sub payloads that omit these fields.
  useEffect(() => {
    if (!runId || !token) return;
    fetch(`/api/aivion/workflow/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: WorkflowRun | null) => {
        if (data) setRun(data);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [runId, token]);

  // Re-fetch full run when status becomes completed/failed — SSE events are
  // often partial (no outputs) so we always want a fresh REST snapshot here.
  useEffect(() => {
    if (!run || !runId || !token) return;
    if (run.status !== 'completed' && run.status !== 'failed') return;
    const key = `${runId}-${run.status}`;
    if (completionFetchedRef.current === key) return;
    completionFetchedRef.current = key;
    fetch(`/api/aivion/workflow/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: WorkflowRun | null) => {
        if (!data) return;
        // Merge: keep pending_input_schema from in-memory so the review panel
        // stays visible even after the REST endpoint clears it on completion.
        setRun((prev) => prev ? {
          ...data,
          pending_input_schema: prev.pending_input_schema ?? data.pending_input_schema,
          pending_prompt: prev.pending_prompt ?? data.pending_prompt,
        } : data);
      })
      .catch(() => undefined);
  }, [run?.status, runId, token]);

  // Fetch workflow definition for step labels and output spec
  useEffect(() => {
    if (!token || !id) return;
    fetch(`/api/aivion/workflow/workflows/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((wf: Workflow | null) => { if (wf) setWorkflow(wf); })
      .catch(() => undefined);
  }, [id, token]);

  // Seed resume form defaults when awaiting_user — skip readonly display fields
  useEffect(() => {
    if (run?.status !== 'awaiting_user') return;
    const fields = (run.pending_input_schema?.fields ?? []).filter(
      (f) => (f.type as string) !== 'readonly',
    );
    if (fields.length === 0) return;
    setResumeValues((prev) => {
      const seeded = { ...prev };
      for (const f of fields) {
        if (!(f.name in seeded) && f.default != null) {
          seeded[f.name] = String(f.default);
        }
      }
      return seeded;
    });
  }, [run?.status, run?.pending_input_schema]);

  // Persist review-gate schema to localStorage so the completed view can
  // still show the full assessment after the REST endpoint clears pending fields.
  useEffect(() => {
    if (run?.status !== 'awaiting_user' || !run.pending_input_schema || !runId) return;
    try {
      localStorage.setItem(`wf_review_${runId}`, JSON.stringify({ schema: run.pending_input_schema }));
    } catch {}
  }, [run?.status, run?.pending_input_schema, runId]);

  // ⌘+Enter keyboard shortcut to submit review
  useEffect(() => {
    if (run?.status !== 'awaiting_user') return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('review-gate-form')?.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run?.status]);

  async function handleResume(e: React.FormEvent) {
    e.preventDefault();
    setResuming(true);
    setResumeError(null);
    try {
      // Strip display-only _-prefixed readonly fields before sending to backend
      const payload = Object.fromEntries(
        Object.entries(resumeValues).filter(([k]) => !k.startsWith('_')),
      );
      const res = await fetch(`/api/aivion/workflow/runs/${runId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ input: payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? `${res.status}`);
      }
      setStreamKey((k) => k + 1);
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : 'Failed to submit.');
    } finally {
      setResuming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-text-secondary">Run not found.</p>
        <Link to={`/workflow/${id}`} className="text-sm text-amber-600 hover:underline">
          ← Back
        </Link>
      </div>
    );
  }

  const steps: WorkflowStep[] = workflow?.spec?.steps ?? [];
  const done = completedStepMap(run);
  const currentStep = steps.find((s) => s.id === run.pending_step_id);
  const specOutput = workflow?.spec?.output;

  // For completed runs: restore review schema from in-memory (SSE merge kept it)
  // or localStorage (page reload case). This lets the completed view show the
  // full assessment without a form.
  let effectiveSchema = run.pending_input_schema;
  if (!effectiveSchema && runId) {
    try {
      const raw = localStorage.getItem(`wf_review_${runId}`);
      if (raw) effectiveSchema = (JSON.parse(raw) as { schema: typeof run.pending_input_schema })?.schema ?? null;
    } catch {}
  }

  const reviewAllFields = effectiveSchema?.fields ?? [];
  const roFields = Object.fromEntries(
    reviewAllFields
      .filter((f) => (f.type as string) === 'readonly')
      .map((f) => [f.name, String(f.default ?? '—')]),
  );
  const reviewEditFields = reviewAllFields.filter((f) => (f.type as string) !== 'readonly');
  const reviewDisplay = workflow?.spec?.review_display;
  const recField = reviewDisplay?.rec_field ?? '_ai_rec';
  const aiRec = roFields[recField] && roFields[recField] !== '—' ? roFields[recField] : null;

  function fieldLabel(key: string): string {
    return reviewAllFields.find((f) => f.name === key)?.label
      ?? key.replace(/^_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main panel ──────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-y-auto">

        {/* Running */}
        {run.status === 'running' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <svg className="h-12 w-12 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" className="opacity-20" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div>
              <p className="text-base font-semibold text-text-primary">
                {currentStep?.label ?? 'Processing…'}
              </p>
              <p className="mt-1 text-sm text-text-secondary">Running step — this may take a moment</p>
            </div>
          </div>
        )}

        {/* Pending */}
        {run.status === 'pending' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <p className="text-sm text-text-secondary">Queued — starting soon…</p>
          </div>
        )}

        {/* awaiting_oauth — service disconnected mid-run */}
        {run.status === 'awaiting_oauth' && (
          <div className="p-6 lg:p-8">
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-900/20">
              <div className="flex items-start gap-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-semibold text-red-800 dark:text-red-300">Service connection required</p>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                    A service this workflow needs is no longer connected. Reconnect it to resume the run.
                  </p>
                  <Link
                    to="/connections"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Manage connections →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* awaiting_user */}
        {run.status === 'awaiting_user' && (
          <div className="flex-1 overflow-y-auto p-5 lg:p-7">
            {run.expires_at && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                Expires in {daysUntil(run.expires_at)} day{daysUntil(run.expires_at) === 1 ? '' : 's'}
              </div>
            )}

            {reviewDisplay ? (
              <div className="space-y-4">
                {/* Row 1: Profile + AI Assessment (spec-driven) */}
                <div className="grid grid-cols-2 gap-4">
                  {(reviewDisplay.profile_fields?.length ?? 0) > 0 && (
                    <div className="rounded-xl border border-border-light bg-surface-primary p-5">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {reviewDisplay.profile_label ?? 'Details'}
                      </p>
                      <div className="space-y-3">
                        {reviewDisplay.profile_fields!.map((key) => {
                          const value = roFields[key] && roFields[key] !== '—'
                            ? roFields[key]
                            : String(run.inputs?.[key] ?? '');
                          return value ? (
                            <div key={key}>
                              <p className="text-xs text-text-tertiary">{fieldLabel(key)}</p>
                              <p className="mt-0.5 text-sm font-medium text-text-primary">{value}</p>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                  {(reviewDisplay.assessment_fields?.length ?? 0) > 0 && (
                    <div className="rounded-xl border border-border-light bg-surface-primary p-5">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {reviewDisplay.assessment_label ?? 'AI Assessment'}
                      </p>
                      <div className="space-y-2">
                        {reviewDisplay.score_field && roFields[reviewDisplay.score_field] && roFields[reviewDisplay.score_field] !== '—' && (
                          <p className="text-sm font-semibold text-text-primary">
                            Fit Score: {roFields[reviewDisplay.score_field]}/10
                          </p>
                        )}
                        {reviewDisplay.assessment_fields!
                          .filter((key) => key !== reviewDisplay.score_field)
                          .map((key, idx) => {
                            const value = roFields[key];
                            if (!value || value === '—') return null;
                            return (
                              <p key={key} className={`text-sm ${idx === 0 ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>
                                {value}
                              </p>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Row 2: Tag groups (spec-driven) */}
                {(reviewDisplay.tag_groups?.length ?? 0) > 0 && (() => {
                  const activeGroups = reviewDisplay.tag_groups!.filter(
                    (g) => splitDots(roFields[g.field] ?? '').length > 0,
                  );
                  if (!activeGroups.length) return null;
                  return (
                    <div className="flex gap-4">
                      {activeGroups.map((group) => {
                        const items = splitDots(roFields[group.field] ?? '');
                        const cls = TAG_COLOR_CLASSES[group.color] ?? TAG_COLOR_CLASSES.gray;
                        return (
                          <div key={group.field} className={`flex-1 rounded-xl border ${cls.border} ${cls.bg} p-4`}>
                            <p className={`mb-2.5 text-xs font-semibold uppercase tracking-wider ${cls.title}`}>
                              {group.label}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {items.map((item, i) => (
                                <span key={i} className={`rounded-full px-2.5 py-1 text-xs font-medium ${cls.chip}`}>{item}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Row 3: Decision */}
                <div className="rounded-xl border border-border-light bg-surface-primary p-5">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-secondary">Your Decision</p>
                  {aiRec && (
                    <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-700/40 dark:bg-amber-900/20">
                      <p className="flex-1 text-xs text-amber-800 dark:text-amber-300">
                        AI suggests: <span className="font-semibold">{aiRec.replace(/_/g, ' ')}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setResumeValues((p) => ({ ...p, final_recommendation: aiRec, priority: p['priority'] || 'medium' }))}
                        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300"
                      >
                        ✓ Accept
                      </button>
                    </div>
                  )}
                  <form id="review-gate-form" onSubmit={handleResume} className="space-y-5">
                    {reviewEditFields.find((f) => f.name === 'final_recommendation') && (
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                          Decision <span className="text-red-500">*</span>
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {REC_OPTS.map((opt) => {
                            const selected = resumeValues['final_recommendation'] === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setResumeValues((p) => ({ ...p, final_recommendation: opt.value }))}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                                  selected
                                    ? opt.active + ' ring-2 ring-current ring-offset-1'
                                    : 'border-border-light bg-surface-secondary text-text-secondary hover:border-border-medium hover:text-text-primary'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {reviewEditFields.find((f) => f.name === 'priority') && (
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-secondary">Priority</label>
                        <div className="flex gap-1.5">
                          {PRIORITY_OPTS.map((opt) => {
                            const selected = resumeValues['priority'] === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setResumeValues((p) => ({ ...p, priority: opt.value }))}
                                className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all ${
                                  selected
                                    ? opt.active + ' ring-1 ring-current'
                                    : 'border-border-light bg-surface-secondary text-text-secondary hover:text-text-primary'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {reviewEditFields.find((f) => f.name === 'recruiter_notes') && (
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-secondary">Your Notes</label>
                        <textarea
                          rows={3}
                          className="w-full resize-none rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                          placeholder="Add observations, context, or override the AI recommendation…"
                          value={resumeValues['recruiter_notes'] ?? ''}
                          onChange={(e) => setResumeValues((p) => ({ ...p, recruiter_notes: e.target.value }))}
                        />
                      </div>
                    )}
                    {reviewEditFields
                      .filter((f) => !['final_recommendation', 'priority', 'recruiter_notes'].includes(f.name))
                      .map((f) => (
                        <div key={f.name}>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                            {f.label}
                            {f.required && <span className="ml-1 text-red-500">*</span>}
                          </label>
                          {f.type === 'select' ? (
                            <select
                              className="w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                              value={resumeValues[f.name] ?? ''}
                              onChange={(e) => setResumeValues((p) => ({ ...p, [f.name]: e.target.value }))}
                            >
                              {(f.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <input
                              type="text"
                              className="w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                              value={resumeValues[f.name] ?? ''}
                              onChange={(e) => setResumeValues((p) => ({ ...p, [f.name]: e.target.value }))}
                              placeholder={f.placeholder}
                            />
                          )}
                        </div>
                      ))}
                    {resumeError && (
                      <p className="text-xs text-red-500">{resumeError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={resuming || !resumeValues['final_recommendation']}
                      title="⌘+Enter"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resuming ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" className="opacity-20" />
                            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Submitting…
                        </>
                      ) : (
                        <>
                          Submit Decision
                          <kbd className="ml-1 rounded bg-amber-400/60 px-1.5 py-0.5 text-xs font-normal">⌘↵</kbd>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {specOutput && (
                  <ReportOutput output={specOutput} completedSteps={done} inputs={run.inputs ?? {}} />
                )}
                {run.pending_prompt && (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">AI Assessment</p>
                    <div className="rounded-2xl border border-border-light bg-surface-primary p-5">
                      <PendingPromptView raw={run.pending_prompt} />
                    </div>
                  </div>
                )}
                {reviewEditFields.length > 0 && (
                  <div className="rounded-xl border border-border-light bg-surface-primary p-5">
                    <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-secondary">Your Decision</p>
                    <form id="review-gate-form" onSubmit={handleResume} className="space-y-4">
                      {reviewEditFields.map((f) => (
                        <div key={f.name}>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                            {f.label}
                            {f.required && <span className="ml-1 text-red-500">*</span>}
                          </label>
                          {f.type === 'select' ? (
                            <select
                              className="w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                              value={resumeValues[f.name] ?? ''}
                              onChange={(e) => setResumeValues((p) => ({ ...p, [f.name]: e.target.value }))}
                            >
                              {(f.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <input
                              type="text"
                              className="w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                              value={resumeValues[f.name] ?? ''}
                              onChange={(e) => setResumeValues((p) => ({ ...p, [f.name]: e.target.value }))}
                              placeholder={f.placeholder}
                            />
                          )}
                        </div>
                      ))}
                      {resumeError && <p className="text-xs text-red-500">{resumeError}</p>}
                      <button
                        type="submit"
                        disabled={resuming}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {resuming ? 'Submitting…' : 'Submit'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Failed */}
        {run.status === 'failed' && (
          <div className="p-6 lg:p-8">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {run.error_message ?? 'The run failed without an error message.'}
            </div>
          </div>
        )}

        {/* Completed */}
        {run.status === 'completed' && (
          <div className="flex-1 overflow-y-auto p-5 lg:p-7">
            {/* Completion banner */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-700/40 dark:bg-green-900/20">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-800/40">
                <svg className="h-4 w-4 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  {workflow?.name ?? 'Workflow'} complete
                </p>
                {run.completed_at && (
                  <p className="text-xs text-green-700 dark:text-green-400">
                    {new Date(run.completed_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {reviewDisplay && reviewAllFields.length > 0 ? (
              <div className="space-y-4">
                {/* Row 1: Profile + AI Assessment */}
                <div className="grid grid-cols-2 gap-4">
                  {(reviewDisplay.profile_fields?.length ?? 0) > 0 && (
                    <div className="rounded-xl border border-border-light bg-surface-primary p-5">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {reviewDisplay.profile_label ?? 'Details'}
                      </p>
                      <div className="space-y-3">
                        {reviewDisplay.profile_fields!.map((key) => {
                          const value = roFields[key] && roFields[key] !== '—'
                            ? roFields[key]
                            : String(run.inputs?.[key] ?? '');
                          return value ? (
                            <div key={key}>
                              <p className="text-xs text-text-tertiary">{fieldLabel(key)}</p>
                              <p className="mt-0.5 text-sm font-medium text-text-primary">{value}</p>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                  {(reviewDisplay.assessment_fields?.length ?? 0) > 0 && (
                    <div className="rounded-xl border border-border-light bg-surface-primary p-5">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {reviewDisplay.assessment_label ?? 'AI Assessment'}
                      </p>
                      <div className="space-y-2">
                        {reviewDisplay.score_field && roFields[reviewDisplay.score_field] && roFields[reviewDisplay.score_field] !== '—' && (
                          <p className="text-sm font-semibold text-text-primary">
                            Fit Score: {roFields[reviewDisplay.score_field]}/10
                          </p>
                        )}
                        {reviewDisplay.assessment_fields!
                          .filter((key) => key !== reviewDisplay.score_field)
                          .map((key, idx) => {
                            const value = roFields[key];
                            if (!value || value === '—') return null;
                            return (
                              <p key={key} className={`text-sm ${idx === 0 ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>
                                {value}
                              </p>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Row 2: Tag groups */}
                {(reviewDisplay.tag_groups?.length ?? 0) > 0 && (() => {
                  const activeGroups = reviewDisplay.tag_groups!.filter(
                    (g) => splitDots(roFields[g.field] ?? '').length > 0,
                  );
                  if (!activeGroups.length) return null;
                  return (
                    <div className="flex gap-4">
                      {activeGroups.map((group) => {
                        const items = splitDots(roFields[group.field] ?? '');
                        const cls = TAG_COLOR_CLASSES[group.color] ?? TAG_COLOR_CLASSES.gray;
                        return (
                          <div key={group.field} className={`flex-1 rounded-xl border ${cls.border} ${cls.bg} p-4`}>
                            <p className={`mb-2.5 text-xs font-semibold uppercase tracking-wider ${cls.title}`}>
                              {group.label}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {items.map((item, i) => (
                                <span key={i} className={`rounded-full px-2.5 py-1 text-xs font-medium ${cls.chip}`}>{item}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Row 3: Decision made (read-only) */}
                {(() => {
                  const outputs = run.outputs as Record<string, unknown> | null;
                  const rec = outputs?.['final_recommendation'] as string | undefined;
                  const priority = outputs?.['priority'] as string | undefined;
                  const notes = outputs?.['recruiter_notes'] as string | undefined;
                  if (!rec && !priority && !notes) return null;
                  return (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-5 dark:border-green-800/40 dark:bg-green-900/10">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-400">
                        Decision Submitted
                      </p>
                      <div className="space-y-3">
                        {rec && (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-text-secondary w-20 shrink-0">Decision</span>
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-800/30 dark:text-green-300">
                              {REC_LABELS[rec] ?? rec.replace(/_/g, ' ')}
                            </span>
                          </div>
                        )}
                        {priority && (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-text-secondary w-20 shrink-0">Priority</span>
                            <span className="text-sm font-medium text-text-primary capitalize">{priority}</span>
                          </div>
                        )}
                        {notes && (
                          <div>
                            <span className="text-xs text-text-secondary">Notes</span>
                            <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap">{notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : specOutput ? (
              <ReportOutput output={specOutput} completedSteps={done} inputs={run.inputs ?? {}} />
            ) : run.outputs && Object.keys(run.outputs).some((k) => k !== '_completed_steps') ? (
              <ResultFallback outputs={run.outputs as Record<string, unknown>} />
            ) : null}
          </div>
        )}

        {/* Cancelled */}
        {run.status === 'cancelled' && (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-text-secondary">This run was cancelled.</p>
          </div>
        )}
      </div>
    </div>
  );
}
