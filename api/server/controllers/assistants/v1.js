const fs = require('fs').promises;
const { FileContext } = require('librechat-data-provider');
const { uploadImageBuffer, filterFile } = require('~/server/services/Files/process');
const validateAuthor = require('~/server/middleware/assistants/validateAuthor');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { deleteAssistantActions } = require('~/server/services/ActionService');
const { updateAssistantDoc, getAssistants } = require('~/models/Assistant');
const { getOpenAIClient, fetchAssistants } = require('./helpers');
const { manifestToolMap } = require('~/app/clients/tools');
const { deleteFileByFilter } = require('~/models/File');
const { logger } = require('~/config');
const axios = require('axios');
const crypto = require('crypto');
const { SignatureV4 } = require("@aws-sdk/signature-v4");
const { HttpRequest } = require("@aws-sdk/protocol-http");
const { Sha256 } = require("@aws-crypto/sha256-browser");
const { defaultProvider } = require("@aws-sdk/credential-provider-node");
const jwt = require('jsonwebtoken');
const https = require('https');

// Load environment variables
const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

// Helper functions for SigV4 signing
const hmac = (key, string) => crypto.createHmac('sha256', key).update(string).digest();
const hash = (string) => crypto.createHash('sha256').update(string).digest('hex');

/**
 * Create an assistant.
 * @route POST /assistants
 * @param {AssistantCreateParams} req.body - The assistant creation parameters.
 * @returns {Assistant} 201 - success response - application/json
 */
