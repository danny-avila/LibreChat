import { useEffect, useState, useMemo, memo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ClipboardList } from 'lucide-react';
import { useAuthContext, useLocalStorage } from '~/hooks';
import { cn } from '~/utils';
import type { RunStatus, WorkflowStep } from './types';

type PipelineStep = WorkflowStep;
type PipelineRunState = {
  status: RunStatus;
  pending_step_id: string | null;
  completed_steps: Record<string, unknown>;
};
type PipelineData = {
  run: PipelineRunState;
  steps: PipelineStep[];
  workflowName: string;
  workflowId: string;
};

type StepState = 'completed' | 'running' | 'awaiting' | 'pending';

function toStepLabel(id: string): string {
  return id.replace(/_ref$/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveSteps(run: PipelineRunState, specSteps: PipelineStep[]): PipelineStep[] {
  if (specSteps.length > 0) return specSteps;
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of Object.keys(run.completed_steps)) {
    if (!seen.has(id)) { seen.add(id); ordered.push(id); }
  }
  if (run.pending_step_id && !seen.has(run.pending_step_id)) {
    seen.add(run.pending_step_id);
    ordered.push(run.pending_step_id);
  }
  return ordered.map((id) => ({ id, type: 'llm' as const, label: toStepLabel(id) }));
}

function getPipelineStepState(step: PipelineStep, run: PipelineRunState): StepState {
  if (step.id in run.completed_steps) return 'completed';
  if (run.pending_step_id === step.id) {
    return run.status === 'awaiting_user' || run.status === 'awaiting_oauth' ? 'awaiting' : 'running';
  }
  return 'pending';
}

function PipelineStepIcon({ state }: { state: StepState }) {
  if (state === 'completed') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <svg className="h-4 w-4 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </span>
    );
  }
  if (state === 'running') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20">
        <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
        </svg>
      </span>
    );
  }
  if (state === 'awaiting') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/20">
        <svg className="h-3 w-3 text-purple-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-border-light dark:border-gray-700" />
  );
}

const PIPELINE_STATUS_BADGE: Record<RunStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  awaiting_user: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  awaiting_oauth: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'text-text-secondary bg-surface-secondary',
};

