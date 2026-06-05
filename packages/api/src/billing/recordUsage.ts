import { logger } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { MediaTokenType } from '@librechat/data-schemas';

export interface BillingUsageBase {
  user: string | Types.ObjectId;
  model: string;
  /** Free-form audit label, e.g. 'stt', 'tts', 'ocr', 'image_gen', 'title'. */
  context: string;
  conversationId?: string;
  messageId?: string;
  endpointTokenConfig?: Record<string, Record<string, number>> | null;
  /** Forwarded to spendTokens/spendMediaTokens. Self-hosters can disable */
  /** balance accounting and/or transaction writes via librechat.yaml. */
  balance?: { enabled?: boolean } | null;
  transactions?: { enabled?: boolean } | null;
}

export interface BillingTextUsage extends BillingUsageBase {
  tokenUsage: { promptTokens?: number; completionTokens?: number };
  media?: never;
}

export interface BillingMediaUsage extends BillingUsageBase {
  media: { type: MediaTokenType; amount: number };
  tokenUsage?: never;
}

export type BillingUsageInput = BillingTextUsage | BillingMediaUsage;

interface Tx {
  user: string | Types.ObjectId;
  conversationId?: string;
  messageId?: string;
  model?: string;
  context?: string;
  endpointTokenConfig?: Record<string, Record<string, number>> | null;
  balance?: { enabled?: boolean } | null;
  transactions?: { enabled?: boolean } | null;
}

export interface BillingDeps {
  spendTokens: (
    txData: Tx,
    tokenUsage: { promptTokens?: number; completionTokens?: number },
  ) => Promise<unknown>;
  spendMediaTokens: (
    txData: Tx,
    usage: { type: MediaTokenType; amount: number },
  ) => Promise<unknown>;
}

export type { MediaTokenType };

/**
 * Records usage for non-text endpoints (STT, TTS, OCR, image-gen, title-gen).
 *
 * Callers should `await recordUsage(deps, input)` so the Mongo write completes
 * before the user's request returns — that guarantees in-flight billing data
 * is not lost when the pod receives SIGTERM during a rollout.
 *
 * Errors are caught and logged; the returned promise never rejects.
 */
export async function recordUsage(deps: BillingDeps, input: BillingUsageInput): Promise<void> {
  try {
    const txData: Tx = {
      user: input.user,
      conversationId: input.conversationId,
      messageId: input.messageId,
      model: input.model,
      context: input.context,
      endpointTokenConfig: input.endpointTokenConfig,
      balance: input.balance,
      transactions: input.transactions,
    };
    if ('media' in input && input.media) {
      await deps.spendMediaTokens(txData, input.media);
      return;
    }
    if ('tokenUsage' in input && input.tokenUsage) {
      await deps.spendTokens(txData, input.tokenUsage);
    }
  } catch (err: unknown) {
    logger.error('[billing.recordUsage] failed to record usage', {
      context: input.context,
      model: input.model,
      user: String(input.user),
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
