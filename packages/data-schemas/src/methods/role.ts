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
        // Create new role if it doesn't exist.
        role = new Role(roleDefaults[roleName]);
      } else {
        // Ensure role.permissions is defined.
        role.permissions = role.permissions || {};
        // For each permission type in defaults, add it if missing.
        for (const permType of Object.keys(defaultPerms)) {
          if (role.permissions[permType] == null) {
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
