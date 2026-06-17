import type { ClientSession, Model } from 'mongoose';
import type { ITenant } from '~/types';
import { normalizeTenantId } from '~/utils/tenantId';

/**
 * Resolves Config principalId (`tenants._id`) from any tenant reference:
 * legacy `tenants.tenantId`, `users.tenantId`, or canonical `tenants._id`.
 */
export async function resolveTenantPrincipalId(
  mongoose: typeof import('mongoose'),
  tenantRef: string | undefined | null,
  session?: ClientSession,
): Promise<string | undefined> {
  const ref = tenantRef?.trim();
  if (!ref) {
    return undefined;
  }

  const Tenant = mongoose.models.Tenant as Model<ITenant> | undefined;
  if (!Tenant) {
    return ref;
  }

  const sessionOpt = session ?? null;

  const byLegacyField = await Tenant.findOne({ tenantId: ref })
    .select({ _id: 1 })
    .session(sessionOpt)
    .lean<Pick<ITenant, '_id'>>();
  if (byLegacyField) {
    return byLegacyField._id.toString();
  }

  const normalized = normalizeTenantId(ref);
  if (normalized !== ref) {
    const byNormalized = await Tenant.findOne({ tenantId: normalized })
      .select({ _id: 1 })
      .session(sessionOpt)
      .lean<Pick<ITenant, '_id'>>();
    if (byNormalized) {
      return byNormalized._id.toString();
    }
  }

  if (mongoose.isValidObjectId(ref)) {
    const byObjectId = await Tenant.findById(ref)
      .select({ _id: 1 })
      .session(sessionOpt)
      .lean<Pick<ITenant, '_id'>>();
    if (byObjectId) {
      return byObjectId._id.toString();
    }
  }

  return ref;
}
