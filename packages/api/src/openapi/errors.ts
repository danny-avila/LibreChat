import { z } from 'zod';

/**
 * The management auth middleware sends `{ error: 'Unauthorized' }` on a 401.
 * This is a different, flatter shape from `agentManagementErrorSchema`, so it needs its own schema.
 */
export const unauthorizedResponseSchema: z.ZodType<{ error: string }> = z
  .object({ error: z.string() })
  .strict();