const PIPELINE_STATUS_LABEL: Record<RunStatus, string> = {
  pending: 'Queued',
  running: 'Running',
  awaiting_user: 'Awaiting Review',
  awaiting_oauth: 'Needs Reconnect',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

type RunSummary = {
  id: string;
  workflow_id: string;
  status: RunStatus;
  inputs: Record<string, unknown>;
  created_at: string;
};

const STATUS_DOT: Record<RunStatus, string> = {
  pending: 'bg-amber-400',
  running: 'bg-blue-400 animate-pulse',
  awaiting_user: 'bg-purple-400 animate-pulse',
  awaiting_oauth: 'bg-red-400',
  completed: 'bg-green-400',
  failed: 'bg-red-400',
  cancelled: 'bg-surface-tertiary',
};

const STATUS_LABEL: Record<RunStatus, string> = {
  pending: 'Queued',
  running: 'Running',
  awaiting_user: 'Waiting',
  awaiting_oauth: 'Needs reconnect',
  completed: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function runTitle(run: RunSummary): string {
  const inputs = run.inputs ?? {};
  for (const key of ['role_title', 'title', 'name', 'query', 'topic', 'subject']) {
    const v = inputs[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return `Run ${run.id.slice(0, 8)}`;
}

type DateGroup = { label: string; runs: RunSummary[] };

function groupRunsByDate(runs: RunSummary[]): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86_400_000;
  const sevenDaysAgo = today - 7 * 86_400_000;
  const thirtyDaysAgo = today - 30 * 86_400_000;

  const buckets: Record<string, RunSummary[]> = {};
  const ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days'];

  for (const run of runs) {
    const ts = new Date(run.created_at).getTime();
    let label: string;
    if (ts >= today) label = 'Today';
    else if (ts >= yesterday) label = 'Yesterday';
    else if (ts >= sevenDaysAgo) label = 'Previous 7 days';
    else if (ts >= thirtyDaysAgo) label = 'Previous 30 days';
    else {
      const d = new Date(run.created_at);
      label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    (buckets[label] ??= []).push(run);
  }

  const result: DateGroup[] = [];
  for (const label of ORDER) {
    if (buckets[label]) result.push({ label, runs: buckets[label] });
  }
  for (const [label, r] of Object.entries(buckets)) {
    if (!ORDER.includes(label)) result.push({ label, runs: r });
  }
  return result;
}

const RunRow = memo(function RunRow({
  run,
  isActive,
}: {
  run: RunSummary;
  isActive: boolean;
}) {
  return (
    <Link
      to={`/workflow/${run.workflow_id}/runs/${run.id}`}
      className={cn(
        'flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-hover',
        isActive && 'bg-surface-hover',
      )}
    >
      <span
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          STATUS_DOT[run.status] ?? 'bg-surface-tertiary',
        )}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight text-text-primary">
          {runTitle(run)}
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {STATUS_LABEL[run.status] ?? run.status} · {relativeTime(run.created_at)}
        </p>
      </div>
    </Link>
  );
});

export default function WorkflowRunsSection() {
  const { token } = useAuthContext();
  const navigate = useNavigate();
  const { runId } = useParams<{ runId?: string }>();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useLocalStorage('workflowRunsExpanded', true);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch('/api/aivion/workflow/runs?limit=50', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!runId || !token) {
      setPipeline(null);
      return;
    }
    fetch(`/api/aivion/workflow/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (run) => {
        if (!run) return;
        const wf = await fetch(`/api/aivion/workflow/workflows/${run.workflow_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => (r.ok ? r.json() : null));
        if (wf) {
          setPipeline({
            run: {
              status: run.status,
              pending_step_id: run.pending_step_id ?? null,
              completed_steps: (run.outputs?._completed_steps ?? {}) as Record<string, unknown>,
            },
            steps: (wf.spec?.steps ?? []) as PipelineStep[],
            workflowName: wf.name ?? 'Workflow',
            workflowId: run.workflow_id,
          });
        }
      })
      .catch(() => null);
  }, [runId, token]);

  // Keep pipeline run state in sync via SSE stream
  useEffect(() => {
    if (!runId || !token) return;
    const controller = new AbortController();

    async function connect() {
      try {
        const res = await fetch(`/api/aivion/workflow/runs/${runId}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';

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
                const data = JSON.parse(line.slice(6)) as {
                  status?: string;
                  pending_step_id?: string | null;
                  outputs?: { _completed_steps?: Record<string, unknown> };
                };
                setPipeline((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    run: {
                      status: (data.status ?? prev.run.status) as RunStatus,
                      pending_step_id:
                        data.pending_step_id !== undefined
                          ? data.pending_step_id
                          : prev.run.pending_step_id,
                      completed_steps:
                        data.outputs?._completed_steps ?? prev.run.completed_steps,
                    },
                  };
                });
                if (data.status) {
                  setRuns((prev) =>
                    prev.map((r) =>
                      r.id === runId ? { ...r, status: data.status as RunStatus } : r,
                    ),
                  );
                }
              } catch { /* skip malformed */ }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }

    void connect();
    return () => controller.abort();
  }, [runId, token]);

  const grouped = useMemo(() => groupRunsByDate(runs), [runs]);

  // ── Pipeline view (when viewing an active run) ────────────────────────────
  if (runId && pipeline) {
    const steps = deriveSteps(pipeline.run, pipeline.steps);
    const completedCount = steps.filter((s) => s.id in pipeline.run.completed_steps).length;
    const totalCount = steps.length || 1;
    const pct = steps.length === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden" role="region" aria-label="Pipeline steps">
        <div className="px-3 pb-1 pt-2">
          <button
            onClick={() => navigate('/workflow')}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            type="button"
          >
            <ClipboardList className="h-4 w-4 shrink-0" />
            <span>Browse Workflows</span>
          </button>
        </div>

        <div className="border-b border-border-light px-4 pb-4 pt-1">
          <Link
            to={`/workflow/${pipeline.workflowId}`}
            className="mb-2 flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {pipeline.workflowName}
          </Link>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', PIPELINE_STATUS_BADGE[pipeline.run.status])}>
            {PIPELINE_STATUS_LABEL[pipeline.run.status]}
          </span>
          {pipeline.steps.length > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-text-secondary">
                <span>{completedCount}/{totalCount} steps</span>
                <span>{pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
                <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {steps.length === 0 ? (
            <p className="px-2 text-xs text-text-secondary">Waiting to start…</p>
          ) : (
            <ul className="space-y-1">
              {steps.map((step) => {
                const state = getPipelineStepState(step, pipeline.run);
                const isActive = state === 'running' || state === 'awaiting';
                return (
                  <li
                    key={step.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl px-3 py-2.5',
                      isActive ? 'bg-surface-hover' : '',
                    )}
                  >
                    <div className="mt-0.5">
                      <PipelineStepIcon state={state} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn(
                        'text-sm font-medium leading-tight',
                        state === 'completed' ? 'text-text-primary' :
                        state === 'awaiting' ? 'text-purple-700 dark:text-purple-400' :
                        state === 'running' ? 'text-text-primary' :
                        'text-text-secondary',
                      )}>
                        {step.label ?? step.id}
                      </p>
                      {state === 'running' && (
                        <p className="mt-0.5 text-xs text-blue-500">Processing…</p>
                      )}
                      {state === 'awaiting' && (
                        <p className="mt-0.5 text-xs text-purple-600 dark:text-purple-400">Your input needed</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ── Default: recent runs list ─────────────────────────────────────────────
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden pb-3"
      role="region"
      aria-label="Workflow runs"
    >
      <div className="px-3 pb-1 pt-2">
        <button
          onClick={() => navigate('/workflow')}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          type="button"
        >
          <ClipboardList className="h-4 w-4 shrink-0" />
          <span>Browse Workflows</span>
        </button>
      </div>

      <div className="px-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="group flex w-full items-center justify-between rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
          type="button"
        >
          <span className="select-none">Recent Runs</span>
          <ChevronDown
            className={cn(
              'h-3 w-3 transition-transform duration-200',
              isExpanded ? 'rotate-180' : '',
            )}
          />
        </button>
      </div>

      {isExpanded && (
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent text-text-secondary" />
            </div>
          )}

          {!loading && runs.length === 0 && (
            <p className="px-4 text-xs text-text-secondary">No runs yet.</p>
          )}

          {!loading &&
            grouped.map(({ label, runs: groupRuns }, gi) => (
              <div key={label}>
                <h2
                  className={cn(
                    'px-4 pt-1 text-text-secondary',
                    gi === 0 ? 'mt-0' : 'mt-2',
                  )}
                  style={{ fontSize: '0.7rem' }}
                >
                  {label}
                </h2>
                {groupRuns.map((run) => (
                  <RunRow key={run.id} run={run} isActive={run.id === runId} />
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
