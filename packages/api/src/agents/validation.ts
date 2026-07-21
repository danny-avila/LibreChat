import { z } from 'zod';
import { MemoryScope, MAX_SUBAGENTS, ViolationTypes, ErrorTypes } from 'librechat-data-provider';
import type { Agent, TModelsConfig } from 'librechat-data-provider';
import type { Request, Response } from 'express';

/**
 * Permissive Request alias used by {@link validateAgentModel}. Accepts either
 * the default Express `Request` or the project-specific `ServerRequest`
 * (see `~/types/http`), whose `params` type is widened to `unknown`.
 */
type LooseRequest = Request<unknown, unknown, unknown>;

/** Avatar schema shared between create and update */
export const agentAvatarSchema: z.ZodObject<
  {
    filepath: z.ZodString;
    source: z.ZodString;
  },
  'strip'
> = z.object({
  filepath: z.string(),
  source: z.string(),
});

/** Base resource schema for tool resources */
export const agentBaseResourceSchema: z.ZodObject<
  {
    file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
  },
  'strip'
> = z.object({
  file_ids: z.array(z.string()).optional(),
  files: z.array(z.unknown()).optional(), // Files are populated at runtime, not from user input
});

/** File resource schema extends base with vector_store_ids */
export const agentFileResourceSchema: z.ZodObject<
  {
    file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
  } & {
    vector_store_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
  },
  'strip'
> = agentBaseResourceSchema.extend({
  vector_store_ids: z.array(z.string()).optional(),
});

