import { z } from 'zod';
import { agentCreateSchema, agentUpdateSchema } from './validation';

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 20;
const MAX_CURSOR_LENGTH = 512;

/**
 * Agent Management accepts the browser-supported configuration fields, but unlike the
 * browser endpoints it rejects unknown top-level fields instead of silently stripping them.
 */
export const agentManagementCreateSchema = agentCreateSchema.strict();
export const agentManagementUpdateSchema = agentUpdateSchema.strict();

const agentManagementCursorSchema = z
  .string()
  .min(1)
  .max(MAX_CURSOR_LENGTH)
  .superRefine((cursor, context) => {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as unknown;
      const result = z
        .object({
          updatedAt: z.string().datetime(),
          _id: z.string().regex(/^[a-f\d]{24}$/i),
        })
        .strict()
        .safeParse(decoded);

      if (!result.success) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor' });
      }
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor' });
    }
  });

export const agentManagementListSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
    cursor: agentManagementCursorSchema.optional(),
  })
  .strict();

const timestampSchema = z.string().datetime();

/** The externally supported Agent shape. Persistence and ownership fields are intentionally absent. */
export const agentManagementResponseSchema = agentUpdateSchema
  .extend({
    id: z.string().min(1),
    provider: z.string(),
    model: z.string().nullable(),
    version: z.number().int().nonnegative(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const agentManagementListResponseSchema = z
  .object({
    object: z.literal('list'),
    data: z.array(agentManagementResponseSchema),
    first_id: z.string().nullable(),
    last_id: z.string().nullable(),
    has_more: z.boolean(),
    after: agentManagementCursorSchema.nullable(),
  })
  .strict()
  .superRefine(({ has_more, after }, context) => {
    if (has_more !== (after != null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['after'],
        message: 'A next cursor is required exactly when more results are available',
      });
    }
  });

export const agentManagementErrorCodeSchema = z.enum([
  'invalid_request',
  'not_found',
  'permission_denied',
  'internal_error',
]);

const agentManagementValidationIssueSchema = z
  .object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  })
  .strict();

export const agentManagementErrorSchema = z
  .object({
    error: z
      .object({
        code: agentManagementErrorCodeSchema,
        message: z.string(),
        details: z.array(agentManagementValidationIssueSchema).optional(),
      })
      .strict(),
  })
  .strict();

export type AgentManagementCreate = z.infer<typeof agentManagementCreateSchema>;
export type AgentManagementUpdate = z.infer<typeof agentManagementUpdateSchema>;
export type AgentManagementList = z.infer<typeof agentManagementListSchema>;
export type AgentManagementResponse = z.infer<typeof agentManagementResponseSchema>;
export type AgentManagementListResponse = z.infer<typeof agentManagementListResponseSchema>;
export type AgentManagementError = z.infer<typeof agentManagementErrorSchema>;
export type AgentManagementErrorCode = z.infer<typeof agentManagementErrorCodeSchema>;

const RESPONSE_CONFIG_FIELDS = [
  'name',
  'description',
  'instructions',
  'avatar',
  'model_parameters',
  'tools',
  'skills',
  'skills_enabled',
  'skill_authoring_enabled',
  'skills_scope',
  'memory_scope',
  'agent_ids',
  'edges',
  'end_after_tools',
  'hide_sequential_outputs',
  'stateful_code_sessions',
  'stateful_code_environment',
  'code_environment_id',
  'artifacts',
  'recursion_limit',
  'conversation_starters',
  'tool_resources',
  'tool_options',
  'subagents',
  'support_contact',
  'category',
] as const;

function toTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' ? value : undefined;
}

/** Build an external response from an untrusted persistence result using an explicit allowlist. */
export function projectAgentManagementResponse(source: unknown): AgentManagementResponse {
  const record =
    source != null && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  const projected: Record<string, unknown> = {
    id: record.id,
    provider: record.provider,
    model: record.model,
    version:
      typeof record.version === 'number'
        ? record.version
        : Array.isArray(record.versions)
          ? record.versions.length
          : undefined,
    createdAt: toTimestamp(record.createdAt),
    updatedAt: toTimestamp(record.updatedAt),
  };

  for (const field of RESPONSE_CONFIG_FIELDS) {
    if (record[field] !== undefined) {
      projected[field] = record[field];
    }
  }

  return agentManagementResponseSchema.parse(projected);
}

export function projectAgentManagementListResponse(source: {
  data?: unknown[];
  has_more?: unknown;
  after?: unknown;
}): AgentManagementListResponse {
  const data = (source.data ?? []).map(projectAgentManagementResponse);
  return agentManagementListResponseSchema.parse({
    object: 'list',
    data,
    first_id: data[0]?.id ?? null,
    last_id: data[data.length - 1]?.id ?? null,
    has_more: source.has_more,
    after: source.has_more === true && typeof source.after === 'string' ? source.after : null,
  });
}

const ERROR_STATUS: Record<AgentManagementErrorCode, number> = {
  invalid_request: 400,
  not_found: 404,
  permission_denied: 403,
  internal_error: 500,
};

const ERROR_MESSAGE: Record<AgentManagementErrorCode, string> = {
  invalid_request: 'Invalid request',
  not_found: 'Agent not found',
  permission_denied: 'Permission denied',
  internal_error: 'Internal server error',
};

/** Map known failure classes to a stable envelope without exposing internal error messages. */
export function mapAgentManagementError(
  code: AgentManagementErrorCode,
  error?: unknown,
): { status: number; body: AgentManagementError } {
  const details =
    code === 'invalid_request' && error instanceof z.ZodError
      ? error.issues.map(({ path, message }) => ({ path, message }))
      : undefined;
  const body = agentManagementErrorSchema.parse({
    error: {
      code,
      message: ERROR_MESSAGE[code],
      ...(details != null ? { details } : {}),
    },
  });

  return { status: ERROR_STATUS[code], body };
}
