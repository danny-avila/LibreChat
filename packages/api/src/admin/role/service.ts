import { logger } from '@librechat/data-schemas';
import { PrincipalType, PrincipalModel, SystemRoles } from 'librechat-data-provider';
import type { Config, CreateRoleRequest, IRole, UpdateRoleRequest } from '@librechat/data-schemas';
import type { AdminConfigDeps } from '../config';
import type { AdminRolesDeps } from '../roles';
import { validateDescription, validateRoleName } from '../roles';
import { prepareConfigOverrides } from './prepare';

type RoleServiceDeps = Pick<
  AdminRolesDeps,
  | 'getRoleByName'
  | 'createRoleByName'
  | 'updateRoleByName'
  | 'updateAccessPermissions'
  | 'findUserIdsByRole'
  | 'updateUsersByRole'
  | 'updateUsersRoleByIds'
> &
  Pick<AdminConfigDeps, 'findConfigByPrincipal' | 'upsertConfig'> & {
    invalidateConfigCaches: () => Promise<void>;
  };

const systemRoleNames = new Set<string>(Object.values(SystemRoles));

function isSystemRoleName(name: string): boolean {
  return systemRoleNames.has(name.toUpperCase());
}

export interface RoleAdminService {
  getRole: (name: string) => Promise<IRole | null>;
  createRole: (role: CreateRoleRequest) => Promise<IRole>;
  updateRole: (name: string, updates: UpdateRoleRequest) => Promise<IRole>;
  updateRolePermissions: (
    name: string,
    permissions: CreateRoleRequest['permissions'],
  ) => Promise<void>;
  upsertRoleConfig: (name: string, config: Pick<Config, 'priority' | 'overrides'>) => Promise<void>;
}

function normalizeRoleName(name: string): string {
  const error = validateRoleName(name, true);
  if (error) {
    throw new TypeError(error);
  }
  return name.trim();
}

function validateRoleDescription(description?: string): void {
  const error = validateDescription(description);
  if (error) {
    throw new TypeError(error);
  }
}

function validatePermissions(permissions: CreateRoleRequest['permissions']): void {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    throw new TypeError('permissions must be an object');
  }
}

export function createRoleAdminService(deps: RoleServiceDeps): RoleAdminService {
  async function createRole(role: CreateRoleRequest): Promise<IRole> {
    const name = normalizeRoleName(role.name);
    validateRoleDescription(role.description);
    validatePermissions(role.permissions);
    return await deps.createRoleByName({ ...role, name });
  }

  async function updateRole(name: string, updates: UpdateRoleRequest): Promise<IRole> {
    const normalizedName = normalizeRoleName(name);
    const nameError = validateRoleName(updates.name, false);
    if (nameError) {
      throw new TypeError(nameError);
    }
    validateRoleDescription(updates.description);
    const nextName = updates.name?.trim();
    const isRename = nextName != null && nextName !== normalizedName;
    if (isRename && isSystemRoleName(normalizedName)) {
      throw new TypeError('Cannot rename system role');
    }
    if (isRename && isSystemRoleName(nextName)) {
      throw new TypeError('Cannot use a reserved system role name');
    }

    const existing = await deps.getRoleByName(normalizedName);
    if (!existing) {
      throw new Error(`Role "${normalizedName}" was not found`);
    }
    if (isRename && (await deps.getRoleByName(nextName))) {
      throw new Error(`Role "${nextName}" already exists`);
    }

    const roleUpdates: UpdateRoleRequest = {};
    if (isRename) {
      roleUpdates.name = nextName;
    }
    if (updates.description !== undefined) {
      roleUpdates.description = updates.description;
    }
    if (Object.keys(roleUpdates).length === 0) {
      return existing;
    }
    if (!isRename) {
      const role = await deps.updateRoleByName(normalizedName, roleUpdates);
      if (!role) {
        throw new Error(`Role "${normalizedName}" was not found`);
      }
      return role;
    }

    const migratedIds = await deps.findUserIdsByRole(normalizedName);
    await deps.updateUsersByRole(normalizedName, nextName);
    try {
      const role = await deps.updateRoleByName(normalizedName, roleUpdates);
      if (!role) {
        throw new Error(`Role "${normalizedName}" was not found`);
      }
      return role;
    } catch (error) {
      try {
        if (migratedIds.length > 0) {
          await deps.updateUsersRoleByIds(migratedIds, normalizedName);
        }
      } catch (rollbackError) {
        logger.error(
          `[roleAdminService] Rename rollback failed for ${migratedIds.length} users`,
          rollbackError,
        );
      }
      throw error;
    }
  }

  async function updateRolePermissions(
    name: string,
    permissions: CreateRoleRequest['permissions'],
  ): Promise<void> {
    const normalizedName = normalizeRoleName(name);
    validatePermissions(permissions);
    const role = await deps.getRoleByName(normalizedName);
    if (!role) {
      throw new Error(`Role "${normalizedName}" was not found`);
    }
    await deps.updateAccessPermissions(
      normalizedName,
      permissions as Record<string, Record<string, boolean>>,
      role,
    );
  }

  async function upsertRoleConfig(
    name: string,
    config: Pick<Config, 'priority' | 'overrides'>,
  ): Promise<void> {
    const normalizedName = normalizeRoleName(name);
    if (
      !config.overrides ||
      typeof config.overrides !== 'object' ||
      Array.isArray(config.overrides)
    ) {
      throw new TypeError('overrides must be a plain object');
    }
    if (typeof config.priority !== 'number' || config.priority < 0) {
      throw new TypeError('priority must be a non-negative number');
    }
    const existingConfig = await deps.findConfigByPrincipal(PrincipalType.ROLE, normalizedName, {
      includeInactive: true,
    });
    const overrides = prepareConfigOverrides(config.overrides, existingConfig?.overrides);
    await deps.upsertConfig(
      PrincipalType.ROLE,
      normalizedName,
      PrincipalModel.ROLE,
      overrides,
      config.priority,
    );
    await deps.invalidateConfigCaches();
  }

  return {
    getRole: deps.getRoleByName,
    createRole,
    updateRole,
    updateRolePermissions,
    upsertRoleConfig,
  };
}
