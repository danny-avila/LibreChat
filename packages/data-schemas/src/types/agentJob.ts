import type { Document, Types } from 'mongoose';

/** Lifecycle status of a long-horizon agent job. */
export type AgentJobStatus =
  | 'queued'
  | 'running'
  | 'waiting_client'
  | 'paused'
  | 'done'
  | 'error'
  | 'canceled';

/** Outcome of a single job step. */
export type AgentJobStepStatus = 'running' | 'success' | 'error';

/**
 * One recorded step of a long-horizon job. Each step maps to one headless agent
 * turn whose progress message is persisted in the job's conversation; `messageId`
 * links back to that message so the frontend can render the step in history.
 */
export interface IAgentJobStep {
  /** Zero-based position of this step within the job. */
  index: number;
  /** Outcome of the step. */
  status: AgentJobStepStatus;
  /** Short human-readable summary of what the step produced. */
  summary?: string;
  /** Message persisted for this step (links the step to conversation history). */
  messageId?: string;
  startedAt?: Date;
  endedAt?: Date;
}

/**
 * A local file operation the running job needs the browser client to perform
 * (Feature 1 — File System Access API). Set on the job while it waits; the
 * frontend services it and posts the result back. Kept generic so the runner
 * can request reads and writes without a schema change per op.
 */
export interface IAgentJobClientOp {
  /** Operation kind the client must run against the connected directory handle. */
  op: 'listDir' | 'readFile' | 'writeFile';
  /** Path relative to the connected directory handle. */
  path?: string;
  /** Reference to file content (e.g. a temp file id) for write operations. */
  contentRef?: string;
}

/**
 * AgentJob — a user-owned, multi-step agent task that runs server-side and
 * survives the browser tab closing. The worker claims due jobs atomically (same
 * lock pattern as SkillSchedule), runs one step per tick, checkpoints progress
 * into `conversationId`, and persists resumable state in `checkpoint`.
 *
 * Jobs are private to their owner: every query is scoped by `user`.
 */
export interface IAgentJob extends Omit<Document, 'model'> {
  /** Owning user. All reads/writes are scoped to this id. */
  user: Types.ObjectId;
  /** Tenant the owner belongs to; steps execute inside this tenant's context. */
  tenantId?: string;
  /** Conversation where step progress is checkpointed. */
  conversationId: string;
  /** Original instruction that drives the job. */
  goal: string;

  /** Optional saved agent to run the job under. */
  agent_id?: string;
  /** Endpoint to run under when not using an agent. */
  endpoint?: string;
  /** Endpoint type when `endpoint` is a custom endpoint. */
  endpointType?: string;
  /** Model to run under when not using an agent. */
  model?: string;
  /** Optional modelSpec name. */
  spec?: string;

  /** Current lifecycle status. */
  status: AgentJobStatus;
  /** Recorded steps, in execution order. */
  steps: IAgentJobStep[];
  /** Index of the next step to run. */
  currentStep: number;
  /** Hard cap on steps so a runaway job cannot loop forever. */
  maxSteps: number;

  /** Serializable state carried between steps (the job's working memory). */
  checkpoint?: unknown;
  /** Pending local file op the browser client must service (Feature 1). */
  pendingClientOp?: IAgentJobClientOp | null;

  /** Error message from the last failed step. */
  lastError?: string;

  /** Claim marker — set atomically when a worker instance picks up the job. */
  lockedAt?: Date | null;
  /** Identifier of the instance currently holding the claim. */
  lockedBy?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export type IAgentJobDocument = IAgentJob;
