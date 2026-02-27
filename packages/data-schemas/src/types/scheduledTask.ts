import { Document, Types } from 'mongoose';

export type ScheduledTaskRunStatus = 'running' | 'success' | 'failure';
export type ScheduledTaskLastStatus = ScheduledTaskRunStatus | null;

export interface IScheduledTask extends Document {
  id: string;
  user: Types.ObjectId;
  agentId: string;
  name: string;
  description?: string;
  prompt: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  lastRunAt?: Date | null;
  nextRunAt?: Date | null;
  lastRunStatus?: ScheduledTaskLastStatus;
  lastRunId?: Types.ObjectId | null;
  lockedAt?: Date | null;
  lockExpiresAt?: Date | null;
}

export interface IScheduledTaskRun extends Document {
  taskId: string;
  user: Types.ObjectId;
  agentId: string;
  startedAt: Date;
  finishedAt?: Date | null;
  status: ScheduledTaskRunStatus;
  conversationId?: string | null;
  errorType?: string | null;
  errorMessage?: string | null;
  errorDetails?: Record<string, unknown> | null;
}
