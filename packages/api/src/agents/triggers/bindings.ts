import { createHash } from 'node:crypto';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type {
  AgentMethods,
  ConversationMethods,
  IAgentEventBindingRecord,
  IConversation,
} from '@librechat/data-schemas';
import type { Request, RequestHandler, Response } from 'express';
import { createSubagentThreadId } from '../subagentThreadIds';

const BINDING_ID_PATTERN = /^evtbind_[a-f0-9]{48}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~:/+=-]+$/;
const MAX_ACTOR_ID_LENGTH = 128;
const MAX_REGISTRATION_KEY_LENGTH = 256;

interface EventBindingUser {
  id?: string;
  role?: string;
  tenantId?: string;
}

interface EventBindingRequest extends Request {
  apiKeyId?: { toString(): string } | string;
  user?: EventBindingUser;
  _agentEventBindingResolved?: boolean;
}

interface RegisterBindingBody {
  actorId?: unknown;
  parentConversationId?: unknown;
  parentMessageId?: unknown;
  target?: { agentId?: unknown };
}

export interface AgentEventBindingDependencies {
  getAgent: AgentMethods['getAgent'];
  getConvo: ConversationMethods['getConvo'];
  getBinding: ConversationMethods['getAgentEventBinding'];
  reserveThread: ConversationMethods['reserveSubagentThread'];
  enabled?: () => boolean;
}

class AgentEventBindingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'invalid_event_binding',
  ) {
    super(message);
    this.name = 'AgentEventBindingError';
  }
}

function requireString(value: unknown, name: string, max = 256): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
    throw new AgentEventBindingError(`${name} must be a non-empty string of at most ${max} bytes`);
  }
  return value;
}

function requirePrincipal(req: EventBindingRequest): {
  userId: string;
  tenantId?: string;
  sourceKeyId: string;
} {
  const userId = requireString(req.user?.id, 'Authenticated user ID');
  const sourceKeyId = requireString(req.apiKeyId?.toString(), 'Authenticated API key ID');
  return {
    userId,
    sourceKeyId,
    ...(typeof req.user?.tenantId === 'string' && req.user.tenantId !== ''
      ? { tenantId: req.user.tenantId }
      : {}),
  };
}

function tenantMatches(actual: string | undefined, expected: string | undefined): boolean {
  return actual == null ? expected == null : actual === expected;
}

function configuredChild(parentAgent: Record<string, unknown>, targetAgentId: string): boolean {
  const parentId = typeof parentAgent.id === 'string' ? parentAgent.id : undefined;
  const subagents = parentAgent.subagents as
    | { enabled?: boolean; allowSelf?: boolean; agent_ids?: unknown[] }
    | undefined;
  if (subagents?.enabled !== true) {
    return false;
  }
  if (targetAgentId === parentId && subagents.allowSelf !== false) {
    return true;
  }
  return subagents.agent_ids?.includes(targetAgentId) === true;
}

function bindingId(
  userId: string,
  tenantId: string | undefined,
  sourceKeyId: string,
  registrationKey: string,
): string {
  const digest = createHash('sha256')
    .update(
      `librechat:agent-event-binding:v1\u0000${userId}\u0000${tenantId ?? ''}\u0000${sourceKeyId}\u0000${registrationKey}`,
    )
    .digest('hex');
  return `evtbind_${digest.slice(0, 48)}`;
}

function registrationKey(req: Request): string {
  const values: string[] = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLowerCase() === 'idempotency-key') {
      values.push(req.rawHeaders[index + 1] ?? '');
    }
  }
  if (values.length !== 1) {
    throw new AgentEventBindingError('Exactly one Idempotency-Key header is required');
  }
  const value = requireString(values[0].trim(), 'Idempotency-Key', MAX_REGISTRATION_KEY_LENGTH);
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new AgentEventBindingError('Idempotency-Key contains invalid characters');
  }
  return value;
}

function publicBinding(record: IAgentEventBindingRecord) {
  return {
    id: record.binding.bindingId,
    actorId: record.binding.actorId,
    agentId: record.agentId,
    threadId: record.conversationId,
  };
}

function assertReplay(
  conversation: IConversation,
  expected: {
    bindingId: string;
    sourceKeyId: string;
    actorId: string;
    parentConversationId: string;
    parentMessageId: string;
    parentAgentId: string;
    targetAgentId: string;
  },
): void {
  const binding = conversation.agentEventBinding;
  const lineage = conversation.subagentThread;
  if (
    binding?.bindingId !== expected.bindingId ||
    binding.sourceKeyId !== expected.sourceKeyId ||
    binding.actorId !== expected.actorId ||
    conversation.agent_id !== expected.targetAgentId ||
    lineage?.parentConversationId !== expected.parentConversationId ||
    lineage.parentMessageId !== expected.parentMessageId ||
    lineage.parentAgentId !== expected.parentAgentId ||
    lineage.subagentType !== expected.targetAgentId ||
    lineage.subagentKind !== 'agent' ||
    lineage.depth !== 1
  ) {
    throw new AgentEventBindingError(
      'Idempotency-Key was already used for a different event binding',
      409,
      'idempotency_conflict',
    );
  }
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof AgentEventBindingError) {
    res.status(error.status).json({
      error: { message: error.message, type: 'invalid_request_error', code: error.code },
    });
    return;
  }
  throw error;
}

