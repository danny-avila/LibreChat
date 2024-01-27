const { v4 } = require('uuid');
const multer = require('multer');
const OpenAI = require('openai');
const express = require('express');
const { actionDelimiter } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { uploadImageBuffer } = require('~/server/services/Files/process');
const { updateAssistant, getAssistant } = require('~/models/Assistant');
const { updateAction } = require('~/models/Action');
const toolsController = require('./tools');
const { logger } = require('~/config');

const upload = multer();
const router = express.Router();

/**
 * Create an assistant.
 * @route GET /assistants/tools
 * @returns {TPlugin[]} 200 - application/json
 */
router.use('/tools', toolsController);

/**
 * Create an assistant.
 * @route POST /assistants
 * @param {AssistantCreateParams} req.body - The assistant creation parameters.
 * @returns {Assistant} 201 - success response - application/json
 */
router.post('/', async (req, res) => {
  try {
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    const assistantData = req.body;
    const assistant = await openai.beta.assistants.create(assistantData);
    logger.debug('/assistants/', assistant);
    res.status(201).json(assistant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Retrieves an assistant.
 * @route GET /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Assistant} 200 - success response - application/json
 */
router.get('/:id', async (req, res) => {
  try {
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    const assistant_id = req.params.id;
    const assistant = await openai.beta.assistants.retrieve(assistant_id);
    res.json(assistant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Modifies an assistant.
 * @route PATCH /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @param {AssistantUpdateParams} req.body - The assistant update parameters.
 * @returns {Assistant} 200 - success response - application/json
 */
router.patch('/:id', async (req, res) => {
  try {
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    const assistant_id = req.params.id;
    const updateData = req.body;
    updateData.tools = (updateData.tools ?? []).map((tool) => {
      if (typeof tool !== 'string') {
        return tool;
      }

      return req.app.locals.availableTools[tool];
    });
    const updatedAssistant = await openai.beta.assistants.update(assistant_id, updateData);
    res.json(updatedAssistant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Deletes an assistant.
 * @route DELETE /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Assistant} 200 - success response - application/json
 */
router.delete('/:id', async (req, res) => {
  try {
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    const assistant_id = req.params.id;
    const deletionStatus = await openai.beta.assistants.del(assistant_id);
    res.json(deletionStatus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Returns a list of assistants.
 * @route GET /assistants
 * @param {AssistantListParams} req.query - The assistant list parameters for pagination and sorting.
 * @returns {AssistantListResponse} 200 - success response - application/json
 */
router.get('/', async (req, res) => {
  try {
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    const { limit, order, after, before } = req.query;
    const response = await openai.beta.assistants.list({
      limit,
      order,
      after,
      before,
    });
    res.json(response.body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/avatar/:assistant_id', upload.single('file'), async (req, res) => {
  try {
    const { assistant_id } = req.params;
    let { metadata: _metadata = '{}' } = req.body;
    /** @type {OpenAI} */
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    const image = await uploadImageBuffer({ req });

    try {
      _metadata = JSON.parse(_metadata);
    } catch (error) {
      logger.error('[/avatar/:assistant_id] Error parsing metadata', error);
      _metadata = {};
    }

    if (_metadata.avatar && _metadata.avatar_source) {
      const { deleteFile } = getStrategyFunctions(_metadata.avatar_source);
      try {
        await deleteFile(req, { filepath: _metadata.avatar });
      } catch (error) {
        logger.error('[/avatar/:assistant_id] Error deleting old avatar', error);
      }
    }

    const metadata = {
      ..._metadata,
      avatar: image.filepath,
      avatar_source: req.app.locals.fileStrategy,
    };

    const promises = [];
    promises.push(
      updateAssistant(
        { assistant_id, user: req.user.id },
        {
          avatar: {
            filepath: image.filepath,
            source: req.app.locals.fileStrategy,
          },
        },
      ),
    );
    promises.push(openai.beta.assistants.update(assistant_id, { metadata }));

    const resolved = await Promise.all(promises);
    res.json(resolved[1]);
  } catch (error) {
    const message = 'An error occurred while updating the Assistant Avatar';
    logger.error(message, error);
    res.status(500).json({ message });
  }
});

router.post('/action/:assistant_id', async (req, res) => {
  try {
    // TODO: 'Action sets cannot have duplicate domains - websearch.plugsugar.com already exists on another action'
    const { assistant_id } = req.params;

    /** @type {{ functions: FunctionTool[], action_id: string, metadata: ActionMetadata }} */
    const { functions, action_id: _action_id, metadata } = req.body;
    if (!functions.length) {
      return res.status(400).json({ message: 'No functions provided' });
    }

    const action_id = _action_id ?? v4();
    const initialPromises = [];

    /** @type {OpenAI} */
    const openai = new OpenAI(process.env.OPENAI_API_KEY);

    initialPromises.push(getAssistant({ assistant_id, user: req.user.id }));
    initialPromises.push(openai.beta.assistants.retrieve(assistant_id));
    const [assistant_data, assistant] = await Promise.all(initialPromises);

    if (!assistant) {
      return res.status(404).json({ message: 'Assistant not found' });
    }

    const mappedFunctions = [];

    for (const func of functions) {
      const { name } = func.function;
      mappedFunctions.push(`${name}${actionDelimiter}${action_id}`);
    }
    const { actions: _actions = [] } = assistant_data ?? {};

    const toolsToRemove = [];
    const actions = _actions
      .filter((action) => {
        if (action.includes(action_id)) {
          toolsToRemove.push(action.split(actionDelimiter)[0]);
          return false;
        }
        return true;
      })
      .concat(mappedFunctions);

    /** @type {{ tools: FunctionTool[] | { type: 'code_interpreter'|'retrieval'}[]}} */
    const { tools: _tools = [] } = assistant;
    const tools = _tools
      .filter((tool) => !(tool.function && toolsToRemove.includes(tool.function.name)))
      .concat(functions);

    const promises = [];
    promises.push(
      updateAssistant(
        { assistant_id, user: req.user.id },
        {
          actions,
        },
      ),
    );
    promises.push(openai.beta.assistants.update(assistant_id, { tools }));
    // TODO: Auth handling
    promises.push(updateAction({ action_id, user: req.user.id }, { metadata }));

    const resolved = await Promise.all(promises);
    res.json(resolved);
  } catch (error) {
    const message = 'An error occurred while updating the Assistant Avatar';
    logger.error(message, error);
    res.status(500).json({ message });
  }
});

module.exports = router;
