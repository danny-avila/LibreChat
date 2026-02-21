import type { Schema } from 'mongoose';
import { getTenantId, SYSTEM_TENANT_ID } from '~/config/tenantContext';

const STRICT = process.env.TENANT_ISOLATION_STRICT === 'true';

/**
 * Mongoose schema plugin that enforces tenant-level data isolation.
 *
 * - `tenantId` present in async context → injected into every query filter.
 * - `tenantId` is `SYSTEM_TENANT_ID` → skips injection (explicit cross-tenant op).
 * - `tenantId` absent + `TENANT_ISOLATION_STRICT=true` → throws (fail-closed).
 * - `tenantId` absent + strict mode off → passes through (transitional/pre-tenancy).
 */
export function applyTenantIsolation(schema: Schema): void {
  const queryMiddleware = function (this: { where: (filter: Record<string, string>) => void }) {
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

  schema.pre('save', function () {
    const tenantId = getTenantId();
    if (tenantId && tenantId !== SYSTEM_TENANT_ID && !this.tenantId) {
      this.tenantId = tenantId;
    }
  });

  schema.pre('insertMany', function (_next, docs) {
    const tenantId = getTenantId();
    if (tenantId && tenantId !== SYSTEM_TENANT_ID && Array.isArray(docs)) {
      for (const doc of docs) {
        if (!doc.tenantId) {
          doc.tenantId = tenantId;
        }
      }
    }
  });
}