/** Tool resources schema matching AgentToolResources interface */
export const agentToolResourcesSchema: z.ZodOptional<
  z.ZodObject<
    {
      image_edit: z.ZodOptional<
        z.ZodObject<
          {
            file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
            files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
          },
          'strip',
          z.ZodTypeAny,
          {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          },
          {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        >
      >;
      execute_code: z.ZodOptional<
        z.ZodObject<
          {
            file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
            files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
          },
          'strip',
          z.ZodTypeAny,
          {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          },
          {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        >
      >;
      file_search: z.ZodOptional<
        z.ZodObject<
          {
            file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
            files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
          } & {
            vector_store_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
          },
          'strip',
          z.ZodTypeAny,
          {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
            vector_store_ids?: string[] | undefined;
          },
          {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
            vector_store_ids?: string[] | undefined;
          }
        >
      >;
      context: z.ZodOptional<
        z.ZodObject<
          {
            file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
            files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
          },
          'strip',
          z.ZodTypeAny,
          {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          },
          {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        >
      >;
      /** @deprecated Use context instead */
      ocr: z.ZodOptional<
        z.ZodObject<
          {
            file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
            files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
          },
          'strip',
          z.ZodTypeAny,
          {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          },
          {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        >
      >;
    },
    'strip',
    z.ZodTypeAny,
    {
      ocr?:
        | {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        | undefined;
      context?:
        | {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        | undefined;
      execute_code?:
        | {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        | undefined;
      file_search?:
        | {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
            vector_store_ids?: string[] | undefined;
          }
        | undefined;
      image_edit?:
        | {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        | undefined;
    },
    {
      ocr?:
        | {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        | undefined;
      context?:
        | {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        | undefined;
      execute_code?:
        | {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        | undefined;
      file_search?:
        | {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
            vector_store_ids?: string[] | undefined;
          }
        | undefined;
      image_edit?:
        | {
            file_ids?: string[] | undefined;
            files?: unknown[] | undefined;
          }
        | undefined;
    }
  >
> = z
  .object({
    image_edit: agentBaseResourceSchema.optional(),
    execute_code: agentBaseResourceSchema.optional(),
    file_search: agentFileResourceSchema.optional(),
    context: agentBaseResourceSchema.optional(),
    /** @deprecated Use context instead */
    ocr: agentBaseResourceSchema.optional(),
  })
  .optional();

/** Support contact schema for agent */
export const agentSupportContactSchema: z.ZodOptional<
  z.ZodObject<
    {
      name: z.ZodOptional<z.ZodString>;
      email: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<''>, z.ZodString]>>;
    },
    'strip',
    z.ZodTypeAny,
    {
      name?: string | undefined;
      email?: string | undefined;
    },
    {
      name?: string | undefined;
      email?: string | undefined;
    }
  >
> = z
  .object({
    name: z.string().optional(),
    email: z.union([z.literal(''), z.string().email()]).optional(),
  })
  .optional();

/** Graph edge schema for agent handoffs */
export const graphEdgeSchema: z.ZodObject<
  {
    from: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, 'many'>]>;
    to: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, 'many'>]>;
    description: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    edgeType: z.ZodOptional<z.ZodEnum<['handoff', 'direct']>>;
    prompt: z.ZodEffects<
      z.ZodOptional<
        z.ZodUnion<[z.ZodString, z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>]>
      >,
      string | ((...args: unknown[]) => unknown) | undefined,
      string | ((...args: unknown[]) => unknown) | undefined
    >;
    excludeResults: z.ZodOptional<z.ZodBoolean>;
    promptKey: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
  },
  'strip'
> = z.object({
  from: z.union([z.string(), z.array(z.string())]),
  to: z.union([z.string(), z.array(z.string())]),
  description: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  edgeType: z.enum(['handoff', 'direct']).optional(),
  prompt: z
    .union([z.string(), z.function()])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  excludeResults: z.boolean().optional(),
  promptKey: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

/** Per-tool options schema (defer_loading, allowed_callers, run_in_background) */
export const toolOptionsSchema: z.ZodObject<
  {
    defer_loading: z.ZodOptional<z.ZodBoolean>;
    allowed_callers: z.ZodOptional<z.ZodArray<z.ZodEnum<['direct', 'code_execution']>, 'many'>>;
    run_in_background: z.ZodOptional<z.ZodBoolean>;
  },
  'strip'
> = z.object({
  defer_loading: z.boolean().optional(),
  allowed_callers: z.array(z.enum(['direct', 'code_execution'])).optional(),
  run_in_background: z.boolean().optional(),
});

/** Agent tool options - map of tool_id to tool options */
export const agentToolOptionsSchema: z.ZodOptional<
  z.ZodRecord<
    z.ZodString,
    z.ZodObject<
      {
        defer_loading: z.ZodOptional<z.ZodBoolean>;
        allowed_callers: z.ZodOptional<z.ZodArray<z.ZodEnum<['direct', 'code_execution']>, 'many'>>;
        run_in_background: z.ZodOptional<z.ZodBoolean>;
      },
      'strip',
      z.ZodTypeAny,
      {
        defer_loading?: boolean | undefined;
        allowed_callers?: ('direct' | 'code_execution')[] | undefined;
        run_in_background?: boolean | undefined;
      },
      {
        defer_loading?: boolean | undefined;
        allowed_callers?: ('direct' | 'code_execution')[] | undefined;
        run_in_background?: boolean | undefined;
      }
    >
  >
> = z.record(z.string(), toolOptionsSchema).optional();

/**
 * Subagent spawning configuration for an agent. `agent_ids` is capped at
 * `Constants.MAX_SUBAGENTS` so a crafted API request cannot trigger hundreds
 * of `processAgent` calls (DB lookup + permission check + tool loading).
 * The UI enforces the same cap, so legitimate payloads never hit the bound.
 */
export const agentSubagentsSchema: z.ZodOptional<
  z.ZodObject<
    {
      enabled: z.ZodOptional<z.ZodBoolean>;
      allowSelf: z.ZodOptional<z.ZodBoolean>;
      agent_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    },
    'strip',
    z.ZodTypeAny,
    {
      enabled?: boolean | undefined;
      agent_ids?: string[] | undefined;
      allowSelf?: boolean | undefined;
    },
    {
      enabled?: boolean | undefined;
      agent_ids?: string[] | undefined;
      allowSelf?: boolean | undefined;
    }
  >
> = z
  .object({
    enabled: z.boolean().optional(),
    allowSelf: z.boolean().optional(),
    agent_ids: z.array(z.string()).max(MAX_SUBAGENTS).optional(),
  })
  .optional();

/** Base agent schema with all common fields */
export const agentBaseSchema: z.ZodObject<
  {
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    instructions: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    avatar: z.ZodOptional<
      z.ZodNullable<
        z.ZodObject<
          {
            filepath: z.ZodString;
            source: z.ZodString;
          },
          'strip',
          z.ZodTypeAny,
          {
            source: string;
            filepath: string;
          },
          {
            source: string;
            filepath: string;
          }
        >
      >
    >;
    model_parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    tools: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    skills_enabled: z.ZodOptional<z.ZodBoolean>;
    memory_scope: z.ZodOptional<z.ZodNativeEnum<typeof MemoryScope>>;
    /** @deprecated Use edges instead */
    agent_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    edges: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            from: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, 'many'>]>;
            to: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, 'many'>]>;
            description: z.ZodEffects<
              z.ZodOptional<z.ZodString>,
              string | undefined,
              string | undefined
            >;
            edgeType: z.ZodOptional<z.ZodEnum<['handoff', 'direct']>>;
            prompt: z.ZodEffects<
              z.ZodOptional<
                z.ZodUnion<[z.ZodString, z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>]>
              >,
              string | ((...args: unknown[]) => unknown) | undefined,
              string | ((...args: unknown[]) => unknown) | undefined
            >;
            excludeResults: z.ZodOptional<z.ZodBoolean>;
            promptKey: z.ZodEffects<
              z.ZodOptional<z.ZodString>,
              string | undefined,
              string | undefined
            >;
          },
          'strip',
          z.ZodTypeAny,
          {
            from: string | string[];
            to: string | string[];
            description?: string | undefined;
            prompt?: string | ((...args: unknown[]) => unknown) | undefined;
            edgeType?: 'direct' | 'handoff' | undefined;
            excludeResults?: boolean | undefined;
            promptKey?: string | undefined;
          },
          {
            from: string | string[];
            to: string | string[];
            description?: string | undefined;
            prompt?: string | ((...args: unknown[]) => unknown) | undefined;
            edgeType?: 'direct' | 'handoff' | undefined;
            excludeResults?: boolean | undefined;
            promptKey?: string | undefined;
          }
        >,
        'many'
      >
    >;
    end_after_tools: z.ZodOptional<z.ZodBoolean>;
    hide_sequential_outputs: z.ZodOptional<z.ZodBoolean>;
    stateful_code_sessions: z.ZodOptional<z.ZodBoolean>;
    artifacts: z.ZodOptional<z.ZodString>;
    recursion_limit: z.ZodOptional<z.ZodNumber>;
    conversation_starters: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    tool_resources: z.ZodOptional<
      z.ZodObject<
        {
          image_edit: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
          execute_code: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
          file_search: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              } & {
                vector_store_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              }
            >
          >;
          context: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
          /** @deprecated Use context instead */
          ocr: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
        },
        'strip',
        z.ZodTypeAny,
        {
          ocr?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          context?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          execute_code?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          file_search?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              }
            | undefined;
          image_edit?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
        },
        {
          ocr?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          context?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          execute_code?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          file_search?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              }
            | undefined;
          image_edit?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
        }
      >
    >;
    tool_options: z.ZodOptional<
      z.ZodRecord<
        z.ZodString,
        z.ZodObject<
          {
            defer_loading: z.ZodOptional<z.ZodBoolean>;
            allowed_callers: z.ZodOptional<
              z.ZodArray<z.ZodEnum<['direct', 'code_execution']>, 'many'>
            >;
            run_in_background: z.ZodOptional<z.ZodBoolean>;
          },
          'strip',
          z.ZodTypeAny,
          {
            defer_loading?: boolean | undefined;
            allowed_callers?: ('direct' | 'code_execution')[] | undefined;
            run_in_background?: boolean | undefined;
          },
          {
            defer_loading?: boolean | undefined;
            allowed_callers?: ('direct' | 'code_execution')[] | undefined;
            run_in_background?: boolean | undefined;
          }
        >
      >
    >;
    subagents: z.ZodOptional<
      z.ZodObject<
        {
          enabled: z.ZodOptional<z.ZodBoolean>;
          allowSelf: z.ZodOptional<z.ZodBoolean>;
          agent_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
        },
        'strip',
        z.ZodTypeAny,
        {
          enabled?: boolean | undefined;
          agent_ids?: string[] | undefined;
          allowSelf?: boolean | undefined;
        },
        {
          enabled?: boolean | undefined;
          agent_ids?: string[] | undefined;
          allowSelf?: boolean | undefined;
        }
      >
    >;
    support_contact: z.ZodOptional<
      z.ZodObject<
        {
          name: z.ZodOptional<z.ZodString>;
          email: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<''>, z.ZodString]>>;
        },
        'strip',
        z.ZodTypeAny,
        {
          name?: string | undefined;
          email?: string | undefined;
        },
        {
          name?: string | undefined;
          email?: string | undefined;
        }
      >
    >;
    category: z.ZodOptional<z.ZodString>;
  },
  'strip'
> = z.object({
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  avatar: agentAvatarSchema.nullable().optional(),
  model_parameters: z.record(z.unknown()).optional(),
  tools: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  skills_enabled: z.boolean().optional(),
  memory_scope: z.nativeEnum(MemoryScope).optional(),
  /** @deprecated Use edges instead */
  agent_ids: z.array(z.string()).optional(),
  edges: z.array(graphEdgeSchema).optional(),
  end_after_tools: z.boolean().optional(),
  hide_sequential_outputs: z.boolean().optional(),
  stateful_code_sessions: z.boolean().optional(),
  artifacts: z.string().optional(),
  recursion_limit: z.number().optional(),
  conversation_starters: z.array(z.string()).optional(),
  tool_resources: agentToolResourcesSchema,
  tool_options: agentToolOptionsSchema,
  subagents: agentSubagentsSchema,
  support_contact: agentSupportContactSchema,
  category: z.string().optional(),
});

/** Create schema extends base with required fields for creation */
export const agentCreateSchema: z.ZodObject<
  {
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    instructions: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    avatar: z.ZodOptional<
      z.ZodNullable<
        z.ZodObject<
          {
            filepath: z.ZodString;
            source: z.ZodString;
          },
          'strip',
          z.ZodTypeAny,
          {
            source: string;
            filepath: string;
          },
          {
            source: string;
            filepath: string;
          }
        >
      >
    >;
    model_parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    skills_enabled: z.ZodOptional<z.ZodBoolean>;
    memory_scope: z.ZodOptional<z.ZodNativeEnum<typeof MemoryScope>>;
    agent_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    edges: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            from: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, 'many'>]>;
            to: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, 'many'>]>;
            description: z.ZodEffects<
              z.ZodOptional<z.ZodString>,
              string | undefined,
              string | undefined
            >;
            edgeType: z.ZodOptional<z.ZodEnum<['handoff', 'direct']>>;
            prompt: z.ZodEffects<
              z.ZodOptional<
                z.ZodUnion<[z.ZodString, z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>]>
              >,
              string | ((...args: unknown[]) => unknown) | undefined,
              string | ((...args: unknown[]) => unknown) | undefined
            >;
            excludeResults: z.ZodOptional<z.ZodBoolean>;
            promptKey: z.ZodEffects<
              z.ZodOptional<z.ZodString>,
              string | undefined,
              string | undefined
            >;
          },
          'strip',
          z.ZodTypeAny,
          {
            from: string | string[];
            to: string | string[];
            description?: string | undefined;
            prompt?: string | ((...args: unknown[]) => unknown) | undefined;
            edgeType?: 'direct' | 'handoff' | undefined;
            excludeResults?: boolean | undefined;
            promptKey?: string | undefined;
          },
          {
            from: string | string[];
            to: string | string[];
            description?: string | undefined;
            prompt?: string | ((...args: unknown[]) => unknown) | undefined;
            edgeType?: 'direct' | 'handoff' | undefined;
            excludeResults?: boolean | undefined;
            promptKey?: string | undefined;
          }
        >,
        'many'
      >
    >;
    end_after_tools: z.ZodOptional<z.ZodBoolean>;
    hide_sequential_outputs: z.ZodOptional<z.ZodBoolean>;
    stateful_code_sessions: z.ZodOptional<z.ZodBoolean>;
    artifacts: z.ZodOptional<z.ZodString>;
    recursion_limit: z.ZodOptional<z.ZodNumber>;
    conversation_starters: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    tool_resources: z.ZodOptional<
      z.ZodObject<
        {
          image_edit: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
          execute_code: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
          file_search: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              } & {
                vector_store_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              }
            >
          >;
          context: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
          /** @deprecated Use context instead */
          ocr: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
        },
        'strip',
        z.ZodTypeAny,
        {
          ocr?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          context?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          execute_code?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          file_search?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              }
            | undefined;
          image_edit?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
        },
        {
          ocr?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          context?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          execute_code?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          file_search?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              }
            | undefined;
          image_edit?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
        }
      >
    >;
    tool_options: z.ZodOptional<
      z.ZodRecord<
        z.ZodString,
        z.ZodObject<
          {
            defer_loading: z.ZodOptional<z.ZodBoolean>;
            allowed_callers: z.ZodOptional<
              z.ZodArray<z.ZodEnum<['direct', 'code_execution']>, 'many'>
            >;
            run_in_background: z.ZodOptional<z.ZodBoolean>;
          },
          'strip',
          z.ZodTypeAny,
          {
            defer_loading?: boolean | undefined;
            allowed_callers?: ('direct' | 'code_execution')[] | undefined;
            run_in_background?: boolean | undefined;
          },
          {
            defer_loading?: boolean | undefined;
            allowed_callers?: ('direct' | 'code_execution')[] | undefined;
            run_in_background?: boolean | undefined;
          }
        >
      >
    >;
    subagents: z.ZodOptional<
      z.ZodObject<
        {
          enabled: z.ZodOptional<z.ZodBoolean>;
          allowSelf: z.ZodOptional<z.ZodBoolean>;
          agent_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
        },
        'strip',
        z.ZodTypeAny,
        {
          enabled?: boolean | undefined;
          agent_ids?: string[] | undefined;
          allowSelf?: boolean | undefined;
        },
        {
          enabled?: boolean | undefined;
          agent_ids?: string[] | undefined;
          allowSelf?: boolean | undefined;
        }
      >
    >;
    support_contact: z.ZodOptional<
      z.ZodObject<
        {
          name: z.ZodOptional<z.ZodString>;
          email: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<''>, z.ZodString]>>;
        },
        'strip',
        z.ZodTypeAny,
        {
          name?: string | undefined;
          email?: string | undefined;
        },
        {
          name?: string | undefined;
          email?: string | undefined;
        }
      >
    >;
    category: z.ZodOptional<z.ZodString>;
  } & {
    provider: z.ZodString;
    model: z.ZodNullable<z.ZodString>;
    tools: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>>;
  },
  'strip'
