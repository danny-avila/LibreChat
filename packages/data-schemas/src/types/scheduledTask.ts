import type { Document } from 'mongoose';

export interface IScheduledTask extends Document {
  userId: string;
  targetType: 'agent' | 'assistant';
  targetId: string;
  triggerType: 'cron' | 'interval' | 'date';
  expression: string;
  /**
   * IANA timezone identifier (e.g. "America/New_York", "Asia/Kolkata").
   * - cron: schedule fires according to wall-clock time in this zone (incl. DST).
   * - date: parsed in this zone when the expression has no offset.
   * - interval: ignored (intervals are wall-clock-independent).
   * Defaults to UTC when not set.
   */
  timezone?: string;
  payload: Record<string, unknown>;
  status: 'active' | 'paused' | 'completed' | 'failed';
  lastRunAt?: Date;
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}
