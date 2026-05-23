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
 * `applyTenantIsolation` plugin cannot intercept it. This wrapper:
 *
 * 1. **Sanitizes** every update document by stripping `tenantId` unconditionally
 *    (both top-level and inside `$set`/`$unset`/`$setOnInsert`/`$rename`).
 * 2. **Injects** `tenantId` into operation filters and insert documents when a
 *    tenant context is active.
 *
 * Unlike the Mongoose middleware guard (`sanitizeTenantIdMutation`), which throws
 * on cross-tenant values, this wrapper strips silently. Throwing mid-batch would
 * abort the entire write for one bad field; the filter injection already scopes
 * every operation to the correct tenant.
 *
 * Behavior:
 * - **tenantId present** (normal request): sanitize + inject into filters/documents.
 * - **SYSTEM_TENANT_ID**: sanitize only, skip injection (cross-tenant system op).
 * - **No tenantId + strict mode**: throws (fail-closed, same as the plugin).
 * - **No tenantId + non-strict**: sanitize only, no injection (backward compat).
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
    return sanitized.length > 0 ? model.bulkWrite(sanitized, options) : EMPTY_BULK_RESULT;
  }

  if (tenantId === SYSTEM_TENANT_ID) {
    return sanitized.length > 0 ? model.bulkWrite(sanitized, options) : EMPTY_BULK_RESULT;
  }

  const injected = sanitized.map((op) => injectTenantId(op, tenantId));
  return injected.length > 0 ? model.bulkWrite(injected, options) : EMPTY_BULK_RESULT;
}

/** Returned when all ops are dropped after sanitization. Single shared instance. */
const EMPTY_BULK_RESULT = Object.freeze({
  insertedCount: 0,
  matchedCount: 0,
  modifiedCount: 0,
  deletedCount: 0,
  upsertedCount: 0,
  upsertedIds: {},
  insertedIds: {},
}) as unknown as BulkWriteResult;

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
 * Injects tenantId into every operation's filter and document.
 * Assumes update payloads have already been sanitized by `sanitizeBulkOp`.
 * Returns a new operation object — does not mutate the original.
 */
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

const MUTATION_OPS = ['$set', '$unset', '$setOnInsert', '$rename'] as const;

/**
 * Strips `tenantId` from a bulk-write update document — both top-level
 * and inside mutation operators. Allocates only when stripping is needed.
 */
function stripTenantIdFromUpdate(update: Record<string, unknown>): Record<string, unknown> {
  let result: Record<string, unknown> | null = null;

  if ('tenantId' in update) {
    const { tenantId: _tenantId, ...rest } = update;
    result = rest;
  }

  for (const op of MUTATION_OPS) {
    const source = result ?? update;
    const payload = source[op] as Record<string, unknown> | undefined;
    if (payload && 'tenantId' in payload) {
      if (!result) {
        result = { ...update };
      }
      const { tenantId: _tenantId, ...rest } = payload;
      if (Object.keys(rest).length > 0) {
        result[op] = rest;
      } else {
        delete result[op];
      }
    }
  }

  return result ?? update;
}
