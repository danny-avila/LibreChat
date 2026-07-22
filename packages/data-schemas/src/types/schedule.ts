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
  lastRun?: {
    conversationId?: string;
    status: ScheduleRunStatus;
    error?: string;
    firedAt: Date;
  };
  runCount: number;
  failureCount: number;
  balanceSkipCount: number;
  countedFor?: Date[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IScheduleDocument extends Omit<ISchedule, 'id' | '_id'>, Document {
  id: string;
}

export interface IScheduleRun {
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
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IScheduleRunDocument extends IScheduleRun, Document {}
