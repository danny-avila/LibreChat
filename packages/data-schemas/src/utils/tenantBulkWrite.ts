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

  if (!tenantId) {
    if (isStrict()) {
      throw new Error(
        `[TenantIsolation] bulkWrite on ${model.modelName} attempted without tenant context in strict mode`,
      );
    }
    return model.bulkWrite(ops, options);
  }

  if (tenantId === SYSTEM_TENANT_ID) {
    return model.bulkWrite(ops, options);
  }

  const injected = ops.map((op) => injectTenantId(op, tenantId));
  return model.bulkWrite(injected, options);
}

/**
 * Injects `tenantId` into a single bulk-write operation.
 * Returns a new operation object — does not mutate the original.
 */
function injectTenantId(op: AnyBulkWriteOperation, tenantId: string): AnyBulkWriteOperation {
  if ('insertOne' in op) {
    return {
      insertOne: {
        document: { ...op.insertOne.document, tenantId },
      },
    };
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
