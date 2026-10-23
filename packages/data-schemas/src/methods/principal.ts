import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import type { Model } from 'mongoose';
import { tenantPartitionFilter } from '~/models/plugins/tenantIsolation';
import { isCanonicalObjectIdString } from '~/utils/objectId';

const systemRoleNames: ReadonlySet<string> = new Set(Object.values(SystemRoles));

export interface PrincipalMethods {
  principalExists: (principalType: PrincipalType, principalId: string) => Promise<boolean>;
}

/** Principal lookups that stay in the caller's tenant partition. */
export function createPrincipalMethods(mongoose: typeof import('mongoose')): PrincipalMethods {
  async function existsInPartition(
    modelName: 'Role' | 'Group' | 'User',
    filter: { name: string } | { _id: string },
  ): Promise<boolean> {
    const model = mongoose.models[modelName] as Model<{ name?: string; tenantId?: string }>;
    const found = await model
      .findOne({ ...filter, ...tenantPartitionFilter('principalExists') })
      .select('_id')
      .lean();
    return found != null;
  }

  /**
   * Whether a role (by its exact name), group or user (by ObjectId) exists in the caller's
   * tenant partition (`tenantPartitionFilter`): the active tenant's principals, or outside a
   * tenant only platform-level ones, never one that only some tenant holds. The system roles
   * always exist, since `getRoleByName` creates them on first use; this lookup creates nothing
   * and reads no cache. Any other type, or an id that cannot name a group or user, is `false`:
   * a group or user id must be canonical (lowercase hex, as `ObjectId#toString()` writes it),
   * because config documents and merges match the id as a string, and an uppercase spelling
   * that the database would still cast to the same ObjectId names a profile that never applies.
   */
  async function principalExists(
    principalType: PrincipalType,
    principalId: string,
  ): Promise<boolean> {
    switch (principalType) {
      case PrincipalType.ROLE:
        return systemRoleNames.has(principalId) || existsInPartition('Role', { name: principalId });
      case PrincipalType.GROUP:
        return (
          isCanonicalObjectIdString(principalId) && existsInPartition('Group', { _id: principalId })
        );
      case PrincipalType.USER:
        return (
          isCanonicalObjectIdString(principalId) && existsInPartition('User', { _id: principalId })
        );
      default:
        return false;
    }
  }

  return { principalExists };
}
