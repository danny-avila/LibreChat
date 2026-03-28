import {
  CacheKeys,
  SystemRoles,
  roleDefaults,
  permissionsSchema,
  removeNullishValues,
} from 'librechat-data-provider';
import type { Model } from 'mongoose';
import type { IRole, IUser } from '~/types';
import logger from '~/config/winston';

const systemRoleValues = new Set<string>(Object.values(SystemRoles));

/** Case-insensitive check — the legacy roles route uppercases params. */
function isSystemRoleName(name: string): boolean {
  return systemRoleValues.has(name.toUpperCase());
}

export class RoleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoleConflictError';
  }
}

export interface RoleDeps {
  /** Returns a cache store for the given key. Injected from getLogStores. */
  getCache?: (key: string) => {
    get: (k: string) => Promise<unknown>;
    set: (k: string, v: unknown) => Promise<void>;
  };
}

export function createRoleMethods(mongoose: typeof import('mongoose'), deps: RoleDeps = {}) {
  /**
   * Initialize default roles in the system.
   * Creates the default roles (ADMIN, USER) if they don't exist in the database.
   * Updates existing roles with new permission types if they're missing.
   */
  async function initializeRoles() {
    const Role = mongoose.models.Role;

    for (const roleName of [SystemRoles.ADMIN, SystemRoles.USER]) {
      let role = await Role.findOne({ name: roleName });
      const defaultPerms = roleDefaults[roleName].permissions;

      if (!role) {
        role = new Role({ ...roleDefaults[roleName], description: '' });
      } else {
        if (role.description == null) {
          role.description = '';
        }
        const permissions = role.toObject()?.permissions ?? {};
        role.permissions = role.permissions || {};
        for (const permType of Object.keys(defaultPerms)) {
          if (permissions[permType] == null || Object.keys(permissions[permType]).length === 0) {
            role.permissions[permType] = defaultPerms[permType as keyof typeof defaultPerms];
          }
        }
      }
      await role.save();
    }
  }

  /**
   * List all roles in the system. Returns only name and description (projected).
   */
  async function listRoles(options?: {
    limit?: number;
    offset?: number;
  }): Promise<Pick<IRole, '_id' | 'name' | 'description'>[]> {
    const Role = mongoose.models.Role as Model<IRole>;
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    return await Role.find({})
      .select('name description')
      .sort({ name: 1 })
      .skip(offset)
      .limit(limit)
      .lean();
  }

  async function countRoles(): Promise<number> {
    const Role = mongoose.models.Role;
    return await Role.countDocuments({});
  }

  /**
   * Retrieve a role by name and convert the found role document to a plain object.
   * If the role with the given name doesn't exist and the name is a system defined role,
   * create it and return the lean version.
   */
  async function getRoleByName(roleName: string, fieldsToSelect: string | string[] | null = null) {
    const cache = deps.getCache?.(CacheKeys.ROLES);
    try {
      if (cache) {
        const cachedRole = await cache.get(roleName);
        if (cachedRole) {
          return cachedRole as IRole;
        }
      }
      const Role = mongoose.models.Role;
      let query = Role.findOne({ name: roleName });
      if (fieldsToSelect) {
        query = query.select(fieldsToSelect);
      }
      const role = await query.lean().exec();

      if (!role && systemRoleValues.has(roleName)) {
        const newRole = await new Role(roleDefaults[roleName as keyof typeof roleDefaults]).save();
        if (cache) {
          await cache.set(roleName, newRole);
        }
        return newRole.toObject() as IRole;
      }
      if (cache) {
        await cache.set(roleName, role);
      }
      return role as unknown as IRole;
    } catch (error) {
      throw new Error(`Failed to retrieve or create role: ${(error as Error).message}`);
    }
  }

  /**
   * Update role values by name.
   */
  async function updateRoleByName(roleName: string, updates: Partial<IRole>) {
    const cache = deps.getCache?.(CacheKeys.ROLES);
    try {
      const Role = mongoose.models.Role;
      const role = await Role.findOneAndUpdate({ name: roleName }, { $set: updates }, { new: true })
        .select('-__v')
        .lean()
        .exec();
      if (cache) {
        if (updates.name && updates.name !== roleName) {
          await Promise.all([cache.set(roleName, null), cache.set(updates.name, role)]);
        } else {
          await cache.set(roleName, role);
        }
      }
      return role as unknown as IRole;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        const targetName = updates.name ?? roleName;
        throw new RoleConflictError(`Role "${targetName}" already exists`);
      }
      throw new Error(`Failed to update role: ${(error as Error).message}`, { cause: error });
    }
  }

  /**
   * Updates access permissions for a specific role and multiple permission types.
   */
  async function updateAccessPermissions(
    roleName: string,
    permissionsUpdate: Record<string, Record<string, boolean>>,
    roleData?: IRole,
  ) {
    const updates: Record<string, Record<string, boolean>> = {};
    for (const [permissionType, permissions] of Object.entries(permissionsUpdate)) {
      if (
        permissionsSchema.shape &&
        permissionsSchema.shape[permissionType as keyof typeof permissionsSchema.shape]
      ) {
        updates[permissionType] = removeNullishValues(permissions) as Record<string, boolean>;
      }
    }
    if (!Object.keys(updates).length) {
      return;
    }

    try {
      const role = roleData ?? (await getRoleByName(roleName));
      if (!role) {
        return;
      }

      const currentPermissions =
        ((role as unknown as Record<string, unknown>).permissions as Record<
          string,
          Record<string, boolean>
        >) || {};
      const updatedPermissions: Record<string, Record<string, boolean>> = { ...currentPermissions };
      let hasChanges = false;

      const unsetFields: Record<string, number> = {};
      const permissionTypes = Object.keys(permissionsSchema.shape || {});
      for (const permType of permissionTypes) {
        if (
          (role as unknown as Record<string, unknown>)[permType] &&
          typeof (role as unknown as Record<string, unknown>)[permType] === 'object'
        ) {
          logger.info(
            `Migrating '${roleName}' role from old schema: found '${permType}' at top level`,
          );

          updatedPermissions[permType] = {
            ...updatedPermissions[permType],
            ...((role as unknown as Record<string, unknown>)[permType] as Record<string, boolean>),
          };

          unsetFields[permType] = 1;
          hasChanges = true;
        }
      }

      // Migrate legacy SHARED_GLOBAL → SHARE for PROMPTS and AGENTS.
      // SHARED_GLOBAL was removed in favour of SHARE in PR #11283. If the DB still has
      // SHARED_GLOBAL but not SHARE, inherit the value so sharing intent is preserved.
      const legacySharedGlobalTypes = ['PROMPTS', 'AGENTS'];
      for (const legacyPermType of legacySharedGlobalTypes) {
        const existingTypePerms = currentPermissions[legacyPermType];
        if (
          existingTypePerms &&
          'SHARED_GLOBAL' in existingTypePerms &&
          !('SHARE' in existingTypePerms) &&
          updates[legacyPermType] &&
          // Don't override an explicit SHARE value the caller already provided
          !('SHARE' in updates[legacyPermType])
        ) {
          const inheritedValue = existingTypePerms['SHARED_GLOBAL'];
          updates[legacyPermType]['SHARE'] = inheritedValue;
          logger.info(
            `Migrating '${roleName}' role ${legacyPermType}.SHARED_GLOBAL=${inheritedValue} → SHARE`,
          );
        }
      }

      for (const [permissionType, permissions] of Object.entries(updates)) {
        const currentTypePermissions = currentPermissions[permissionType] || {};
        updatedPermissions[permissionType] = { ...currentTypePermissions };

        for (const [permission, value] of Object.entries(permissions)) {
          if (currentTypePermissions[permission] !== value) {
            updatedPermissions[permissionType][permission] = value;
            hasChanges = true;
            logger.info(
              `Updating '${roleName}' role permission '${permissionType}' '${permission}' from ${currentTypePermissions[permission]} to: ${value}`,
            );
          }
        }
      }

      // Clean up orphaned SHARED_GLOBAL fields left in DB after the schema rename.
      // Since we $set the full permissions object, deleting from updatedPermissions
      // is sufficient to remove the field from MongoDB.
      for (const legacyPermType of legacySharedGlobalTypes) {
        const existingTypePerms = currentPermissions[legacyPermType];
        if (existingTypePerms && 'SHARED_GLOBAL' in existingTypePerms) {
          if (!updates[legacyPermType]) {
            // permType wasn't in the update payload so the migration block above didn't run.
            // Create a writable copy and handle the SHARED_GLOBAL → SHARE inheritance here
            // to avoid removing SHARED_GLOBAL without writing SHARE (data loss).
            updatedPermissions[legacyPermType] = { ...existingTypePerms };
            if (!('SHARE' in existingTypePerms)) {
              updatedPermissions[legacyPermType]['SHARE'] = existingTypePerms['SHARED_GLOBAL'];
              logger.info(
                `Migrating '${roleName}' role ${legacyPermType}.SHARED_GLOBAL=${existingTypePerms['SHARED_GLOBAL']} → SHARE`,
              );
            }
          }
          delete updatedPermissions[legacyPermType]['SHARED_GLOBAL'];
          hasChanges = true;
          logger.info(
            `Removed legacy SHARED_GLOBAL field from '${roleName}' role ${legacyPermType} permissions`,
          );
        }
      }

      if (hasChanges) {
        const Role = mongoose.models.Role;
        const updateObj = { permissions: updatedPermissions };

        if (Object.keys(unsetFields).length > 0) {
          logger.info(
            `Unsetting old schema fields for '${roleName}' role: ${Object.keys(unsetFields).join(', ')}`,
          );

          try {
            await Role.updateOne(
              { name: roleName },
              {
                $set: updateObj,
                $unset: unsetFields,
              },
            );

            const cache = deps.getCache?.(CacheKeys.ROLES);
            const updatedRole = await Role.findOne({ name: roleName }).select('-__v').lean().exec();
            if (cache) {
              await cache.set(roleName, updatedRole);
            }

            logger.info(`Updated role '${roleName}' and removed old schema fields`);
          } catch (updateError) {
            logger.error(`Error during role migration update: ${(updateError as Error).message}`);
            throw updateError;
          }
        } else {
          await updateRoleByName(roleName, updateObj as unknown as Partial<IRole>);
        }

        logger.info(`Updated '${roleName}' role permissions`);
      } else {
        logger.info(`No changes needed for '${roleName}' role permissions`);
      }
    } catch (error) {
      logger.error(`Failed to update ${roleName} role permissions:`, error);
    }
  }

  /**
   * Migrates roles from old schema to new schema structure.
   */
  async function migrateRoleSchema(roleName?: string): Promise<number> {
    try {
      const Role = mongoose.models.Role;
      let roles;
      if (roleName) {
        const role = await Role.findOne({ name: roleName });
        roles = role ? [role] : [];
      } else {
        roles = await Role.find({});
      }

      logger.info(`Migrating ${roles.length} roles to new schema structure`);
      let migratedCount = 0;

      for (const role of roles) {
        const permissionTypes = Object.keys(permissionsSchema.shape || {});
        const unsetFields: Record<string, number> = {};
        let hasOldSchema = false;

        for (const permType of permissionTypes) {
          if (role[permType] && typeof role[permType] === 'object') {
            hasOldSchema = true;
            role.permissions = role.permissions || {};
            role.permissions[permType] = {
              ...role.permissions[permType],
              ...role[permType],
            };
            unsetFields[permType] = 1;
          }
        }

        if (hasOldSchema) {
          try {
            logger.info(`Migrating role '${role.name}' from old schema structure`);

            await Role.updateOne(
              { _id: role._id },
              {
                $set: { permissions: role.permissions },
                $unset: unsetFields,
              },
            );

            const cache = deps.getCache?.(CacheKeys.ROLES);
            if (cache) {
              const updatedRole = await Role.findById(role._id).lean().exec();
              await cache.set(role.name, updatedRole);
            }

            migratedCount++;
            logger.info(`Migrated role '${role.name}'`);
          } catch (error) {
            logger.error(`Failed to migrate role '${role.name}': ${(error as Error).message}`);
          }
        }
      }

      logger.info(`Migration complete: ${migratedCount} roles migrated`);
      return migratedCount;
    } catch (error) {
      logger.error(`Role schema migration failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /** Rejects names that match system roles. */
  async function createRoleByName(roleData: Partial<IRole>): Promise<IRole> {
    const { name } = roleData;
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new Error('Role name is required');
    }
    const trimmed = name.trim();
    if (isSystemRoleName(trimmed)) {
      throw new RoleConflictError(`Cannot create role with reserved system name: ${name}`);
    }
    const Role = mongoose.models.Role;
    const existing = await Role.findOne({ name: trimmed }).lean();
    if (existing) {
      throw new RoleConflictError(`Role "${trimmed}" already exists`);
    }
    let role;
    try {
      role = await new Role({ ...roleData, name: trimmed }).save();
    } catch (err) {
      /**
       * The compound unique index `{ name: 1, tenantId: 1 }` on the role schema
       * (roleSchema.index in schema/role.ts) triggers error 11000 when a concurrent
       * request races past the findOne check above. This catch converts it into
       * the same user-facing message as the application-level duplicate check.
       */
      if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
        throw new RoleConflictError(`Role "${trimmed}" already exists`);
      }
      throw err;
    }
    try {
      const cache = deps.getCache?.(CacheKeys.ROLES);
      if (cache) {
        await cache.set(role.name, role.toObject());
      }
    } catch (cacheError) {
      logger.error(`[createRoleByName] cache set failed for "${role.name}":`, cacheError);
    }
    return role.toObject() as IRole;
  }

  /**
   * Guards against deleting system roles. Reassigns affected users back to USER.
   *
   * No existence pre-check is performed: for a nonexistent role the `updateMany`
   * is a harmless no-op and `findOneAndDelete` returns null. This makes the
   * function idempotent — a retry after a partial failure will still clean up
   * orphaned user references and cache entries.
   *
   * Without a MongoDB transaction the two writes are non-atomic — if the delete
   * fails after the reassignment, users will already have been moved to USER
   * while the role document still exists. Recovery requires the caller to retry
   * the delete call, which will succeed since the `updateMany` is a no-op on
   * the second pass.
   */
  async function deleteRoleByName(roleName: string): Promise<IRole | null> {
    if (isSystemRoleName(roleName)) {
      throw new Error(`Cannot delete system role: ${roleName}`);
    }
    const Role = mongoose.models.Role;
    const User = mongoose.models.User as Model<IUser>;
    await User.updateMany({ role: roleName }, { $set: { role: SystemRoles.USER } });
    const deleted = await Role.findOneAndDelete({ name: roleName }).lean();
    try {
      const cache = deps.getCache?.(CacheKeys.ROLES);
      if (cache) {
        // Setting null evicts the stale document. getRoleByName treats falsy cached
        // values as a miss and falls through to the DB, so this does not provide
        // negative caching — it only prevents serving the pre-deletion document.
        await cache.set(roleName, null);
      }
    } catch (cacheError) {
      logger.error(`[deleteRoleByName] cache invalidation failed for "${roleName}":`, cacheError);
    }
    return deleted as IRole | null;
  }

  async function updateUsersByRole(oldRole: string, newRole: string): Promise<void> {
    const User = mongoose.models.User as Model<IUser>;
    await User.updateMany({ role: oldRole }, { $set: { role: newRole } });
  }

  async function findUserIdsByRole(roleName: string): Promise<string[]> {
    const User = mongoose.models.User as Model<IUser>;
    const users = await User.find({ role: roleName }).select('_id').lean();
    return users.map((u) => u._id.toString());
  }

  async function updateUsersRoleByIds(userIds: string[], newRole: string): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    const User = mongoose.models.User as Model<IUser>;
    await User.updateMany({ _id: { $in: userIds } }, { $set: { role: newRole } });
  }

  async function listUsersByRole(
    roleName: string,
    options?: { limit?: number; offset?: number },
  ): Promise<IUser[]> {
    const User = mongoose.models.User as Model<IUser>;
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    return await User.find({ role: roleName })
      .select('_id name email avatar')
      .sort({ _id: 1 })
      .skip(offset)
      .limit(limit)
      .lean();
  }

  async function countUsersByRole(roleName: string): Promise<number> {
    const User = mongoose.models.User as Model<IUser>;
    return await User.countDocuments({ role: roleName });
  }

  return {
    listRoles,
    countRoles,
    initializeRoles,
    getRoleByName,
    updateRoleByName,
    updateAccessPermissions,
    migrateRoleSchema,
    createRoleByName,
    deleteRoleByName,
    updateUsersByRole,
    findUserIdsByRole,
    updateUsersRoleByIds,
    listUsersByRole,
    countUsersByRole,
  };
}

export type RoleMethods = ReturnType<typeof createRoleMethods>;
