export type BackgroundTaskStatus = 'running' | 'completed' | 'error' | 'cancelled';

/**
 * Public projection of one ordinary background tool task. Results, artifacts
 * and errors stay server-side; the list carries identity, status and timing.
 */
export type BackgroundTaskSummary = {
  taskId: string;
  toolName: string;
  toolCallId: string;
  messageId?: string;
  status: BackgroundTaskStatus;
  cancellationRequested: boolean;
  /** ISO-8601 dispatch time. */
  startedAt: string;
  /** ISO-8601 terminal time. Absent while the task is running. */
  settledAt?: string;
};

export type BackgroundTaskIndex = {
  conversationId: string;
  tasks: BackgroundTaskSummary[];
  /** Whether the deployment accepts user cancellation of ordinary tools. */
  cancellable: boolean;
};

export type BackgroundTaskCancelRequest = {
  /** Tasks to cancel; omitted cancels every running task in the conversation. */
  taskIds?: string[];
};

export type BackgroundTaskCancelOutcome =
  | 'not_found'
  | 'unavailable'
  | 'requested'
  | 'already_requested'
  | 'settled';

export type BackgroundTaskCancelResponse = {
  results: Array<{ taskId: string; status: BackgroundTaskCancelOutcome }>;
};
