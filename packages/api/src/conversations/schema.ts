import { z } from 'zod';
import { createHash } from 'crypto';
import { ContentTypes } from 'librechat-data-provider';
import type {
  ConversationMessageResource,
  ConversationPageBoundary,
  ConversationResource,
} from '@librechat/data-schemas';

import {
  CONTENT_TRAVERSAL_MAX_DEPTH,
  CONTENT_TRAVERSAL_MAX_NODES,
} from '~/protection/adapters/nested';

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 20;
const MAX_CURSOR_LENGTH = 1024;
export const MAX_CONVERSATION_MANAGEMENT_TITLE_LENGTH = 1024;
const MAX_TAGS = 100;
const MAX_TAG_LENGTH = 256;

const identifier = z.string().trim().min(1).max(512);
const tag = z.string().trim().min(1).max(MAX_TAG_LENGTH);
export const conversationTagsSchema: z.ZodType<string[], z.ZodTypeDef, unknown> = z
  .array(tag)
  .max(MAX_TAGS)
  .transform((values) => [...new Set(values)]);

export interface ConversationPageInput {
  limit: number;
  cursor?: string;
}

export interface ConversationListInput extends ConversationPageInput {
  agent_id?: string;
  tags?: string[];
  isArchived?: boolean;
}

export interface ConversationUpdate {
  title?: string;
  tags?: string[];
  isArchived?: boolean;
}

export const conversationPageSchema: z.ZodType<ConversationPageInput, z.ZodTypeDef, unknown> = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
    cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).optional(),
  })
  .strict();

export const conversationListSchema: z.ZodType<ConversationListInput, z.ZodTypeDef, unknown> = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
    cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).optional(),
    agent_id: identifier.optional(),
    tags: z
      .union([tag.transform((value) => [value]), conversationTagsSchema])
      .transform((values) => [...new Set(values)].sort())
      .optional(),
    isArchived: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

export const conversationUpdateSchema: z.ZodType<ConversationUpdate, z.ZodTypeDef, unknown> = z
  .object({
    title: z
      .string()
      .transform((value) => value.trim().slice(0, MAX_CONVERSATION_MANAGEMENT_TITLE_LENGTH))
      .pipe(z.string().min(1))
      .optional(),
    tags: conversationTagsSchema.optional(),
    isArchived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'An update is required');

export type ConversationCursorKind = 'conversations' | 'messages';

const cursorPayloadSchema = z
  .object({
    v: z.literal(1),
    kind: z.enum(['conversations', 'messages']),
    date: z.string().datetime(),
    id: z.string().regex(/^[a-f\d]{24}$/i),
    scope: z.string().regex(/^[a-f\d]{64}$/),
  })
  .strict();

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function encodeConversationCursor(
  kind: ConversationCursorKind,
  boundary: ConversationPageBoundary,
  binding: string,
): string {
  const payload = {
    v: 1 as const,
    kind,
    date: boundary.date,
    id: boundary.id,
    scope: digest(binding),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeConversationCursor(
  cursor: string | undefined,
  kind: ConversationCursorKind,
  binding: string,
): ConversationPageBoundary | undefined {
  if (cursor == null) return;
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new ConversationManagementError('invalid_request');
  }

  try {
    const payload = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    if (payload.kind !== kind || payload.scope !== digest(binding)) {
      throw new ConversationManagementError('invalid_request');
    }
    return { date: payload.date, id: payload.id };
  } catch (error) {
    if (error instanceof ConversationManagementError) throw error;
    throw new ConversationManagementError('invalid_request');
  }
}

const contentMetadata = {
  agentId: z.string().optional(),
  groupId: z.number().optional(),
  siblingIndex: z.number().optional(),
  progress: z.number().optional(),
  status: z.string().optional(),
  runStepStatus: z.string().optional(),
  runStepDurationMs: z.number().optional(),
  backgrounded: z.boolean().optional(),
};

const annotationRange = {
  start_index: z.number().int().nonnegative(),
  end_index: z.number().int().nonnegative(),
  text: z.string(),
};
const textAnnotation = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('file_citation'),
      ...annotationRange,
      file_citation: z.object({ file_id: z.string(), quote: z.string().optional() }).strip(),
    })
    .strip(),
  z
    .object({
      type: z.literal('file_path'),
      ...annotationRange,
      file_path: z.object({ file_id: z.string() }).strip(),
    })
    .strip(),
]);
const textValue = z.union([
  z.string(),
  z
    .object({ value: z.string().optional(), annotations: z.array(textAnnotation).optional() })
    .strip(),
]);
const jsonObject = z.record(z.string(), z.unknown());
/** Exports contain partial file references as well as complete attachment records. */
export const conversationFileSchema: z.ZodType<Record<string, unknown>> = z.object({
  file_id: z.string().nullish(),
  filename: z.string().nullish(),
  filepath: z.string().nullish(),
  type: z.string().nullish(),
  text: z.string().nullish(),
  preview: z.string().nullish(),
  messageId: z.string().nullish(),
  toolCallId: z.string().nullish(),
  agentId: z.string().nullish(),
  stepId: z.string().nullish(),
  bytes: z.number().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  embedded: z.boolean().nullish(),
  metadata: z.object({}).strip().nullish(),
});

