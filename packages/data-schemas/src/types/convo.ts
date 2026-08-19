import type { TSubagentThreadLineage } from 'librechat-data-provider';
import type { Document, Types } from 'mongoose';

export interface ISubagentThreadLease {
  token: string;
  taskId: string;
  expiresAt: Date;
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
