import { Types } from 'mongoose';
import { PrincipalType, PrincipalModel, PermissionBits } from 'librechat-data-provider';
import type {
  AnyBulkWriteOperation,
  ClientSession,
  PipelineStage,
  DeleteResult,
  Model,
} from 'mongoose';
import type { AclEntry, IAclEntry } from '~/types';
import { MAX_PERM_BITS } from '~/common/permissions';
import { tenantSafeBulkWrite } from '~/utils/tenantBulkWrite';

/**
 * Empty frozen array shared by every rejection path. Returning a single
 * instance keeps the hot path allocation-free and freezes a known-safe value
 * so it can never mutate into a "match everything" list.
 */
const EMPTY_SUPERSETS: readonly number[] = Object.freeze([]);

const supersetCache = new Map<number, readonly number[]>();

/**
 * Enumerates every `permBits` value (in the range `[0, MAX_PERM_BITS]`) whose
 * set bits include all bits in `requiredBits`. Used with a `$in` filter to push
 * permission-mask matching down to the database without relying on the
 * `$bitsAllSet` query operator, which is not supported by Azure Cosmos DB for
 * MongoDB (see issue #12729).
 *
 * **Invariant:** stored `permBits` values must lie in `[0, MAX_PERM_BITS]`.
 * Values with higher-order bits set would never appear in the emitted `$in`
 * list and would silently produce false permission denials. The aclEntry
 * schema enforces this with a `max` validator; if the `PermissionBits` enum
 * grows, `MAX_PERM_BITS` auto-expands from the new enum values.
 *
 * **Cache safety:** callers sometimes forward user input directly (e.g.
 * `req.query.requiredPermission` is parsed and passed through without a range
 * check). To prevent the process-global cache from growing unboundedly from
 * attacker-supplied integers, any `requiredBits` outside `[0, MAX_PERM_BITS]`
 * or with bits set above the max returns a shared frozen empty array and is
 * NOT added to the cache. An empty `$in` list correctly matches zero rows,
 * which is the right behavior for a request asking for bits the system does
 * not recognize.
 *
 * For the current 4-bit `PermissionBits` enum the worst case is `required = 0`
 * which expands to 16 values; the best case (all bits required) expands to 1.
 * Results are memoized per `requiredBits` so the expansion runs at most once
 * per distinct mask over the process lifetime.
 */
export function permissionBitSupersets(requiredBits: number): readonly number[] {
  if (
    !Number.isInteger(requiredBits) ||
    requiredBits < 0 ||
    (requiredBits & ~MAX_PERM_BITS) !== 0
  ) {
    return EMPTY_SUPERSETS;
  }
  const cached = supersetCache.get(requiredBits);
  if (cached !== undefined) {
    return cached;
  }
  const supersets: number[] = [];
  for (let v = 0; v <= MAX_PERM_BITS; v++) {
    if ((v & requiredBits) === requiredBits) {
      supersets.push(v);
    }
  }
  /**
   * Freeze the cached array so a future caller cannot mutate the shared cache
   * entry. All current callers only forward this to Mongoose's `$in`, which
   * does not mutate — freezing is cheap and prevents silent corruption.
   */
  const frozen = Object.freeze(supersets);
  supersetCache.set(requiredBits, frozen);
  return frozen;
}

