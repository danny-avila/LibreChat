import { Constants } from 'librechat-data-provider';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ConversationMethods } from '@librechat/data-schemas';
import { buildSubagentThreadTaskConfig, SubagentThreadTaskStore } from './subagentThreads';

const AGENTS_CHAT_BASE_URL = '/api/agents/chat';
const CHILD_VIEW_ONLY_ERROR =
  'This child thread is view-only. Continue it from its parent agent using the saved thread history.';
const CHILD_BUSY_ERROR =
  'This child thread is still running. Wait for it to settle before starting a user turn.';
const CHILD_AGENT_ERROR = 'This child thread can only be continued with its original saved agent.';

interface SubagentTurnBody {
  conversationId?: unknown;
  arg?: { conversationId?: unknown };
  agent_id?: unknown;
  clientRequestId?: unknown;
}

interface SubagentTurnUser {
  id?: string;
  _id?: string | { toString(): string };
  tenantId?: string;
}

interface SubagentThreadTurnLease {
  retain(): void;
  release(): void;
}

type SubagentTurnRequest = Request & {
  subagentThreadTurnLease?: SubagentThreadTurnLease;
};

export interface SubagentThreadTurnGuardDeps {
  getConvo: ConversationMethods['getConvo'];
  store: SubagentThreadTaskStore;
}

function rejectTurn(res: Response, message: string): Response {
  return res.status(409).json({ error: message });
}

/** Enforces durable child write policy and acquires the shared process-local writer lease. */
export function createSubagentThreadTurnGuard({
  getConvo,
  store,
}: SubagentThreadTurnGuardDeps): RequestHandler {
  return async (request: Request, res: Response, next: NextFunction): Promise<void> => {
    const req = request as SubagentTurnRequest;
    const body = req.body as SubagentTurnBody | undefined;
    const user = req.user as SubagentTurnUser | undefined;
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
      const conversation = await getConvo(userId, candidateConversationId);
      if (conversation == null) {
        if (store.isThreadActiveForOwner(userId, candidateConversationId, tenantId)) {
          rejectTurn(res, CHILD_BUSY_ERROR);
          return;
        }
        next();
        return;
      }
      const lineage = conversation.subagentThread;
      if (lineage == null) {
        next();
        return;
      }
      if (req.baseUrl !== AGENTS_CHAT_BASE_URL) {
        rejectTurn(res, CHILD_AGENT_ERROR);
        return;
      }
      if (
        typeof body?.agent_id === 'string' &&
        typeof conversation.agent_id === 'string' &&
        body.agent_id !== conversation.agent_id
      ) {
        rejectTurn(res, CHILD_AGENT_ERROR);
        return;
      }
      if (lineage.userRunnable !== true) {
        rejectTurn(res, CHILD_VIEW_ONLY_ERROR);
        return;
      }

      const config = buildSubagentThreadTaskConfig(store, {
        userId,
        parentConversationId: lineage.parentConversationId,
        ...(tenantId == null ? {} : { tenantId }),
      });
      const release = store.acquireUserTurn(
        config.scopeId,
        candidateConversationId,
        typeof body?.clientRequestId === 'string' ? body.clientRequestId : undefined,
      );
      if (release == null) {
        rejectTurn(res, CHILD_BUSY_ERROR);
        return;
      }
      let released = false;
      let retainedByGeneration = false;
      const releaseOnce = (): void => {
        if (released) {
          return;
        }
        released = true;
        release();
      };
      req.subagentThreadTurnLease = {
        /** Agents chat acknowledges before background generation settles. */
        retain: () => {
          retainedByGeneration = true;
        },
        release: releaseOnce,
      };
      const releaseUnretained = (): void => {
        if (!retainedByGeneration) {
          releaseOnce();
        }
      };
      res.once('finish', releaseUnretained);
      res.once('close', releaseUnretained);
      next();
    } catch (error) {
      next(error);
    }
  };
}
