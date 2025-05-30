import type { Document } from 'mongoose';

// @ts-ignore
export interface IMessage extends Document {
  messageId: string;
  conversationId: string;
  user: string;
  model?: string;
  endpoint?: string;
  conversationSignature?: string;
  clientId?: string;
  invocationId?: number;
  parentMessageId?: string;
  tokenCount?: number;
  summaryTokenCount?: number;
  sender?: string;
  text?: string;
  summary?: string;
  isCreatedByUser: boolean;
  unfinished?: boolean;
  error?: boolean;
  finish_reason?: string;
  _meiliIndex?: boolean;
  files?: unknown[];
  plugin?: {
    latest?: string;
    inputs?: unknown[];
    outputs?: string;
  };
  plugins?: unknown[];
  content?: unknown[];
  thread_id?: string;
  iconURL?: string;
  attachments?: unknown[];
  expiredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
