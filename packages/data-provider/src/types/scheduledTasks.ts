import type { TEphemeralAgent, TEndpointOption } from '../types';

export type TScheduledTaskPayload = {
  text?: string;
  isTemporary?: boolean;
  endpointOption?: TEndpointOption;
  ephemeralAgent?: TEphemeralAgent;
};

export type TScheduledTask = {
  _id: string;
  userId: string;
  targetType: 'agent' | 'assistant';
  targetId: string;
  triggerType: 'cron' | 'interval' | 'date';
  expression: string;
  payload: TScheduledTaskPayload;
  status: 'active' | 'paused' | 'completed' | 'failed';
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreateScheduledTask = Omit<TScheduledTask, '_id' | 'userId' | 'createdAt' | 'updatedAt' | 'lastRunAt'>;
export type TUpdateScheduledTask = Partial<TCreateScheduledTask> & { status?: TScheduledTask['status'] };
