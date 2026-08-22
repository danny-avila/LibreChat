import { Constants } from 'librechat-data-provider';
import type { ConversationMethods, IConversation } from '@librechat/data-schemas';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { SubagentThreadTaskStore } from './subagentThreads';
import { isReservedSubagentThreadId } from './subagentThreadIds';
import { isAgentEventRetentionActive } from './eventRetention';

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
  getEventBinding?: ConversationMethods['getAgentEventBinding'];
  isHumanResumeAllowed?: (target: SubagentThreadWriteTarget) => Promise<boolean>;
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
  _isAgentTrigger?: boolean;
  _agentEventBindingRetention?: {
    isTemporary?: boolean;
    expiredAt?: Date;
  };
  _agentEventBindingParentConversationId?: string;
  _agentEventBindingParentAgentId?: string;
  _agentEventBindingTenantId?: string;
}

function applyEventBindingContext(
  request: ResolvedConversationRequest,
  conversation: IConversation,
): void {
  request.resolvedConversation = conversation;
  request._agentEventBindingRetention = {
    ...(conversation.isTemporary == null ? {} : { isTemporary: conversation.isTemporary }),
    ...(conversation.expiredAt == null ? {} : { expiredAt: conversation.expiredAt }),
  };
  request._agentEventBindingParentConversationId =
    conversation.subagentThread?.parentConversationId;
  request._agentEventBindingParentAgentId = conversation.subagentThread?.parentAgentId;
  request._agentEventBindingTenantId = conversation.tenantId;
}

async function isBoundEventContinuation(
  deps: SubagentThreadWriteGuardDeps,
  request: ResolvedConversationRequest,
  target: SubagentThreadWriteTarget,
): Promise<IConversation | null> {
  if (request._isAgentTrigger !== true || deps.getEventBinding == null) {
    return null;
  }
  const bindingId = request.get('x-lc-agent-event-binding');
  const sourceKeyId = request.get('x-lc-agent-event-source-key');
  if (bindingId == null || sourceKeyId == null) {
    return null;
  }
  const binding = await deps.getEventBinding({
    user: target.userId,
    bindingId,
    sourceKeyId,
    ...(target.tenantId == null ? {} : { tenantId: target.tenantId }),
  });
  if (
    binding?.conversationId !== target.conversationId ||
    !isAgentEventRetentionActive(binding?.expiredAt)
  ) {
    return null;
  }
  const parent = await deps.getConvo(target.userId, binding.lineage.parentConversationId);
  if (
    parent == null ||
    parent.subagentThread != null ||
    parent.agent_id !== binding.lineage.parentAgentId ||
    (parent.tenantId ?? undefined) !== target.tenantId ||
    !isAgentEventRetentionActive(parent.expiredAt)
  ) {
    return null;
  }
  return {
    conversationId: binding.conversationId,
    agent_id: binding.agentId,
    ...(binding.tenantId == null ? {} : { tenantId: binding.tenantId }),
    ...(binding.isTemporary == null ? {} : { isTemporary: binding.isTemporary }),
    ...(binding.expiredAt == null ? {} : { expiredAt: binding.expiredAt }),
    agentEventBinding: binding.binding,
    subagentThread: binding.lineage,
  } as unknown as IConversation;
}

async function resolveSubagentThreadWrite(
  { getConvo, store }: SubagentThreadWriteGuardDeps,
  { userId, conversationId, tenantId }: SubagentThreadWriteTarget,
): Promise<SubagentThreadWriteResolution> {
  /** New child IDs are returned synchronously by the SDK before Mongo creation can
   * finish. Their reserved UUID namespace closes that brief window on every replica. */
  if (isReservedSubagentThreadId(conversationId)) {
    const conversation = await getConvo(userId, conversationId);
    return { blocked: true, conversation };
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
      const resolvedRequest = request as ResolvedConversationRequest;
      const resolvedConversation = resolved.conversation;
      const lineage = resolvedConversation?.subagentThread;
      const humanResume = deps.isHumanResumeAllowed;
      if (
        request.path === '/resume' &&
        resolvedConversation?.agentEventBinding != null &&
        lineage != null &&
        isAgentEventRetentionActive(resolvedConversation.expiredAt) &&
        humanResume != null &&
        (await humanResume({
          userId,
          conversationId: candidateConversationId,
          ...(tenantId == null ? {} : { tenantId }),
        }))
      ) {
        const parent = await deps.getConvo(userId, lineage.parentConversationId);
        if (
          parent != null &&
          parent.subagentThread == null &&
          parent.agent_id === lineage.parentAgentId &&
          (parent.tenantId ?? undefined) === tenantId &&
          isAgentEventRetentionActive(parent.expiredAt)
        ) {
          applyEventBindingContext(resolvedRequest, resolvedConversation);
          next();
          return;
        }
      }
      const boundConversation = await isBoundEventContinuation(
        deps,
        request as ResolvedConversationRequest,
        {
          userId,
          conversationId: candidateConversationId,
          ...(tenantId == null ? {} : { tenantId }),
        },
      );
      if (boundConversation != null) {
        applyEventBindingContext(resolvedRequest, boundConversation);
        next();
        return;
      }
      res.status(409).json({ error: CHILD_THREAD_READ_ONLY_ERROR });
    } catch (error) {
      next(error);
    }
  };
}