const baseToolCall = z
  .object({
    id: z.string().optional(),
    type: z.string().optional(),
    name: z.string().optional(),
    stepId: z.string().optional(),
    mcpServerName: z.string().optional(),
    inputValidationError: z.boolean().optional(),
    subagent_content: z.lazy(() => z.array(contentSchema)).optional(),
    args: z.union([z.string(), jsonObject]).optional(),
    output: z.union([z.string(), jsonObject, z.array(z.unknown())]).nullish(),
    function: z
      .object({
        name: z.string(),
        arguments: z.union([z.string(), jsonObject]),
        output: z.union([z.string(), jsonObject, z.array(z.unknown())]).nullish(),
      })
      .strip()
      .optional(),
    ...contentMetadata,
  })
  .strip();

const codeOutput = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('logs'),
      logs: z.string().optional(),
      index: z.number().int().optional(),
    })
    .strip(),
  z
    .object({
      type: z.literal('image'),
      index: z.number().int().optional(),
      image: z
        .object({ file_id: z.string().optional(), detail: z.string().optional() })
        .strip()
        .optional(),
    })
    .strip(),
]);
const toolCall = z.union([
  baseToolCall.extend({
    type: z.literal('code_interpreter'),
    code_interpreter: z
      .object({ input: z.string().optional(), outputs: z.array(codeOutput).optional() })
      .strip()
      .optional(),
  }),
  baseToolCall.extend({ type: z.literal('retrieval'), retrieval: z.object({}).strip().optional() }),
  baseToolCall.extend({
    type: z.literal('file_search'),
    file_search: z
      .object({
        ranking_options: z
          .object({ ranker: z.string(), score_threshold: z.number() })
          .strip()
          .optional(),
        results: z
          .array(
            z
              .object({
                file_id: z.string(),
                file_name: z.string(),
                score: z.number(),
                content: z
                  .array(
                    z
                      .object({ type: z.literal('text').optional(), text: z.string().optional() })
                      .strip(),
                  )
                  .optional(),
              })
              .strip(),
          )
          .optional(),
      })
      .strip()
      .optional(),
  }),
  baseToolCall.refine(
    (value) => !['code_interpreter', 'retrieval', 'file_search'].includes(value.type ?? ''),
  ),
]);

