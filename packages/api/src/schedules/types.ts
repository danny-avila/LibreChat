import type { ScheduleMethods, ISchedule } from '@librechat/data-schemas';
import type { Types } from 'mongoose';

export interface ScheduleLimits {
  /** Feature-level switch: when false the engine claims/fires nothing. */
  enabled: boolean;
  maxPerUser: number;
  minIntervalMinutes: number;
  autoDisableAfterFailures: number;
  fireConcurrency: number;
}

export const DEFAULT_SCHEDULE_LIMITS: ScheduleLimits = {
  enabled: true,
  maxPerUser: 10,
  minIntervalMinutes: 60,
  autoDisableAfterFailures: 5,
  fireConcurrency: 5,
};

export interface ScheduleUserContext {
  id: string;
  tenantId?: string;
  role?: string;
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
  /** Resolves interface.schedules limits, per-principal when a user is given. */
  getLimits: (user?: ScheduleUserContext) => Promise<ScheduleLimits>;
  /** Loads the owning user (id + tenant) or null when deleted/disabled. */
  getUserContext: (userId: string | Types.ObjectId) => Promise<ScheduleUserContext | null>;
  /** Whether the balance feature gates this user and they are out of credits. */
  isOutOfBalance: (user: ScheduleUserContext) => Promise<boolean>;
  /** Live agent access for the owner: 'missing' (deleted) vs 'forbidden' (ACL revoked). */
  agentAccess: (
    agentId: string,
    user: ScheduleUserContext,
  ) => Promise<'ok' | 'missing' | 'forbidden'>;
  /** Whether the owning user's current role still grants SCHEDULES access. */
  hasScheduleAccess: (user: ScheduleUserContext) => Promise<boolean>;
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
  /**
   * Deletes a retained terminal job after the reconciler has finalized its run.
   * Gives `preserveForReconcile` jobs (kept without `completedAt` so the store's
   * finished-job sweep can't reap them early) a definitive cleanup path.
   */
  clearReconciledJob: (conversationId: string) => Promise<void>;
  /** Global in-flight scheduled-run count (system tenant scope) for the fire cap. */
  countActiveRunsGlobal: () => Promise<number>;
}

export interface FireResult {
  fired: boolean;
  conversationId?: string;
  skipped?:
    | 'overlap'
    | 'balance'
    | 'capacity'
    | 'duplicate'
    | 'agent_deleted'
    | 'user_missing'
    | 'permission_revoked'
    | 'disabled';
  error?: string;
}

export type FireableSchedule = ISchedule;
