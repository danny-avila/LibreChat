const express = require('express');
const {
  promptPermissionsSchema,
  PermissionTypes,
  roleDefaults,
  SystemRoles,
} = require('librechat-data-provider');
const { checkAdmin, requireJwtAuth } = require('~/server/middleware');
const { updateRoleByName, getRoleByName } = require('~/models/Role');

const router = express.Router();
router.use(requireJwtAuth);

/**
 * GET /api/roles/:roleName
 * Get a specific role by name
 */
router.get('/:roleName', async (req, res) => {
  const { roleName: _r } = req.params;
  // TODO: TEMP, use a better parsing for roleName
  const roleName = _r.toUpperCase();

  if (req.user.role !== SystemRoles.ADMIN && !roleDefaults[roleName]) {
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
router.put('/:roleName/prompts', checkAdmin, async (req, res) => {
  const { roleName: _r } = req.params;
  // TODO: TEMP, use a better parsing for roleName
  const roleName = _r.toUpperCase();
  /** @type {TRole['PROMPTS']} */
  const updates = req.body;

  try {
    const parsedUpdates = promptPermissionsSchema.partial().parse(updates);

    const role = await getRoleByName(roleName);
    if (!role) {
      return res.status(404).send({ message: 'Role not found' });
    }

    const mergedUpdates = {
      [PermissionTypes.PROMPTS]: {
        ...role[PermissionTypes.PROMPTS],
        ...parsedUpdates,
      },
    };

    const updatedRole = await updateRoleByName(roleName, mergedUpdates);
    res.status(200).send(updatedRole);
  } catch (error) {
    return res.status(400).send({ message: 'Invalid prompt permissions.', error: error.errors });
  }
});

module.exports = router;
