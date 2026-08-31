import type { Document, Types } from 'mongoose';

export type AgentQueuedTurnStatus =
  | 'reserving'
  | 'queued'
  | 'claimed'
  | 'admitted'
  | 'cancelled'
  | 'dead';

export type AgentQueuedTurnDeliveryState =
  | 'pending'
  | 'publishing'
  | 'published'
  | 'retiring'
  | 'retired';

export interface AgentQueuedTurnFileRef {
  file_id: string;
  type?: string;
  filepath?: string;
  filename?: string;
  height?: number;
  width?: number;
  bytes?: number;
}

export interface AgentQueuedTurnFailure {
  code: string;
  message: string;
}

export interface AgentQueuedTurnTerminalReceipt {
  outcome: 'admitted' | 'cancelled' | 'dead';
  settledAt: Date;
  admissionId?: string;
  admissionMode?: 'warm' | 'ordinary';
  generationId?: string;
  generationCreatedAt?: number;
  failure?: AgentQueuedTurnFailure;
}

export interface IAgentQueuedTurn {
  _id?: Types.ObjectId;
  user: Types.ObjectId;
  tenantId?: string;
  conversationId: string;
  agentId: string;
  parentMessageId: string;
  clientRequestId: string;
  fingerprint: string;
  /** Immutable generation of the conversation lane that admitted this row. */
  laneId?: string;
  /** Assigned after the row is durably visible as `reserving`. */
  sequence?: number;
  /** Fences a reserving row to the lane writer allowed to assign its sequence. */
  reservationWriterId?: string;
  /** Bounded active-lane capacity token. Present only while queued/claimed. */
  activeSlot?: number;
  status: AgentQueuedTurnStatus;
  priority: boolean;
  text: string;
  files?: AgentQueuedTurnFileRef[];
  quotes?: string[];
  manualSkills?: string[];
  expectedPredecessorCreatedAt?: number;
  attempts: number;
  availableAt: Date;
  deliveryKey?: string;
  deliveryState?: AgentQueuedTurnDeliveryState;
  scheduledAt?: Date;
  claimId?: string;
  claimBy?: string;
  claimUntil?: Date;
  /** Durable proof that ordinary admission may have crossed the HTTP boundary. */
  admissionStartedAt?: Date;
  admissionId?: string;
  /** Version 2 requires accepted and deduplicated execution responses to prove
   * the exact post-invocation source receipt. */
  admissionProtocolVersion?: 2;
  reconciliationAvailableAt?: Date;
  reconciliationClaimId?: string;
  reconciliationClaimBy?: string;
  reconciliationClaimUntil?: Date;
  reconciliationAttempts?: number;
  terminalReceipt?: AgentQueuedTurnTerminalReceipt;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAgentQueuedTurnDocument extends Omit<IAgentQueuedTurn, '_id'>, Document {}

export interface IAgentQueuedTurnSequence {
  _id: string;
  user: Types.ObjectId;
  tenantId?: string;
  conversationId: string;
  /** Changes whenever a fully retired lane is recreated. */
  laneId: string;
  value: number;
  /** Visible reservation currently owning `value`; recovery completes it. */
  reservationId?: string;
  writerId?: string;
  writerUntil?: Date;
  retiredAt?: Date;
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAgentQueuedTurnSequenceDocument
  extends Omit<IAgentQueuedTurnSequence, '_id'>,
    Document<string> {}

export interface AgentQueuedTurnRecord
  extends Omit<IAgentQueuedTurn, '_id' | 'createdAt' | 'sequence' | 'status'> {
  queuedTurnId: string;
  sequence: number;
  status: Exclude<AgentQueuedTurnStatus, 'reserving'>;
  createdAt: Date;
}

export type AgentQueuedTurnActiveRecord = Pick<
  AgentQueuedTurnRecord,
  | 'queuedTurnId'
  | 'conversationId'
  | 'agentId'
  | 'parentMessageId'
  | 'clientRequestId'
  | 'sequence'
  | 'activeSlot'
  | 'status'
  | 'priority'
  | 'text'
  | 'files'
  | 'quotes'
  | 'manualSkills'
  | 'expectedPredecessorCreatedAt'
  | 'attempts'
  | 'availableAt'
  | 'deliveryKey'
  | 'deliveryState'
  | 'scheduledAt'
  | 'createdAt'
  | 'updatedAt'
  | 'terminalReceipt'
>;

export interface AgentQueuedTurnClaim extends AgentQueuedTurnRecord {
  status: 'claimed';
  claimId: string;
  claimBy: string;
  claimUntil: Date;
}
