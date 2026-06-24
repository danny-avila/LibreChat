import type { Document, Types } from 'mongoose';

/** Whether a schedule fires once at a fixed instant or repeats on a cron cadence. */
export type SkillScheduleType = 'once' | 'recurring';

/** Lifecycle status of the most recent run attempt. */
export type SkillScheduleStatus = 'pending' | 'running' | 'success' | 'error';

/**
 * SkillSchedule — a user-owned instruction to run a skill (or a plain prompt)
 * under a chosen agent/model at a future time, recurring or one-time. Runs are
 * executed server-side by the scheduler poller even when the owner is offline,
 * and surface as a tagged "scheduled" conversation.
 *
 * Schedules are private to their owner: every query is scoped by `user`, so
 * there is no ACL/sharing layer (unlike Skill).
 */
export interface ISkillSchedule {
  /** Owning user. All reads/writes are scoped to this id. */
  user: Types.ObjectId;
  /** Tenant the owner belongs to; runs execute inside this tenant's context. */
  tenantId?: string;
  /** Human label, also used as the seed title for the resulting conversation. */
  name: string;
  /** When false, the poller skips this schedule (paused). */
  enabled: boolean;

  /** Instruction text that drives the agent turn. */
  prompt: string;
  /** Target skill slug, primed into the run via `manualSkills`. Optional. */
  skillName?: string;
  /** Optional reference to the skill document, for display/integrity. */
  skillId?: Types.ObjectId;

  /** When set, the run uses the `agents` endpoint with this agent. */
  agent_id?: string;
  /** Otherwise, the endpoint to run under (e.g. a model endpoint). */
  endpoint?: string;
  /** Endpoint type when `endpoint` is a custom endpoint. */
  endpointType?: string;
  /** Model to run under when not using an agent. */
  model?: string;
  /** Optional modelSpec name. */
  spec?: string;

  /** Discriminates the scheduling fields below. */
  scheduleType: SkillScheduleType;
  /** Standard cron expression (recurring schedules). */
  cron?: string;
  /** Absolute UTC instant (one-time schedules). */
  runAt?: Date;
  /** IANA timezone used to interpret `cron`. `runAt` is timezone-independent. */
  timezone: string;

  /** Next instant the poller should run this schedule. Null when exhausted. */
  nextRunAt?: Date | null;
  /** When the last run started. */
  lastRunAt?: Date;
  /** Conversation produced by the last run. */
  lastConversationId?: string;
  /** Outcome of the last run attempt. */
  lastStatus: SkillScheduleStatus;
  /** Error message from the last failed run. */
  lastError?: string;

  /** Claim marker — set atomically when a poller instance picks up the row. */
  lockedAt?: Date | null;
  /** Identifier of the instance currently holding the claim. */
  lockedBy?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export type ISkillScheduleDocument = ISkillSchedule & Document;
