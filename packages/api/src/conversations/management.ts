import { z } from 'zod';
import { logger } from '@librechat/data-schemas';
import { EModelEndpoint } from 'librechat-data-provider';
import type {
  ConversationMethods,
  ConversationResource,
  ConversationResourceMethods,
  ConversationTagMethods,
} from '@librechat/data-schemas';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import {
  ConversationManagementError,
  conversationListSchema,
  conversationPageSchema,
  conversationUpdateSchema,
  decodeConversationCursor,
  encodeConversationCursor,
  mapConversationManagementError,
  projectConversation,
  projectConversationList,
  projectConversationMessage,
} from './schema';
import { isContentFilterError } from '../middleware/contentFilter';
import { updateConversationMetadata } from './metadata';

type DeleteConversations = (
  userId: string,
  filter: Parameters<ConversationMethods['deleteConvos']>[1],
  tenantId?: string,
  checkpointer?: TCheckpointerConfig,
  options?: { allowMissingRoot?: boolean },
) => Promise<Awaited<ReturnType<ConversationMethods['deleteConvos']>>>;

export interface ConversationManagementHandlerDeps {
  initializeAssistantClient: (options: {
    req: ServerRequest;
    res: Response;
    endpoint: EModelEndpoint.assistants | EModelEndpoint.azureAssistants;
    version: string;
  }) => Promise<{
    openai: { beta: { threads: { delete: (threadId: string) => Promise<unknown> } } };
  }>;

  canRecoverAgentConversationDeletion: (
    userId: string,
    conversationId: string,
    tenantId?: string,
    checkpointer?: TCheckpointerConfig,
  ) => Promise<boolean>;
  getConversationResourceDeletionState: ConversationResourceMethods['getConversationResourceDeletionState'];
  getConversationResource: ConversationResourceMethods['getConversationResource'];
  getConversationProviderThreadIds: ConversationResourceMethods['getConversationProviderThreadIds'];
  listConversationResources: ConversationResourceMethods['listConversationResources'];
  listConversationMessageResources: ConversationResourceMethods['listConversationMessageResources'];
  saveConvo: ConversationMethods['saveConvo'];
  updateConversationResourceTags: ConversationTagMethods['updateConversationResourceTags'];
  deleteConversations: DeleteConversations;
}

function tenantId(req: ServerRequest): string | undefined {
  return req.user?.tenantId;
}

function resourceId(req: ServerRequest): string {
  return (req.params as { id: string }).id;
}

function requireDate(value: Date | undefined): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ConversationManagementError('internal_error');
  }
  return value.toISOString();
}

function listBinding(
  req: ServerRequest,
  input: { agent_id?: string; tags?: string[]; isArchived?: boolean },
): string {
  return JSON.stringify({
    user: req.user?.id,
    tenantId: tenantId(req) ?? null,
    agent_id: input.agent_id ?? null,
    tags: input.tags ?? [],
    isArchived: input.isArchived ?? null,
  });
}

function messageBinding(req: ServerRequest, conversationId: string): string {
  return JSON.stringify({
    user: req.user?.id,
    tenantId: tenantId(req) ?? null,
    conversationId,
  });
}

function sendError(res: Response, error: unknown): Response {
  if (isContentFilterError(error)) {
    return res.status(error.statusCode).json(error.body);
  }
  let code: 'invalid_request' | 'internal_error' | ConversationManagementError['code'];
  if (error instanceof ConversationManagementError) {
    code = error.code;
  } else if (error instanceof z.ZodError) {
    code = 'invalid_request';
  } else {
    code = 'internal_error';
  }
  if (code === 'internal_error') {
    logger.error('[conversationManagement] Request failed', error);
  }
  const mapped = mapConversationManagementError(code, error);
  return res.status(mapped.status).json(mapped.body);
}

function nextConversationCursor(
  row: ConversationResource | undefined,
  binding: string,
): string | null {
  if (row == null) return null;
  return encodeConversationCursor(
    'conversations',
    { date: requireDate(row.updatedAt), id: row._id.toString() },
    binding,
  );
}

