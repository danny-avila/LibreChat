import type { Document } from 'mongoose';
import type { TFeedbackRating, TFeedbackTag } from 'librechat-data-provider';

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
  parentMessageId?: string | null;
  tokenCount?: number;
  summaryTokenCount?: number;
  sender?: string;
  text?: string;
  summary?: string;
  isCreatedByUser: boolean;
  unfinished?: boolean;
  error?: boolean;
  finish_reason?: string;
  feedback?: {
    rating: TFeedbackRating;
    tag: TFeedbackTag | undefined;
    text?: string;
  };
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
  addedConvo?: boolean;
  metadata?: Record<string, unknown>;
  contextMeta?: {
    calibrationRatio?: number;
    encoding?: string;
  };
  attachments?: unknown[];
  /** Skills the user invoked manually via the `$` popover on this turn. UI-only metadata for `SkillPills`. */
  manualSkills?: string[];
  /**
   * Skills auto-primed on this turn via `always-apply` frontmatter. Persisted
   * at turn time so pinned badges survive later flips of the skill's
   * `alwaysApply` flag — the audit trail follows what actually ran, not what
   * the current catalog says.
   */
  alwaysAppliedSkills?: string[];
  expiredAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
