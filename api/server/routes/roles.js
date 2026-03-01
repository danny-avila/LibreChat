const express = require('express');
const {
  SystemRoles,
  roleDefaults,
  PermissionTypes,
  agentPermissionsSchema,
  promptPermissionsSchema,
  memoryPermissionsSchema,
  mcpServersPermissionsSchema,
  marketplacePermissionsSchema,
  peoplePickerPermissionsSchema,
  remoteAgentsPermissionsSchema,
} = require('librechat-data-provider');
const { checkAdmin, requireJwtAuth } = require('~/server/middleware');
const { updateRoleByName, getRoleByName } = require('~/models');

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
 * GET /api/roles/:roleName
 * Get a specific role by name
 */
router.get('/:roleName', async (req, res) => {
  const { roleName: _r } = req.params;
  // TODO: TEMP, use a better parsing for roleName
  const roleName = _r.toUpperCase();

  if (
    (req.user.role !== SystemRoles.ADMIN && roleName === SystemRoles.ADMIN) ||
    (req.user.role !== SystemRoles.ADMIN && !roleDefaults[roleName])
  ) {
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
