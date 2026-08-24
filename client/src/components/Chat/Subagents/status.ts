import { AlertCircle, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import type { SubagentThreadStatus } from 'librechat-data-provider';

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
