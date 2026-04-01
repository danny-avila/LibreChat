import type { AnyBulkWriteOperation, Model, MongooseBulkWriteOptions } from 'mongoose';
import type { BulkWriteResult } from 'mongodb';
import { getTenantId, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import logger from '~/config/winston';

let _strictMode: boolean | undefined;

function isStrict(): boolean {
  return (_strictMode ??= process.env.TENANT_ISOLATION_STRICT === 'true');
}

/** Resets the cached strict-mode flag. Exposed for test teardown only. */
export function _resetBulkWriteStrictCache(): void {
  _strictMode = undefined;
}

/**
 * Tenant-safe wrapper around Mongoose `Model.bulkWrite()`.
 *
 * Mongoose's `bulkWrite` does not trigger schema-level middleware hooks, so the
 * `applyTenantIsolation` plugin cannot intercept it. This wrapper injects the
 * current ALS tenant context into every operation's filter and/or document
 * before delegating to the native `bulkWrite`.
 *
 * Behavior:
 * - **tenantId present** (normal request): injects `{ tenantId }` into every
 *   operation filter (updateOne, deleteOne, replaceOne) and document (insertOne).
 * - **SYSTEM_TENANT_ID**: skips injection (cross-tenant system operation).
 * - **No tenantId + strict mode**: throws (fail-closed, same as the plugin).
 * - **No tenantId + non-strict**: passes through without injection (backward compat).
 */
export async function tenantSafeBulkWrite<T>(
  model: Model<T>,
  ops: AnyBulkWriteOperation[],
  options?: MongooseBulkWriteOptions,
): Promise<BulkWriteResult> {
  const tenantId = getTenantId();

  // Strip tenantId from update documents unconditionally — application code
  // must never control tenantId via update payloads regardless of context.
  const sanitized = ops.map(sanitizeBulkOp).filter((op): op is AnyBulkWriteOperation => op != null);

  if (!tenantId) {
    if (isStrict()) {
      throw new Error(
        `[TenantIsolation] bulkWrite on ${model.modelName} attempted without tenant context in strict mode`,
      );
    }
    return sanitized.length > 0 ? model.bulkWrite(sanitized, options) : emptyBulkResult();
  }

  if (tenantId === SYSTEM_TENANT_ID) {
    return sanitized.length > 0 ? model.bulkWrite(sanitized, options) : emptyBulkResult();
  }

  const injected = sanitized.map((op) => injectTenantId(op, tenantId));
  return injected.length > 0 ? model.bulkWrite(injected, options) : emptyBulkResult();
}

function emptyBulkResult(): BulkWriteResult {
  return {
    insertedCount: 0,
    matchedCount: 0,
    modifiedCount: 0,
    deletedCount: 0,
    upsertedCount: 0,
    upsertedIds: {},
    insertedIds: {},
  } as unknown as BulkWriteResult;
}

/** Strips tenantId from update documents. Returns null if the op becomes empty. */
function sanitizeBulkOp(op: AnyBulkWriteOperation): AnyBulkWriteOperation | null {
  if ('updateOne' in op) {
    const { update, ...rest } = op.updateOne;
    const stripped = stripTenantIdFromUpdate(update as Record<string, unknown>);
    return Object.keys(stripped).length === 0 ? null : { updateOne: { ...rest, update: stripped } };
  }

  if ('updateMany' in op) {
    const { update, ...rest } = op.updateMany;
    const stripped = stripTenantIdFromUpdate(update as Record<string, unknown>);
    return Object.keys(stripped).length === 0
      ? null
      : { updateMany: { ...rest, update: stripped } };
  }

  return op;
}

/**
 * Injects `tenantId` into a single bulk-write operation.
 * Returns a new operation object — does not mutate the original.
 */
/** Injects tenantId into filters and documents. Assumes update payloads are already sanitized. */
function injectTenantId(op: AnyBulkWriteOperation, tenantId: string): AnyBulkWriteOperation {
  if ('insertOne' in op) {
    return { insertOne: { document: { ...op.insertOne.document, tenantId } } };
  }

  if ('updateOne' in op) {
    const { filter, ...rest } = op.updateOne;
    return { updateOne: { ...rest, filter: { ...filter, tenantId } } };
  }

  if ('updateMany' in op) {
    const { filter, ...rest } = op.updateMany;
    return { updateMany: { ...rest, filter: { ...filter, tenantId } } };
  }

  if ('deleteOne' in op) {
    const { filter, ...rest } = op.deleteOne;
    return { deleteOne: { ...rest, filter: { ...filter, tenantId } } };
  }

  if ('deleteMany' in op) {
    const { filter, ...rest } = op.deleteMany;
    return { deleteMany: { ...rest, filter: { ...filter, tenantId } } };
  }

  if ('replaceOne' in op) {
    const { filter, replacement, ...rest } = op.replaceOne;
    return {
      replaceOne: {
        ...rest,
        filter: { ...filter, tenantId },
        replacement: { ...replacement, tenantId },
      },
    };
  }

  if (isStrict()) {
    throw new Error(
      '[TenantIsolation] Unknown bulkWrite operation type in strict mode — refusing to pass through without tenant injection',
    );
  }
  logger.warn(
    '[tenantSafeBulkWrite] Unknown bulk op type, passing through without tenant injection',
  );
  return op;
}

/**
 * Strips `tenantId` from a bulk-write update document.
 * Handles both plain objects (Mongoose wraps into `$set`) and explicit operator objects.
 */
function stripTenantIdFromUpdate(update: Record<string, unknown>): Record<string, unknown> {
  const u = update as Record<string, unknown>;

  if ('tenantId' in u) {
    const { tenantId: _, ...rest } = u;
    return rest as typeof update;
  }

  const operators = ['$set', '$unset', '$setOnInsert', '$rename'] as const;
  let modified = false;
  const result = { ...u };

  for (const op of operators) {
    const payload = result[op] as Record<string, unknown> | undefined;
    if (payload && 'tenantId' in payload) {
      const { tenantId: _, ...rest } = payload;
      result[op] = Object.keys(rest).length > 0 ? rest : undefined;
      if (result[op] === undefined) {
        delete result[op];
      }
      modified = true;
    }
  }

  return modified ? (result as typeof update) : update;
}