const contentSchema: z.ZodType<Record<string, unknown>> = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal(ContentTypes.AGENT_UPDATE),
      agent_update: z
        .object({ index: z.number().int().nonnegative(), runId: z.string(), agentId: z.string() })
        .strip(),
    })
    .strip(),
  z
    .object({
      type: z.literal(ContentTypes.TEXT),
      text: textValue.optional(),
      phase: z.enum(['commentary', 'final_answer']).optional(),
      tool_call_ids: z.array(z.string()).optional(),
      ...contentMetadata,
    })
    .strip(),
  z
    .object({
      type: z.literal(ContentTypes.THINK),
      think: textValue.optional(),
      reasoning_label: z.string().optional(),
      reasoning_label_status: z.enum(['streaming', 'complete']).optional(),
      reasoning_unavailable: z.boolean().optional(),
      ...contentMetadata,
    })
    .strip(),
  z
    .object({
      type: z.literal(ContentTypes.ERROR),
      text: textValue.optional(),
      error: z.string().optional(),
      ...contentMetadata,
    })
    .strip(),
  z
    .object({
      type: z.literal(ContentTypes.TOOL_CALL),
      tool_call: toolCall,
      ...contentMetadata,
    })
    .strip(),
  z
    .object({
      type: z.literal(ContentTypes.IMAGE_URL),
      image_url: z.union([
        z.string(),
        z.object({ url: z.string(), detail: z.enum(['auto', 'low', 'high']).optional() }).strip(),
      ]),
      ...contentMetadata,
    })
    .strip(),
  z
    .object({
      type: z.literal(ContentTypes.IMAGE_FILE),
      image_file: z
        .object({ file_id: z.string().optional(), detail: z.string().optional() })
        .strip(),
      ...contentMetadata,
    })
    .strip(),
  z
    .object({
      type: z.literal(ContentTypes.VIDEO_URL),
      video_url: z.object({ url: z.string() }).strip(),
      ...contentMetadata,
    })
    .strip(),
  z
    .object({
      type: z.literal(ContentTypes.INPUT_AUDIO),
      input_audio: z.object({ data: z.string(), format: z.string() }).strip(),
      ...contentMetadata,
    })
    .strip(),
  z
    .object({
      type: z.literal(ContentTypes.SUMMARY),
      content: z
        .array(z.object({ type: z.literal(ContentTypes.TEXT), text: z.string() }).strip())
        .optional(),
      summarizing: z.boolean().optional(),
      failed: z.boolean().optional(),
      summaryVersion: z.number().optional(),
      tokenCount: z.number().optional(),
      model: z.string().optional(),
      provider: z.string().optional(),
      initiatedBy: z.literal('user').optional(),
      boundary: z
        .object({ messageId: z.string(), contentIndex: z.number().int().nonnegative() })
        .strip()
        .optional(),
      createdAt: z.string().optional(),
      ...contentMetadata,
    })
    .strip(),
  z
    .object({
      type: z.literal(ContentTypes.ACTIVITY_LABEL),
      activity_label: z.string().optional(),
      activity_label_type: z.literal('phase').optional(),
      tool_call_ids: z.array(z.string()).optional(),
      activity_start_index: z.number().optional(),
      activity_end_index: z.number().optional(),
      activity_count: z.number().optional(),
      agent_ids: z.array(z.string()).optional(),
      pending: z.boolean().optional(),
      ...contentMetadata,
    })
    .strip(),
  z
    .object({
      type: z.literal(ContentTypes.STEER),
      steer: z.string(),
      files: z.array(conversationFileSchema).optional(),
      steerId: z.string().optional(),
      clientSteerId: z.string().optional(),
      createdAt: z.number().optional(),
      quotes: z.array(z.string()).optional(),
      ...contentMetadata,
    })
    .strip(),
]);

function withinContentLimits(value: unknown, depth: number, budget: { nodes: number }): boolean {
  budget.nodes++;
  if (depth > CONTENT_TRAVERSAL_MAX_DEPTH || budget.nodes > CONTENT_TRAVERSAL_MAX_NODES)
    return false;
  if (value != null && typeof value === 'object') {
    for (const key in value) {
      if (!withinContentLimits((value as Record<string, unknown>)[key], depth + 1, budget))
        return false;
    }
  }
  return true;
}

export function isValidConversationContentPart(value: unknown): boolean {
  return withinContentLimits(value, 0, { nodes: 0 }) && contentSchema.safeParse(value).success;
}

