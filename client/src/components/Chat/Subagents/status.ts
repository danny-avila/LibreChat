import { AlertCircle, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import type { SubagentThreadStatus } from 'librechat-data-provider';

/** Only abnormal endings earn a status chip — main chat conveys an in-flight
 *  run through its streaming content and cursor, never a "running" label. */
export const isAbnormalTerminalStatus = (status: SubagentThreadStatus): boolean =>
  status === 'failed' || status === 'interrupted' || status === 'cancelled';

export const subagentStatusIcon = (status: SubagentThreadStatus) => {
  if (status === 'completed') return CheckCircle2;
  if (status === 'failed' || status === 'interrupted') return AlertCircle;
  if (status === 'cancelled') return XCircle;
  return Clock3;
};

export const subagentStatusLabelKey = (status: SubagentThreadStatus) =>
  (
    ({
      dispatched: 'com_ui_subagent_thread_status_dispatched',
      running: 'com_ui_subagent_thread_status_running',
      completed: 'com_ui_subagent_thread_status_completed',
      failed: 'com_ui_subagent_thread_status_failed',
      interrupted: 'com_ui_subagent_thread_status_interrupted',
      cancelled: 'com_ui_subagent_thread_status_cancelled',
    }) as const
  )[status];

/** Fixed-size status dot classes: a stable-width indicator that cannot make
 *  rows shift as status text changes length. */
export const subagentStatusDotClass = (status: SubagentThreadStatus): string => {
  if (status === 'completed') return 'bg-status-success';
  if (status === 'running') return 'animate-pulse bg-status-info';
  if (status === 'failed' || status === 'interrupted') return 'bg-status-error';
  if (status === 'cancelled') return 'bg-status-warning';
  return 'bg-text-tertiary';
};
