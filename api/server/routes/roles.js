const express = require('express');
const {
  SystemRoles,
  isSystemRole,
  PermissionTypes,
  agentPermissionsSchema,
  promptPermissionsSchema,
  memoryPermissionsSchema,
  CUSTOM_ROLE_NAME_REGEX,
  mcpServersPermissionsSchema,
  marketplacePermissionsSchema,
  peoplePickerPermissionsSchema,
  remoteAgentsPermissionsSchema,
} = require('librechat-data-provider');
const { checkAdmin, requireJwtAuth } = require('~/server/middleware');
const { updateRoleByName, getRoleByName, getAllRoleNames } = require('~/models/Role');
const { Role } = require('~/db/models');

const router = express.Router();
router.use(requireJwtAuth);

/**
 * Permission configuration mapping
 * Maps route paths to their corresponding schemas and permission types
 */
const permissionConfigs = {
  prompts: {
    schema: promptPermissionsSchema,
    permissionType: PermissionTypes.PROMPTS,
    errorMessage: 'Invalid prompt permissions.',
  },
  agents: {
    schema: agentPermissionsSchema,
    permissionType: PermissionTypes.AGENTS,
    errorMessage: 'Invalid agent permissions.',
  },
  memories: {
    schema: memoryPermissionsSchema,
    permissionType: PermissionTypes.MEMORIES,
    errorMessage: 'Invalid memory permissions.',
  },
  'people-picker': {
    schema: peoplePickerPermissionsSchema,
    permissionType: PermissionTypes.PEOPLE_PICKER,
    errorMessage: 'Invalid people picker permissions.',
  },
  'mcp-servers': {
    schema: mcpServersPermissionsSchema,
    permissionType: PermissionTypes.MCP_SERVERS,
    errorMessage: 'Invalid MCP servers permissions.',
  },
  marketplace: {
    schema: marketplacePermissionsSchema,
    permissionType: PermissionTypes.MARKETPLACE,
    errorMessage: 'Invalid marketplace permissions.',
  },
  'remote-agents': {
    schema: remoteAgentsPermissionsSchema,
    permissionType: PermissionTypes.REMOTE_AGENTS,
    errorMessage: 'Invalid remote agents permissions.',
  },
};

/**
 * Generic handler for updating permissions
 * @param {string} permissionKey - The key from permissionConfigs
 * @returns {Function} Express route handler
 */
const createPermissionUpdateHandler = (permissionKey) => {
  const config = permissionConfigs[permissionKey];

  return async (req, res) => {
    const { roleName: _r } = req.params;
    // TODO: TEMP, use a better parsing for roleName
    const roleName = _r.toUpperCase();
    const updates = req.body;

    try {
      const parsedUpdates = config.schema.partial().parse(updates);

      const role = await getRoleByName(roleName);
      if (!role) {
        return res.status(404).send({ message: 'Role not found' });
      }

      const currentPermissions =
        role.permissions?.[config.permissionType] || role[config.permissionType] || {};

      const mergedUpdates = {
        permissions: {
          ...role.permissions,
          [config.permissionType]: {
            ...currentPermissions,
            ...parsedUpdates,
          },
        },
      };

      const updatedRole = await updateRoleByName(roleName, mergedUpdates);
      res.status(200).send(updatedRole);
    } catch (error) {
      return res.status(400).send({ message: config.errorMessage, error: error.errors });
    }
  };
};

/**
 * GET /api/roles
 * List all role names (admin-only)
 */
router.get('/', checkAdmin, async (req, res) => {
  try {
    const roleNames = await getAllRoleNames();
    res.status(200).send(roleNames);
  } catch (error) {
    return res.status(500).send({ message: 'Failed to list roles', error: error.message });
  }
});

/**
 * POST /api/roles
 * Create a new custom role (admin-only)
 */
router.post('/', checkAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).send({ message: 'Role name is required' });
  }

  const roleName = name.toUpperCase();

  if (!CUSTOM_ROLE_NAME_REGEX.test(roleName)) {
    return res.status(400).send({ message: 'Invalid role name format' });
  }

  if (isSystemRole(roleName)) {
    return res.status(400).send({ message: 'Cannot create system roles' });
  }

  try {
    const existing = await Role.findOne({ name: roleName }).lean().exec();
    if (existing) {
      return res.status(409).send({ message: 'Role already exists' });
    }
    const role = await getRoleByName(roleName);
    res.status(201).send(role);
  } catch (error) {
    return res.status(500).send({ message: 'Failed to create role', error: error.message });
  }
});

/**
 * GET /api/roles/:roleName
 * Get a specific role by name
 */
router.get('/:roleName', async (req, res) => {
  const { roleName: _r } = req.params;
  // TODO: TEMP, use a better parsing for roleName
  const roleName = _r.toUpperCase();

  const isAdmin = req.user.role === SystemRoles.ADMIN;
  const isOwnRole = req.user.role === roleName;
  const isUserRole = roleName === SystemRoles.USER;
  if (!isAdmin && !isOwnRole && !isUserRole) {
    return res.status(403).send({ message: 'Unauthorized' });
  }

  try {
    const role = await getRoleByName(roleName, '-_id -__v');
    if (!role) {
      return res.status(404).send({ message: 'Role not found' });
    }

    res.status(200).send(role);
  } catch (error) {
    return res.status(500).send({ message: 'Failed to retrieve role', error: error.message });
  }
});

/**
 * PUT /api/roles/:roleName/prompts
 * Update prompt permissions for a specific role
 */
router.put('/:roleName/prompts', checkAdmin, createPermissionUpdateHandler('prompts'));

/**
 * PUT /api/roles/:roleName/agents
 * Update agent permissions for a specific role
 */
router.put('/:roleName/agents', checkAdmin, createPermissionUpdateHandler('agents'));

/**
 * PUT /api/roles/:roleName/memories
 * Update memory permissions for a specific role
 */
router.put('/:roleName/memories', checkAdmin, createPermissionUpdateHandler('memories'));

/**
 * PUT /api/roles/:roleName/people-picker
 * Update people picker permissions for a specific role
 */
router.put('/:roleName/people-picker', checkAdmin, createPermissionUpdateHandler('people-picker'));

/**
 * PUT /api/roles/:roleName/mcp-servers
 * Update MCP servers permissions for a specific role
 */
router.put('/:roleName/mcp-servers', checkAdmin, createPermissionUpdateHandler('mcp-servers'));

/**
 * PUT /api/roles/:roleName/marketplace
 * Update marketplace permissions for a specific role
 */
router.put('/:roleName/marketplace', checkAdmin, createPermissionUpdateHandler('marketplace'));

/**
 * PUT /api/roles/:roleName/remote-agents
 * Update remote agents (API) permissions for a specific role
 */
router.put('/:roleName/remote-agents', checkAdmin, createPermissionUpdateHandler('remote-agents'));

module.exports = router;
