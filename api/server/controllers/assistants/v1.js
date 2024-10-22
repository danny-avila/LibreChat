const { FileContext } = require('librechat-data-provider');
const validateAuthor = require('~/server/middleware/assistants/validateAuthor');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { deleteAssistantActions } = require('~/server/services/ActionService');
const { updateAssistantDoc, getAssistants } = require('~/models/Assistant');
const { uploadImageBuffer } = require('~/server/services/Files/process');
const { getOpenAIClient, fetchAssistants } = require('./helpers');
const { deleteFileByFilter } = require('~/models/File');
const { logger } = require('~/config');

/**
 * Create an assistant.
 * @route POST /assistants
 * @param {AssistantCreateParams} req.body - The assistant creation parameters.
 * @returns {Assistant} 201 - success response - application/json
 */
const createAssistant = async (req, res) => {
  try {
    const { openai } = await getOpenAIClient({ req, res });

    const { tools = [], endpoint, conversation_starters, ...assistantData } = req.body;
    delete assistantData.conversation_starters;

    assistantData.tools = tools
      .map((tool) => {
        if (typeof tool !== 'string') {
          return tool;
        }

        return req.app.locals.availableTools[tool];
      })
      .filter((tool) => tool);

    let azureModelIdentifier = null;
    if (openai.locals?.azureOptions) {
      azureModelIdentifier = assistantData.model;
      assistantData.model = openai.locals.azureOptions.azureOpenAIApiDeploymentName;
    }

    assistantData.metadata = {
      author: req.user.id,
      endpoint,
    };

    const assistant = await openai.beta.assistants.create(assistantData);

    const createData = { user: req.user.id };
    if (conversation_starters) {
      createData.conversation_starters = conversation_starters;
    }

    const document = await updateAssistantDoc({ assistant_id: assistant.id }, createData);

    if (azureModelIdentifier) {
      assistant.model = azureModelIdentifier;
    }

    if (document.conversation_starters) {
      assistant.conversation_starters = document.conversation_starters;
    }

    logger.debug('/assistants/', assistant);
    res.status(201).json(assistant);
  } catch (error) {
    logger.error('[/assistants] Error creating assistant', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Retrieves an assistant.
 * @route GET /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Assistant} 200 - success response - application/json
 */
const retrieveAssistant = async (req, res) => {
  try {
    /* NOTE: not actually being used right now */
    const { openai } = await getOpenAIClient({ req, res });
    const assistant_id = req.params.id;
    const assistant = await openai.beta.assistants.retrieve(assistant_id);
    res.json(assistant);
  } catch (error) {
    logger.error('[/assistants/:id] Error retrieving assistant', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Modifies an assistant.
 * @route PATCH /assistants/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Assistant identifier.
 * @param {AssistantUpdateParams} req.body - The assistant update parameters.
 * @returns {Assistant} 200 - success response - application/json
 */
const patchAssistant = async (req, res) => {
  try {
    const { openai } = await getOpenAIClient({ req, res });
    await validateAuthor({ req, openai });

    const assistant_id = req.params.id;
    const { endpoint: _e, conversation_starters, ...updateData } = req.body;
    updateData.tools = (updateData.tools ?? [])
      .map((tool) => {
        if (typeof tool !== 'string') {
          return tool;
        }

        return req.app.locals.availableTools[tool];
      })
      .filter((tool) => tool);

    if (openai.locals?.azureOptions && updateData.model) {
      updateData.model = openai.locals.azureOptions.azureOpenAIApiDeploymentName;
    }

    const updatedAssistant = await openai.beta.assistants.update(assistant_id, updateData);

    if (conversation_starters !== undefined) {
      const conversationStartersUpdate = await updateAssistantDoc(
        { assistant_id },
        { conversation_starters },
      );
      updatedAssistant.conversation_starters = conversationStartersUpdate.conversation_starters;
    }

    res.json(updatedAssistant);
  } catch (error) {
    logger.error('[/assistants/:id] Error updating assistant', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Deletes an assistant.
 * @route DELETE /assistants/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Assistant} 200 - success response - application/json
 */
const deleteAssistant = async (req, res) => {
  try {
    const { openai } = await getOpenAIClient({ req, res });
    await validateAuthor({ req, openai });

    const assistant_id = req.params.id;
    const deletionStatus = await openai.beta.assistants.del(assistant_id);
    if (deletionStatus?.deleted) {
      await deleteAssistantActions({ req, assistant_id });
    }
    res.json(deletionStatus);
  } catch (error) {
    logger.error('[/assistants/:id] Error deleting assistant', error);
    res.status(500).json({ error: 'Error deleting assistant' });
  }
};

/**
 * Returns a list of assistants.
 * @route GET /assistants
 * @param {object} req - Express Request
 * @param {AssistantListParams} req.query - The assistant list parameters for pagination and sorting.
 * @returns {AssistantListResponse} 200 - success response - application/json
 */
const listAssistants = async (req, res) => {
  try {
    const body = await fetchAssistants({ req, res });
    res.json(body);
  } catch (error) {
    logger.error('[/assistants] Error listing assistants', error);
    res.status(500).json({ message: 'Error listing assistants' });
  }
};

/**
 * Filter assistants based on configuration.
 *
 * @param {object} params - The parameters object.
 * @param {string} params.userId -  The user ID to filter private assistants.
 * @param {AssistantDocument[]} params.assistants - The list of assistants to filter.
 * @param {Partial<TAssistantEndpoint>} [params.assistantsConfig] -  The assistant configuration.
 * @returns {AssistantDocument[]} - The filtered list of assistants.
 */
function filterAssistantDocs({ documents, userId, assistantsConfig = {} }) {
  const { supportedIds, excludedIds, privateAssistants } = assistantsConfig;
  const removeUserId = (doc) => {
    const { user: _u, ...document } = doc;
    return document;
  };

  if (privateAssistants) {
    return documents.filter((doc) => userId === doc.user.toString()).map(removeUserId);
  } else if (supportedIds?.length) {
    return documents.filter((doc) => supportedIds.includes(doc.assistant_id)).map(removeUserId);
  } else if (excludedIds?.length) {
    return documents.filter((doc) => !excludedIds.includes(doc.assistant_id)).map(removeUserId);
  }
  return documents.map(removeUserId);
}

/**
 * Returns a list of the user's assistant documents (metadata saved to database).
 * @route GET /assistants/documents
 * @returns {AssistantDocument[]} 200 - success response - application/json
 */
const getAssistantDocuments = async (req, res) => {
  try {
    const endpoint = req.query;
    const assistantsConfig = req.app.locals[endpoint];
    const documents = await getAssistants(
      {},
      {
        user: 1,
        assistant_id: 1,
        conversation_starters: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    );

    const docs = filterAssistantDocs({
      documents,
      userId: req.user.id,
      assistantsConfig,
    });
    res.json(docs);
  } catch (error) {
    logger.error('[/assistants/documents] Error listing assistant documents', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Uploads and updates an avatar for a specific assistant.
 * @route POST /avatar/:assistant_id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.assistant_id - The ID of the assistant.
 * @param {Express.Multer.File} req.file - The avatar image file.
 * @param {object} req.body - Request body
 * @returns {Object} 200 - success response - application/json
 */
const uploadAssistantAvatar = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    if (!assistant_id) {
      return res.status(400).json({ message: 'Assistant ID is required' });
    }

    const { openai } = await getOpenAIClient({ req, res });
    await validateAuthor({ req, openai });

    const image = await uploadImageBuffer({
      req,
      context: FileContext.avatar,
      metadata: {
        buffer: req.file.buffer,
      },
    });

    let _metadata;

    try {
      const assistant = await openai.beta.assistants.retrieve(assistant_id);
      if (assistant) {
        _metadata = assistant.metadata;
      }
    } catch (error) {
      logger.error('[/avatar/:assistant_id] Error fetching assistant', error);
      _metadata = {};
    }

    if (_metadata.avatar && _metadata.avatar_source) {
      const { deleteFile } = getStrategyFunctions(_metadata.avatar_source);
      try {
        await deleteFile(req, { filepath: _metadata.avatar });
        await deleteFileByFilter({ user: req.user.id, filepath: _metadata.avatar });
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
      updateAssistantDoc(
        { assistant_id },
        {
          avatar: {
            filepath: image.filepath,
            source: req.app.locals.fileStrategy,
          },
          user: req.user.id,
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
};

module.exports = {
  createAssistant,
  retrieveAssistant,
  patchAssistant,
  deleteAssistant,
  listAssistants,
  getAssistantDocuments,
  uploadAssistantAvatar,
};
