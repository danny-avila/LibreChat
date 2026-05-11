import { unlink } from 'fs/promises';
import { isMainThread } from 'worker_threads';
import { getTenantId, tenantStorage, logger, SYSTEM_TENANT_ID } from '@librechat/data-schemas';
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

export type RequestTenantSource = {
  tenantId?: string;
  user?: { tenantId?: string } | null;
};

export function resolveRequestTenantId(req: RequestTenantSource): string | undefined {
  return req.tenantId ?? req.user?.tenantId;
}

type UploadFile = {
  path?: string;
};

type UploadRequest = ServerRequest & {
  file?: UploadFile;
  files?: UploadFile[] | Record<string, UploadFile[]>;
};

function collectUploadPaths(req: UploadRequest): string[] {
  const paths = new Set<string>();
  if (req.file?.path) {
    paths.add(req.file.path);
  }
  const { files } = req;
  if (Array.isArray(files)) {
    files.forEach((file) => {
      if (file.path) {
        paths.add(file.path);
      }
    });
  } else if (files) {
    Object.values(files).forEach((uploads) => {
      uploads.forEach((file) => {
        if (file.path) {
          paths.add(file.path);
        }
      });
    });
  }
  return [...paths];
}

async function cleanupUploadedFiles(req: ServerRequest): Promise<void> {
  const paths = collectUploadPaths(req as UploadRequest);
  if (paths.length === 0) {
    return;
  }
  const results = await Promise.allSettled(paths.map((filepath) => unlink(filepath)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error('[restoreTenantContextFromReq] Failed to delete rejected upload:', {
        path: paths[index],
        error: result.reason,
      });
    }
  });
}

async function rejectRequestWithUploadCleanup(
  req: ServerRequest,
  res: Response,
  message: string,
): Promise<void> {
  await cleanupUploadedFiles(req);
  res.status(403).json({ error: message });
}

/**
 * Re-enters tenant ALS from the server-resolved request tenant.
 *
 * Use this after middleware that may cross async stream boundaries (for example
 * multipart parsers) and before tenant-isolated model calls. The tenant source
 * is restricted to authenticated/resolved request fields, never form data.
 */
export function restoreTenantContextFromReq(
  req: ServerRequest,
  res: Response,
  next: NextFunction,
): void | Promise<void> {
  const tenantId = resolveRequestTenantId(req as RequestTenantSource);

  if (!tenantId) {
    if (isStrict()) {
      return rejectRequestWithUploadCleanup(
        req,
        res,
        'Tenant context required in strict isolation mode',
      );
    }
    next();
    return;
  }

  if (tenantId === SYSTEM_TENANT_ID) {
    logger.warn('[restoreTenantContextFromReq] Rejected system tenant for request route', {
      path: req.path,
    });
    return rejectRequestWithUploadCleanup(
      req,
      res,
      'System tenant is not allowed for request-scoped routes',
    );
  }

  if (getTenantId() === tenantId) {
    next();
    return;
  }

  return void tenantStorage.run({ tenantId }, async () => {
    next();
  });
}