> = agentBaseSchema.extend({
  provider: z.string(),
  model: z.string().nullable(),
  tools: z.array(z.string()).optional().default([]),
});

/** Update schema extends base with all fields optional and additional update-only fields */
export const agentUpdateSchema: z.ZodObject<
  {
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    instructions: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    model_parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    tools: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    skills_enabled: z.ZodOptional<z.ZodBoolean>;
    memory_scope: z.ZodOptional<z.ZodNativeEnum<typeof MemoryScope>>;
    agent_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    edges: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            from: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, 'many'>]>;
            to: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, 'many'>]>;
            description: z.ZodEffects<
              z.ZodOptional<z.ZodString>,
              string | undefined,
              string | undefined
            >;
            edgeType: z.ZodOptional<z.ZodEnum<['handoff', 'direct']>>;
            prompt: z.ZodEffects<
              z.ZodOptional<
                z.ZodUnion<[z.ZodString, z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>]>
              >,
              string | ((...args: unknown[]) => unknown) | undefined,
              string | ((...args: unknown[]) => unknown) | undefined
            >;
            excludeResults: z.ZodOptional<z.ZodBoolean>;
            promptKey: z.ZodEffects<
              z.ZodOptional<z.ZodString>,
              string | undefined,
              string | undefined
            >;
          },
          'strip',
          z.ZodTypeAny,
          {
            from: string | string[];
            to: string | string[];
            description?: string | undefined;
            prompt?: string | ((...args: unknown[]) => unknown) | undefined;
            edgeType?: 'direct' | 'handoff' | undefined;
            excludeResults?: boolean | undefined;
            promptKey?: string | undefined;
          },
          {
            from: string | string[];
            to: string | string[];
            description?: string | undefined;
            prompt?: string | ((...args: unknown[]) => unknown) | undefined;
            edgeType?: 'direct' | 'handoff' | undefined;
            excludeResults?: boolean | undefined;
            promptKey?: string | undefined;
          }
        >,
        'many'
      >
    >;
    end_after_tools: z.ZodOptional<z.ZodBoolean>;
    hide_sequential_outputs: z.ZodOptional<z.ZodBoolean>;
    stateful_code_sessions: z.ZodOptional<z.ZodBoolean>;
    artifacts: z.ZodOptional<z.ZodString>;
    recursion_limit: z.ZodOptional<z.ZodNumber>;
    conversation_starters: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
    tool_resources: z.ZodOptional<
      z.ZodObject<
        {
          image_edit: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
          execute_code: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
          file_search: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              } & {
                vector_store_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              }
            >
          >;
          context: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
          /** @deprecated Use context instead */
          ocr: z.ZodOptional<
            z.ZodObject<
              {
                file_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
                files: z.ZodOptional<z.ZodArray<z.ZodUnknown, 'many'>>;
              },
              'strip',
              z.ZodTypeAny,
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              },
              {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            >
          >;
        },
        'strip',
        z.ZodTypeAny,
        {
          ocr?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          context?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          execute_code?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          file_search?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              }
            | undefined;
          image_edit?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
        },
        {
          ocr?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          context?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          execute_code?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
          file_search?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
                vector_store_ids?: string[] | undefined;
              }
            | undefined;
          image_edit?:
            | {
                file_ids?: string[] | undefined;
                files?: unknown[] | undefined;
              }
            | undefined;
        }
      >
    >;
    tool_options: z.ZodOptional<
      z.ZodRecord<
        z.ZodString,
        z.ZodObject<
          {
            defer_loading: z.ZodOptional<z.ZodBoolean>;
            allowed_callers: z.ZodOptional<
              z.ZodArray<z.ZodEnum<['direct', 'code_execution']>, 'many'>
            >;
            run_in_background: z.ZodOptional<z.ZodBoolean>;
          },
          'strip',
          z.ZodTypeAny,
          {
            defer_loading?: boolean | undefined;
            allowed_callers?: ('direct' | 'code_execution')[] | undefined;
            run_in_background?: boolean | undefined;
          },
          {
            defer_loading?: boolean | undefined;
            allowed_callers?: ('direct' | 'code_execution')[] | undefined;
            run_in_background?: boolean | undefined;
          }
        >
      >
    >;
    subagents: z.ZodOptional<
      z.ZodObject<
        {
          enabled: z.ZodOptional<z.ZodBoolean>;
          allowSelf: z.ZodOptional<z.ZodBoolean>;
          agent_ids: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
        },
        'strip',
        z.ZodTypeAny,
        {
          enabled?: boolean | undefined;
          agent_ids?: string[] | undefined;
          allowSelf?: boolean | undefined;
        },
        {
          enabled?: boolean | undefined;
          agent_ids?: string[] | undefined;
          allowSelf?: boolean | undefined;
        }
      >
    >;
    support_contact: z.ZodOptional<
      z.ZodObject<
        {
          name: z.ZodOptional<z.ZodString>;
          email: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<''>, z.ZodString]>>;
        },
        'strip',
        z.ZodTypeAny,
        {
          name?: string | undefined;
          email?: string | undefined;
        },
        {
          name?: string | undefined;
          email?: string | undefined;
        }
      >
    >;
    category: z.ZodOptional<z.ZodString>;
  } & {
    avatar: z.ZodOptional<
      z.ZodUnion<
        [
          z.ZodObject<
            {
              filepath: z.ZodString;
              source: z.ZodString;
            },
            'strip',
            z.ZodTypeAny,
            {
              source: string;
              filepath: string;
            },
            {
              source: string;
              filepath: string;
            }
          >,
          z.ZodNull,
        ]
      >
    >;
    provider: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  },
  'strip'
