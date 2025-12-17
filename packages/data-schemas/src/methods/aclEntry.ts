import { Types } from 'mongoose';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { Model, DeleteResult, ClientSession } from 'mongoose';
import type { IAclEntry } from '~/types';

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
   * Check if a set of principals has a specific permission on a resource
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
      permBits: { $bitsAllSet: permissionBit },
    }).lean();

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
      if (!update.$bit) update.$bit = {};
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
   * Find all resources of a specific type that a set of principals has access to
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

    const entries = await AclEntry.find({
      $or: principalsQuery,
      resourceType,
      permBits: { $bitsAllSet: requiredPermBit },
    }).distinct('resourceId');

    return entries;
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
  };
}

export type AclEntryMethods = ReturnType<typeof createAclEntryMethods>;
