import type { Document } from 'mongoose';

export interface IScheduledTask extends Document {
  userId: string;
  /** User-supplied display name (1-120 chars). Surfaced in the side-panel
   * list and Task Runs modal so authors can distinguish multiple tasks. */
  name: string;
  targetType: 'model';
  /** Mirror of `payload.model`, kept as a top-level field for indexed lookups. */
  targetId: string;
  triggerType: 'cron';
  expression: string;
  /**
   * IANA timezone identifier (e.g. "America/New_York", "Asia/Kolkata"). The
   * schedule fires according to wall-clock time in this zone (DST-aware).
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