export function createAclEntryMethods(mongoose: typeof import('mongoose')) {
  /**
   * Find ACL entries for a specific principal (user or group)
   * @param principalType - The type of principal ('user', 'group')
   * @param principalId - The ID of the principal
   * @param resourceType - Optional filter by resource type
   * @returns Array of ACL entries
   */
  async function findEntriesByPrincipal(
    principalType: string,
    principalId: string | Types.ObjectId,
    resourceType?: string,
  ): Promise<IAclEntry[]> {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    const query: Record<string, unknown> = { principalType, principalId };
    if (resourceType) {
      query.resourceType = resourceType;
    }
    return await AclEntry.find(query).lean();
  }

  /**
   * Find ACL entries for a specific resource
   * @param resourceType - The type of resource ('agent', 'project', 'file')
   * @param resourceId - The ID of the resource
   * @returns Array of ACL entries
   */
  async function findEntriesByResource(
    resourceType: string,
    resourceId: string | Types.ObjectId,
  ): Promise<IAclEntry[]> {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    return await AclEntry.find({ resourceType, resourceId }).lean();
  }

  /**
   * Find all ACL entries for a set of principals (including public)
   * @param principalsList - List of principals, each containing { principalType, principalId }
   * @param resourceType - The type of resource
   * @param resourceId - The ID of the resource
   * @returns Array of matching ACL entries
   */
  async function findEntriesByPrincipalsAndResource(
    principalsList: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    resourceType: string,
    resourceId: string | Types.ObjectId,
  ): Promise<IAclEntry[]> {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    const principalsQuery = principalsList.map((p) => ({
      principalType: p.principalType,
      ...(p.principalType !== PrincipalType.PUBLIC && { principalId: p.principalId }),
    }));

    return await AclEntry.find({
      $or: principalsQuery,
      resourceType,
      resourceId,
    }).lean();
  }

  /**
   * Check if a set of principals has a specific permission on a resource.
   * See {@link permissionBitSupersets} for the Cosmos-compatible bit filter.
   * @param principalsList - List of principals, each containing { principalType, principalId }
   * @param resourceType - The type of resource
   * @param resourceId - The ID of the resource
   * @param permissionBit - The permission bit to check (use PermissionBits enum)
   * @returns Whether any of the principals has the permission
   */
  async function hasPermission(
    principalsList: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    resourceType: string,
    resourceId: string | Types.ObjectId,
    permissionBit: number,
  ): Promise<boolean> {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    const principalsQuery = principalsList.map((p) => ({
      principalType: p.principalType,
      ...(p.principalType !== PrincipalType.PUBLIC && { principalId: p.principalId }),
    }));

    const entry = await AclEntry.findOne({
      $or: principalsQuery,
      resourceType,
      resourceId,
      permBits: { $in: permissionBitSupersets(permissionBit) },
    })
      .select('_id')
      .lean();

    return !!entry;
  }

  /**
   * Get the combined effective permissions for a set of principals on a resource
   * @param principalsList - List of principals, each containing { principalType, principalId }
   * @param resourceType - The type of resource
   * @param resourceId - The ID of the resource
   * @returns {Promise<number>} Effective permission bitmask
   */
  async function getEffectivePermissions(
    principalsList: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    resourceType: string,
    resourceId: string | Types.ObjectId,
  ): Promise<number> {
    const aclEntries = await findEntriesByPrincipalsAndResource(
      principalsList,
      resourceType,
      resourceId,
    );

    let effectiveBits = 0;
    for (const entry of aclEntries) {
      effectiveBits |= entry.permBits;
    }
    return effectiveBits;
  }

  /**
   * Get effective permissions for multiple resources in a single query (BATCH)
   * Returns a map of resourceId → effectivePermissionBits
   *
   * @param principalsList - List of principals (user + groups + public)
   * @param resourceType - The type of resource ('MCPSERVER', 'AGENT', etc.)
   * @param resourceIds - Array of resource IDs to check
   * @returns {Promise<Map<string, number>>} Map of resourceId → permission bits
   *
   * @example
   * const principals = await getUserPrincipals({ userId, role });
   * const serverIds = [id1, id2, id3];
   * const permMap = await getEffectivePermissionsForResources(
   *   principals,
   *   ResourceType.MCPSERVER,
   *   serverIds
   * );
   * // permMap.get(id1.toString()) → 7 (VIEW|EDIT|DELETE)
   */
  async function getEffectivePermissionsForResources(
    principalsList: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    resourceType: string,
    resourceIds: Array<string | Types.ObjectId>,
  ): Promise<Map<string, number>> {
    if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
      return new Map();
    }

    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    const principalsQuery = principalsList.map((p) => ({
      principalType: p.principalType,
      ...(p.principalType !== PrincipalType.PUBLIC && { principalId: p.principalId }),
    }));

    // Batch query for all resources at once
    const aclEntries = await AclEntry.find({
      $or: principalsQuery,
      resourceType,
      resourceId: { $in: resourceIds },
    }).lean();

    // Compute effective permissions per resource
    const permissionsMap = new Map<string, number>();
    for (const entry of aclEntries) {
      const rid = entry.resourceId.toString();
      const currentBits = permissionsMap.get(rid) || 0;
      permissionsMap.set(rid, currentBits | entry.permBits);
    }

    return permissionsMap;
  }

  /**
   * Grant permission to a principal for a resource
   * @param principalType - The type of principal ('user', 'group', 'public')
   * @param principalId - The ID of the principal (null for 'public')
   * @param resourceType - The type of resource
   * @param resourceId - The ID of the resource
   * @param permBits - The permission bits to grant
   * @param grantedBy - The ID of the user granting the permission
   * @param session - Optional MongoDB session for transactions
   * @param roleId - Optional role ID to associate with this permission
   * @returns The created or updated ACL entry
   */
  async function grantPermission(
    principalType: string,
    principalId: string | Types.ObjectId | null,
    resourceType: string,
    resourceId: string | Types.ObjectId,
    permBits: number,
    grantedBy: string | Types.ObjectId,
    session?: ClientSession,
    roleId?: string | Types.ObjectId,
  ): Promise<IAclEntry | null> {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    const query: Record<string, unknown> = {
      principalType,
      resourceType,
      resourceId,
    };

    if (principalType !== PrincipalType.PUBLIC) {
      query.principalId =
        typeof principalId === 'string' && principalType !== PrincipalType.ROLE
          ? new Types.ObjectId(principalId)
          : principalId;
      if (principalType === PrincipalType.USER) {
        query.principalModel = PrincipalModel.USER;
      } else if (principalType === PrincipalType.GROUP) {
        query.principalModel = PrincipalModel.GROUP;
      } else if (principalType === PrincipalType.ROLE) {
        query.principalModel = PrincipalModel.ROLE;
      }
    }

    const update = {
      $set: {
        permBits,
        grantedBy,
        grantedAt: new Date(),
        ...(roleId && { roleId }),
      },
    };

    const options = {
      upsert: true,
      new: true,
      ...(session ? { session } : {}),
    };

    return await AclEntry.findOneAndUpdate(query, update, options);
  }

  /**
   * Revoke permissions from a principal for a resource
   * @param principalType - The type of principal ('user', 'group', 'public')
   * @param principalId - The ID of the principal (null for 'public')
   * @param resourceType - The type of resource
   * @param resourceId - The ID of the resource
   * @param session - Optional MongoDB session for transactions
   * @returns The result of the delete operation
   */
  async function revokePermission(
    principalType: string,
    principalId: string | Types.ObjectId | null,
    resourceType: string,
    resourceId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<DeleteResult> {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    const query: Record<string, unknown> = {
      principalType,
      resourceType,
      resourceId,
    };

    if (principalType !== PrincipalType.PUBLIC) {
      query.principalId =
        typeof principalId === 'string' && principalType !== PrincipalType.ROLE
          ? new Types.ObjectId(principalId)
          : principalId;
    }

    const options = session ? { session } : {};

    return await AclEntry.deleteOne(query, options);
  }

  /**
   * Modify existing permission bits for a principal on a resource
   * @param principalType - The type of principal ('user', 'group', 'public')
   * @param principalId - The ID of the principal (null for 'public')
   * @param resourceType - The type of resource
   * @param resourceId - The ID of the resource
   * @param addBits - Permission bits to add
   * @param removeBits - Permission bits to remove
   * @param session - Optional MongoDB session for transactions
   * @returns The updated ACL entry
   */
  async function modifyPermissionBits(
    principalType: string,
    principalId: string | Types.ObjectId | null,
    resourceType: string,
    resourceId: string | Types.ObjectId,
    addBits?: number | null,
    removeBits?: number | null,
    session?: ClientSession,
  ): Promise<IAclEntry | null> {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    const query: Record<string, unknown> = {
      principalType,
      resourceType,
      resourceId,
    };

    if (principalType !== PrincipalType.PUBLIC) {
      query.principalId =
        typeof principalId === 'string' && principalType !== PrincipalType.ROLE
          ? new Types.ObjectId(principalId)
          : principalId;
    }

    const update: Record<string, unknown> = {};

    if (addBits) {
      update.$bit = { permBits: { or: addBits } };
    }

    if (removeBits) {
      if (!update.$bit) {
        update.$bit = {};
      }
      const bitUpdate = update.$bit as Record<string, unknown>;
      bitUpdate.permBits = { ...(bitUpdate.permBits as Record<string, unknown>), and: ~removeBits };
    }

    const options = {
      new: true,
      ...(session ? { session } : {}),
    };

    return await AclEntry.findOneAndUpdate(query, update, options);
  }

  /**
   * Find all resources of a specific type that a set of principals has access to.
   * See {@link permissionBitSupersets} for the Cosmos-compatible bit filter.
   * @param principalsList - List of principals, each containing { principalType, principalId }
   * @param resourceType - The type of resource
   * @param requiredPermBit - Required permission bit (use PermissionBits enum)
   * @returns Array of resource IDs
   */
  async function findAccessibleResources(
    principalsList: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    resourceType: string,
    requiredPermBit: number,
  ): Promise<Types.ObjectId[]> {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    const principalsQuery = principalsList.map((p) => ({
      principalType: p.principalType,
      ...(p.principalType !== PrincipalType.PUBLIC && { principalId: p.principalId }),
    }));

    return await AclEntry.find({
      $or: principalsQuery,
      resourceType,
      permBits: { $in: permissionBitSupersets(requiredPermBit) },
    }).distinct('resourceId');
  }

  /**
   * Deletes ACL entries matching the given filter.
   * @param filter - MongoDB filter query
   * @param options - Optional query options (e.g., { session })
   */
  async function deleteAclEntries(
    filter: Record<string, unknown>,
    options?: { session?: ClientSession },
  ): Promise<DeleteResult> {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    return AclEntry.deleteMany(filter, options || {});
  }

  /**
   * Performs a bulk write operation on ACL entries.
   * @param ops - Array of bulk write operations
   * @param options - Optional query options (e.g., { session })
   */
  async function bulkWriteAclEntries(
    ops: AnyBulkWriteOperation<AclEntry>[],
    options?: { session?: ClientSession },
  ) {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    return tenantSafeBulkWrite(AclEntry, ops as AnyBulkWriteOperation[], options || {});
  }

  /**
   * Finds all publicly accessible resource IDs for a given resource type.
   * See {@link permissionBitSupersets} for the Cosmos-compatible bit filter.
   * @param resourceType - The type of resource
   * @param requiredPermissions - Required permission bits
   */
  async function findPublicResourceIds(
    resourceType: string,
    requiredPermissions: number,
  ): Promise<Types.ObjectId[]> {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    return await AclEntry.find({
      principalType: PrincipalType.PUBLIC,
      resourceType,
      permBits: { $in: permissionBitSupersets(requiredPermissions) },
    }).distinct('resourceId');
  }

  /**
   * Runs an aggregation pipeline on the AclEntry collection.
   * @param pipeline - MongoDB aggregation pipeline stages
   */
  async function aggregateAclEntries(pipeline: PipelineStage[]) {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    return AclEntry.aggregate(pipeline);
  }

  /**
   * Returns resource IDs solely owned by the given user (no other principals
   * hold DELETE on the same resource). Handles both single and array resource types.
   * See {@link permissionBitSupersets} for the Cosmos-compatible bit filter.
   */
  async function getSoleOwnedResourceIds(
    userObjectId: Types.ObjectId,
    resourceTypes: string | string[],
  ): Promise<Types.ObjectId[]> {
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    const types = Array.isArray(resourceTypes) ? resourceTypes : [resourceTypes];
    const deleteSupersets = permissionBitSupersets(PermissionBits.DELETE);

    const ownedEntries = await AclEntry.find({
      principalType: PrincipalType.USER,
      principalId: userObjectId,
      resourceType: { $in: types },
      permBits: { $in: deleteSupersets },
    })
      .select('resourceId')
      .lean();

    if (ownedEntries.length === 0) {
      return [];
    }

    const ownedIds = ownedEntries.map((e) => e.resourceId);

    const otherOwners = await AclEntry.aggregate([
      {
        $match: {
          resourceType: { $in: types },
          resourceId: { $in: ownedIds },
          permBits: { $in: deleteSupersets },
          $or: [
            { principalId: { $ne: userObjectId } },
            { principalType: { $ne: PrincipalType.USER } },
          ],
        },
      },
      { $group: { _id: '$resourceId' } },
    ]);

    const multiOwnerIds = new Set(
      otherOwners.map((doc: { _id: Types.ObjectId }) => doc._id.toString()),
    );
    return ownedIds.filter((id) => !multiOwnerIds.has(id.toString()));
  }

  return {
    findEntriesByPrincipal,
    findEntriesByResource,
    findEntriesByPrincipalsAndResource,
    hasPermission,
    getEffectivePermissions,
    getEffectivePermissionsForResources,
    grantPermission,
    revokePermission,
    modifyPermissionBits,
    findAccessibleResources,
    deleteAclEntries,
    bulkWriteAclEntries,
    findPublicResourceIds,
    aggregateAclEntries,
    getSoleOwnedResourceIds,
  };
}

export type AclEntryMethods = ReturnType<typeof createAclEntryMethods>;
