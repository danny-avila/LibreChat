const { nanoid } = require('nanoid');
const { logger } = require('@librechat/data-schemas');
const { checkAccess, loadWebSearchAuth, authorizeArtifactToolCall } = require('@librechat/api');
const {
  Tools,
  AuthType,
  Permissions,
  ToolCallTypes,
  PermissionTypes,
} = require('librechat-data-provider');
const {
  getFiles,
  getMessage,
  getRoleByName,
  createToolCall,
  getToolCallsByConvo,
} = require('~/models');
const { processFileURL, uploadImageBuffer } = require('~/server/services/Files/process');
const { getRetentionExpiry } = require('~/server/services/Files/retention');
const { processCodeOutput, runPreviewFinalize } = require('~/server/services/Files/Code/process');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { loadTools } = require('~/app/clients/tools/util');

/**
 * Tools that are callable directly via `POST /tools/:toolId/call`.
 * `execute_code` is the only entry today; the tool runs server-side via
 * the agents library / sandbox service without any per-user credential.
 */
const directCallableTools = new Set([Tools.execute_code]);

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
    const appConfig = req.config;
    const userId = req.user.id;
    /** @type {TCustomConfig['webSearch']} */
    const webSearchConfig = appConfig?.webSearch || {};
    const result = await loadWebSearchAuth({
      userId,
      loadAuthValues,
      webSearchConfig,
      throwError: false,
    });

    return res.status(200).json({
      authenticated: result.authenticated,
      authTypes: result.authTypes,
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
    if (!directCallableTools.has(toolId)) {
      res.status(404).json({ message: 'Tool not found' });
      return;
    }
    /**
     * `execute_code` no longer requires a per-user credential — sandbox
     * auth is handled server-side by the agents library. Always report
     * system-authenticated so the client proceeds straight to the call
     * without a key-entry dialog.
     *
     * Deployment contract: reachability of the sandbox service is the
     * admin's responsibility. This endpoint does not probe the service
     * (a per-auth-check network hop would be too expensive for what is
     * a UI-gate query). If the sandbox is unreachable, the call path
     * surfaces the error at execution time instead of here.
     */
    res.status(200).json({ authenticated: true, message: AuthType.SYSTEM_DEFINED });
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
    const appConfig = req.config;
    const { toolId = '' } = req.params;
    if (!directCallableTools.has(toolId)) {
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
      hasAccess = await checkAccess({
        user: req.user,
        permissionType: toolAccessPermType[toolId],
        permissions: [Permissions.USE],
        getRoleByName,
      });
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
      },
      webSearch: appConfig.webSearch,
      fileStrategy: appConfig.fileStrategy,
      imageOutputType: appConfig.imageOutputType,
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
      ...(await getRetentionExpiry(req)),
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
      /* Files flagged `inherited` by codeapi are unchanged passthroughs of
       * inputs the caller already owns (skill files, prior downloaded inputs,
       * inherited .dirkeep markers). Re-downloading them is wasted work and
       * 403s when the file is scoped to a different entity (e.g. skill
       * entity_id) than the user's session key. They remain available for
       * subsequent tool calls via primeInvokedSkills / session inheritance. */
      if (file.inherited) {
        continue;
      }
      const { id, name } = file;
      artifactPromises.push(
        (async () => {
          const result = await processCodeOutput({
            req,
            id,
            name,
            messageId,
            toolCallId,
            conversationId,
            session_id: artifact.session_id,
          });
          const fileMetadata = result?.file ?? null;
          const finalize = result?.finalize;
          if (!fileMetadata) {
            return null;
          }
          /* This endpoint is non-streaming and its contract is "give
           * me the artifacts" — return the persisted record immediately
           * (with `status: 'pending'` for office buckets) and run the
           * preview render in the background. The client polls
           * `/api/files/:file_id/preview` for the resolved record.
           * No `onResolved` — there's no live stream to write to here. */
          runPreviewFinalize({
            finalize,
            fileId: fileMetadata.file_id,
            previewRevision: result?.previewRevision,
          });
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

/**
 * No-op response used as the captured `res` for live-artifact MCP tool
 * instances. The bridge is a non-streaming JSON endpoint, so the OAuth/SSE
 * emitters inside the tool must never write to the real response. We pre-check
 * the connection and reject when a server isn't connected, so this stub is only
 * a defense-in-depth guard against the interactive OAuth path.
 */
const createNoopEventSink = () => ({
  headersSent: true,
  write: () => true,
  end: () => {},
  flush: () => {},
  on: () => {},
});

/**
 * Dispatch a single MCP tool call originating from a live artifact's bridge.
 *
 * The artifact's permitted tools are stored on its file record at authoring time
 * (`file.metadata.mcpTools`). That server-stored allowlist is re-validated here,
 * so a tampered client cannot call tools the artifact never declared. Tools run
 * with the user's live MCP credentials.
 *
 * @param {ServerRequest} req
 * @param {ServerResponse} res
 * @returns {Promise<void>}
 */
const callArtifactTool = async (req, res) => {
  try {
    /* Lazy-require: `~/server/services/MCP` pulls a heavy auth chain
     * (Graph/OBO/openid) at load time. Requiring it here keeps the rest of
     * this controller (and its tests) loadable without that chain. */
    const {
      createMCPTool,
      getMCPSetupData,
      userCanUseMCPServers,
      getServerConnectionStatus,
      createMCPPermissionContext,
    } = require('~/server/services/MCP');

    const { tool, file_id: fileId, messageId, conversationId, partIndex, blockIndex } = req.body;
    const rawArgs = req.body.args;
    const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {};

    if (typeof tool !== 'string' || !tool || typeof fileId !== 'string' || !fileId) {
      res.status(400).json({ message: 'tool and file_id are required' });
      return;
    }

    const [file] = await getFiles({ file_id: fileId, user: req.user.id });
    if (!file) {
      res.status(404).json({ message: 'Artifact file not found' });
      return;
    }

    const authorization = authorizeArtifactToolCall(file.metadata?.mcpTools, tool);
    if (!authorization.allowed) {
      if (authorization.reason === 'not_mcp') {
        res.status(400).json({ message: 'Only MCP tools are callable from artifacts' });
        return;
      }
      logger.warn(
        `[artifact/tool] User ${req.user.id} attempted tool "${tool}" not in file "${fileId}" allowlist`,
      );
      res.status(403).json({ message: 'Tool not permitted for this artifact' });
      return;
    }
    const { serverName } = authorization;

    const hasAccess = await userCanUseMCPServers(req.user, req);
    if (!hasAccess) {
      logger.warn(`[artifact/tool] Forbidden: User ${req.user.id} lacks MCP server permissions`);
      res.status(403).json({ message: 'Forbidden: Insufficient MCP server permissions' });
      return;
    }

    const { mcpConfig, appConnections, userConnections, oauthServers } = await getMCPSetupData(
      req.user.id,
      { role: req.user.role, tenantId: req.user.tenantId },
    );
    const serverConfig = mcpConfig[serverName];
    if (!serverConfig) {
      res.status(404).json({ message: `MCP server "${serverName}" not found` });
      return;
    }

    const { connectionState, requiresOAuth } = await getServerConnectionStatus(
      req.user.id,
      serverName,
      serverConfig,
      appConnections,
      userConnections,
      oauthServers,
    );
    if (connectionState !== 'connected') {
      res.status(409).json({
        message: `MCP server "${serverName}" is not connected`,
        serverName,
        connectionState,
        requiresOAuth,
      });
      return;
    }

    const toolInstance = await createMCPTool({
      res: createNoopEventSink(),
      user: req.user,
      toolKey: tool,
      config: serverConfig,
      mcpPermissionContext: createMCPPermissionContext(req),
    });
    if (!toolInstance) {
      res.status(404).json({ message: 'Tool unavailable' });
      return;
    }

    const toolCallId = `${req.user.id}_${nanoid()}`;
    const result = await toolInstance.invoke(
      { name: tool, args, id: toolCallId, type: ToolCallTypes.TOOL_CALL },
      {
        signal: req.abortController?.signal,
        /* Stable flow identifiers so any OAuth path derives a unique flowId
         * instead of `${serverName}:oauth_login:undefined:undefined`. */
        metadata: { thread_id: conversationId ?? `artifact:${fileId}`, run_id: toolCallId },
        configurable: { user: req.user, requestBody: { conversationId, messageId } },
      },
    );

    const { content, artifact } = result ?? {};
    if (messageId) {
      createToolCall({
        toolId: tool,
        messageId,
        partIndex,
        blockIndex,
        conversationId,
        result: content,
        user: req.user.id,
        ...(await getRetentionExpiry(req)),
      }).catch((error) => {
        logger.error(`[artifact/tool] Error recording tool call: ${error.message}`);
      });
    }

    res.status(200).json({ result: content, artifact });
  } catch (error) {
    logger.error('[artifact/tool] Error calling artifact tool', error);
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
  callArtifactTool,
};
