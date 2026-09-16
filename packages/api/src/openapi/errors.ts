import { z } from 'zod';

/**
 * The management auth middleware sends `{ error: 'Unauthorized' }` on a 401.
 * This is a different, flatter shape from `agentManagementErrorSchema`, so it needs its own schema.
 */
export const unauthorizedResponseSchema: z.ZodType<{ error: string }> = z
  .object({ error: z.string() })
  .strict();

/**
 * When the bound account is being deleted, the auth middleware sends 409 with a flat
 * `{ error, code: 'ACCOUNT_DELETION_IN_PROGRESS' }` body. This is a third shape, distinct from
 * both `agentManagementErrorSchema` (nested) and the 401 body, so it needs its own schema.
 */
export const accountDeletionResponseSchema: z.ZodType<{ error: string; code: string }> = z
  .object({ error: z.string(), code: z.string() })
  .strict();

/**
 * The ban middleware (403) and the default file-upload limiter (429) send a flat `{ message }`
 * body. This is a fourth error shape, distinct from the nested, one-field, and two-field shapes.
 */
export const messageResponseSchema: z.ZodType<{ message: string }> = z
  .object({ message: z.string() })
  .strict();
