import { roleDefaults, SystemRoles } from 'librechat-data-provider';

// Factory function that takes mongoose instance and returns the methods
export function createRoleMethods(mongoose: typeof import('mongoose')) {
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
        role = new Role(roleDefaults[roleName]);
      } else {
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
   * List all roles in the system (for testing purposes)
   * Returns an array of all roles with their names and permissions
   */
  async function listRoles() {
    const Role = mongoose.models.Role;
    return await Role.find({}).select('name permissions').lean();
  }

  // Return all methods you want to expose
  return {
    listRoles,
    initializeRoles,
  };
}

export type RoleMethods = ReturnType<typeof createRoleMethods>;
