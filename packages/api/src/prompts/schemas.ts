import { z } from 'zod';
import { Constants } from 'librechat-data-provider';

/**
 * Schema for validating prompt group update payloads.
 * Only allows fields that users should be able to modify.
 * Sensitive fields like author, authorName, _id, productionId, etc. are excluded.
 */
export const updatePromptGroupSchema = z
  .object({
    /** The name of the prompt group */
    name: z.string().min(1).max(255).optional(),
    /** Short description/oneliner for the prompt group */
    oneliner: z.string().max(500).optional(),
    /** Category for organizing prompt groups */
    category: z.string().max(100).optional(),
    /** Command shortcut for the prompt group */
    command: z
      .string()
      .max(Constants.COMMANDS_MAX_LENGTH as number)
      .regex(/^[a-z0-9-]*$/, {
        message: 'Command must only contain lowercase alphanumeric characters and hyphens',
      })
      .optional()
      .nullable(),
  })
  .strict();

export type TUpdatePromptGroupSchema = z.infer<typeof updatePromptGroupSchema>;

/**
 * Validates and sanitizes a prompt group update payload.
 * Returns only the allowed fields, stripping any sensitive fields.
 * @param data - The raw request body to validate
 * @returns The validated and sanitized payload
 * @throws ZodError if validation fails
 */
export function validatePromptGroupUpdate(data: unknown): TUpdatePromptGroupSchema {
  return updatePromptGroupSchema.parse(data);
}

/**
 * Safely validates a prompt group update payload without throwing.
 * @param data - The raw request body to validate
 * @returns A SafeParseResult with either the validated data or validation errors
 */
export function safeValidatePromptGroupUpdate(data: unknown) {
  return updatePromptGroupSchema.safeParse(data);
}
