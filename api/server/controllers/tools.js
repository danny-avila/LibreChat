const { nanoid } = require('nanoid');
const { EnvVar } = require('@librechat/agents');
const {
  Tools,
  AuthType,
  Permissions,
  webSearchAuth,
  ToolCallTypes,
  PermissionTypes,
  extractWebSearchEnvVars,
} = require('librechat-data-provider');
const { processFileURL, uploadImageBuffer } = require('~/server/services/Files/process');
const { processCodeOutput } = require('~/server/services/Files/Code/process');
const { createToolCall, getToolCallsByConvo } = require('~/models/ToolCall');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { loadTools } = require('~/app/clients/tools/util');
const { checkAccess } = require('~/server/middleware');
const { getMessage } = require('~/models/Message');
const { logger } = require('~/config');

const fieldsMap = {
  [Tools.execute_code]: [EnvVar.CODE_API_KEY],
};

const toolAccessPermType = {
  [Tools.execute_code]: PermissionTypes.RUN_CODE,
};

/**
 * Verifies web search authentication, ensuring each category has at least
 * one fully authenticated service.
 *
 * @param {ServerRequest} req - The request object
 * @param {ServerResponse} res - The response object
 * @returns {Promise<void>} A promise that resolves when the function has completed
 */
const verifyWebSearchAuth = async (req, res) => {
  try {
    const userId = req.user.id;
    /** @type {TCustomConfig['webSearch']} */
    const webSearchConfig = req.app.locals?.webSearch || {};

    // Initialize result
    let isAuthenticated = true;
    let isUserProvided = false;

    // Process each category sequentially
    for (const category in webSearchAuth) {
      let categoryAuthenticated = false;

      // Get all services for this category
      const services = Object.keys(webSearchAuth[category]);

      // Try each service until we find an authenticated one
      for (let i = 0; i < services.length && !categoryAuthenticated; i++) {
        const service = services[i];
        const serviceConfig = webSearchAuth[category][service];

        // Split keys into required and optional
        const allKeys = Object.keys(serviceConfig);
        const requiredKeys = allKeys.filter((key) => serviceConfig[key] === 1);
        const optionalKeys = allKeys.filter((key) => serviceConfig[key] === 0);

        // Skip if no required keys (unlikely but defensive)
        if (requiredKeys.length === 0) {
          continue;
        }

        // Get environment variables for all keys
        const allKeyFields = extractWebSearchEnvVars({
          keys: allKeys,
          config: webSearchConfig,
        });

        // Map keys to their auth fields
        const keyToFieldMap = {};
        for (let j = 0; j < allKeys.length; j++) {
          if (j < allKeyFields.length) {
            keyToFieldMap[allKeys[j]] = allKeyFields[j];
          }
        }

        // Get auth fields for required keys
        const requiredAuthFields = requiredKeys.map((key) => keyToFieldMap[key]).filter(Boolean); // Remove undefined fields

        // Skip if any required keys don't have auth fields
        if (requiredAuthFields.length !== requiredKeys.length) {
          continue;
        }

        // Get auth fields for optional keys
        const optionalAuthFields = new Set(
          optionalKeys.map((key) => keyToFieldMap[key]).filter(Boolean), // Remove undefined fields
        );

        try {
          // Load authentication values
          const authValues = await loadAuthValues({
            userId,
            authFields: allKeyFields,
            optional: optionalAuthFields,
            throwError: false,
          });

          // Check if all required fields are authenticated
          const serviceAuthenticated = requiredAuthFields.every((field) => !!authValues[field]);

          if (serviceAuthenticated) {
            // Mark this category as authenticated
            categoryAuthenticated = true;

            // Check if any auth value is user-provided
            for (const field of requiredAuthFields) {
              const value = authValues[field];
              if (value && process.env[field] && value !== process.env[field]) {
                isUserProvided = true;
                break;
              }
            }
          }
        } catch (error) {
          // Continue to next service on error
          continue;
        }
      }

      // If no service in this category is authenticated, the overall result is false
      if (!categoryAuthenticated) {
        isAuthenticated = false;
        // Can break early since we need ALL categories to be authenticated
        break;
      }
    }

    /** @type {AuthType} */
    const message = isUserProvided ? AuthType.USER_PROVIDED : AuthType.SYSTEM_DEFINED;

    return res.status(200).json({
      authenticated: isAuthenticated,
      message,
    });
  } catch (error) {
    console.error('Error in verifyWebSearchAuth:', error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * @param {ServerRequest} req - The request object, containing information about the HTTP request.
 * @param {ServerResponse} res - The response object, used to send back the desired HTTP response.
 * @returns {Promise<void>} A promise that resolves when the function has completed.
 */
const verifyToolAuth = async (req, res) => {
  try {
    const { toolId } = req.params;
    if (toolId === Tools.web_search) {
      return await verifyWebSearchAuth(req, res);
    }
    const authFields = fieldsMap[toolId];
    if (!authFields) {
      res.status(404).json({ message: 'Tool not found' });
      return;
    }
    let result;
    try {
      result = await loadAuthValues({
        userId: req.user.id,
        authFields,
        throwError: false,
      });
    } catch (error) {
      res.status(200).json({ authenticated: false, message: AuthType.USER_PROVIDED });
      return;
    }
    let isUserProvided = false;
    for (const field of authFields) {
      if (!result[field]) {
        res.status(200).json({ authenticated: false, message: AuthType.USER_PROVIDED });
        return;
      }
      if (!isUserProvided && process.env[field] !== result[field]) {
        isUserProvided = true;
      }
    }
    res.status(200).json({
      authenticated: true,
      message: isUserProvided ? AuthType.USER_PROVIDED : AuthType.SYSTEM_DEFINED,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @param {ServerRequest} req - The request object, containing information about the HTTP request.
 * @param {ServerResponse} res - The response object, used to send back the desired HTTP response.
 * @param {NextFunction} next - The next middleware function to call.
 * @returns {Promise<void>} A promise that resolves when the function has completed.
 */
const callTool = async (req, res) => {
  try {
    const { toolId = '' } = req.params;
    if (!fieldsMap[toolId]) {
      logger.warn(`[${toolId}/call] User ${req.user.id} attempted call to invalid tool`);
      res.status(404).json({ message: 'Tool not found' });
      return;
    }

    const { partIndex, blockIndex, messageId, conversationId, ...args } = req.body;
    if (!messageId) {
      logger.warn(`[${toolId}/call] User ${req.user.id} attempted call without message ID`);
      res.status(400).json({ message: 'Message ID required' });
      return;
    }

    const message = await getMessage({ user: req.user.id, messageId });
    if (!message) {
      logger.debug(`[${toolId}/call] User ${req.user.id} attempted call with invalid message ID`);
      res.status(404).json({ message: 'Message not found' });
      return;
    }
    logger.debug(`[${toolId}/call] User: ${req.user.id}`);
    let hasAccess = true;
    if (toolAccessPermType[toolId]) {
      hasAccess = await checkAccess(req.user, toolAccessPermType[toolId], [Permissions.USE]);
    }
    if (!hasAccess) {
      logger.warn(
        `[${toolAccessPermType[toolId]}] Forbidden: Insufficient permissions for User ${req.user.id}: ${Permissions.USE}`,
      );
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }
    const { loadedTools } = await loadTools({
      user: req.user.id,
      tools: [toolId],
      functions: true,
      options: {
        req,
        returnMetadata: true,
        processFileURL,
        uploadImageBuffer,
        fileStrategy: req.app.locals.fileStrategy,
      },
    });

    const tool = loadedTools[0];
    const toolCallId = `${req.user.id}_${nanoid()}`;
    const result = await tool.invoke({
      args,
      name: toolId,
      id: toolCallId,
      type: ToolCallTypes.TOOL_CALL,
    });

    const { content, artifact } = result;
    const toolCallData = {
      toolId,
      messageId,
      partIndex,
      blockIndex,
      conversationId,
      result: content,
      user: req.user.id,
    };

    if (!artifact || !artifact.files || toolId !== Tools.execute_code) {
      createToolCall(toolCallData).catch((error) => {
        logger.error(`Error creating tool call: ${error.message}`);
      });
      return res.status(200).json({
        result: content,
      });
    }

    const artifactPromises = [];
    for (const file of artifact.files) {
      const { id, name } = file;
      artifactPromises.push(
        (async () => {
          const fileMetadata = await processCodeOutput({
            req,
            id,
            name,
            apiKey: tool.apiKey,
            messageId,
            toolCallId,
            conversationId,
            session_id: artifact.session_id,
          });

          if (!fileMetadata) {
            return null;
          }

          return fileMetadata;
        })().catch((error) => {
          logger.error('Error processing code output:', error);
          return null;
        }),
      );
    }
    const attachments = await Promise.all(artifactPromises);
    toolCallData.attachments = attachments;
    createToolCall(toolCallData).catch((error) => {
      logger.error(`Error creating tool call: ${error.message}`);
    });
    res.status(200).json({
      result: content,
      attachments,
    });
  } catch (error) {
    logger.error('Error calling tool', error);
    res.status(500).json({ message: 'Error calling tool' });
  }
};

const getToolCalls = async (req, res) => {
  try {
    const { conversationId } = req.query;
    const toolCalls = await getToolCallsByConvo(conversationId, req.user.id);
    res.status(200).json(toolCalls);
  } catch (error) {
    logger.error('Error getting tool calls', error);
    res.status(500).json({ message: 'Error getting tool calls' });
  }
};

module.exports = {
  callTool,
  getToolCalls,
  verifyToolAuth,
};
