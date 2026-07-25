import { z } from 'zod';
import { RE2JS } from 're2js';

export const FILTER_PII_STARTER_PATTERNS = [
  'sk_prefix',
  'bearer_header',
  'api_key_header',
] as const;

const MAX_CUSTOM_PATTERN_LENGTH = 512;

export const MESSAGE_FILTER_FIELDS = [
  'name',
  'text',
  'summary',
  'quote',
  'answer',
  'decision_response',
  'decision_reason',
  'content_part',
  'attachment_reference',
  'assembled_context',
] as const;

export const PROMPT_FILTER_FIELDS = [
  'name',
  'description',
  'oneliner',
  'category',
  'command',
  'text',
  'preset_text',
  'system',
  'context',
  'instructions',
  'additional_instructions',
  'greeting',
  'example_input',
  'example_output',
] as const;

export const AGENT_INSTRUCTION_FILTER_FIELDS = [
  'name',
  'category',
  'description',
  'instructions',
  'additional_instructions',
  'edge_description',
  'edge_prompt',
  'edge_prompt_key',
  'artifacts',
  'support_contact_name',
  'support_contact_email',
] as const;

export const CONVERSATION_STARTER_FILTER_FIELDS = ['text'] as const;
export const CONVERSATION_TITLE_FILTER_FIELDS = ['title'] as const;
export const FEEDBACK_FILTER_FIELDS = ['text'] as const;

export const SKILL_FILTER_FIELDS = [
  'name',
  'display_title',
  'description',
  'category',
  'frontmatter',
  'instructions',
  'imported_text',
  'file_name',
  'file_text',
] as const;

export const MEMORY_FILTER_FIELDS = ['key', 'value', 'summary'] as const;

export const FILE_FILTER_FIELDS = [
  'name',
  'content',
  'extracted_text',
  'transcript',
  'uri',
] as const;

export const TOOL_ARGUMENT_FILTER_FIELDS = ['name', 'arguments', 'output'] as const;

export const MODEL_PARAMETER_FILTER_FIELDS = [
  'stop',
  'request_fields',
  'response_format',
  'metadata',
] as const;

export const ACTION_METADATA_FILTER_FIELDS = [
  'raw_spec',
  'domain',
  'privacy_policy_url',
  'authorization_type',
  'custom_auth_header',
  'authorization_content_type',
  'authorization_url',
  'client_url',
  'scope',
  'token_exchange_method',
  'api_key',
  'oauth_client_id',
  'oauth_client_secret',
] as const;

export const messageFilterFieldSchema = z.enum(MESSAGE_FILTER_FIELDS);
export const promptFilterFieldSchema = z.enum(PROMPT_FILTER_FIELDS);
export const agentInstructionFilterFieldSchema = z.enum(AGENT_INSTRUCTION_FILTER_FIELDS);
export const conversationStarterFilterFieldSchema = z.enum(CONVERSATION_STARTER_FILTER_FIELDS);
export const conversationTitleFilterFieldSchema = z.enum(CONVERSATION_TITLE_FILTER_FIELDS);
export const feedbackFilterFieldSchema = z.enum(FEEDBACK_FILTER_FIELDS);
export const skillFilterFieldSchema = z.enum(SKILL_FILTER_FIELDS);
export const memoryFilterFieldSchema = z.enum(MEMORY_FILTER_FIELDS);
export const fileFilterFieldSchema = z.enum(FILE_FILTER_FIELDS);
export const toolArgumentFilterFieldSchema = z.enum(TOOL_ARGUMENT_FILTER_FIELDS);
export const modelParameterFilterFieldSchema = z.enum(MODEL_PARAMETER_FILTER_FIELDS);
export const filterPiiStarterPatternSchema = z.enum(FILTER_PII_STARTER_PATTERNS);
export const actionMetadataFilterFieldSchema = z.enum(ACTION_METADATA_FILTER_FIELDS);

export type MessageFilterField = z.infer<typeof messageFilterFieldSchema>;
export type PromptFilterField = z.infer<typeof promptFilterFieldSchema>;
export type AgentInstructionFilterField = z.infer<typeof agentInstructionFilterFieldSchema>;
export type ConversationStarterFilterField = z.infer<typeof conversationStarterFilterFieldSchema>;
export type ConversationTitleFilterField = z.infer<typeof conversationTitleFilterFieldSchema>;
export type FeedbackFilterField = z.infer<typeof feedbackFilterFieldSchema>;
export type SkillFilterField = z.infer<typeof skillFilterFieldSchema>;
export type MemoryFilterField = z.infer<typeof memoryFilterFieldSchema>;
export type FileFilterField = z.infer<typeof fileFilterFieldSchema>;
export type ToolArgumentFilterField = z.infer<typeof toolArgumentFilterFieldSchema>;
export type ModelParameterFilterField = z.infer<typeof modelParameterFilterFieldSchema>;
export type ActionMetadataFilterField = z.infer<typeof actionMetadataFilterFieldSchema>;

