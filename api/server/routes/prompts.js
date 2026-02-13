const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  generateCheckAccess,
  markPublicPromptGroups,
  buildPromptGroupFilter,
  formatPromptGroupsResponse,
  safeValidatePromptGroupUpdate,
  createEmptyPromptGroupsResponse,
  filterAccessibleIdsBySharedLogic,
} = require('@librechat/api');
const {
  Permissions,
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
  PermissionTypes,
} = require('librechat-data-provider');
const {
  getListPromptGroupsByAccess,
  makePromptProduction,
  updatePromptGroup,
  deletePromptGroup,
  createPromptGroup,
  getPromptGroup,
  deletePrompt,
  getPrompts,
  savePrompt,
  getPrompt,
} = require('~/models/Prompt');
const {
  canAccessPromptGroupResource,
  canAccessPromptViaGroup,
  requireJwtAuth,
} = require('~/server/middleware');
const {
  findPubliclyAccessibleResources,
  getEffectivePermissions,
  findAccessibleResources,
  grantPermission,
} = require('~/server/services/PermissionService');
const { getRoleByName } = require('~/models/Role');

const router = express.Router();

const checkPromptAccess = generateCheckAccess({
  permissionType: PermissionTypes.PROMPTS,
  permissions: [Permissions.USE],
  getRoleByName,
});
const checkPromptCreate = generateCheckAccess({
  permissionType: PermissionTypes.PROMPTS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

router.use(requireJwtAuth);
router.use(checkPromptAccess);

/**
 * Route to get single prompt group by its ID
 * GET /groups/:groupId
 */
router.get(
  '/groups/:groupId',
  canAccessPromptGroupResource({
    requiredPermission: PermissionBits.VIEW,
  }),
  async (req, res) => {
    const { groupId } = req.params;

    try {
      const group = await getPromptGroup({ _id: groupId });

      if (!group) {
        return res.status(404).send({ message: 'Prompt group not found' });
      }

      res.status(200).send(group);
    } catch (error) {
      logger.error('Error getting prompt group', error);
      res.status(500).send({ message: 'Error getting prompt group' });
    }
  },
);

/**
 * Route to fetch all prompt groups (ACL-aware)
 * GET /all
 */
router.get('/all', async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, category, ...otherFilters } = req.query;
    const { filter, searchShared, searchSharedOnly } = buildPromptGroupFilter({
      name,
      category,
      ...otherFilters,
    });

    let accessibleIds = await findAccessibleResources({
      userId,
      role: req.user.role,
      resourceType: ResourceType.PROMPTGROUP,
      requiredPermissions: PermissionBits.VIEW,
    });

    const publiclyAccessibleIds = await findPubliclyAccessibleResources({
      resourceType: ResourceType.PROMPTGROUP,
      requiredPermissions: PermissionBits.VIEW,
    });

    const filteredAccessibleIds = await filterAccessibleIdsBySharedLogic({
      accessibleIds,
      searchShared,
      searchSharedOnly,
      publicPromptGroupIds: publiclyAccessibleIds,
    });

    const result = await getListPromptGroupsByAccess({
      accessibleIds: filteredAccessibleIds,
      otherParams: filter,
    });

    if (!result) {
      return res.status(200).send([]);
    }

    const { data: promptGroups = [] } = result;
    if (!promptGroups.length) {
      return res.status(200).send([]);
    }

    const groupsWithPublicFlag = markPublicPromptGroups(promptGroups, publiclyAccessibleIds);
    res.status(200).send(groupsWithPublicFlag);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error getting prompt groups' });
  }
});

/**
 * Route to fetch paginated prompt groups with filters (ACL-aware)
 * GET /groups
 */
