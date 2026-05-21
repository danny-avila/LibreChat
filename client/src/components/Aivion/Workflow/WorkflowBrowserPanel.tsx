import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import { cn } from '~/utils';
import type { RunStatus, WorkflowStep } from './types';

type WfSummary = { id: string; name: string; icon?: string; category?: string };
type RunSummary = {
  id: string;
  workflow_id: string;
  status: RunStatus;
  inputs: Record<string, unknown>;
  created_at: string;
  pending_step_id?: string | null;
  outputs?: Record<string, unknown> | null;
};

const STEP_BADGE: Record<string, string> = {
  llm: 'AI',
  file_extract: 'Extract',
  user_input: 'Review Gate',
  integration: 'Integration',
  loop: 'Loop',
  template: 'Template',
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
  awaiting_user: 'Awaiting Review',
  awaiting_oauth: 'Needs Reconnect',
  completed: 'Completed',
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
  for (const key of ['role_title', 'title', 'name', 'query', 'subject']) {
    const v = run.inputs?.[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return `Run ${run.id.slice(0, 6)}`;
}

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WorkflowBrowserPanel() {
  const { token } = useAuthContext();
  const navigate = useNavigate();
  const { id: activeWorkflowId, runId: activeRunId } = useParams<{ id?: string; runId?: string }>();

  const [workflows, setWorkflows] = useState<WfSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentRun, setCurrentRun] = useState<RunSummary | null>(null);
  const [wfSteps, setWfSteps] = useState<WorkflowStep[]>([]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      fetch('/api/aivion/workflow/workflows', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : [])),
      fetch('/api/aivion/workflow/runs?limit=20', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([wfs, rs]) => { setWorkflows(wfs); setRuns(rs); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token]);

  // When on a run page, resolve the run — from cache or a targeted fetch
  useEffect(() => {
    if (!activeRunId || !token) { setCurrentRun(null); return; }
    const cached = runs.find((r) => r.id === activeRunId);
    if (cached) { setCurrentRun(cached); return; }
    fetch(`/api/aivion/workflow/runs/${activeRunId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setCurrentRun(data))
      .catch(() => null);
  }, [activeRunId, runs, token]);

  // Poll run status when it's in a transient state so the panel doesn't stay stale
  useEffect(() => {
    if (!activeRunId || !token || !currentRun) return;
    const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
    if (TERMINAL.has(currentRun.status)) return;
    const id = setInterval(() => {
      fetch(`/api/aivion/workflow/runs/${activeRunId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (data) setCurrentRun(data); })
        .catch(() => null);
    }, 4000);
    return () => clearInterval(id);
  }, [activeRunId, token, currentRun?.status]);

  // Fetch workflow steps when entering a run page
  useEffect(() => {
    if (!activeWorkflowId || !token) { setWfSteps([]); return; }
    fetch(`/api/aivion/workflow/workflows/${activeWorkflowId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((wf) => {
        const steps: WorkflowStep[] = (wf?.spec?.steps ?? []).filter(
          (s: WorkflowStep) => s.type !== 'scrub' && s.type !== 'unscrub',
        );
        setWfSteps(steps);
      })
      .catch(() => null);
  }, [activeWorkflowId, token]);

  const recentRuns = useMemo(() => {
    if (!activeWorkflowId) return runs.slice(0, 10);
    const wfRuns = runs.filter((r) => r.workflow_id === activeWorkflowId);
    return wfRuns.length > 0 ? wfRuns.slice(0, 10) : runs.slice(0, 10);
  }, [runs, activeWorkflowId]);

  const activeWf = workflows.find((w) => w.id === activeWorkflowId);

  // ── Run context panel (shown when on a specific run page) ────────────────────
  if (activeRunId) {
    const inputEntries = Object.entries(currentRun?.inputs ?? {})
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      .filter(([, v]) => String(v).length > 0 && String(v).length < 150)
      .slice(0, 6);

    return (
      <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border-light bg-surface-primary-alt">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3">
          <button
            type="button"
            onClick={() => navigate(activeWorkflowId ? `/workflow/${activeWorkflowId}` : '/workflow')}
            className="flex items-center gap-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All Runs
          </button>
        </div>

        {/* Workflow label */}
        {activeWf && (
          <div className="flex items-center gap-2 px-3 pb-2">
            <span className="text-base leading-none" aria-hidden>{activeWf.icon ?? '⚡'}</span>
            <span className="truncate text-sm font-semibold text-text-primary">{activeWf.name}</span>
          </div>
        )}

        {/* Run status */}
        {currentRun && (
          <div className="mx-3 mb-3 rounded-lg border border-border-light bg-surface-primary p-3">
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[currentRun.status] ?? 'bg-surface-tertiary')} />
              <span className="text-xs font-medium text-text-primary">{STATUS_LABEL[currentRun.status]}</span>
            </div>
            <p className="mt-1 text-[10px] text-text-secondary">{relativeTime(currentRun.created_at)}</p>
          </div>
        )}

        {/* Pipeline steps when running/pending; inputs otherwise */}
        {(currentRun?.status === 'running' || currentRun?.status === 'pending') && wfSteps.length > 0 ? (
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
              Pipeline · {wfSteps.length} steps
            </p>
            <ol className="space-y-0">
              {wfSteps.map((step, i) => {
                const completedKeys = Object.keys(
                  (currentRun?.outputs?.['_completed_steps'] as Record<string, unknown>) ?? {},
                );
                const isDone = completedKeys.includes(step.id);
                const isRunning = !isDone && currentRun?.pending_step_id === step.id;
                const state = isDone ? 'done' : isRunning ? 'running' : 'pending';
                return (
                  <li key={step.id} className="flex gap-2">
                    <div className="flex w-5 shrink-0 flex-col items-center">
                      <div className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-bold transition-colors',
                        state === 'done' ? 'border-green-500 bg-green-500 text-white' :
                        state === 'running' ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30' :
                        'border-border-light bg-surface-primary text-text-tertiary',
                      )}>
                        {state === 'done' ? '✓' :
                         state === 'running' ? <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" /> :
                         i + 1}
                      </div>
                      {i < wfSteps.length - 1 && (
                        <div className={cn('my-0.5 w-px flex-1', isDone ? 'bg-green-300 dark:bg-green-700' : 'bg-border-light')} style={{ minHeight: 8 }} />
                      )}
                    </div>
                    <div className={i < wfSteps.length - 1 ? 'pb-2.5' : ''}>
                      <p className={cn(
                        'text-[10px] font-bold uppercase tracking-wider',
                        state === 'running' ? 'text-blue-600 dark:text-blue-400' :
                        state === 'done' ? 'text-green-600 dark:text-green-400' :
                        'text-text-tertiary',
                      )}>
                        {STEP_BADGE[step.type] ?? step.type}
                      </p>
                      <p className={cn(
                        'text-xs leading-tight',
                        state === 'running' ? 'font-semibold text-text-primary' :
                        state === 'done' ? 'text-text-tertiary' :
                        'text-text-secondary',
                      )}>
                        {step.label ?? step.id.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : inputEntries.length > 0 ? (
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Inputs</p>
            <div className="space-y-2.5">
              {inputEntries.map(([key, value]) => (
                <div key={key}>
                  <p className="text-[10px] text-text-tertiary">{formatKey(key)}</p>
                  <p className="mt-0.5 text-xs font-medium text-text-primary leading-snug">{String(value)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* New Run */}
        {activeWorkflowId && (
          <div className="mt-auto border-t border-border-light p-2">
            <Link
              to={`/workflow/${activeWorkflowId}`}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              New Run
            </Link>
          </div>
        )}
      </aside>
    );
  }

  // ── Runs list panel (shown on /workflow and /workflow/:id) ───────────────────
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border-light bg-surface-primary-alt">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {activeWf ? activeWf.name : 'Workflows'}
        </span>
        <Link
          to="/workflow"
          className="rounded p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          title="Browse all workflows"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent text-text-secondary" />
          </div>
        ) : recentRuns.length === 0 ? (
          <p className="px-3 py-4 text-xs text-text-secondary">No runs yet.</p>
        ) : (
          <>
            <div className="px-3 py-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                {activeWf ? `${activeWf.name} Runs` : 'Recent Runs'}
              </p>
            </div>
            <ul className="space-y-0.5 px-2 pb-3">
              {recentRuns.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/workflow/${run.workflow_id}/runs/${run.id}`)}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  >
                    <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[run.status] ?? 'bg-surface-tertiary')} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium leading-tight">{runTitle(run)}</p>
                      <p className="text-[10px] text-text-secondary">{relativeTime(run.created_at)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {activeWorkflowId && (
        <div className="mt-auto border-t border-border-light p-2">
          <Link
            to={`/workflow/${activeWorkflowId}`}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New Run
          </Link>
        </div>
      )}
    </aside>
  );
}
