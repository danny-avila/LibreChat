import type { Schema, Query, Aggregate } from 'mongoose';
import { getTenantId, SYSTEM_TENANT_ID } from '~/config/tenantContext';

const STRICT = process.env.TENANT_ISOLATION_STRICT === 'true';

if (
  process.env.TENANT_ISOLATION_STRICT &&
  process.env.TENANT_ISOLATION_STRICT !== 'true' &&
  process.env.TENANT_ISOLATION_STRICT !== 'false'
) {
  console.warn(
    `[TenantIsolation] TENANT_ISOLATION_STRICT="${process.env.TENANT_ISOLATION_STRICT}" ` +
      'is not "true" or "false"; defaulting to non-strict mode.',
  );
}

const TENANT_ISOLATION_APPLIED = Symbol.for('librechat:tenantIsolation');

/**
 * Mongoose schema plugin that enforces tenant-level data isolation.
 *
 * - `tenantId` present in async context -> injected into every query filter.
 * - `tenantId` is `SYSTEM_TENANT_ID` -> skips injection (explicit cross-tenant op).
 * - `tenantId` absent + `TENANT_ISOLATION_STRICT=true` -> throws (fail-closed).
 * - `tenantId` absent + strict mode off -> passes through (transitional/pre-tenancy).
 */
export function applyTenantIsolation(schema: Schema): void {
  const s = schema as Schema & { [key: symbol]: boolean };
  if (s[TENANT_ISOLATION_APPLIED]) {
    return;
  }
  s[TENANT_ISOLATION_APPLIED] = true;

  const queryMiddleware = function (this: Query<unknown, unknown>) {
    const tenantId = getTenantId();

    if (!tenantId && STRICT) {
      throw new Error('[TenantIsolation] Query attempted without tenant context in strict mode');
    }

    if (!tenantId || tenantId === SYSTEM_TENANT_ID) {
      return;
    }

    this.where({ tenantId });
  };

  schema.pre('find', queryMiddleware);
  schema.pre('findOne', queryMiddleware);
  schema.pre('findOneAndUpdate', queryMiddleware);
  schema.pre('findOneAndDelete', queryMiddleware);
  schema.pre('findOneAndReplace', queryMiddleware);
  schema.pre('updateOne', queryMiddleware);
  schema.pre('updateMany', queryMiddleware);
  schema.pre('deleteOne', queryMiddleware);
  schema.pre('deleteMany', queryMiddleware);
  schema.pre('countDocuments', queryMiddleware);
  schema.pre('replaceOne', queryMiddleware);

  schema.pre('aggregate', function (this: Aggregate<unknown>) {
    const tenantId = getTenantId();

    if (!tenantId && STRICT) {
      throw new Error(
        '[TenantIsolation] Aggregate attempted without tenant context in strict mode',
      );
    }

    if (!tenantId || tenantId === SYSTEM_TENANT_ID) {
      return;
    }

    this.pipeline().unshift({ $match: { tenantId } });
  });

  schema.pre('save', function () {
    const tenantId = getTenantId();

    if (!tenantId && STRICT) {
      throw new Error('[TenantIsolation] Save attempted without tenant context in strict mode');
    }

    if (tenantId && tenantId !== SYSTEM_TENANT_ID && !this.tenantId) {
      this.tenantId = tenantId;
    }
  });

  schema.pre('insertMany', function (next, docs) {
    const tenantId = getTenantId();

    if (!tenantId && STRICT) {
      next(
        new Error('[TenantIsolation] insertMany attempted without tenant context in strict mode'),
      );
      return;
    }

    if (tenantId && tenantId !== SYSTEM_TENANT_ID && Array.isArray(docs)) {
      for (const doc of docs) {
        if (!doc.tenantId) {
          doc.tenantId = tenantId;
        }
      }
    }

    next();
  });
}
