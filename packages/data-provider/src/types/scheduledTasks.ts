export type ScheduledTaskStatus = 'active' | 'paused' | 'error';
export type ScheduledTaskRunStatus = 'running' | 'success' | 'failure';

export type ScheduledTask = {
  id: string;
  agentId: string;
  name: string;
  description?: string | null;
  prompt: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  status: ScheduledTaskStatus;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  lastRunStatus?: ScheduledTaskRunStatus | null;
  lastRunId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ScheduledTaskRun = {
  id: string;
  taskId: string;
  agentId: string;
  startedAt: string;
  finishedAt?: string | null;
  status: ScheduledTaskRunStatus;
  conversationId?: string | null;
  errorType?: string | null;
  errorMessage?: string | null;
  errorDetails?: Record<string, unknown> | null;
};

export type ScheduledTaskCreateParams = {
  agentId: string;
  name: string;
  description?: string | null;
  prompt: string;
  cron: string;
  timezone: string;
  enabled?: boolean;
};

export type ScheduledTaskUpdateParams = {
  agentId?: string;
  name?: string;
  description?: string | null;
  prompt?: string;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
};

export type ScheduledTaskListResponse = {
  data: ScheduledTask[];
};

export type ScheduledTaskRunsResponse = {
  data: ScheduledTaskRun[];
};
