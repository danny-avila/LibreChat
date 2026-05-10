import { isMainThread } from 'worker_threads';
import { tenantStorage, logger } from '@librechat/data-schemas';
import type { Response, NextFunction } from 'express';
import type { ServerRequest } from '~/types/http';

let _checkedThread = false;

let _strictMode: boolean | undefined;

function isStrict(): boolean {
  return (_strictMode ??= process.env.TENANT_ISOLATION_STRICT === 'true');
}

/** Resets the cached strict-mode flag. Exposed for test teardown only. */
export function _resetTenantMiddlewareStrictCache(): void {
  _strictMode = undefined;
}

/**
 * Express middleware that propagates the authenticated user's `tenantId` into
 * the AsyncLocalStorage context used by the Mongoose tenant-isolation plugin.
 *
 * **Placement**: Chained automatically by `requireJwtAuth` after successful
 * passport authentication (req.user is populated). Must NOT be registered at
 * global `app.use()` scope — `req.user` is undefined at that stage.
 *
 * Behaviour:
 * - Authenticated request with `tenantId` → wraps downstream in `tenantStorage.run({ tenantId })`
 * - Authenticated request **without** `tenantId`:
 *   - Strict mode (`TENANT_ISOLATION_STRICT=true`) → responds 403
 *   - Non-strict (default) → passes through without ALS context (backward compat)
 * - Unauthenticated request → no-op (calls `next()` directly)
 */
export function tenantContextMiddleware(
  req: ServerRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!_checkedThread) {
    _checkedThread = true;
    if (!isMainThread) {
      logger.error(
        '[tenantContextMiddleware] Running in a worker thread — ' +
          'ALS context will not propagate. This middleware must only run in the main Express process.',
      );
    }
  }

  const user = req.user as { tenantId?: string } | undefined;

  if (!user) {
    next();
    return;
  }

  const tenantId = user.tenantId;

  if (!tenantId) {
    if (isStrict()) {
      res.status(403).json({ error: 'Tenant context required in strict isolation mode' });
      return;
    }
    next();
    return;
  }

  return void tenantStorage.run({ tenantId }, async () => {
    next();
  });
}
