import type { Document, Types } from 'mongoose';

export type AgentTriggerDeliveryStatus = 'staging' | 'pending' | 'leased' | 'succeeded' | 'dead';
export type AgentTriggerDeliveryOutcome = 'succeeded' | 'retry' | 'dead';

export interface AgentTriggerDeliveryFailure {
  code: string;
  message: string;
  certainty: 'definite' | 'ambiguous';
  retryable: boolean;
  attemptedAt: Date;
  status?: number;
}

export interface AgentTriggerDeliveryHistoryEntry {
  attempt: number;
  outcome: AgentTriggerDeliveryOutcome;
  at: Date;
  workerId: string;
  error?: AgentTriggerDeliveryFailure;
}

export interface IAgentTriggerDelivery {
  _id?: Types.ObjectId;
  deliveryKey: string;
  fingerprint: string;
  orderingKey: string;
  /** Monotonic sequence allocated while holding the lane publication fence. */
  laneSequence: number;
  envelope: unknown;
  user: Types.ObjectId;
  tenantId?: string;
  status: AgentTriggerDeliveryStatus;
  attempts: number;
  availableAt: Date;
  leaseBy?: string;
  leaseUntil?: Date;
  claimToken?: string;
  lastError?: AgentTriggerDeliveryFailure;
  result?: unknown;
  history?: AgentTriggerDeliveryHistoryEntry[];
  settledAt?: Date;
  expiresAt?: Date;
  requeueCount?: number;
  /** Fairness cursor for bounded recovery of rows stranded before lane publication. */
  stagingRecoveryAt?: Date;
  /** Durable proof that successful settlement still owes lane cleanup publication. */
  laneCleanupPendingAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAgentTriggerDeliveryDocument
  extends Omit<IAgentTriggerDelivery, '_id'>,
    Document {}

export interface AgentTriggerDeliveryRecord
  extends Omit<IAgentTriggerDelivery, '_id' | 'createdAt'> {
  id: string;
  createdAt: Date;
}

export interface IAgentTriggerLaneSequence {
  _id: string;
  value: number;
  user: Types.ObjectId;
  tenantId?: string;
  /** Latest delivery admitted to this lane. Used to reclaim inactive lane counters safely. */
  tailDeliveryId?: Types.ObjectId;
  /** Delivery currently owning the serialized sequence/publication step. */
  publisherDeliveryId?: Types.ObjectId;
  publisherStartedAt?: Date;
  cleanupRequestedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAgentTriggerLaneSequenceDocument
  extends Omit<IAgentTriggerLaneSequence, '_id'>,
    Document<string> {}

/** Durable proof that trigger payload cleanup must survive the deleting process. */
export interface IAgentTriggerUserPurge {
  _id: Types.ObjectId;
  fenceStartedAt: Date;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAgentTriggerUserPurgeDocument
  extends Omit<IAgentTriggerUserPurge, '_id'>,
    Document {}

export interface AgentTriggerDeliveryClaim extends AgentTriggerDeliveryRecord {
  claimToken: string;
  leaseBy: string;
  leaseUntil: Date;
  status: 'leased';
}

export interface AgentTriggerOrderingBlock {
  availableAt: Date;
  leaseUntil?: Date;
}
