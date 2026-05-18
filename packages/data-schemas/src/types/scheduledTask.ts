import type { Document } from 'mongoose';

export interface IScheduledTask extends Document {
  userId: string;
  /** User-supplied display name (1-120 chars). Surfaced in the side-panel
   * list and Task Runs modal so authors can distinguish multiple tasks. */
  name: string;
  /** Can be extended to other target types in the future. */
  targetType: 'model';
  /** Mirror of `payload.model`, kept as a top-level field for indexed lookups. */
  targetId: string;
  /** Can be extended to other trigger types in the future. */
  triggerType: 'cron';
  /** Cron expression (e.g. "0 0 * * *" for daily at midnight). */
  expression: string;
  /**
   * IANA timezone identifier (e.g. "America/New_York", "Asia/Kolkata"). The
   * schedule fires according to wall-clock time in this zone (DST-aware).
   * Defaults to UTC when not set.
   */
  timezone?: string;
  /** Payload stored alongside a scheduled task. The provider key (`endpoint`)
   * and model identifier (`model`) live here so the job processor can construct
   * an ephemeral-agent run without a separate target collection. */
  payload: Record<string, unknown>;

  status: 'active' | 'paused' | 'completed' | 'failed';
  lastRunAt?: Date;
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}
