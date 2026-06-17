import { AccessRoleIds, ResourceType, PermissionBits } from 'librechat-data-provider';
import type { Model, Types, DeleteResult } from 'mongoose';
import type { IAccessRole } from '~/types';
import { RoleBits } from '~/common';
import { getTenantId, runAsSystem, SYSTEM_TENANT_ID, tenantStorage } from '~/config/tenantContext';

const DEFAULT_ACCESS_ROLES: Array<{
  accessRoleId: AccessRoleIds;
  name: string;
  description: string;
  resourceType: ResourceType;
  permBits: RoleBits;
}> = [
  {
    accessRoleId: AccessRoleIds.AGENT_VIEWER,
    name: 'com_ui_role_viewer',
    description: 'com_ui_role_viewer_desc',
    resourceType: ResourceType.AGENT,
    permBits: RoleBits.VIEWER,
  },
  {
    accessRoleId: AccessRoleIds.AGENT_EDITOR,
    name: 'com_ui_role_editor',
    description: 'com_ui_role_editor_desc',
    resourceType: ResourceType.AGENT,
    permBits: RoleBits.EDITOR,
  },
  {
    accessRoleId: AccessRoleIds.AGENT_OWNER,
    name: 'com_ui_role_owner',
    description: 'com_ui_role_owner_desc',
    resourceType: ResourceType.AGENT,
    permBits: RoleBits.OWNER,
  },
  {
    accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
    name: 'com_ui_role_viewer',
    description: 'com_ui_role_viewer_desc',
    resourceType: ResourceType.PROMPTGROUP,
    permBits: RoleBits.VIEWER,
  },
  {
    accessRoleId: AccessRoleIds.PROMPTGROUP_EDITOR,
    name: 'com_ui_role_editor',
    description: 'com_ui_role_editor_desc',
    resourceType: ResourceType.PROMPTGROUP,
    permBits: RoleBits.EDITOR,
  },
  {
    accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
    name: 'com_ui_role_owner',
    description: 'com_ui_role_owner_desc',
    resourceType: ResourceType.PROMPTGROUP,
    permBits: RoleBits.OWNER,
  },
  {
    accessRoleId: AccessRoleIds.MCPSERVER_VIEWER,
    name: 'com_ui_mcp_server_role_viewer',
    description: 'com_ui_mcp_server_role_viewer_desc',
    resourceType: ResourceType.MCPSERVER,
    permBits: RoleBits.VIEWER,
  },
  {
    accessRoleId: AccessRoleIds.MCPSERVER_EDITOR,
    name: 'com_ui_mcp_server_role_editor',
    description: 'com_ui_mcp_server_role_editor_desc',
    resourceType: ResourceType.MCPSERVER,
    permBits: RoleBits.EDITOR,
  },
  {
    accessRoleId: AccessRoleIds.MCPSERVER_OWNER,
    name: 'com_ui_mcp_server_role_owner',
    description: 'com_ui_mcp_server_role_owner_desc',
    resourceType: ResourceType.MCPSERVER,
    permBits: RoleBits.OWNER,
  },
  {
    accessRoleId: AccessRoleIds.REMOTE_AGENT_VIEWER,
    name: 'com_ui_remote_agent_role_viewer',
    description: 'com_ui_remote_agent_role_viewer_desc',
    resourceType: ResourceType.REMOTE_AGENT,
    permBits: RoleBits.VIEWER,
  },
  {
    accessRoleId: AccessRoleIds.REMOTE_AGENT_EDITOR,
    name: 'com_ui_remote_agent_role_editor',
    description: 'com_ui_remote_agent_role_editor_desc',
    resourceType: ResourceType.REMOTE_AGENT,
    permBits: RoleBits.EDITOR,
  },
  {
    accessRoleId: AccessRoleIds.REMOTE_AGENT_OWNER,
    name: 'com_ui_remote_agent_role_owner',
    description: 'com_ui_remote_agent_role_owner_desc',
    resourceType: ResourceType.REMOTE_AGENT,
    permBits: RoleBits.OWNER,
  },
  {
    accessRoleId: AccessRoleIds.SKILL_VIEWER,
    name: 'com_ui_role_viewer',
    description: 'com_ui_role_viewer_desc',
    resourceType: ResourceType.SKILL,
    permBits: RoleBits.VIEWER,
  },
  {
    accessRoleId: AccessRoleIds.SKILL_EDITOR,
    name: 'com_ui_role_editor',
    description: 'com_ui_role_editor_desc',
    resourceType: ResourceType.SKILL,
    permBits: RoleBits.EDITOR,
  },
  {
    accessRoleId: AccessRoleIds.SKILL_OWNER,
    name: 'com_ui_role_owner',
    description: 'com_ui_role_owner_desc',
    resourceType: ResourceType.SKILL,
    permBits: RoleBits.OWNER,
  },
];

