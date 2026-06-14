import type { Types } from 'mongoose';
import type { IMessage } from './message';

/**
 * Immutable snapshot of a file referenced by a shared chat snapshot. Captured at
 * share create/update so shared-link viewers can preview/download the file through
 * the share-scoped routes without consulting the original owner's live file ACL.
 * References the original stored object (no byte copy); only the metadata needed to
 * stream/preview is duplicated.
 */
export interface SharedFileSnapshot {
  file_id: string;
  source?: string;
  storageKey?: string;
  filepath?: string;
  type?: string;
  filename?: string;
  bytes?: number;
  width?: number;
  height?: number;
  model?: string;
  tenantId?: string;
}

export interface ISharedLink {
  _id?: Types.ObjectId;
  conversationId: string;
  title?: string;
  user?: string;
  messages?: Types.ObjectId[];
  shareId?: string;
  targetMessageId?: string;
  expiredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  /** Owning tenant for multi-tenant deployments (read by the shared-link access middleware). */
  tenantId?: string;
  /** Per-share file snapshot referenced by the share-scoped file routes. */
  fileSnapshots?: SharedFileSnapshot[];
}

export interface ShareServiceError extends Error {
  code: string;
}

/**
 * A file or attachment as exposed through a public shared link: storage- and
 * identity-internal fields are stripped, but render-relevant data (including
 * dynamic tool-call payloads keyed by tool name) is preserved.
 */
export type SharedFile = Record<string, unknown>;

/**
 * Public, anonymized projection of a message returned by a shared link. Only
 * render-relevant fields are surfaced; internal fields (user, endpoint,
 * conversationSignature, clientId, plugin(s), metadata, etc.) are omitted.
 */
export type SharedMessage = Pick<
  IMessage,
  | 'messageId'
  | 'parentMessageId'
  | 'conversationId'
  | 'sender'
  | 'text'
  | 'content'
  | 'iconURL'
  | 'isCreatedByUser'
  | 'createdAt'
  | 'updatedAt'
  | 'tokenCount'
  | 'unfinished'
  | 'error'
  | 'finish_reason'
  | 'manualSkills'
  | 'alwaysAppliedSkills'
> & {
  model?: string;
  files?: SharedFile[];
  attachments?: SharedFile[];
};

export interface SharedLinksResult {
  links: Array<{
    shareId: string;
    title: string;
    createdAt: Date;
    conversationId: string;
  }>;
  nextCursor?: Date;
  hasNextPage: boolean;
}

export interface SharedMessagesResult {
  conversationId: string;
  messages: Array<SharedMessage>;
  shareId: string;
  title?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateShareResult {
  _id?: string;
  shareId: string;
  conversationId: string;
  targetMessageId?: string;
}

export interface UpdateShareResult {
  _id?: string;
  shareId: string;
  conversationId: string;
  targetMessageId?: string;
}

export interface DeleteShareResult {
  _id?: string;
  success: boolean;
  shareId: string;
  message: string;
}

export interface GetShareLinkResult {
  _id?: string;
  shareId: string | null;
  targetMessageId?: string;
  success: boolean;
}

export interface DeleteAllSharesResult {
  message: string;
  deletedCount: number;
}
