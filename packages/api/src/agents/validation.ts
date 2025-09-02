import { z } from 'zod';

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
    ocr: agentBaseResourceSchema.optional(),
  })
  .optional();

/** Base agent schema with all common fields */
export const agentBaseSchema = z.object({
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  avatar: agentAvatarSchema.nullable().optional(),
  model_parameters: z.record(z.unknown()).optional(),
  tools: z.array(z.string()).optional(),
  agent_ids: z.array(z.string()).optional(),
  end_after_tools: z.boolean().optional(),
  hide_sequential_outputs: z.boolean().optional(),
  artifacts: z.string().optional(),
  recursion_limit: z.number().optional(),
  conversation_starters: z.array(z.string()).optional(),
  tool_resources: agentToolResourcesSchema,
});

/** Create schema extends base with required fields for creation */
export const agentCreateSchema = agentBaseSchema.extend({
  provider: z.string(),
  model: z.string().nullable(),
  tools: z.array(z.string()).optional().default([]),
});

/** Update schema extends base with all fields optional and additional update-only fields */
export const agentUpdateSchema = agentBaseSchema.extend({
  provider: z.string().optional(),
  model: z.string().nullable().optional(),
  projectIds: z.array(z.string()).optional(),
  removeProjectIds: z.array(z.string()).optional(),
  isCollaborative: z.boolean().optional(),
});
