import { z } from 'zod';
import { ViolationTypes, ErrorTypes } from 'librechat-data-provider';
import type { Agent, TModelsConfig } from 'librechat-data-provider';
import type { Request, Response } from 'express';

/** Avatar schema shared between create and update */
export const agentAvatarSchema = z.object({
  filepath: z.string(),
  source: z.string(),
});

/** Base resource schema for tool resources */
export const agentBaseResourceSchema = z.object({
  file_ids: z.array(z.string()).optional(),
  files: z.array(z.any()).optional(), // Files are populated at runtime, not from user input
});

/** File resource schema extends base with vector_store_ids */
export const agentFileResourceSchema = agentBaseResourceSchema.extend({
  vector_store_ids: z.array(z.string()).optional(),
});

/** Tool resources schema matching AgentToolResources interface */
export const agentToolResourcesSchema = z
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
export const agentSupportContactSchema = z
  .object({
    name: z.string().optional(),
    email: z.union([z.literal(''), z.string().email()]).optional(),
  })
  .optional();

/** Graph edge schema for agent handoffs */
export const graphEdgeSchema = z.object({
  from: z.union([z.string(), z.array(z.string())]),
  to: z.union([z.string(), z.array(z.string())]),
  description: z.string().optional(),
  edgeType: z.enum(['handoff', 'direct']).optional(),
  prompt: z.union([z.string(), z.function()]).optional(),
  excludeResults: z.boolean().optional(),
  promptKey: z.string().optional(),
});

/** Per-tool options schema (defer_loading, allowed_callers) */
export const toolOptionsSchema = z.object({
  defer_loading: z.boolean().optional(),
  allowed_callers: z.array(z.enum(['direct', 'code_execution'])).optional(),
});

/** Agent tool options - map of tool_id to tool options */
export const agentToolOptionsSchema = z.record(z.string(), toolOptionsSchema).optional();

/** Base agent schema with all common fields */
export const agentBaseSchema = z.object({
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  avatar: agentAvatarSchema.nullable().optional(),
  model_parameters: z.record(z.unknown()).optional(),
  tools: z.array(z.string()).optional(),
  /** @deprecated Use edges instead */
  agent_ids: z.array(z.string()).optional(),
  edges: z.array(graphEdgeSchema).optional(),
  end_after_tools: z.boolean().optional(),
  hide_sequential_outputs: z.boolean().optional(),
  artifacts: z.string().optional(),
  recursion_limit: z.number().optional(),
  conversation_starters: z.array(z.string()).optional(),
  tool_resources: agentToolResourcesSchema,
  tool_options: agentToolOptionsSchema,
  support_contact: agentSupportContactSchema,
  category: z.string().optional(),
});

/** Create schema extends base with required fields for creation */
export const agentCreateSchema = agentBaseSchema.extend({
  provider: z.string(),
  model: z.string().nullable(),
  tools: z.array(z.string()).optional().default([]),
});

/** Update schema extends base with all fields optional and additional update-only fields */
export const agentUpdateSchema = agentBaseSchema.extend({
  avatar: z.union([agentAvatarSchema, z.null()]).optional(),
  provider: z.string().optional(),
  model: z.string().nullable().optional(),
});

interface ValidateAgentModelParams {
  req: Request;
  res: Response;
  agent: Agent;
  modelsConfig: TModelsConfig;
  logViolation: (
    req: Request,
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
