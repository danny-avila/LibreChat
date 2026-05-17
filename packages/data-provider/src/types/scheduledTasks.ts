export type TScheduledTask = {
  _id: string;
  userId: string;
  targetType: 'agent' | 'assistant';
  targetId: string;
  triggerType: 'cron' | 'interval' | 'date';
  expression: string;
  payload: Record<string, unknown>;
  status: 'active' | 'paused' | 'completed' | 'failed';
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreateScheduledTask = Omit<TScheduledTask, '_id' | 'userId' | 'createdAt' | 'updatedAt' | 'lastRunAt'>;
export type TUpdateScheduledTask = Partial<TCreateScheduledTask> & { status?: TScheduledTask['status'] };
