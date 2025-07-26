import type { Model, Types, DeleteResult } from 'mongoose';
import { RoleBits, PermissionBits } from '~/common';
import type { IAccessRole } from '~/types';

export function createAccessRoleMethods(mongoose: typeof import('mongoose')) {
  /**
   * Find an access role by its ID
   * @param roleId - The role ID
   * @returns The role document or null if not found
   */
  async function findRoleById(roleId: string | Types.ObjectId): Promise<IAccessRole | null> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    return await AccessRole.findById(roleId).lean();
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
    return await AccessRole.findOne({ accessRoleId }).lean();
  }

  /**
   * Find all access roles for a specific resource type
   * @param resourceType - The type of resource ('agent', 'project', 'file')
   * @returns Array of role documents
   */
  async function findRolesByResourceType(resourceType: string): Promise<IAccessRole[]> {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    return await AccessRole.find({ resourceType }).lean();
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
    return await AccessRole.findOne({ resourceType, permBits }).lean();
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
    ).lean();
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
    return await AccessRole.find().lean();
  }

  /**
   * Seed default roles if they don't exist
   * @returns Object containing created roles
   */
  async function seedDefaultRoles() {
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    const defaultRoles = [
      {
        accessRoleId: 'agent_viewer',
        name: 'com_ui_role_viewer',
        description: 'com_ui_role_viewer_desc',
        resourceType: 'agent',
        permBits: RoleBits.VIEWER,
      },
      {
        accessRoleId: 'agent_editor',
        name: 'com_ui_role_editor',
        description: 'com_ui_role_editor_desc',
        resourceType: 'agent',
        permBits: RoleBits.EDITOR,
      },
      {
        accessRoleId: 'agent_owner',
        name: 'com_ui_role_owner',
        description: 'com_ui_role_owner_desc',
        resourceType: 'agent',
        permBits: RoleBits.OWNER,
      },
      // Prompt access roles
      {
        accessRoleId: 'prompt_viewer',
        name: 'com_ui_role_viewer',
        description: 'com_ui_role_viewer_desc',
        resourceType: 'prompt',
        permBits: RoleBits.VIEWER,
      },
      {
        accessRoleId: 'prompt_editor',
        name: 'com_ui_role_editor',
        description: 'com_ui_role_editor_desc',
        resourceType: 'prompt',
        permBits: RoleBits.EDITOR,
      },
      {
        accessRoleId: 'prompt_owner',
        name: 'com_ui_role_owner',
        description: 'com_ui_role_owner_desc',
        resourceType: 'prompt',
        permBits: RoleBits.OWNER,
      },
      // PromptGroup access roles
      {
        accessRoleId: 'promptGroup_viewer',
        name: 'com_ui_role_viewer',
        description: 'com_ui_role_viewer_desc',
        resourceType: 'promptGroup',
        permBits: RoleBits.VIEWER,
      },
      {
        accessRoleId: 'promptGroup_editor',
        name: 'com_ui_role_editor',
        description: 'com_ui_role_editor_desc',
        resourceType: 'promptGroup',
        permBits: RoleBits.EDITOR,
      },
      {
        accessRoleId: 'promptGroup_owner',
        name: 'com_ui_role_owner',
        description: 'com_ui_role_owner_desc',
        resourceType: 'promptGroup',
        permBits: RoleBits.OWNER,
      },
    ];

    const result: Record<string, IAccessRole> = {};

    for (const role of defaultRoles) {
      const upsertedRole = await AccessRole.findOneAndUpdate(
        { accessRoleId: role.accessRoleId },
        { $setOnInsert: role },
        { upsert: true, new: true },
      ).lean();

      result[role.accessRoleId] = upsertedRole;
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
    const AccessRole = mongoose.models.AccessRole as Model<IAccessRole>;
    const exactMatch = await AccessRole.findOne({ resourceType, permBits }).lean();
    if (exactMatch) {
      return exactMatch;
    }

    /** If no exact match, the closest role without exceeding permissions */
    const roles = await AccessRole.find({ resourceType }).sort({ permBits: -1 }).lean();

    return roles.find((role) => (role.permBits & permBits) === role.permBits) || null;
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