function toTimestamp(value: Date | string | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export interface ConversationResponse {
  id: string;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  agent_id: string | null;
  tags: string[];
  isArchived: boolean;
}

export interface ConversationMessageResponse {
  id: string;
  conversationId: string;
  parentMessageId: string | null;
  text: string;
  content: object[];
  files: object[];
  attachments: object[];
  quotes: string[];
  sender: string;
  isCreatedByUser: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  unfinished: boolean;
  error: boolean;
  finish_reason: string | null;
}

export function projectConversation(source: ConversationResource): ConversationResponse {
  return {
    id: source.conversationId,
    title: source.title ?? '',
    createdAt: toTimestamp(source.createdAt),
    updatedAt: toTimestamp(source.updatedAt),
    agent_id: source.agent_id ?? null,
    tags: source.tags ?? [],
    isArchived: source.isArchived ?? false,
  };
}

export function projectConversationMessage(
  source: ConversationMessageResource,
): ConversationMessageResponse {
  const budget = { nodes: 0 };
  const projectParts = (parts: unknown, schema: z.ZodType<Record<string, unknown>>): object[] => {
    const projected: object[] = [];
    if (!Array.isArray(parts)) return projected;
    for (const part of parts) {
      if (budget.nodes >= CONTENT_TRAVERSAL_MAX_NODES) break;
      if (!withinContentLimits(part, 0, budget)) continue;
      const parsed = schema.safeParse(part);
      if (parsed.success) projected.push(parsed.data);
    }
    return projected;
  };
  const quotes =
    withinContentLimits(source.quotes, 0, budget) && Array.isArray(source.quotes)
      ? source.quotes.filter((quote): quote is string => typeof quote === 'string')
      : [];
  const content = projectParts(source.content, contentSchema);
  const files = projectParts(source.files, conversationFileSchema);
  const attachments = projectParts(source.attachments, conversationFileSchema);
  return {
    id: source.messageId,
    conversationId: source.conversationId,
    parentMessageId: source.parentMessageId ?? null,
    text: source.text ?? '',
    content,
    files,
    attachments,
    quotes,
    sender: source.sender ?? '',
    isCreatedByUser: source.isCreatedByUser,
    createdAt: toTimestamp(source.createdAt),
    updatedAt: toTimestamp(source.updatedAt),
    unfinished: source.unfinished ?? false,
    error: source.error ?? false,
    finish_reason: source.finish_reason ?? null,
  };
}

export type ConversationListResponse<T> = {
  object: 'list';
  data: T[];
  first_id: string | null;
  last_id: string | null;
  has_more: boolean;
  after: string | null;
};

export function projectConversationList<T extends { id: string }>(
  data: T[],
  hasMore: boolean,
  after: string | null,
): ConversationListResponse<T> {
  return {
    object: 'list',
    data,
    first_id: data[0]?.id ?? null,
    last_id: data[data.length - 1]?.id ?? null,
    has_more: hasMore,
    after: hasMore ? after : null,
  };
}

export type ConversationManagementErrorCode =
  | 'invalid_request'
  | 'not_found'
  | 'permission_denied'
  | 'internal_error';

export class ConversationManagementError extends Error {
  constructor(readonly code: ConversationManagementErrorCode) {
    super(code);
    this.name = 'ConversationManagementError';
  }
}

const ERROR_STATUS: Record<ConversationManagementErrorCode, number> = {
  invalid_request: 400,
  not_found: 404,
  permission_denied: 403,
  internal_error: 500,
};

const ERROR_MESSAGE: Record<ConversationManagementErrorCode, string> = {
  invalid_request: 'Invalid request',
  not_found: 'Conversation not found',
  permission_denied: 'Permission denied',
  internal_error: 'Internal server error',
};

export function mapConversationManagementError(
  code: ConversationManagementErrorCode,
  error?: unknown,
): {
  status: number;
  body: {
    error: {
      code: ConversationManagementErrorCode;
      message: string;
      details?: Array<{ path: Array<string | number>; message: string }>;
    };
  };
} {
  const details =
    code === 'invalid_request' && error instanceof z.ZodError
      ? error.issues.map(({ path, message }) => ({ path, message }))
      : undefined;
  return {
    status: ERROR_STATUS[code],
    body: {
      error: {
        code,
        message: ERROR_MESSAGE[code],
        ...(details ? { details } : {}),
      },
    },
  };
}