type PiiPatternSelection = {
  readonly starterPatterns?: readonly unknown[];
  readonly customPatterns?: readonly unknown[];
};

const UNINSPECTABLE_FILE_FIELDS = new Set<FileFilterField>([
  'content',
  'extracted_text',
  'transcript',
]);

/**
 * An omitted starter selection enables the built-in catalog. An explicit
 * empty selection disables it, so a source is active only when custom rules
 * remain. This mirrors the documented filter semantics without compiling
 * regular expressions.
 */
export function hasActivePiiPatterns(config: PiiPatternSelection | null | undefined): boolean {
  return (
    config != null &&
    (config.starterPatterns == null ||
      config.starterPatterns.length > 0 ||
      (config.customPatterns?.length ?? 0) > 0)
  );
}

/**
 * Returns whether a parsed source-aware config can enforce any rule. An
 * explicit fail-close file policy remains active even without text patterns.
 */
export function hasActiveFiltersConfig(filters: FiltersConfig | null | undefined): boolean {
  if (filters == null) {
    return false;
  }
  const sourcePatterns = [
    filters.messages?.pii,
    filters.prompts?.pii,
    filters.agentInstructions?.pii,
    filters.conversationStarters?.pii,
    filters.conversationTitles?.pii,
    filters.feedback?.pii,
    filters.skills?.pii,
    filters.memories?.pii,
    filters.files?.pii,
    filters.toolArguments?.pii,
    filters.modelParameters?.pii,
    filters.actionMetadata?.pii,
  ];
  if (sourcePatterns.some(hasActivePiiPatterns)) {
    return true;
  }
  const filePii = filters.files?.pii;
  return (
    filePii?.uninspectable === 'block' &&
    (filePii.fields == null || filePii.fields.some((field) => UNINSPECTABLE_FILE_FIELDS.has(field)))
  );
}

export const filterPiiRegexSchema = z
  .string()
  .min(1)
  .max(MAX_CUSTOM_PATTERN_LENGTH)
  .refine(
    (value) => {
      try {
        RE2JS.compile(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Regex must use supported linear-time syntax' },
  );

export const filterPiiCustomPatternSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    regex: filterPiiRegexSchema,
  })
  .strict();

export type FilterPiiCustomPatternConfig = z.infer<typeof filterPiiCustomPatternSchema>;

function createPiiFilterSchema<Field extends z.ZodTypeAny>(fieldSchema: Field) {
  return z
    .object({
      fields: z.array(fieldSchema).min(1).optional(),
      starterPatterns: z.array(filterPiiStarterPatternSchema).optional(),
      customPatterns: z.array(filterPiiCustomPatternSchema).optional(),
    })
    .strict();
}

function createSourceFilterSchema<Field extends z.ZodTypeAny>(fieldSchema: Field) {
  return z
    .object({
      pii: createPiiFilterSchema(fieldSchema).optional(),
    })
    .strict();
}

const fileSourceFilterSchema = z
  .object({
    pii: createPiiFilterSchema(fileFilterFieldSchema)
      .extend({
        uninspectable: z.enum(['allow', 'block']).optional(),
      })
      .optional(),
  })
  .strict();

export const filtersConfigSchema = z
  .object({
    messages: createSourceFilterSchema(messageFilterFieldSchema).optional(),
    prompts: createSourceFilterSchema(promptFilterFieldSchema).optional(),
    agentInstructions: createSourceFilterSchema(agentInstructionFilterFieldSchema).optional(),
    conversationStarters: createSourceFilterSchema(conversationStarterFilterFieldSchema).optional(),
    conversationTitles: createSourceFilterSchema(conversationTitleFilterFieldSchema).optional(),
    feedback: createSourceFilterSchema(feedbackFilterFieldSchema).optional(),
    skills: createSourceFilterSchema(skillFilterFieldSchema).optional(),
    memories: createSourceFilterSchema(memoryFilterFieldSchema).optional(),
    files: fileSourceFilterSchema.optional(),
    toolArguments: createSourceFilterSchema(toolArgumentFilterFieldSchema).optional(),
    modelParameters: createSourceFilterSchema(modelParameterFilterFieldSchema).optional(),
    actionMetadata: createSourceFilterSchema(actionMetadataFilterFieldSchema).optional(),
  })
  .strict();

export type FiltersConfig = z.infer<typeof filtersConfigSchema>;
