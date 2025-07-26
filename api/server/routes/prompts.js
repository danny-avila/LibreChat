const express = require('express');
const { logger, PermissionBits } = require('@librechat/data-schemas');
const { generateCheckAccess } = require('@librechat/api');
const { Permissions, SystemRoles, PermissionTypes } = require('librechat-data-provider');
const {
  getPrompt,
  getPrompts,
  savePrompt,
  deletePrompt,
  getPromptGroup,
  getPromptGroups,
  updatePromptGroup,
  deletePromptGroup,
  createPromptGroup,
  getAllPromptGroups,
  // updatePromptLabels,
  makePromptProduction,
} = require('~/models/Prompt');
const { grantPermission } = require('~/server/services/PermissionService');
const { requireJwtAuth, canAccessPromptResource } = require('~/server/middleware');
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

const checkGlobalPromptShare = generateCheckAccess({
  permissionType: PermissionTypes.PROMPTS,
  permissions: [Permissions.USE, Permissions.CREATE],
  bodyProps: {
    [Permissions.SHARED_GLOBAL]: ['projectIds', 'removeProjectIds'],
  },
  getRoleByName,
});

router.use(requireJwtAuth);
router.use(checkPromptAccess);

/**
 * Route to get single prompt group by its ID
 * GET /groups/:groupId
 */
router.get('/groups/:groupId', async (req, res) => {
  let groupId = req.params.groupId;
  const author = req.user.id;

  const query = {
    _id: groupId,
    $or: [{ projectIds: { $exists: true, $ne: [], $not: { $size: 0 } } }, { author }],
  };

  if (req.user.role === SystemRoles.ADMIN) {
    delete query.$or;
  }

  try {
    const group = await getPromptGroup(query);

    if (!group) {
      return res.status(404).send({ message: 'Prompt group not found' });
    }

    res.status(200).send(group);
  } catch (error) {
    logger.error('Error getting prompt group', error);
    res.status(500).send({ message: 'Error getting prompt group' });
  }
});

/**
 * Route to fetch all prompt groups
 * GET /groups
 */
router.get('/all', async (req, res) => {
  try {
    const groups = await getAllPromptGroups(req, {
      author: req.user._id,
    });
    res.status(200).send(groups);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error getting prompt groups' });
  }
});

/**
 * Route to fetch paginated prompt groups with filters
 * GET /groups
 */
router.get('/groups', async (req, res) => {
  try {
    const filter = req.query;
    /* Note: The aggregation requires an ObjectId */
    filter.author = req.user._id;
    const groups = await getPromptGroups(req, filter);
    res.status(200).send(groups);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error getting prompt groups' });
  }
});

/**
 * Updates or creates a prompt + promptGroup
 * @param {object} req
 * @param {TCreatePrompt} req.body
 * @param {Express.Response} res
 */
const createPrompt = async (req, res) => {
  try {
    const { prompt, group } = req.body;
    if (!prompt) {
      return res.status(400).send({ error: 'Prompt is required' });
    }

    const saveData = {
      prompt,
      group,
      author: req.user.id,
      authorName: req.user.name,
    };

    /** @type {TCreatePromptResponse} */
    let result;
    if (group && group.name) {
      result = await createPromptGroup(saveData);
    } else {
      result = await savePrompt(saveData);
    }

    // Grant owner permissions to the creator
    if (result.prompt && result.prompt._id) {
      try {
        await grantPermission({
          principalType: 'user',
          principalId: req.user.id,
          resourceType: 'prompt',
          resourceId: result.prompt._id,
          accessRoleId: 'prompt_owner',
          grantedBy: req.user.id,
        });
        logger.debug(
          `[createPrompt] Granted owner permissions to user ${req.user.id} for prompt ${result.prompt._id}`,
        );
      } catch (permissionError) {
        logger.error(
          `[createPrompt] Failed to grant owner permissions for prompt ${result.prompt._id}:`,
          permissionError,
        );
      }
    }

    res.status(200).send(result);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error saving prompt' });
  }
};

router.post('/', checkPromptCreate, createPrompt);

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
    const promptGroup = await updatePromptGroup(filter, req.body);
    res.status(200).send(promptGroup);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error updating prompt group' });
  }
};

router.patch('/groups/:groupId', checkGlobalPromptShare, patchPromptGroup);

router.patch(
  '/:promptId/tags/production',
  checkPromptCreate,
  canAccessPromptResource({
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
  canAccessPromptResource({
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
    const query = { groupId, author };
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
 * @param {Express.Request} req - The request object.
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
    const message = await deletePromptGroup({ _id, author: req.user.id, role: req.user.role });
    res.send(message);
  } catch (error) {
    logger.error('Error deleting prompt group', error);
    res.status(500).send({ message: 'Error deleting prompt group' });
  }
};

router.delete(
  '/:promptId',
  checkPromptCreate,
  canAccessPromptResource({
    requiredPermission: PermissionBits.DELETE,
    resourceIdParam: 'promptId',
  }),
  deletePromptController,
);
router.delete('/groups/:groupId', checkPromptCreate, deletePromptGroupController);

module.exports = router;
