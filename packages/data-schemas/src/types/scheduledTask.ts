import type { Document } from 'mongoose';

export interface IScheduledTask extends Document {
  userId: string;
  targetType: 'agent' | 'assistant';
  targetId: string;
  triggerType: 'cron' | 'interval' | 'date';
  expression: string;
  payload: Record<string, unknown>;
  status: 'active' | 'paused' | 'completed' | 'failed';
  lastRunAt?: Date;
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}
