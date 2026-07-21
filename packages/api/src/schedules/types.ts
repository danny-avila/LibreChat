import type { ScheduleMethods, ISchedule } from '@librechat/data-schemas';
import type { Types } from 'mongoose';

export interface ScheduleLimits {
  maxPerUser: number;
  minIntervalMinutes: number;
  autoDisableAfterFailures: number;
  fireConcurrency: number;
}

export const DEFAULT_SCHEDULE_LIMITS: ScheduleLimits = {
  maxPerUser: 10,
  minIntervalMinutes: 60,
  autoDisableAfterFailures: 5,
  fireConcurrency: 5,
};

export interface ScheduleUserContext {
  id: string;
  tenantId?: string;
}

export interface ScheduleFileRef {
  file_id: string;
  filepath?: string;
  filename?: string;
  type?: string;
  height?: number;
  width?: number;
  source?: string;
}

export interface ScheduleEngineDeps {
  methods: ScheduleMethods;
  /** Resolves interface.schedules limits from the base app config. */
  getLimits: () => Promise<ScheduleLimits>;
  /** Loads the owning user (id + tenant) or null when deleted/disabled. */
  getUserContext: (userId: string | Types.ObjectId) => Promise<ScheduleUserContext | null>;
  /** Whether the balance feature gates this user and they are out of credits. */
  isOutOfBalance: (user: ScheduleUserContext) => Promise<boolean>;
  /** Whether the schedule's agent still exists (VIEW enforcement happens in the fire request). */
  agentExists: (agentId: string, user: ScheduleUserContext) => Promise<boolean>;
  /** Re-resolves stored file_ids to attachment payloads; missing files are simply absent. */
  resolveFiles: (fileIds: string[], user: ScheduleUserContext) => Promise<ScheduleFileRef[]>;
  /** Mints the schedule-scoped short-lived JWT accepted by requireJwtAuth. */
  mintFireToken: (userId: string) => string;
  /** Base URL of this server for the loopback fire POST. */
  getSelfUrl: () => string;
  /** Runs fn inside the owner's tenant ALS context. */
  runInTenantContext: <T>(user: ScheduleUserContext, fn: () => Promise<T>) => Promise<T>;
  /** Job-store status for a run's conversation, or null when the job is gone. */
  getJobStatus: (conversationId: string) => Promise<string | null>;
}

export interface FireResult {
  fired: boolean;
  conversationId?: string;
  skipped?: 'overlap' | 'balance' | 'duplicate' | 'agent_deleted' | 'user_missing';
  error?: string;
}

export type FireableSchedule = ISchedule;
