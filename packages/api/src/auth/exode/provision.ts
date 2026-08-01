import { logger } from '@librechat/data-schemas';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { ExodeUserDeps } from './user';
import { serializeExodeUser, upsertExodeUser } from './user';
import { getExodeAuthConfig } from './config';
import { ExodeExchangeError } from './types';

/**
 * Explicitly annotated because this package builds with `--isolatedDeclarations`: an inferred
 * Zod schema type cannot be emitted into the .d.ts without re-checking the whole expression.
 */
export const exodeProvisionUserInputSchema: z.ZodObject<{
  subject: z.ZodString;
  name: z.ZodOptional<z.ZodString>;
  avatar: z.ZodOptional<z.ZodString>;
}> = z.object({
  /**
   * The exode principal this account represents — the same opaque value the bridge later
   * presents as `openidId`. Both paths must derive it identically or they create two accounts
   * for one person.
   */
  subject: z.string().min(8).max(256),
  name: z.string().max(256).optional(),
  avatar: z.string().url().max(2048).optional(),
});

export interface ExodeProvisionUserDeps extends ExodeUserDeps {
  getTenantId: () => string | undefined;
}

/**
 * Create (or return) the LibreChat account for one exode principal.
 *
 * Exists because the only other way to create a user server-to-server is `/api/auth/register`,
 * which is gated by `ALLOW_REGISTRATION` — the same switch that opens public self-signup on the
 * chat UI. Deployments were forced to choose between provisioning and keeping signup closed.
 * It also cannot set `openidId`, so accounts made that way never converge with the ones the
 * iframe bridge upserts, and one person ends up with two.
 *
 * Idempotent by construction: it reuses the bridge's own upsert, keyed on
 * (openidId, openidIssuer). Calling it repeatedly for the same principal returns the same account.
 *
 * Guarded by `requireJwtAuth` + ACCESS_ADMIN at the route, so the caller is an authenticated
 * LibreChat admin — no additional shared secret to distribute or rotate.
 */
export function createExodeProvisionUserController(deps: ExodeProvisionUserDeps): RequestHandler {
  return async (req, res) => {
    const parsed = exodeProvisionUserInputSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'Invalid provisioning request' });
      return;
    }

    try {
      const config = getExodeAuthConfig();

      const user = await upsertExodeUser(
        {
          subject: parsed.data.subject,
          name: parsed.data.name ?? '',
          avatar: parsed.data.avatar,
        },
        config.issuer,
        deps.getTenantId(),
        deps,
      );

      res.status(200).json({ user: serializeExodeUser(user) });
    } catch (error) {
      if (error instanceof ExodeExchangeError) {
        res.status(error.status).json({ error: error.code, message: error.message });
        return;
      }

      logger.error('[exode] provisioning failed', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to provision user' });
    }
  };
}
