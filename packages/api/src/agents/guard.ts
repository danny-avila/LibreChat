import { Constants } from 'librechat-data-provider';
import type { ConversationMethods, IConversation } from '@librechat/data-schemas';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { SubagentThreadTaskStore } from './subagentThreads';
import { isReservedSubagentThreadId } from './subagentThreadIds';

export const CHILD_THREAD_READ_ONLY_ERROR =
  'This subagent thread is view-only. Continue it from its parent agent or create a separate chat.';

interface SubagentTurnBody {
  conversationId?: unknown;
  arg?: { conversationId?: unknown };
}

interface SubagentTurnUser {
  id?: string;
  _id?: string | { toString(): string };
  tenantId?: string;
}

export interface SubagentThreadWriteGuardDeps {
  getConvo: ConversationMethods['getConvo'];
  store: SubagentThreadTaskStore;
}

export interface SubagentThreadWriteTarget {
  userId: string;
  conversationId: string;
  tenantId?: string;
}

interface SubagentThreadWriteResolution {
  blocked: boolean;
  conversation?: IConversation | null;
}

interface ResolvedConversationRequest extends Request {
  resolvedConversation?: IConversation | null;
}

async function resolveSubagentThreadWrite(
  { getConvo, store }: SubagentThreadWriteGuardDeps,
  { userId, conversationId, tenantId }: SubagentThreadWriteTarget,
): Promise<SubagentThreadWriteResolution> {
  /** New child IDs are returned synchronously by the SDK before Mongo creation can
   * finish. Their reserved UUID namespace closes that brief window on every replica. */
  if (isReservedSubagentThreadId(conversationId)) {
    return { blocked: true };
  }
  if (store.isThreadActiveForOwner(userId, conversationId, tenantId)) {
    return { blocked: true };
  }
  const conversation = await getConvo(userId, conversationId);
  return { blocked: conversation?.subagentThread != null, conversation };
}

/** Applies the same immutable-child policy to every server write adapter. */
export async function isSubagentThreadWriteBlocked(
  deps: SubagentThreadWriteGuardDeps,
  target: SubagentThreadWriteTarget,
): Promise<boolean> {
  return (await resolveSubagentThreadWrite(deps, target)).blocked;
}

/** Rejects model-bound turns for durable or provisionally-created child threads. */
export function createSubagentThreadTurnGuard(deps: SubagentThreadWriteGuardDeps): RequestHandler {
  return async (request: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = request.body as SubagentTurnBody | undefined;
    const user = request.user as SubagentTurnUser | undefined;
    const candidateConversationId = body?.conversationId ?? body?.arg?.conversationId;
    if (
      typeof candidateConversationId !== 'string' ||
      candidateConversationId === '' ||
      candidateConversationId === Constants.NEW_CONVO
    ) {
      next();
      return;
    }
    const rawUserId = user?.id ?? user?._id;
    if (rawUserId == null) {
      next();
      return;
    }
    const userId = String(rawUserId);
    const tenantId =
      typeof user?.tenantId === 'string' && user.tenantId !== '' ? user.tenantId : undefined;

    try {
      const resolved = await resolveSubagentThreadWrite(deps, {
        userId,
        conversationId: candidateConversationId,
        ...(tenantId == null ? {} : { tenantId }),
      });
      if (resolved.conversation !== undefined) {
        (request as ResolvedConversationRequest).resolvedConversation = resolved.conversation;
      }
      if (!resolved.blocked) {
        next();
        return;
      }
      res.status(409).json({ error: CHILD_THREAD_READ_ONLY_ERROR });
    } catch (error) {
      next(error);
    }
  };
}
