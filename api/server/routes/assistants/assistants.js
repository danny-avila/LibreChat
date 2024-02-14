const multer = require('multer');
const express = require('express');
const { FileContext, EModelEndpoint } = require('librechat-data-provider');
const { updateAssistant, getAssistants } = require('~/models/Assistant');
const { initializeClient } = require('~/server/services/Endpoints/assistant');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { uploadImageBuffer } = require('~/server/services/Files/process');
const { deleteFileByFilter } = require('~/models/File');
const { logger } = require('~/config');
const actions = require('./actions');
const tools = require('./tools');

const upload = multer();
const router = express.Router();

/**
 * Assistant actions route.
 * @route GET|POST /assistants/actions
 */
router.use('/actions', actions);

/**
 * Create an assistant.
 * @route GET /assistants/tools
 * @returns {TPlugin[]} 200 - application/json
 */
router.use('/tools', tools);

/**
 * Create an assistant.
 * @route POST /assistants
 * @param {AssistantCreateParams} req.body - The assistant creation parameters.
 * @returns {Assistant} 201 - success response - application/json
 */
router.post('/', async (req, res) => {
  try {
    /** @type {{ openai: OpenAI }} */
    const { openai } = await initializeClient({ req, res });

    const { tools = [], ...assistantData } = req.body;
    assistantData.tools = tools
      .map((tool) => {
        if (typeof tool !== 'string') {
          return tool;
        }

        return req.app.locals.availableTools[tool];
      })
      .filter((tool) => tool);

    const assistant = await openai.beta.assistants.create(assistantData);
    logger.debug('/assistants/', assistant);
    res.status(201).json(assistant);
  } catch (error) {
    logger.error('[/assistants] Error creating assistant', error);
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
    /** @type {{ openai: OpenAI }} */
    const { openai } = await initializeClient({ req, res });

    const assistant_id = req.params.id;
    const assistant = await openai.beta.assistants.retrieve(assistant_id);
    res.json(assistant);
  } catch (error) {
    logger.error('[/assistants/:id] Error retrieving assistant', error);
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
    /** @type {{ openai: OpenAI }} */
    const { openai } = await initializeClient({ req, res });

    const assistant_id = req.params.id;
    const updateData = req.body;
    updateData.tools = (updateData.tools ?? [])
      .map((tool) => {
        if (typeof tool !== 'string') {
          return tool;
        }

        return req.app.locals.availableTools[tool];
      })
      .filter((tool) => tool);

    const updatedAssistant = await openai.beta.assistants.update(assistant_id, updateData);
    res.json(updatedAssistant);
  } catch (error) {
    logger.error('[/assistants/:id] Error updating assistant', error);
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
    /** @type {{ openai: OpenAI }} */
    const { openai } = await initializeClient({ req, res });

    const assistant_id = req.params.id;
    const deletionStatus = await openai.beta.assistants.del(assistant_id);
    res.json(deletionStatus);
  } catch (error) {
    logger.error('[/assistants/:id] Error deleting assistant', error);
    res.status(500).json({ error: 'Error deleting assistant' });
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
    /** @type {{ openai: OpenAI }} */
    const { openai } = await initializeClient({ req, res });

    const { limit, order, after, before } = req.query;
    const response = await openai.beta.assistants.list({
      limit,
      order,
      after,
      before,
    });

    /** @type {AssistantListResponse} */
    let body = response.body;

    if (req.app.locals?.[EModelEndpoint.assistants]) {
      /** @type {Partial<TAssistantEndpoint>} */
      const assistantsConfig = req.app.locals[EModelEndpoint.assistants];
      const { supportedIds, excludedIds } = assistantsConfig;
      if (supportedIds?.length) {
        body.data = body.data.filter((assistant) => supportedIds.includes(assistant.id));
      } else if (excludedIds?.length) {
        body.data = body.data.filter((assistant) => !excludedIds.includes(assistant.id));
      }
    }

    res.json(body);
  } catch (error) {
    logger.error('[/assistants] Error listing assistants', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Returns a list of the user's assistant documents (metadata saved to database).
 * @route GET /assistants/documents
 * @returns {AssistantDocument[]} 200 - success response - application/json
 */
router.get('/documents', async (req, res) => {
  try {
    res.json(await getAssistants({ user: req.user.id }));
  } catch (error) {
    logger.error('[/assistants/documents] Error listing assistant documents', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Uploads and updates an avatar for a specific assistant.
 * @route POST /avatar/:assistant_id
 * @param {string} req.params.assistant_id - The ID of the assistant.
 * @param {Express.Multer.File} req.file - The avatar image file.
 * @param {string} [req.body.metadata] - Optional metadata for the assistant's avatar.
 * @returns {Object} 200 - success response - application/json
 */
router.post('/avatar/:assistant_id', upload.single('file'), async (req, res) => {
  try {
    const { assistant_id } = req.params;
    if (!assistant_id) {
      return res.status(400).json({ message: 'Assistant ID is required' });
    }

    let { metadata: _metadata = '{}' } = req.body;
    /** @type {{ openai: OpenAI }} */
    const { openai } = await initializeClient({ req, res });

    const image = await uploadImageBuffer({ req, context: FileContext.avatar });

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
        await deleteFileByFilter({ filepath: _metadata.avatar });
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
    res.status(201).json(resolved[1]);
  } catch (error) {
    const message = 'An error occurred while updating the Assistant Avatar';
    logger.error(message, error);
    res.status(500).json({ message });
  }
});

module.exports = router;
