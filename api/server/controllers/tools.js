const { nanoid } = require('nanoid');
const { EnvVar } = require('@librechat/agents');
const { Tools, AuthType, ToolCallTypes } = require('librechat-data-provider');
const { processFileURL, uploadImageBuffer } = require('~/server/services/Files/process');
const { processCodeOutput } = require('~/server/services/Files/Code/process');
const { loadAuthValues, loadTools } = require('~/app/clients/tools/util');
const { createToolCall, getToolCallsByConvo } = require('~/models/ToolCall');
const { getMessage } = require('~/models/Message');
const { logger } = require('~/config');

const fieldsMap = {
  [Tools.execute_code]: [EnvVar.CODE_API_KEY],
};

/**
 * @param {ServerRequest} req - The request object, containing information about the HTTP request.
 * @param {ServerResponse} res - The response object, used to send back the desired HTTP response.
 * @returns {Promise<void>} A promise that resolves when the function has completed.
 */
const verifyToolAuth = async (req, res) => {
  try {
    const { toolId } = req.params;
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
