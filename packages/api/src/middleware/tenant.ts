import { unlink } from 'fs/promises';
import { isMainThread } from 'worker_threads';
import { tenantStorage, logger, SYSTEM_TENANT_ID } from '@librechat/data-schemas';
import type { TenantContext } from '@librechat/data-schemas';
import type { Response, NextFunction } from 'express';
import type { ServerRequest } from '~/types/http';

type ContextUser = {
  tenantId?: string;
  id?: string;
  _id?: { toString: () => string };
} | null;

type ContextRequest = {
  headers: ServerRequest['headers'];
  tenantId?: string;
  user?: ContextUser;
  id?: string;
  requestId?: string;
};

const REQUEST_ID_HEADERS = ['x-request-id', 'x-correlation-id'] as const;

let _checkedThread = false;

let _strictMode: boolean | undefined;

function isStrict(): boolean {
  return (_strictMode ??= process.env.TENANT_ISOLATION_STRICT === 'true');
}

/** Resets the cached strict-mode flag. Exposed for test teardown only. */
export function _resetTenantMiddlewareStrictCache(): void {
  _strictMode = undefined;
}

function normalizeContextValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  return normalizeContextValue(Array.isArray(value) ? value[0] : value);
}

function getRequestId(req: ContextRequest): string | undefined {
  const requestId = normalizeContextValue(req.requestId) ?? normalizeContextValue(req.id);
  if (requestId) {
    return requestId;
  }
  for (const header of REQUEST_ID_HEADERS) {
    const value = getHeaderValue(req.headers[header]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function getUserId(user: ContextUser): string | undefined {
  return normalizeContextValue(user?.id) ?? normalizeContextValue(user?._id?.toString());
}

function hasTenantContext(context: TenantContext): boolean {
  return Boolean(context.tenantId || context.userId || context.requestId);
}

export function buildTenantContext(
  req: ContextRequest,
  tenantId = req.tenantId ?? req.user?.tenantId,
): TenantContext {
  return {
    tenantId: normalizeContextValue(tenantId),
    userId: getUserId(req.user ?? null),
    requestId: getRequestId(req),
  };
}

export function runWithTenantContext(context: TenantContext, next: NextFunction): void {
  if (!hasTenantContext(context)) {
    next();
    return;
  }
  return void tenantStorage.run(context, async () => {
    next();
  });
}

/**
 * Express middleware that propagates the authenticated user's `tenantId` into
 * the AsyncLocalStorage context used by the Mongoose tenant-isolation plugin
 * and request-scoped logging.
 *
 * **Placement**: Chained automatically by `requireJwtAuth` after successful
 * passport authentication (req.user is populated). Must NOT be registered at
 * global `app.use()` scope — `req.user` is undefined at that stage.
 *
 * Behaviour:
 * - Authenticated request with context → wraps downstream in `tenantStorage.run(context)`
 * - Authenticated request **without** `tenantId`:
 *   - Strict mode (`TENANT_ISOLATION_STRICT=true`) → responds 403
 *   - Non-strict (default) → passes through with user/request context only
 * - Unauthenticated request → propagates request context when available
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

  const user = req.user;
  const context = buildTenantContext(req);

  if (!user) {
    runWithTenantContext(context, next);
    return;
  }

  const { tenantId } = context;

  if (!tenantId) {
    if (isStrict()) {
      res.status(403).json({ error: 'Tenant context required in strict isolation mode' });
      return;
    }
    runWithTenantContext(context, next);
    return;
  }

  runWithTenantContext(context, next);
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

function rejectRequestWithUploadCleanupInContext(
  context: TenantContext,
  req: ServerRequest,
  res: Response,
  message: string,
): Promise<void> {
  const rejectRequest = () => rejectRequestWithUploadCleanup(req, res, message);
  if (!hasTenantContext(context)) {
    return rejectRequest();
  }
  return tenantStorage.run(context, rejectRequest);
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
  const context = buildTenantContext(req, tenantId);
  const resolvedTenantId = context.tenantId;

  if (!resolvedTenantId) {
    if (isStrict()) {
      return rejectRequestWithUploadCleanupInContext(
        context,
        req,
        res,
        'Tenant context required in strict isolation mode',
      );
    }
    runWithTenantContext(context, next);
    return;
  }

  if (resolvedTenantId === SYSTEM_TENANT_ID) {
    logger.warn('[restoreTenantContextFromReq] Rejected system tenant for request route', {
      path: req.path,
    });
    return rejectRequestWithUploadCleanup(
      req,
      res,
      'System tenant is not allowed for request-scoped routes',
    );
  }

  const currentContext = tenantStorage.getStore();
  if (
    currentContext?.tenantId === context.tenantId &&
    currentContext?.userId === context.userId &&
    currentContext?.requestId === context.requestId
  ) {
    next();
    return;
  }

  return runWithTenantContext(context, next);
}
