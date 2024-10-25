const express = require('express');
const { PermissionTypes, Permissions, SystemRoles } = require('librechat-data-provider');
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
const { requireJwtAuth, generateCheckAccess } = require('~/server/middleware');
const { logger } = require('~/config');

const router = express.Router();

const checkPromptAccess = generateCheckAccess(PermissionTypes.PROMPTS, [Permissions.USE]);
const checkPromptCreate = generateCheckAccess(PermissionTypes.PROMPTS, [
  Permissions.USE,
  Permissions.CREATE,
]);

const checkGlobalPromptShare = generateCheckAccess(
  PermissionTypes.PROMPTS,
  [Permissions.USE, Permissions.CREATE],
  {
    [Permissions.SHARED_GLOBAL]: ['projectIds', 'removeProjectIds'],
  },
);

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

router.patch('/:promptId/tags/production', checkPromptCreate, async (req, res) => {
  try {
    const { promptId } = req.params;
    const result = await makePromptProduction(promptId);
    res.status(200).send(result);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error updating prompt production' });
  }
});

router.get('/:promptId', async (req, res) => {
  const { promptId } = req.params;
  const author = req.user.id;
  const query = { _id: promptId, author };
  if (req.user.role === SystemRoles.ADMIN) {
    delete query.author;
  }
  const prompt = await getPrompt(query);
  res.status(200).send(prompt);
});

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
    if (req.user.role === SystemRoles.ADMIN) {
      delete query.author;
    }
    const result = await deletePrompt(query);
    res.status(200).send(result);
  } catch (error) {
    logger.error(error);
    res.status(500).send({ error: 'Error deleting prompt' });
  }
};

router.delete('/:promptId', checkPromptCreate, deletePromptController);

router.delete('/groups/:groupId', checkPromptCreate, async (req, res) => {
  const { groupId } = req.params;
  res.status(200).send(await deletePromptGroup(groupId));
});

module.exports = router;
