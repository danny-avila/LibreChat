import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import type { RunStatus } from './types';

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
  // Try common meaningful input fields
  for (const key of ['role_title', 'title', 'name', 'query', 'topic', 'subject']) {
    const v = inputs[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return `Run ${run.id.slice(0, 8)}`;
}

export default function WorkflowSidebar() {
  const { token } = useAuthContext();
  const { runId } = useParams<{ id?: string; runId?: string }>();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch('/api/aivion/workflow/runs?limit=30', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-border-light bg-surface-primary">
      <div className="px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Recent runs
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent text-text-secondary" />
          </div>
        )}

        {!loading && runs.length === 0 && (
          <p className="px-4 text-xs text-text-secondary">No runs yet.</p>
        )}

        {!loading && runs.map((run) => {
          const isActive = run.id === runId;
          return (
            <Link
              key={run.id}
              to={`/workflow/${run.workflow_id}/runs/${run.id}`}
              className={`flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-surface-hover ${
                isActive ? 'bg-surface-hover' : ''
              }`}
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[run.status as RunStatus] ?? 'bg-surface-tertiary'}`}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary leading-tight">
                  {runTitle(run)}
                </p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {STATUS_LABEL[run.status as RunStatus] ?? run.status} · {relativeTime(run.created_at)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