export function createConversationManagementHandlers(deps: ConversationManagementHandlerDeps): {
  list: (req: ServerRequest, res: Response) => Promise<Response>;
  get: (req: ServerRequest, res: Response) => Promise<Response>;
  messages: (req: ServerRequest, res: Response) => Promise<Response>;
  update: (req: ServerRequest, res: Response) => Promise<Response>;
  remove: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const get = async (req: ServerRequest, res: Response): Promise<Response> => {
    try {
      const conversation = await deps.getConversationResource(
        req.user!.id,
        tenantId(req),
        resourceId(req),
      );
      if (conversation == null) throw new ConversationManagementError('not_found');
      return res.status(200).json(projectConversation(conversation));
    } catch (error) {
      return sendError(res, error);
    }
  };

  const list = async (req: ServerRequest, res: Response): Promise<Response> => {
    try {
      const input = conversationListSchema.parse(req.query);
      const binding = listBinding(req, input);
      const boundary = decodeConversationCursor(input.cursor, 'conversations', binding);
      const rows = await deps.listConversationResources(req.user!.id, tenantId(req), {
        limit: input.limit,
        boundary,
        agent_id: input.agent_id,
        tags: input.tags,
        isArchived: input.isArchived,
      });
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const data = page.map(projectConversation);
      const after = hasMore ? nextConversationCursor(page[page.length - 1], binding) : null;
      return res.status(200).json(projectConversationList(data, hasMore, after));
    } catch (error) {
      return sendError(res, error);
    }
  };

  const messages = async (req: ServerRequest, res: Response): Promise<Response> => {
    try {
      const input = conversationPageSchema.parse(req.query);
      const id = resourceId(req);
      const binding = messageBinding(req, id);
      const boundary = decodeConversationCursor(input.cursor, 'messages', binding);
      const rows = await deps.listConversationMessageResources(req.user!.id, tenantId(req), id, {
        limit: input.limit,
        boundary,
      });
      if (rows == null) throw new ConversationManagementError('not_found');
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const data = page.map(projectConversationMessage);
      const last = page[page.length - 1];
      const after =
        !hasMore || last == null
          ? null
          : encodeConversationCursor(
              'messages',
              { date: requireDate(last.createdAt), id: last._id.toString() },
              binding,
            );
      return res.status(200).json(projectConversationList(data, hasMore, after));
    } catch (error) {
      return sendError(res, error);
    }
  };

  const update = async (req: ServerRequest, res: Response): Promise<Response> => {
    try {
      const input = conversationUpdateSchema.parse(req.body);
      const owner = req.user!.id;
      const conversationTenantId = tenantId(req);
      const id = resourceId(req);
      const existing = await deps.getConversationResource(owner, conversationTenantId, id);
      if (existing == null) throw new ConversationManagementError('not_found');

      const saved = await updateConversationMetadata(deps, {
        userId: owner,
        tenantId: conversationTenantId,
        conversationId: id,
        ...input,
        filters: req.config?.filters,
        interfaceConfig: req.config?.interfaceConfig,
      });
      if (saved == null) throw new ConversationManagementError('not_found');

      return res.status(200).json(projectConversation({ ...existing, ...saved }));
    } catch (error) {
      return sendError(res, error);
    }
  };

  const remove = async (req: ServerRequest, res: Response): Promise<Response> => {
    try {
      const owner = req.user!.id;
      const conversationTenantId = tenantId(req);
      const id = resourceId(req);
      const existing = await deps.getConversationResource(owner, conversationTenantId, id);
      const allowMissingRoot = existing == null;
      const checkpointer = req.config?.endpoints?.agents?.checkpointer;
      if (allowMissingRoot) {
        const state = await deps.getConversationResourceDeletionState(
          owner,
          conversationTenantId,
          id,
        );
        if (
          state === 'present' ||
          (state === 'missing' &&
            !(await deps.canRecoverAgentConversationDeletion(
              owner,
              id,
              conversationTenantId,
              checkpointer,
            )))
        ) {
          throw new ConversationManagementError('not_found');
        }
      }
      if (
        existing &&
        (existing.endpoint === EModelEndpoint.assistants ||
          existing.endpoint === EModelEndpoint.azureAssistants)
      ) {
        const threadIds = await deps.getConversationProviderThreadIds(
          owner,
          conversationTenantId,
          id,
        );
        if (threadIds.length > 0) {
          const providerReq = Object.create(req) as ServerRequest;
          Object.defineProperties(providerReq, {
            body: { value: { model: existing.model } },
            query: { value: {} },
          });
          const { openai } = await deps.initializeAssistantClient({
            req: providerReq,
            res,
            endpoint: existing.endpoint,
            version: 'v2',
          });
          for (const threadId of threadIds) {
            try {
              await openai.beta.threads.delete(threadId);
            } catch (error) {
              if (
                error == null ||
                typeof error !== 'object' ||
                !('status' in error) ||
                error.status !== 404
              )
                throw error;
            }
          }
        }
      }
      await deps.deleteConversations(
        owner,
        {
          conversationId: id,
          ...(conversationTenantId == null
            ? { tenantId: { $exists: false } }
            : { tenantId: conversationTenantId }),
        },
        conversationTenantId,
        checkpointer,
        { allowMissingRoot },
      );
      return res.status(200).json({ id, deleted: true });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Conversation not found or already deleted.'
      ) {
        return sendError(res, new ConversationManagementError('not_found'));
      }
      return sendError(res, error);
    }
  };

  return { list, get, messages, update, remove };
}
