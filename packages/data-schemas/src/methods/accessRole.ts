import { AccessRoleIds, ResourceType, PermissionBits } from 'librechat-data-provider';
import type { Model, Types, DeleteResult } from 'mongoose';
import type { IAccessRole } from '~/types';
import { getTenantId, runAsSystem, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import { RoleBits } from '~/common';

/**
 * Matches the global default roles, which `seedDefaultRoles` writes without a
 * `tenantId`. Needed because the tenant-isolation plugin only ever adds a
 * positive `{ tenantId: T }` predicate, never one that also accepts the globals.
 */
const BASE_ROLE_FILTER = { tenantId: { $in: [null, undefined] } } as const;

/**
 * Deliberately scoped to the tenant-scoped case only.
 *
 * Lookups outside a tenant context — including explicit system-context ones such
 * as GitHub Skill Sync — keep their existing behavior, so deployments that seed
 * roles per tenant rather than globally are unaffected by this fallback.
 */

export function createAccessRoleMethods(mongoose: typeof import('mongoose')): {
  createRole: (roleData: Partial<IAccessRole>) => Promise<IAccessRole>;
  updateRole: (
    accessRoleId: string | Types.ObjectId,
    updateData: Partial<IAccessRole>,
  ) => Promise<IAccessRole | null>;
  deleteRole: (accessRoleId: string | Types.ObjectId) => Promise<DeleteResult>;
  getAllRoles: () => Promise<IAccessRole[]>;
  findRoleById: (roleId: string | Types.ObjectId) => Promise<IAccessRole | null>;
  seedDefaultRoles: () => Promise<Record<string, IAccessRole>>;
  findRoleByIdentifier: (accessRoleId: string | Types.ObjectId) => Promise<IAccessRole | null>;
  getRoleForPermissions: (
    resourceType: string,
    permBits: PermissionBits | RoleBits,
  ) => Promise<IAccessRole | null>;
  findRoleByPermissions: (
    resourceType: string,
    permBits: PermissionBits | RoleBits,
  ) => Promise<IAccessRole | null>;
  findRolesByResourceType: (resourceType: string) => Promise<IAccessRole[]>;
} {
  /**
   * Runs an access-role lookup against the active tenant, then against the global
   * default roles.
   *
   * The default roles are seeded once, globally, with no `tenantId`. A request
   * running inside a tenant context has its queries scoped to `{ tenantId: T }` by
   * the isolation plugin, so those seeded roles never match and every caller that
   * resolves a role by identifier — the owner grant on resource creation above all
   * — fails with `Role <id> not found`.
   *
   * A tenant that carries its own copy of a role keeps precedence; whatever it does
   * not override resolves to the global role under an explicit system context.
   */
  async function resolveRole<T>(
    filter: Record<string, unknown>,
    runQuery: (filter: Record<string, unknown>) => Promise<T>,
    isResolved: (result: T) => boolean,
  ): Promise<T> {
    const tenantId = getTenantId();
    if (!tenantId || tenantId === SYSTEM_TENANT_ID) {
      return await runQuery(filter);
    }

    const scoped = await runQuery(filter);
    if (isResolved(scoped)) {
      return scoped;
    }
    /** The callback must be async: a sync one returning a Mongoose thenable would
     * execute after `runAsSystem` exits and be re-scoped to the active tenant. */
    return await runAsSystem(async () => await runQuery({ ...filter, ...BASE_ROLE_FILTER }));
  }

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
    return await resolveRole(
      { accessRoleId },
      (filter) => AccessRole.findOne(filter).lean<IAccessRole>().exec(),
      (role) => role != null,
    );
  }

  /**
   * Find all access roles for a specific resource type
   *
   * The tenant's own copies are merged over the global default roles by
   * `accessRoleId`, so a tenant that overrides one role still sees the rest.
   *
   * @param resourceType - The type of resource ('agent', 'project', 'file')
   * @returns Array of role documents
   */
  async function findRolesByResourceType(resourceType: string): Promise<IAccessRole[]> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    const runQuery = (filter: Record<string, unknown>) =>
      AccessRole.find(filter).lean<IAccessRole[]>().exec();

    const tenantId = getTenantId();
    if (!tenantId || tenantId === SYSTEM_TENANT_ID) {
      return await runQuery({ resourceType });
    }

    const [base, scoped] = await Promise.all([
      runAsSystem(async () => await runQuery({ resourceType, ...BASE_ROLE_FILTER })),
      runQuery({ resourceType }),
    ]);
    const rolesById = new Map(base.map((role) => [String(role.accessRoleId), role]));
    for (const role of scoped) {
      rolesById.set(String(role.accessRoleId), role);
    }
    return [...rolesById.values()];
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
    return await resolveRole(
      { resourceType, permBits },
      (filter) => AccessRole.findOne(filter).lean<IAccessRole>().exec(),
      (role) => role != null,
    );
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

  /**
   * Seed default roles if they don't exist
   * @returns Object containing created roles
   */
  async function seedDefaultRoles(): Promise<Record<string, IAccessRole>> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    const defaultRoles = [
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
        accessRoleId: AccessRoleIds.CODE_ENVIRONMENT_VIEWER,
        name: 'com_ui_role_viewer',
        description: 'com_ui_role_viewer_desc',
        resourceType: ResourceType.CODE_ENVIRONMENT,
        permBits: RoleBits.VIEWER,
      },
      {
        accessRoleId: AccessRoleIds.CODE_ENVIRONMENT_EDITOR,
        name: 'com_ui_role_editor',
        description: 'com_ui_role_editor_desc',
        resourceType: ResourceType.CODE_ENVIRONMENT,
        permBits: RoleBits.EDITOR,
      },
      {
        accessRoleId: AccessRoleIds.CODE_ENVIRONMENT_OWNER,
        name: 'com_ui_role_owner',
        description: 'com_ui_role_owner_desc',
        resourceType: ResourceType.CODE_ENVIRONMENT,
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
      {
        accessRoleId: AccessRoleIds.SHARED_LINK_VIEWER,
        name: 'com_ui_role_viewer',
        description: 'com_ui_role_viewer_desc',
        resourceType: ResourceType.SHARED_LINK,
        permBits: RoleBits.VIEWER,
      },
      {
        accessRoleId: AccessRoleIds.SHARED_LINK_OWNER,
        name: 'com_ui_role_owner',
        description: 'com_ui_role_owner_desc',
        resourceType: ResourceType.SHARED_LINK,
        permBits: RoleBits.OWNER,
      },
    ];

    const result: Record<string, IAccessRole> = {};

    for (const role of defaultRoles) {
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
   * Helper to get the appropriate role for a set of permissions
   * @param resourceType - The type of resource
   * @param permBits - The permission bits
   * @returns The matching role or null if none found
   */
  async function getRoleForPermissions(
    resourceType: string,
    permBits: PermissionBits | RoleBits,
  ): Promise<IAccessRole | null> {
    const exactMatch = await findRoleByPermissions(resourceType, permBits);
    if (exactMatch) {
      return exactMatch;
    }

    /** If no exact match, the closest role without exceeding permissions */
    const roles = await findRolesByResourceType(resourceType);

    return (
      roles
        .sort((a, b) => b.permBits - a.permBits)
        .find((role) => (role.permBits & permBits) === role.permBits) || null
    );
  }

  return {
    createRole,
    updateRole,
    deleteRole,
    getAllRoles,
    findRoleById,
    seedDefaultRoles,
    findRoleByIdentifier,
    getRoleForPermissions,
    findRoleByPermissions,
    findRolesByResourceType,
  };
}

export type AccessRoleMethods = ReturnType<typeof createAccessRoleMethods>;
