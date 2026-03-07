import type { Schema, Query, Aggregate, UpdateQuery } from 'mongoose';
import { getTenantId, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import logger from '~/config/winston';

let _strictMode: boolean | undefined;

function isStrict(): boolean {
  return (_strictMode ??= process.env.TENANT_ISOLATION_STRICT === 'true');
}

/** Resets the cached strict-mode flag. Exposed for test teardown only. */
export function _resetStrictCache(): void {
  _strictMode = undefined;
}

if (
  process.env.TENANT_ISOLATION_STRICT &&
  process.env.TENANT_ISOLATION_STRICT !== 'true' &&
  process.env.TENANT_ISOLATION_STRICT !== 'false'
) {
  logger.warn(
    `[TenantIsolation] TENANT_ISOLATION_STRICT="${process.env.TENANT_ISOLATION_STRICT}" ` +
      'is not "true" or "false"; defaulting to non-strict mode.',
  );
}

const TENANT_ISOLATION_APPLIED = Symbol.for('librechat:tenantIsolation');

const MUTATION_OPERATORS = ['$set', '$unset', '$setOnInsert', '$rename'] as const;

function assertNoTenantIdMutation(update: UpdateQuery<unknown> | null): void {
  if (!update) {
    return;
  }
  for (const op of MUTATION_OPERATORS) {
    const payload = update[op] as Record<string, unknown> | undefined;
    if (payload && 'tenantId' in payload) {
      throw new Error('[TenantIsolation] Modifying tenantId via update operators is not allowed');
    }
  }
  if ('tenantId' in update) {
    throw new Error('[TenantIsolation] Modifying tenantId via update operators is not allowed');
  }
}

/**
 * Mongoose schema plugin that enforces tenant-level data isolation.
 *
 * - `tenantId` present in async context -> injected into every query filter.
 * - `tenantId` is `SYSTEM_TENANT_ID` -> skips injection (explicit cross-tenant op).
 * - `tenantId` absent + `TENANT_ISOLATION_STRICT=true` -> throws (fail-closed).
 * - `tenantId` absent + strict mode off -> passes through (transitional/pre-tenancy).
 * - Update and replace operations that modify `tenantId` are blocked unless running as system.
 */
export function applyTenantIsolation(schema: Schema): void {
  const s = schema as Schema & { [key: symbol]: boolean };
  if (s[TENANT_ISOLATION_APPLIED]) {
    return;
  }
  s[TENANT_ISOLATION_APPLIED] = true;

  const queryMiddleware = function (this: Query<unknown, unknown>) {
    const tenantId = getTenantId();

    if (!tenantId && isStrict()) {
      throw new Error('[TenantIsolation] Query attempted without tenant context in strict mode');
    }

    if (!tenantId || tenantId === SYSTEM_TENANT_ID) {
      return;
    }

    this.where({ tenantId });
  };

  const updateGuard = function (this: Query<unknown, unknown>) {
    const tenantId = getTenantId();
    if (tenantId === SYSTEM_TENANT_ID) {
      return;
    }
    assertNoTenantIdMutation(this.getUpdate() as UpdateQuery<unknown> | null);
  };

  const replaceGuard = function (this: Query<unknown, unknown>) {
    const tenantId = getTenantId();
    if (tenantId === SYSTEM_TENANT_ID) {
      return;
    }
    const replacement = this.getUpdate() as Record<string, unknown> | null;
    if (!replacement) {
      return;
    }
    if ('tenantId' in replacement && replacement.tenantId !== tenantId) {
      throw new Error('[TenantIsolation] Modifying tenantId via replacement is not allowed');
    }
    if (tenantId && !('tenantId' in replacement)) {
      replacement.tenantId = tenantId;
    }
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

  schema.pre('findOneAndUpdate', updateGuard);
  schema.pre('updateOne', updateGuard);
  schema.pre('updateMany', updateGuard);

  schema.pre('replaceOne', replaceGuard);
  schema.pre('findOneAndReplace', replaceGuard);

  schema.pre('aggregate', function (this: Aggregate<unknown>) {
    const tenantId = getTenantId();

    if (!tenantId && isStrict()) {
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

    if (!tenantId && isStrict()) {
      throw new Error('[TenantIsolation] Save attempted without tenant context in strict mode');
    }

    if (tenantId && tenantId !== SYSTEM_TENANT_ID) {
      if (!this.tenantId) {
        this.tenantId = tenantId;
      } else if (isStrict() && this.tenantId !== tenantId) {
        throw new Error(
          '[TenantIsolation] Document tenantId does not match current tenant context',
        );
      }
    }
  });

  schema.pre('insertMany', function (next, docs) {
    const tenantId = getTenantId();

    if (!tenantId && isStrict()) {
      return next(
        new Error('[TenantIsolation] insertMany attempted without tenant context in strict mode'),
      );
    }

    if (tenantId && tenantId !== SYSTEM_TENANT_ID && Array.isArray(docs)) {
      for (const doc of docs) {
        if (!doc.tenantId) {
          doc.tenantId = tenantId;
        } else if (isStrict() && doc.tenantId !== tenantId) {
          return next(
            new Error('[TenantIsolation] Document tenantId does not match current tenant context'),
          );
        }
      }
    }

    next();
  });
}
