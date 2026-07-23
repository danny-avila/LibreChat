import type { ScheduleMethods, ISchedule } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { SlotClaimResult } from './capacity';

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
  /**
   * Job-store state for a run's conversation, or null when the job is gone. Carries
   * the job's scheduled identity so reconciliation can verify the job at this
   * conversationId is THIS occurrence's generation (a replacement user turn reuses
   * the conversationId but strips scheduleId/scheduledFor) before trusting the status.
   */
  getJobStatus: (conversationId: string) => Promise<JobState | null>;
  /**
   * Aborts the loopback generation for a scheduled occurrence, identity-guarded so
   * it never signals/clobbers a replacement turn that reused the conversationId.
   * Used by deletion quiescing to stop an in-flight run before its evidence is
   * erased. `preserve` keeps the terminal job for the reconciler (per-schedule
   * delete, whose run row survives to drive cleanup); account deletion passes false
   * since it hard-deletes the run rows, so a preserved job would leak in the store.
   */
  abortScheduledJob: (
    conversationId: string,
    identity: JobIdentity,
    options?: { preserve?: boolean },
  ) => Promise<boolean>;
  /**
   * Whether every engine replica can observe the SAME jobs (Redis-backed, or a
   * single process). When false — e.g. clustered workers each with a private
   * in-memory store — a non-owning replica would read `jobStatus == null` for a
   * peer's live run and wrongly interrupt it, so the job-status reconciliation is
   * skipped and each run is finalized only by its owning replica's inline hooks.
   */
  isJobStoreShared: () => boolean;
  /**
   * Deletes a retained terminal job after the reconciler has finalized its run.
   * Identity-guarded: only deletes when the job still carries this run's
   * scheduleId/scheduledFor, so a replacement generation occupying the same
   * conversationId is never destroyed. Gives `preserveForReconcile` jobs (kept
   * without `completedAt` so the finished-job sweep can't reap them early) a
   * definitive cleanup path.
   */
  clearReconciledJob: (conversationId: string, identity: JobIdentity) => Promise<void>;
  /** Global in-flight scheduled-run count (system tenant scope) for the fire cap. */
  countActiveRunsGlobal: () => Promise<number>;
  /**
   * Runs `claim` against the lowest free GLOBAL capacity slot, retrying the next slot
   * when the unique partial index rejects a collision. Enforces fireConcurrency in the
   * database instead of via a read-then-compare count, so concurrent admissions of
   * different schedules cannot both pass a cap-1 check. Occupancy is read in system
   * scope so the cap stays global across tenants.
   */
  withGlobalCapacitySlot: <T>(
    cap: number,
    claim: (slot: number) => Promise<SlotClaimResult<T>>,
  ) => Promise<{ claimed: T } | 'capacity'>;
}

/** The immutable scheduled identity of a generation job, for reconcile/abort fencing. */
export interface JobIdentity {
  scheduleId: string;
  scheduledFor: string | Date;
}

/** Job-store state plus the job's scheduled identity (absent on a replacement turn). */
export interface JobState {
  status: string;
  scheduleId?: string;
  scheduledFor?: string;
}

export interface FireResult {
  fired: boolean;
  conversationId?: string;
  skipped?:
    | 'overlap'
    | 'balance'
    | 'capacity'
    | 'duplicate'
    | 'superseded'
    | 'agent_deleted'
    | 'user_missing'
    | 'permission_revoked'
    | 'disabled';
  error?: string;
}

export type FireableSchedule = ISchedule;