> = agentBaseSchema.extend({
  avatar: z.union([agentAvatarSchema, z.null()]).optional(),
  provider: z.string().optional(),
  model: z.string().nullable().optional(),
});

export interface ValidateAgentModelParams {
  req: LooseRequest;
  res: Response;
  agent: Agent;
  modelsConfig: TModelsConfig;
  logViolation: (
    req: LooseRequest,
    res: Response,
    type: string,
    errorMessage: Record<string, unknown>,
    score?: number | string,
  ) => Promise<void>;
}

interface ValidateAgentModelResult {
  isValid: boolean;
  error?: {
    message: string;
  };
}

/**
 * Validates an agent's model against the available models configuration.
 * This is a non-middleware version of validateModel that can be used
 * in service initialization flows.
 *
 * @param params - Validation parameters
 * @returns Object indicating whether the model is valid and any error details
 */
export async function validateAgentModel(
  params: ValidateAgentModelParams,
): Promise<ValidateAgentModelResult> {
  const { req, res, agent, modelsConfig, logViolation } = params;
  const { model, provider: endpoint } = agent;

  if (!model) {
    return {
      isValid: false,
      error: {
        message: `{ "type": "${ErrorTypes.MISSING_MODEL}", "info": "${endpoint}" }`,
      },
    };
  }

  if (!modelsConfig) {
    return {
      isValid: false,
      error: {
        message: `{ "type": "${ErrorTypes.MODELS_NOT_LOADED}" }`,
      },
    };
  }

  const availableModels = modelsConfig[endpoint];
  if (!availableModels) {
    return {
      isValid: false,
      error: {
        message: `{ "type": "${ErrorTypes.ENDPOINT_MODELS_NOT_LOADED}", "info": "${endpoint}" }`,
      },
    };
  }

  const validModel = !!availableModels.find((availableModel) => availableModel === model);

  if (validModel) {
    return { isValid: true };
  }

  const { ILLEGAL_MODEL_REQ_SCORE: score = 1 } = process.env ?? {};
  const type = ViolationTypes.ILLEGAL_MODEL_REQUEST;
  const errorMessage = {
    type,
    model,
    endpoint,
  };

  await logViolation(req, res, type, errorMessage, score);

  return {
    isValid: false,
    error: {
      message: `{ "type": "${ViolationTypes.ILLEGAL_MODEL_REQUEST}", "info": "${endpoint}|${model}" }`,
    },
  };
}