router.get('/groups', async (req, res) => {
  try {
    const userId = req.user.id;
    const { pageSize, limit, cursor, name, category, ...otherFilters } = req.query;

    const { filter, searchShared, searchSharedOnly } = buildPromptGroupFilter({
      name,
      category,
      ...otherFilters,
    });

    let actualLimit = limit;
    let actualCursor = cursor;

    if (pageSize && !limit) {
      actualLimit = parseInt(pageSize, 10);
    }

    if (
      actualCursor &&
      (actualCursor === 'undefined' || actualCursor === 'null' || actualCursor.length === 0)
    ) {
      actualCursor = null;
    }

    let accessibleIds = await findAccessibleResources({
      userId,
      role: req.user.role,
      resourceType: ResourceType.PROMPTGROUP,
      requiredPermissions: PermissionBits.VIEW,
    });

    const publiclyAccessibleIds = await findPubliclyAccessibleResources({
      resourceType: ResourceType.PROMPTGROUP,
      requiredPermissions: PermissionBits.VIEW,
    });

    const filteredAccessibleIds = await filterAccessibleIdsBySharedLogic({
      accessibleIds,
      searchShared,
      searchSharedOnly,
      publicPromptGroupIds: publiclyAccessibleIds,
    });

    // Cursor-based pagination only
    const result = await getListPromptGroupsByAccess({
      accessibleIds: filteredAccessibleIds,
      otherParams: filter,
      limit: actualLimit,
      after: actualCursor,
    });

    if (!result) {
      const emptyResponse = createEmptyPromptGroupsResponse({
        pageNumber: '1',
        pageSize: actualLimit,
        actualLimit,
      });
      return res.status(200).send(emptyResponse);
    }

    const { data: promptGroups = [], has_more = false, after = null } = result;
    const groupsWithPublicFlag = markPublicPromptGroups(promptGroups, publiclyAccessibleIds);

    const response = formatPromptGroupsResponse({
      promptGroups: groupsWithPublicFlag,
      pageNumber: '1', // Always 1 for cursor-based pagination
      pageSize: actualLimit.toString(),
      hasMore: has_more,
      after,
    });

    res.status(200).send(response);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error getting prompt groups' });
  }
});

/**
 * Creates a new prompt group with initial prompt
 * @param {object} req
 * @param {TCreatePrompt} req.body
 * @param {Express.Response} res
 */
const createNewPromptGroup = async (req, res) => {
  try {
    const { prompt, group } = req.body;

    if (!prompt || !group || !group.name) {
      return res.status(400).send({ error: 'Prompt and group name are required' });
    }

    const saveData = {
      prompt,
      group,
      author: req.user.id,
      authorName: req.user.name,
    };

    const result = await createPromptGroup(saveData);

    if (result.prompt && result.prompt._id && result.prompt.groupId) {
      try {
        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: req.user.id,
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: result.prompt.groupId,
          accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
          grantedBy: req.user.id,
        });
        logger.debug(
          `[createPromptGroup] Granted owner permissions to user ${req.user.id} for promptGroup ${result.prompt.groupId}`,
        );
      } catch (permissionError) {
        logger.error(
          `[createPromptGroup] Failed to grant owner permissions for promptGroup ${result.prompt.groupId}:`,
          permissionError,
        );
      }
    }

    res.status(200).send(result);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error creating prompt group' });
  }
};

/**
 * Adds a new prompt to an existing prompt group
 * @param {object} req
 * @param {TCreatePrompt} req.body
 * @param {Express.Response} res
 */
const addPromptToGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).send({ error: 'Prompt is required' });
    }

    // Ensure the prompt is associated with the correct group
    prompt.groupId = groupId;

    const saveData = {
      prompt,
      author: req.user.id,
      authorName: req.user.name,
    };

    const result = await savePrompt(saveData);
    res.status(200).send(result);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error adding prompt to group' });
  }
};

// Create new prompt group (requires CREATE permission)
router.post('/', checkPromptCreate, createNewPromptGroup);

// Add prompt to existing group (requires EDIT permission on the group)
router.post(
  '/groups/:groupId/prompts',
  checkPromptAccess,
  canAccessPromptGroupResource({
    requiredPermission: PermissionBits.EDIT,
  }),
  addPromptToGroup,
);

/**
 * Updates a prompt group
 * @param {object} req
 * @param {object} req.params - The request parameters
 * @param {string} req.params.groupId - The group ID
 * @param {TUpdatePromptGroupPayload} req.body - The request body
 * @param {Express.Response} res
 */
const patchPromptGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const author = req.user.id;
    const filter = { _id: groupId, author };
    if (req.user.role === SystemRoles.ADMIN) {
      delete filter.author;
    }

    const validationResult = safeValidatePromptGroupUpdate(req.body);
    if (!validationResult.success) {
      return res.status(400).send({
        error: 'Invalid request body',
        details: validationResult.error.errors,
      });
    }

    const promptGroup = await updatePromptGroup(filter, validationResult.data);
    res.status(200).send(promptGroup);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error updating prompt group' });
  }
};

router.patch(
  '/groups/:groupId',
  checkPromptCreate,
  canAccessPromptGroupResource({
    requiredPermission: PermissionBits.EDIT,
  }),
  patchPromptGroup,
);

router.patch(
  '/:promptId/tags/production',
  checkPromptCreate,
  canAccessPromptViaGroup({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'promptId',
  }),
  async (req, res) => {
    try {
      const { promptId } = req.params;
      const result = await makePromptProduction(promptId);
      res.status(200).send(result);
    } catch (error) {
      logger.error(error);
      res.status(500).send({ error: 'Error updating prompt production' });
    }
  },
);

router.get(
  '/:promptId',
  canAccessPromptViaGroup({
    requiredPermission: PermissionBits.VIEW,
    resourceIdParam: 'promptId',
  }),
  async (req, res) => {
    const { promptId } = req.params;
    const prompt = await getPrompt({ _id: promptId });
    res.status(200).send(prompt);
  },
);

router.get('/', async (req, res) => {
  try {
    const author = req.user.id;
    const { groupId } = req.query;

    // If requesting prompts for a specific group, check permissions
    if (groupId) {
      const permissions = await getEffectivePermissions({
        userId: req.user.id,
        role: req.user.role,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: groupId,
      });

      if (!(permissions & PermissionBits.VIEW)) {
        return res
          .status(403)
          .send({ error: 'Insufficient permissions to view prompts in this group' });
      }

      // If user has access, fetch all prompts in the group (not just their own)
      const prompts = await getPrompts({ groupId });
      return res.status(200).send(prompts);
    }

    // If no groupId, return user's own prompts
    const query = { author };
    if (req.user.role === SystemRoles.ADMIN) {
      delete query.author;
    }
    const prompts = await getPrompts(query);
    res.status(200).send(prompts);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error getting prompts' });
  }
});

/**
 * Deletes a prompt
 *
 * @param {ServerRequest} req - The request object.
 * @param {TDeletePromptVariables} req.params - The request parameters
 * @param {import('mongoose').ObjectId} req.params.promptId - The prompt ID
 * @param {Express.Response} res - The response object.
 * @return {TDeletePromptResponse} A promise that resolves when the prompt is deleted.
 */
const deletePromptController = async (req, res) => {
  try {
    const { promptId } = req.params;
    const { groupId } = req.query;
    const author = req.user.id;
    const query = { promptId, groupId, author, role: req.user.role };
    const result = await deletePrompt(query);
    res.status(200).send(result);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error deleting prompt' });
  }
};

/**
 * Delete a prompt group
 * @param {ServerRequest} req
 * @param {ServerResponse} res
 * @returns {Promise<TDeletePromptGroupResponse>}
 */
const deletePromptGroupController = async (req, res) => {
  try {
    const { groupId: _id } = req.params;
    // Don't pass author - permissions are now checked by middleware
    const message = await deletePromptGroup({ _id, role: req.user.role });
    res.send(message);
  } catch (error) {
    logger.error('Error deleting prompt group', error);
    res.status(500).send({ message: 'Error deleting prompt group' });
  }
};

router.delete(
  '/:promptId',
  checkPromptCreate,
  canAccessPromptViaGroup({
    requiredPermission: PermissionBits.DELETE,
    resourceIdParam: 'promptId',
  }),
  deletePromptController,
);
router.delete(
  '/groups/:groupId',
  checkPromptCreate,
  canAccessPromptGroupResource({
    requiredPermission: PermissionBits.DELETE,
  }),
  deletePromptGroupController,
);

module.exports = router;
