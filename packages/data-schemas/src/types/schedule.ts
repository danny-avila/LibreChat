import type {
  ScheduleRunStatus,
  ScheduleDisabledReason,
  TScheduleCadence,
} from 'librechat-data-provider';
import type { Document, Types } from 'mongoose';

export interface ISchedule {
  _id?: Types.ObjectId;
  id: string;
  user: Types.ObjectId;
  tenantId?: string;
  name: string;
  prompt: string;
  agent_id: string;
  cadence: TScheduleCadence;
  timezone: string;
  target: 'new';
  file_ids?: string[];
  tools?: string[];
  cron?: string;
  enabled: boolean;
  disabledReason?: ScheduleDisabledReason;
  nextRunAt?: Date;
  leaseUntil?: Date;
  leaseBy?: string;
  claimToken?: string;
  /** Owner-config generation; bumped only by an owner edit. */
  configRevision?: number;
  deleting?: boolean;
  slot?: number;
  /** Client-supplied idempotency key of the create that produced this row. */
  clientRequestId?: string;
  lastRun?: {
    conversationId?: string;
    status: ScheduleRunStatus;
    error?: string;
    firedAt: Date;
    /** The OCCURRENCE this projection came from; orders the card against delayed
     *  outcomes (a resumed pause, a reconciler replay) arriving after a newer run. */
    scheduledFor?: Date;
  };
  runCount: number;
  failureCount: number;
  balanceSkipCount: number;
  countedFor?: Date[];
  /** Newest occurrence applied to the streak counters; orders them like the card. */
  countersAsOf?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IScheduleDocument extends Omit<ISchedule, 'id' | '_id'>, Document {
  id: string;
}

export interface IScheduleRun {
  _id?: Types.ObjectId;
  scheduleId: string;
  user: Types.ObjectId;
  tenantId?: string;
  scheduledFor: Date;
  firedAt?: Date;
  conversationId?: string;
  status: ScheduleRunStatus;
  error?: string;
  droppedFileIds?: string[];
  durationMs?: number;
  bookkept?: boolean;
  /** Global concurrency slot held while `started`. */
  capacitySlot?: number;
  /** When an abort was requested; capacity is held until settlement is confirmed. */
  abortRequestedAt?: Date;
  /** The schedule's configRevision at claim time. */
  configRevision?: number;
  /** When reconciliation last examined this row; orders the paused window so no row
   *  can be starved by a full batch of still-live pauses ahead of it. */
  reconciledAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IScheduleRunDocument extends Omit<IScheduleRun, '_id'>, Document {}
