import type { NextFunction, Response } from 'express';

type MessageValidationUser = {
  id: string;
  tenantId?: string | null;
};

type MessageValidationBody = {
  conversationId?: string;
  message?: {
    conversationId?: string;
  };
};

type MessageValidationParams = {
  conversationId?: string;
  messageId?: string;
};

export type MessageValidationRequest = {
  method?: string;
  params?: MessageValidationParams;
  body?: MessageValidationBody;
  user: MessageValidationUser;
  messageRequestValidation?: MessageRequestValidation;
};

type ConversationRecord = {
  user?: string;
} | null;

type PendingActionRecord = unknown;

type GenerationJobRecord = {
  status?: string;
  metadata?: {
    userId?: string;
    tenantId?: string | null;
    pendingAction?: PendingActionRecord;
  };
} | null;

export type MessageValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      body: unknown;
      send?: boolean;
    };

export type FailedMessageValidationResult = Extract<MessageValidationResult, { ok: false }>;

export type MessageRequestValidation = {
  conversationId?: string;
  shouldFetchMessages: boolean;
  promise: Promise<MessageValidationResult>;
};

type MessageValidationLogger = {
  warn: (message: string, error: unknown) => void;
};

export type MessageValidationDeps = {
  getConvo: (userId: string, conversationId?: string) => Promise<ConversationRecord>;
  getJob: (conversationId?: string) => Promise<GenerationJobRecord>;
  isPendingActionStale: (job: { pendingAction?: PendingActionRecord }) => boolean;
  logger: MessageValidationLogger;
};

export type MessageRequestMiddleware = {
  createMessageRequestValidation: (req: MessageValidationRequest) => MessageRequestValidation;
  prepareMessageRequestValidation: (
    req: MessageValidationRequest,
    res: Response,
    next: NextFunction,
  ) => void;
  sendValidationResponse: (res: Response, result: FailedMessageValidationResult) => Response;
  validateMessageReq: (
    req: MessageValidationRequest,
    res: Response,
    next: NextFunction,
  ) => Promise<Response | void>;
};

function hasTenantMismatch(job: GenerationJobRecord, user: MessageValidationUser): boolean {
  // Untenanted jobs remain readable by their owner for pre-multi-tenancy deployments.
  return job?.metadata?.tenantId != null && job.metadata.tenantId !== user.tenantId;
}

export function createMessageRequestMiddleware(
  deps: MessageValidationDeps,
): MessageRequestMiddleware {
  async function canReadActiveJobConversation(
    req: MessageValidationRequest,
    conversationId?: string,
  ): Promise<boolean> {
    if (req.method !== 'GET' || req.params?.messageId) {
      return false;
    }

    let job: GenerationJobRecord;
    try {
      job = await deps.getJob(conversationId);
    } catch (error) {
      deps.logger.warn(
        `[validateMessageReq] Active job lookup failed for ${conversationId}:`,
        error,
      );
      return false;
    }

    if (!job) {
      return false;
    }

    // A job paused for human review is still active (consistent with /chat/status
    // and /chat/active), so a new-conversation run that pauses before its final
    // save can still recover the prompt, but only while it has a live,
    // resolvable prompt (missing/malformed or past-expiry reads as inactive).
    const isActive =
      job.status === 'running' ||
      (job.status === 'requires_action' &&
        !deps.isPendingActionStale({ pendingAction: job.metadata?.pendingAction }));
    if (!isActive) {
      return false;
    }

    return job.metadata?.userId === req.user.id && !hasTenantMismatch(job, req.user);
  }

  async function validateConversationAccess(
    req: MessageValidationRequest,
    conversationId?: string,
  ): Promise<MessageValidationResult> {
    const conversation = await deps.getConvo(req.user.id, conversationId);

    if (!conversation) {
      if (await canReadActiveJobConversation(req, conversationId)) {
        return { ok: true };
      }

      return { ok: false, status: 404, body: { error: 'Conversation not found' } };
    }

    if (conversation.user !== req.user.id) {
      return {
        ok: false,
        status: 403,
        body: { error: 'User not authorized for this conversation' },
      };
    }

    return { ok: true };
  }

  function createMessageRequestValidation(req: MessageValidationRequest): MessageRequestValidation {
    const body = req.body ?? {};
    const paramConversationId = req.params?.conversationId;
    const bodyConversationId = body.conversationId;
    const nestedConversationId = body.message?.conversationId;

    if (
      (paramConversationId &&
        ((bodyConversationId && paramConversationId !== bodyConversationId) ||
          (nestedConversationId && paramConversationId !== nestedConversationId))) ||
      (bodyConversationId && nestedConversationId && bodyConversationId !== nestedConversationId)
    ) {
      return {
        shouldFetchMessages: false,
        promise: Promise.resolve({
          ok: false,
          status: 400,
          body: { error: 'Conversation ID mismatch' },
        }),
      };
    }

    const conversationId = paramConversationId || bodyConversationId || nestedConversationId;

    if (conversationId === 'new') {
      return {
        conversationId,
        shouldFetchMessages: false,
        promise: Promise.resolve({ ok: false, status: 200, body: [], send: true }),
      };
    }

    return {
      conversationId,
      shouldFetchMessages: true,
      promise: validateConversationAccess(req, conversationId),
    };
  }

  function sendValidationResponse(res: Response, result: FailedMessageValidationResult): Response {
    if (result.send) {
      return res.status(result.status).send(result.body);
    }
    return res.status(result.status).json(result.body);
  }

  function prepareMessageRequestValidation(
    req: MessageValidationRequest,
    _res: Response,
    next: NextFunction,
  ): void {
    req.messageRequestValidation = createMessageRequestValidation(req);
    next();
  }

  async function validateMessageReq(
    req: MessageValidationRequest,
    res: Response,
    next: NextFunction,
  ): Promise<Response | void> {
    const validation = createMessageRequestValidation(req);
    const result = await validation.promise;
    if (!result.ok) {
      return sendValidationResponse(res, result);
    }
    next();
  }

  return {
    createMessageRequestValidation: createMessageRequestValidation,
    prepareMessageRequestValidation: prepareMessageRequestValidation,
    sendValidationResponse: sendValidationResponse,
    validateMessageReq: validateMessageReq,
  };
}