function requireEnabled(deps: AgentEventBindingDependencies): void {
  if (deps.enabled?.() !== true) {
    throw new AgentEventBindingError(
      'Event-driven child turns are not enabled on this deployment',
      503,
      'event_binding_unavailable',
    );
  }
}

export function createAgentEventBindingHandlers(deps: AgentEventBindingDependencies): {
  register: RequestHandler;
  resolve: RequestHandler;
} {
  const register: RequestHandler = async (baseReq, res, next) => {
    const req = baseReq as EventBindingRequest;
    try {
      requireEnabled(deps);
      const principal = requirePrincipal(req);
      const body = (req.body ?? {}) as RegisterBindingBody;
      const actorId = requireString(body.actorId, 'actorId', MAX_ACTOR_ID_LENGTH);
      const parentConversationId = requireString(body.parentConversationId, 'parentConversationId');
      const parentMessageId = requireString(body.parentMessageId, 'parentMessageId');
      const targetAgentId = requireString(body.target?.agentId, 'target.agentId');
      const parent = await deps.getConvo(principal.userId, parentConversationId);
      if (
        parent == null ||
        parent.subagentThread != null ||
        !tenantMatches(parent.tenantId, principal.tenantId) ||
        typeof parent.agent_id !== 'string'
      ) {
        throw new AgentEventBindingError('Parent agent conversation was not found', 404);
      }
      const resolvedParentAgent = await deps.getAgent({ id: parent.agent_id });
      if (resolvedParentAgent == null || !configuredChild(resolvedParentAgent, targetAgentId)) {
        throw new AgentEventBindingError(
          'Target agent is not configured as a direct child of the parent agent',
          403,
          'event_binding_forbidden',
        );
      }

      const id = bindingId(
        principal.userId,
        principal.tenantId,
        principal.sourceKeyId,
        registrationKey(req),
      );
      const scopeId = JSON.stringify({
        userId: principal.userId,
        parentConversationId,
        ...(principal.tenantId == null ? {} : { tenantId: principal.tenantId }),
      });
      const threadId = createSubagentThreadId(scopeId, id);
      const expected = {
        bindingId: id,
        sourceKeyId: principal.sourceKeyId,
        actorId,
        parentConversationId,
        parentMessageId,
        parentAgentId: parent.agent_id,
        targetAgentId,
      };
      const reserved = await deps.reserveThread({
        user: principal.userId,
        conversationId: threadId,
        ...(principal.tenantId == null ? {} : { tenantId: principal.tenantId }),
        conversation: {
          conversationId: threadId,
          endpoint: EModelEndpoint.agents,
          title: `Agent actor: ${actorId}`.slice(0, 120),
          agent_id: targetAgentId,
          ...(parent.isTemporary == null ? {} : { isTemporary: parent.isTemporary }),
          ...(parent.expiredAt == null ? {} : { expiredAt: parent.expiredAt }),
          ...(principal.tenantId == null ? {} : { tenantId: principal.tenantId }),
          agentEventBinding: { bindingId: id, sourceKeyId: principal.sourceKeyId, actorId },
          subagentThread: {
            rootConversationId: parentConversationId,
            parentConversationId,
            parentMessageId,
            parentToolCallId: `event-binding:${id}`,
            parentAgentId: parent.agent_id,
            subagentType: targetAgentId,
            subagentKind: 'agent',
            depth: 1,
          },
        },
      });
      assertReplay(reserved.conversation, expected);
      res.status(reserved.created ? 201 : 200).json(
        publicBinding({
          conversationId: threadId,
          agentId: targetAgentId,
          ...(principal.tenantId == null ? {} : { tenantId: principal.tenantId }),
          binding: reserved.conversation.agentEventBinding!,
          lineage: reserved.conversation.subagentThread!,
        }),
      );
    } catch (error) {
      try {
        sendError(res, error);
      } catch (unexpected) {
        next(unexpected);
      }
    }
  };

  const resolve: RequestHandler = async (baseReq, res, next) => {
    const req = baseReq as EventBindingRequest;
    try {
      const principal = requirePrincipal(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (body.mode !== 'continue') {
        if (body.bindingId != null) {
          throw new AgentEventBindingError('bindingId is valid only for continue events');
        }
        next();
        return;
      }
      requireEnabled(deps);
      const id = requireString(body.bindingId, 'bindingId');
      if (!BINDING_ID_PATTERN.test(id)) {
        throw new AgentEventBindingError('bindingId is invalid');
      }
      const binding = await deps.getBinding({
        user: principal.userId,
        bindingId: id,
        sourceKeyId: principal.sourceKeyId,
        ...(principal.tenantId == null ? {} : { tenantId: principal.tenantId }),
      });
      if (binding == null) {
        throw new AgentEventBindingError(
          'Event binding was not found',
          404,
          'event_binding_not_found',
        );
      }
      req.body = {
        ...body,
        orderingKey: typeof body.orderingKey === 'string' ? body.orderingKey : id,
        mode: 'continue',
        target: {
          agentId: binding.agentId,
          conversationId: binding.conversationId,
          parentMessageId: Constants.NO_PARENT,
          bindingId: id,
          sourceKeyId: principal.sourceKeyId,
        },
      };
      req._agentEventBindingResolved = true;
      next();
    } catch (error) {
      try {
        sendError(res, error);
      } catch (unexpected) {
        next(unexpected);
      }
    }
  };

  return { register, resolve };
}
