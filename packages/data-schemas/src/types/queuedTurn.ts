import type { Document, Types } from 'mongoose';

export type AgentQueuedTurnStatus = 'queued' | 'claimed' | 'admitted' | 'cancelled' | 'dead';

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
  sequence: number;
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
  scheduledAt?: Date;
  claimId?: string;
  claimBy?: string;
  claimUntil?: Date;
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
  value: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAgentQueuedTurnSequenceDocument
  extends Omit<IAgentQueuedTurnSequence, '_id'>,
    Document<string> {}

export interface AgentQueuedTurnRecord extends Omit<IAgentQueuedTurn, '_id' | 'createdAt'> {
  queuedTurnId: string;
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
  | 'scheduledAt'
  | 'createdAt'
  | 'updatedAt'
>;

export interface AgentQueuedTurnClaim extends AgentQueuedTurnRecord {
  status: 'claimed';
  claimId: string;
  claimBy: string;
  claimUntil: Date;
}