const createAssistant = async (req, res) => {
  try {
    const { openai } = await getOpenAIClient({ req, res });

    const {
      tools = [],
      endpoint,
      conversation_starters,
      append_current_datetime,
      ...assistantData
    } = req.body;
    delete assistantData.conversation_starters;
    delete assistantData.append_current_datetime;

    assistantData.tools = tools
      .map((tool) => {
        if (typeof tool !== 'string') {
          return tool;
        }

        const toolDefinitions = req.app.locals.availableTools;
        const toolDef = toolDefinitions[tool];
        if (!toolDef && manifestToolMap[tool] && manifestToolMap[tool].toolkit === true) {
          return (
            Object.entries(toolDefinitions)
              .filter(([key]) => key.startsWith(`${tool}_`))
              // eslint-disable-next-line no-unused-vars
              .map(([_, val]) => val)
          );
        }

        return toolDef;
      })
      .filter((tool) => tool)
      .flat();

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
    if (append_current_datetime !== undefined) {
      createData.append_current_datetime = append_current_datetime;
    }

    const document = await updateAssistantDoc({ assistant_id: assistant.id }, createData);

    if (azureModelIdentifier) {
      assistant.model = azureModelIdentifier;
    }

    if (document.conversation_starters) {
      assistant.conversation_starters = document.conversation_starters;
    }

    if (append_current_datetime !== undefined) {
      assistant.append_current_datetime = append_current_datetime;
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
    const {
      endpoint: _e,
      conversation_starters,
      append_current_datetime,
      ...updateData
    } = req.body;
    updateData.tools = (updateData.tools ?? [])
      .map((tool) => {
        if (typeof tool !== 'string') {
          return tool;
        }

        const toolDefinitions = req.app.locals.availableTools;
        const toolDef = toolDefinitions[tool];
        if (!toolDef && manifestToolMap[tool] && manifestToolMap[tool].toolkit === true) {
          return (
            Object.entries(toolDefinitions)
              .filter(([key]) => key.startsWith(`${tool}_`))
              // eslint-disable-next-line no-unused-vars
              .map(([_, val]) => val)
          );
        }

        return toolDef;
      })
      .filter((tool) => tool)
      .flat();

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

    if (append_current_datetime !== undefined) {
      await updateAssistantDoc({ assistant_id }, { append_current_datetime });
      updatedAssistant.append_current_datetime = append_current_datetime;
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
    const allAssistants = await fetchAssistants({ req, res });

    const API_URL = process.env.API_URL
    const API_KEY = process.env.API_KEY
    const AWS_REGION = 'us-east-1';
    const SERVICE = 'execute-api';

    const bearerToken = req.headers.authorization?.split(' ')[1];

    if (!bearerToken) {
      throw new Error('Bearer token is missing');
    }

    const decodedToken = jwt.decode(bearerToken);
    const userEmail = decodedToken.email;

    if (!userEmail) {
      throw new Error('User email not found in token');
    }

    const url = new URL(`${API_URL}/user-agents`);
    url.searchParams.append('email', userEmail);

    const method = 'GET';
    const now = new Date();
    const amzdate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const datestamp = amzdate.slice(0, 8);

    const canonical_uri = url.pathname;
    const canonical_querystring = url.searchParams.toString();
    const canonical_headers = `host:${url.hostname}\nx-api-key:${API_KEY}\nx-amz-date:${amzdate}\n`;
    const signed_headers = 'host;x-api-key;x-amz-date';
    const payload_hash = hash('');
    const canonical_request = `${method}\n${canonical_uri}\n${canonical_querystring}\n${canonical_headers}\n${signed_headers}\n${payload_hash}`;

    const algorithm = 'AWS4-HMAC-SHA256';
    const credential_scope = `${datestamp}/${AWS_REGION}/${SERVICE}/aws4_request`;
    const string_to_sign = `${algorithm}\n${amzdate}\n${credential_scope}\n${hash(canonical_request)}`;

    const signing_key = hmac(hmac(hmac(hmac('AWS4' + API_KEY, datestamp), AWS_REGION), SERVICE), 'aws4_request');
    const signature = hmac(signing_key, string_to_sign).toString('hex');

    const authorization_header = `${algorithm} Credential=${API_KEY}/${credential_scope}, SignedHeaders=${signed_headers}, Signature=${signature}`;

    const fetchAvailableAgents = () => {
      return new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
              'Host': url.hostname,
              'X-API-Key': API_KEY,
              'X-Amz-Date': amzdate,
              'Authorization': authorization_header
            }
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(JSON.parse(data));
              } else {
                reject(new Error(`Request failed with status code ${res.statusCode}: ${data}`));
              }
            });
          }
        );
        req.on('error', reject);
        req.end();
      });
    };

    const availableAgentsResponse = await fetchAvailableAgents();
    const availableAgents = availableAgentsResponse.available_agents || [];

    const userAssitants = allAssistants.data.filter(assistant => 
      availableAgents.some(agent => agent.agent_id === assistant.id)
    );

    const body = {
      ...allAssistants,
      data: userAssitants,
    };

    res.json(body);
  } catch (error) {
    console.error('[/assistants] Error listing assistants', error);
    res.status(500).json({ message: 'Error listing assistants', error: error.message });
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
        append_current_datetime: 1,
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
 * @route POST /:assistant_id/avatar
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.assistant_id - The ID of the assistant.
 * @param {Express.Multer.File} req.file - The avatar image file.
 * @param {object} req.body - Request body
 * @returns {Object} 200 - success response - application/json
 */
const uploadAssistantAvatar = async (req, res) => {
  try {
    filterFile({ req, file: req.file, image: true, isAvatar: true });
    const { assistant_id } = req.params;
    if (!assistant_id) {
      return res.status(400).json({ message: 'Assistant ID is required' });
    }

    const { openai } = await getOpenAIClient({ req, res });
    await validateAuthor({ req, openai });

    const buffer = await fs.readFile(req.file.path);
    const image = await uploadImageBuffer({
      req,
      context: FileContext.avatar,
      metadata: { buffer },
    });

    let _metadata;

    try {
      const assistant = await openai.beta.assistants.retrieve(assistant_id);
      if (assistant) {
        _metadata = assistant.metadata;
      }
    } catch (error) {
      logger.error('[/:assistant_id/avatar] Error fetching assistant', error);
      _metadata = {};
    }

    if (_metadata.avatar && _metadata.avatar_source) {
      const { deleteFile } = getStrategyFunctions(_metadata.avatar_source);
      try {
        await deleteFile(req, { filepath: _metadata.avatar });
        await deleteFileByFilter({ user: req.user.id, filepath: _metadata.avatar });
      } catch (error) {
        logger.error('[/:assistant_id/avatar] Error deleting old avatar', error);
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
  } finally {
    try {
      await fs.unlink(req.file.path);
      logger.debug('[/:agent_id/avatar] Temp. image upload file deleted');
    } catch (error) {
      logger.debug('[/:agent_id/avatar] Temp. image upload file already deleted');
    }
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
