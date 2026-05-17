import type { TEphemeralAgent, TEndpointOption } from '../types';

/**
 * Payload stored alongside a scheduled task. For `targetType: 'model'` runs we
 * persist the provider key (`endpoint`) and model identifier (`model`) here so
 * the job processor can construct an ephemeral agent run without needing a
 * separate target collection.
 */
export type TScheduledTaskPayload = {
  text?: string;
  isTemporary?: boolean;
  endpoint?: string;
  model?: string;
  endpointOption?: TEndpointOption;
  ephemeralAgent?: TEphemeralAgent;
};

export type TScheduledTask = {
  _id: string;
  userId: string;
  targetType: 'agent' | 'assistant' | 'model';
  targetId: string;
  triggerType: 'cron' | 'interval' | 'date';
  expression: string;
  /** IANA timezone identifier (e.g. "America/New_York"). Defaults to UTC server-side. */
  timezone?: string;
  payload: TScheduledTaskPayload;
  status: 'active' | 'paused' | 'completed' | 'failed';
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreateScheduledTask = Omit<TScheduledTask, '_id' | 'userId' | 'createdAt' | 'updatedAt' | 'lastRunAt'>;
export type TUpdateScheduledTask = Partial<TCreateScheduledTask> & { status?: TScheduledTask['status'] };
