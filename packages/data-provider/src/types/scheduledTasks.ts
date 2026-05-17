import type { TEphemeralAgent, TEndpointOption } from '../types';

/**
 * Payload stored alongside a scheduled task. The provider key (`endpoint`)
 * and model identifier (`model`) live here so the job processor can construct
 * an ephemeral-agent run without a separate target collection.
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
  /** User-supplied display name (1-120 chars). */
  name: string;
  targetType: 'model';
  targetId: string;
  triggerType: 'cron';
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
