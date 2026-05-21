import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import type { Workflow } from './types';

const STEP_BADGE: Record<string, string> = {
  llm: 'AI',
  file_extract: 'Extract',
  user_input: 'Review Gate',
  integration: 'Integration',
  loop: 'Loop',
  template: 'Template',
};

function visibleSteps(workflow: Workflow) {
  return (workflow.spec.steps ?? []).filter(
    (s) => s.type !== 'scrub' && s.type !== 'unscrub',
  );
}

export default function WorkflowList() {
  const navigate = useNavigate();
  const { token } = useAuthContext();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/aivion/workflow/workflows', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(setWorkflows)
      .catch(() => setError('Could not load workflows.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary text-sm">
        {error}
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-base font-semibold text-text-primary">No workflows assigned</p>
        <p className="text-sm text-text-secondary">Contact your administrator to get access to workflows.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold text-text-primary">Workflows</h1>
      <p className="mb-8 text-sm text-text-secondary">Select a workflow to run it.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {workflows.map((wf) => {
          const steps = visibleSteps(wf);
          const notRunnable = wf.is_runnable === false;
          return (
            <button
              key={wf.id}
              onClick={() => navigate(`/workflow/${wf.id}`)}
              className={`group flex flex-col gap-3 rounded-xl border bg-surface-primary p-5 text-left transition-colors hover:bg-surface-hover ${
                notRunnable
                  ? 'border-amber-200 dark:border-amber-700/40'
                  : 'border-border-light hover:border-border-medium'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                {wf.category && (
                  <span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs text-text-secondary">
                    {wf.category}
                  </span>
                )}
              </div>

              <div>
                <p className="font-semibold text-text-primary">{wf.name}</p>
                {wf.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{wf.description}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {steps.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  >
                    {STEP_BADGE[s.type] ?? s.type}
                  </span>
                ))}
                {notRunnable && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    ⚠ Connect required
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {workflows.some((w) => w.is_runnable === false) && (
        <div className="mt-6 flex items-center gap-2 text-sm text-text-secondary">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="shrink-0 text-amber-500" aria-hidden>
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          Some workflows need service connections.{' '}
          <Link to="/connections" className="font-medium text-amber-600 hover:underline">
            Manage connections →
          </Link>
        </div>
      )}
    </div>
  );
}
