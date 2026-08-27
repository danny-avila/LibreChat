import type { TSubagentThreadLineage } from 'librechat-data-provider';
import type { Document, Types } from 'mongoose';

export interface ISubagentThreadLease {
  token: string;
  taskId: string;
  expiresAt: Date;
}

/** Server-private route from one authenticated event source to a child actor thread. */
export interface IAgentEventBinding {
  bindingId: string;
  sourceKeyId: string;
  actorId: string;
}

export interface IAgentEventActorCheckpoint {
  threadId: string;
  checkpointId: string;
  checkpointNs: string;
}

/** Private committed checkpoint state for one event-bound child actor. */
export interface IAgentEventActorState {
  generation: number;
  checkpoint: IAgentEventActorCheckpoint;
  previousCheckpoint?: IAgentEventActorCheckpoint;
  /** Forces the next qualifying event to rebuild from durable message history. */
  requiresColdStart?: boolean;
}

export interface IAgentEventActorReconciliation {
  invocationId: string;
  /** New-protocol executions acquire the delivery-owned action admission CAS
   * before the external action may run. Absent only on mixed-version rows. */
  actionAdmitted?: boolean;
  status:
    | 'invocation_pending'
    | 'persistence_pending'
    | 'history_persisted'
    | 'commit_conflict'
    | 'commit_indeterminate'
    | 'persistence_failed'
    | 'settled';
  checkpoint: Omit<IAgentEventActorCheckpoint, 'checkpointId'> & { checkpointId?: string };
  action: { toolName: string; toolCallId?: string };
  error?: string;
  /** How a retained receipt reached `settled`. Absent on active lifecycle rows. */
  resolution?: 'checkpoint_verified' | 'action_compensated' | 'history_repaired';
  observedAt: Date;
}

/**
 * Durable fence covering one legacy-path turn from before its execution until
 * its history is persisted. While present, no fork may execute or commit — the
 * turn's messages are not yet durable, so any rebuild would be incomplete. A
 * crash leaves the token in place (fail-closed) until it is reclaimed.
 */
export interface IAgentEventActorLegacyTurn {
  token: string;
  startedAt: Date;
}

export interface IAgentEventActorSnapshot {
  state: IAgentEventActorState | null;
  reconciliations: IAgentEventActorReconciliation[];
  legacyTurn: IAgentEventActorLegacyTurn | null;
  /** Durable invalidation epoch. Every legacy-path event bumps it — including
   * for headless or already cold-marked actors, where the marker alone leaves
   * no CAS-visible trace — and the commit CAS requires the epoch observed at
   * preparation, so a stale fork can never commit state built from history
   * read before an intervening legacy turn. */
  epoch: number;
}

export interface IAgentEventBindingRecord {
  conversationId: string;
  agentId: string;
  tenantId?: string;
  isTemporary?: boolean;
  expiredAt?: Date;
  binding: IAgentEventBinding;
  lineage: TSubagentThreadLineage;
}

export interface IActiveSubagentThreadLease {
  conversationId: string;
  parentConversationId: string;
  taskId: string;
}

export interface ISubagentThreadReservation {
  conversation: IConversation;
  created: boolean;
}

// @ts-ignore
export interface IConversation extends Document {
  conversationId: string;
  title?: string;
  user?: string;
  messages?: Types.ObjectId[];
  isTemporary?: boolean;
  // Fields provided by conversationPreset (adjust types as needed)
  endpoint?: string;
  endpointType?: string;
  model?: string;
  region?: string;
  chatGptLabel?: string;
  examples?: unknown[];
  modelLabel?: string;
  promptPrefix?: string;
  temperature?: number;
  top_p?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  maxTokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  file_ids?: string[];
  resendImages?: boolean;
  promptCache?: boolean;
  promptCacheTtl?: '5m' | '1h';
  thinking?: boolean;
  thinkingBudget?: number;
  effort?: string;
  system?: string;
  resendFiles?: boolean;
  imageDetail?: string;
  agent_id?: string;
  subagentThread?: TSubagentThreadLineage;
  /** Internal execution fence. Excluded from ordinary conversation reads. */
  subagentThreadLease?: ISubagentThreadLease;
  /** Internal event-source identity. Excluded from ordinary conversation reads. */
  agentEventBinding?: IAgentEventBinding;
  /** Internal event-actor checkpoint head. Excluded from ordinary conversation reads. */
  agentEventActor?: IAgentEventActorState;
  /** Private invocation proof: active lifecycle fences plus settled same-ID receipts. */
  agentEventActorReconciliations?: IAgentEventActorReconciliation[];
  /** Private invalidation epoch; see {@link IAgentEventActorSnapshot.epoch}. */
  agentEventActorEpoch?: number;
  /** Private in-flight legacy-turn fence; see {@link IAgentEventActorLegacyTurn}. */
  agentEventActorLegacyTurn?: IAgentEventActorLegacyTurn;
  assistant_id?: string;
  instructions?: string;
  stop?: string[];
  isArchived?: boolean;
  /** Set when archived, cleared on unarchive; absent on chats archived before it existed. */
  archivedAt?: Date | null;
  pinned?: boolean;
  /** Derived per request from the shared-links collection; never persisted on the conversation. */
  isShared?: boolean;
  iconURL?: string;
  greeting?: string;
  spec?: string;
  tags?: string[];
  chatProjectId?: string | null;
  tools?: string[];
  maxContextTokens?: number;
  max_tokens?: number;
  reasoning_effort?: string;
  reasoning_summary?: string;
  reasoning_mode?: string;
  reasoning_context?: string;
  verbosity?: string;
  useResponsesApi?: boolean;
  web_search?: boolean;
  url_context?: boolean;
  disableStreaming?: boolean;
  fileTokenLimit?: number;
  // Additional fields
  files?: string[];
  expiredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