export function createAccessRoleMethods(mongoose: typeof import('mongoose')) {
  /**
   * Find an access role by its ID
   * @param roleId - The role ID
   * @returns The role document or null if not found
   */
  async function findRoleById(roleId: string | Types.ObjectId): Promise<IAccessRole | null> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    return await AccessRole.findById(roleId).lean<IAccessRole>();
  }

  /**
   * Find an access role by its unique identifier
   * @param accessRoleId - The unique identifier (e.g., "agent_viewer")
   * @returns The role document or null if not found
   */
  async function findRoleByIdentifier(
    accessRoleId: string | Types.ObjectId,
  ): Promise<IAccessRole | null> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    return await AccessRole.findOne({ accessRoleId }).lean<IAccessRole>();
  }

  /**
   * Find all access roles for a specific resource type
   * @param resourceType - The type of resource ('agent', 'project', 'file')
   * @returns Array of role documents
   */
  async function findRolesByResourceType(resourceType: string): Promise<IAccessRole[]> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    return await AccessRole.find({ resourceType }).lean<IAccessRole[]>();
  }

  /**
   * Find an access role by resource type and permission bits
   * @param resourceType - The type of resource
   * @param permBits - The permission bits (use PermissionBits or RoleBits enum)
   * @returns The role document or null if not found
   */
  async function findRoleByPermissions(
    resourceType: string,
    permBits: PermissionBits | RoleBits,
  ): Promise<IAccessRole | null> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    return await AccessRole.findOne({ resourceType, permBits }).lean<IAccessRole>();
  }

  /**
   * Create a new access role
   * @param roleData - Role data (accessRoleId, name, description, resourceType, permBits)
   * @returns The created role document
   */
  async function createRole(roleData: Partial<IAccessRole>): Promise<IAccessRole> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    return await AccessRole.create(roleData);
  }

  /**
   * Update an existing access role
   * @param accessRoleId - The unique identifier of the role to update
   * @param updateData - Data to update
   * @returns The updated role document or null if not found
   */
  async function updateRole(
    accessRoleId: string | Types.ObjectId,
    updateData: Partial<IAccessRole>,
  ): Promise<IAccessRole | null> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    return await AccessRole.findOneAndUpdate(
      { accessRoleId },
      { $set: updateData },
      { new: true },
    ).lean<IAccessRole>();
  }

  /**
   * Delete an access role
   * @param accessRoleId - The unique identifier of the role to delete
   * @returns The result of the delete operation
   */
  async function deleteRole(accessRoleId: string | Types.ObjectId): Promise<DeleteResult> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    return await AccessRole.deleteOne({ accessRoleId });
  }

  /**
   * Get all predefined roles
   * @returns Array of all role documents
   */
  async function getAllRoles(): Promise<IAccessRole[]> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    return await AccessRole.find().lean<IAccessRole[]>();
  }

  async function upsertDefaultRolesInContext(): Promise<Record<string, IAccessRole>> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    const result: Record<string, IAccessRole> = {};

    for (const role of DEFAULT_ACCESS_ROLES) {
      const upsertedRole = await AccessRole.findOneAndUpdate(
        { accessRoleId: role.accessRoleId },
        { $setOnInsert: role },
        { upsert: true, new: true },
      ).lean<IAccessRole>();

      if (upsertedRole) {
        result[role.accessRoleId] = upsertedRole;
      }
    }

    return result;
  }

  /**
   * Seed default ACL roles for a tenant. Required when TENANT_ISOLATION_STRICT scopes
   * AccessRole queries by tenantId — global startup seed is invisible to tenant requests.
   */
  async function seedDefaultRolesForTenant(tenantId: string): Promise<Record<string, IAccessRole>> {
    const normalized = tenantId.trim();
    if (!normalized || normalized === SYSTEM_TENANT_ID) {
      return {};
    }
    return tenantStorage.run({ tenantId: normalized }, upsertDefaultRolesInContext);
  }

  /**
   * Seed default roles for every known tenant (Tenant collection + distinct user tenantIds).
   */
  async function seedDefaultRolesForAllTenants(): Promise<void> {
    const tenantIds = new Set<string>();

    await runAsSystem(async () => {
      const Tenant = mongoose.models.Tenant as Model<{ tenantId?: string }> | undefined;
      const User = mongoose.models.User as Model<{ tenantId?: string }> | undefined;

      if (Tenant) {
        const tenants = await Tenant.find({}, { tenantId: 1 }).lean<Array<{ tenantId?: string }>>();
        for (const tenant of tenants) {
          if (tenant.tenantId) {
            tenantIds.add(tenant.tenantId);
          }
        }
      }

      if (User) {
        const userTenantIds = await User.distinct('tenantId', {
          tenantId: { $exists: true, $nin: [null, ''] },
        });
        for (const id of userTenantIds) {
          if (typeof id === 'string' && id.trim()) {
            tenantIds.add(id.trim());
          }
        }
      }
    });

    for (const tenantId of tenantIds) {
      await seedDefaultRolesForTenant(tenantId);
    }
  }

  /** Idempotent: ensure tenant-scoped ACL roles exist before grantPermission. */
  async function ensureDefaultRolesForTenant(tenantId: string): Promise<void> {
    const normalized = tenantId.trim();
    if (!normalized || normalized === SYSTEM_TENANT_ID) {
      return;
    }

    const hasSkillOwner = await tenantStorage.run({ tenantId: normalized }, async () => {
      const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
      const existing = await AccessRole.exists({ accessRoleId: AccessRoleIds.SKILL_OWNER });
      return existing != null;
    });

    if (!hasSkillOwner) {
      await seedDefaultRolesForTenant(normalized);
    }
  }

  /**
   * Seed default roles if they don't exist.
   * Prefer seedDefaultRolesForTenant / seedDefaultRolesForAllTenants in multi-tenant mode.
   */
  async function seedDefaultRoles(tenantId?: string) {
    const resolvedTenantId = tenantId?.trim() || getTenantId();
    if (resolvedTenantId && resolvedTenantId !== SYSTEM_TENANT_ID) {
      return seedDefaultRolesForTenant(resolvedTenantId);
    }
    return runAsSystem(upsertDefaultRolesInContext);
  }

  /**
   * Helper to get the appropriate role for a set of permissions
   * @param resourceType - The type of resource
   * @param permBits - The permission bits
   * @returns The matching role or null if none found
   */
  async function getRoleForPermissions(
    resourceType: string,
    permBits: PermissionBits | RoleBits,
  ): Promise<IAccessRole | null> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    const exactMatch = await AccessRole.findOne({ resourceType, permBits }).lean<IAccessRole>();
    if (exactMatch) {
      return exactMatch;
    }

    /** If no exact match, the closest role without exceeding permissions */
    const roles = await AccessRole.find({ resourceType })
      .sort({ permBits: -1 })
      .lean<IAccessRole[]>();

    return roles.find((role) => (role.permBits & permBits) === role.permBits) || null;
  }

  return {
    createRole,
    updateRole,
    deleteRole,
    getAllRoles,
    findRoleById,
    seedDefaultRoles,
    seedDefaultRolesForTenant,
    seedDefaultRolesForAllTenants,
    ensureDefaultRolesForTenant,
    findRoleByIdentifier,
    getRoleForPermissions,
    findRoleByPermissions,
    findRolesByResourceType,
  };
}

export type AccessRoleMethods = ReturnType<typeof createAccessRoleMethods>;
