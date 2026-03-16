const { logger, encryptV2, decryptV2 } = require('@librechat/data-schemas');
const { nanoid } = require('nanoid');
const { v4: uuidv4 } = require('uuid');
const { sendEvent, sanitizeMessageForTransmit, countTokens } = require('@librechat/api');
const { ContentTypes, EModelEndpoint, SystemRoles } = require('librechat-data-provider');
const { 
  createE2BAssistantDoc, 
  getE2BAssistantDocs, 
  updateE2BAssistantDoc, 
  deleteE2BAssistantDoc 
} = require('~/models/E2BAssistant');
const E2BDataAnalystAgent = require('~/server/services/Agents/e2bAgent');
const { buildE2BHistory } = require('~/server/services/Agents/e2bAgent/historyBuilder');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { saveMessage, getConvo, getMessages, getFiles } = require('~/models');

const toIdString = (value) => (value == null ? '' : value.toString?.() ?? String(value));

const buildVisibilityMetadata = (assistant) => {
  const metadata =
    assistant?.metadata && typeof assistant.metadata === 'object' ? { ...assistant.metadata } : {};

  if (!metadata.author && assistant?.author) {
    metadata.author = toIdString(assistant.author);
  }
  if (!metadata.role && assistant?.role) {
    metadata.role = assistant.role;
  }
  if (metadata.group === undefined && assistant?.group !== undefined && assistant?.group !== null) {
    metadata.group = assistant.group;
  }
  if (!metadata.endpoint) {
    metadata.endpoint = EModelEndpoint.e2bAssistants;
  }

  return metadata;
};

const canAccessAssistant = ({ assistant, userId, userRole, userGroups = [] }) => {
  if (userRole === SystemRoles.ADMIN) {
    return true;
  }

  const metadata = buildVisibilityMetadata(assistant);
  const authorId = toIdString(metadata.author);
  const group = typeof metadata.group === 'string' ? metadata.group : '';
  const role = typeof metadata.role === 'string' ? metadata.role.toUpperCase() : '';

  if (authorId && authorId === userId) {
    return true;
  }

  if (authorId && authorId !== userId) {
    if (role === SystemRoles.ADMIN) {
      if (!group) {
        return true;
      }
      return userGroups.includes(group);
    }

    if (group && userGroups.includes(group)) {
      return true;
    }

    return false;
  }

  if (Array.isArray(metadata.visibleTo)) {
    return metadata.visibleTo.includes(userId);
  }

  return false;
};

/**
 * Helper: Encrypt passwords in data_sources
 */
const encryptDataSources = async (dataSources) => {
  if (!dataSources || !Array.isArray(dataSources)) return dataSources;
  
  const encrypted = await Promise.all(dataSources.map(async (ds) => {
    if (ds.config && ds.config.password) {
      try {
        const encPassword = await encryptV2(ds.config.password);
        return {
          ...ds,
          config: {
            ...ds.config,
            password: encPassword
          }
        };
      } catch (e) {
        logger.error('[E2B Assistant] Encryption failed for datasource:', e);
        return ds;
      }
    }
    return ds;
  }));
  return encrypted;
};

/**
 * Helper: Decrypt passwords in data_sources (for frontend display)
 */
const decryptDataSources = async (dataSources) => {
  if (!dataSources || !Array.isArray(dataSources)) return [];
  
  const decrypted = await Promise.all(dataSources.map(async (ds) => {
    if (ds.config && ds.config.password) {
      try {
        const decPassword = await decryptV2(ds.config.password);
        return {
          ...ds,
          config: {
            ...ds.config,
            password: decPassword
          }
        };
      } catch (e) {
        return ds;
      }
    }
    return ds;
  }));
  return decrypted;
};

/**
 * Populates code_files in the assistant response.
 * @param {Object} assistant - The assistant document.
 * @param {Object} assistantResponse - The response object to populate.
 */
const populateCodeFiles = async (assistant, assistantResponse) => {
  const fileIds = new Set();

  // Collect IDs from tool_resources (V2 style)
  if (assistant.tool_resources?.code_interpreter?.file_ids) {
    assistant.tool_resources.code_interpreter.file_ids.forEach(id => fileIds.add(id));
  }

  // Collect IDs from file_ids (V1 style / Root level)
  if (assistant.file_ids && Array.isArray(assistant.file_ids)) {
    assistant.file_ids.forEach(id => fileIds.add(id));
  }

  if (fileIds.size > 0) {
    try {
      const uniqueIds = Array.from(fileIds);
      const files = await getFiles({ file_id: { $in: uniqueIds } });
      assistantResponse.code_files = files.map(file => [file.file_id, {
        file_id: file.file_id,
        filename: file.filename,
        bytes: file.bytes,
        type: file.type,
        filepath: file.filepath,
        _id: file._id,
        user: file.user,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      }]);
    } catch (error) {
      logger.error('[E2B Assistant] Error fetching files:', error);
      assistantResponse.code_files = [];
    }
  } else {
    assistantResponse.code_files = [];
  }
};

/**
 * Creates an E2B Assistant.
 * 
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
const createAssistant = async (req, res) => {
  try {
    logger.info('[E2B Assistant] CONTROLLER V3: Starting creation...');
    
    const { 
      name, 
      description, 
      instructions, 
      group,
      e2b_config, 
      model, 
      model_parameters, 
      code_execution_mode,
      e2b_sandbox_template,
      allowed_libraries,
      conversation_starters,
      tools,
      tool_resources,
      append_current_datetime,
      data_sources, // ✨ Extract data_sources
      metadata,
      // ...other fields
    } = req.body;
    
    logger.info(`[E2B Assistant] Creating assistant: ${name}`);
    if (data_sources) {
      logger.info(`[E2B Assistant] Received ${data_sources.length} data_sources for creation`);
    }
    
    // Default values if not provided
    const assistantData = {
      id: `asst_${nanoid()}`,
      name,
      description,
      instructions,
      prompt: instructions, // Map instructions to prompt for Schema validation
      author: req.user.id,
      model: model || 'gpt-4o', // Default model
      model_parameters: model_parameters || {},
      e2b_config: e2b_config || {
        timeout_ms: 3600000,
        max_memory_mb: 10240,
        max_cpu_percent: 80,
      },
      code_execution_mode: code_execution_mode || 'interactive',
      // Prefer request value, then environment template, finally official default template.
      e2b_sandbox_template:
        e2b_sandbox_template || process.env.E2B_SANDBOX_TEMPLATE || 'code-interpreter',
      allowed_libraries: allowed_libraries || [
        'numpy', 'pandas', 'scipy', 'statsmodels', 
        'scikit-learn', 'xgboost', 'lightgbm',
        'matplotlib', 'seaborn', 'plotly', 'bokeh',
        'nltk', 'spacy', 'textblob', 'gensim',
        'openpyxl', 'pyarrow', 'fastparquet', 'h5py',
        'requests', 'beautifulsoup4', 'networkx', 'sympy', 'yfinance', 'faker'
      ],
      conversation_starters: conversation_starters || [],
      tools: tools || [],
      tool_resources: tool_resources || {},
      append_current_datetime: append_current_datetime !== undefined ? append_current_datetime : false,
      data_sources: data_sources || [], // ✨ Save data_sources
      // Access control defaults (to be refined by collaborators)
      is_public: false,
      access_level: 0,
      metadata: {
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
        author: req.user.id,
        role: req.user.role,
        endpoint: EModelEndpoint.e2bAssistants,
        ...(group !== undefined && req.user.role === SystemRoles.ADMIN
          ? { group: group || '' }
          : {}),
      },
    };

    const assistant = await createE2BAssistantDoc(assistantData);

    logger.info(`[E2B Assistant] Created assistant: ${assistant.id}`);
    logger.info(`[E2B Assistant] Assistant data: name=${assistant.name}, description=${assistant.description}, prompt=${assistant.prompt?.substring(0, 50)}...`);
    
    // DEBUG: Ensure response is safe JSON and log it
    const responseData = assistant.toObject ? assistant.toObject() : assistant;
    
    // Map prompt to instructions for frontend
    responseData.instructions = responseData.prompt;
    
    // Ensure all frontend fields are included
    if (!responseData.conversation_starters) {
      responseData.conversation_starters = [];
    }
    if (responseData.append_current_datetime === undefined) {
      responseData.append_current_datetime = false;
    }
    if (!responseData.tools) {
      responseData.tools = [];
    }
    if (!responseData.tool_resources) {
      responseData.tool_resources = {};
    }
    
    // Populate code_files
    await populateCodeFiles(assistant, responseData);
    
    let safeData;
    try {
      // Remove potential circular refs or Map objects by stringifying
      safeData = JSON.parse(JSON.stringify(responseData));
    } catch (e) {
      logger.error('[E2B Assistant] JSON serialization failed', e);
      // Fallback to simple object
      safeData = { 
        id: assistant.id, 
        name: assistant.name,
        description: assistant.description,
        instructions: assistant.prompt,
        error: 'Serialization failed but created' 
      };
    }
    
    logger.info(`[E2B Assistant] Sending response: ${JSON.stringify(safeData).substring(0, 500)}...`);
    
    res.status(201).json(safeData);
  } catch (error) {
    logger.error('[E2B Assistant] Error creating assistant:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Lists assistants accessible to the user.
 */
const listAssistants = async (req, res) => {
  try {
    const assistants = await getE2BAssistantDocs({});

    const visibleAssistants = assistants.filter((assistant) =>
      canAccessAssistant({
        assistant,
        userId: req.user.id,
        userRole: req.user.role,
        userGroups: req.user.groups || [],
      }),
    );
    
    // Map prompt to instructions for frontend compatibility
    const mappedAssistants = visibleAssistants.map((assistant) => {
      const metadata = buildVisibilityMetadata(assistant);
      const mapped = {
        ...(assistant.toObject ? assistant.toObject() : assistant),
        instructions: assistant.prompt,
        metadata,
      };
      
      // Ensure all frontend fields exist
      if (!mapped.conversation_starters) {
        mapped.conversation_starters = [];
      }
      if (mapped.append_current_datetime === undefined) {
        mapped.append_current_datetime = false;
      }
      if (!mapped.tools) {
        mapped.tools = [];
      }
      if (!mapped.tool_resources) {
        mapped.tool_resources = {};
      }
      if (!mapped.data_sources) {
        mapped.data_sources = []; // ✨ Ensure data_sources exists
      }
      
      return mapped;
    });
    
    // Return in the same format as OpenAI/Azure Assistants
    // Frontend expects { data: [...] }
    res.json({ data: mappedAssistants });
  } catch (error) {
    logger.error('[E2B Assistant] Error listing assistants:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Gets a specific assistant.
 */
const getAssistant = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    
    const assistants = await getE2BAssistantDocs({ id: assistant_id });
    
    if (!assistants || assistants.length === 0) {
      return res.status(404).json({ error: 'Assistant not found' });
    }
    
    const assistant = assistants[0];
    
    if (
      !canAccessAssistant({
        assistant,
        userId: req.user.id,
        userRole: req.user.role,
        userGroups: req.user.groups || [],
      })
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Map prompt back to instructions for frontend compatibility
    const assistantObj = assistant.toObject ? assistant.toObject() : assistant;
    const assistantResponse = {
      ...assistantObj,
      instructions: assistantObj.prompt,
      metadata: buildVisibilityMetadata(assistantObj),
    };
    
    // Ensure all frontend fields exist
    if (!assistantResponse.conversation_starters) {
      assistantResponse.conversation_starters = [];
    }
    if (assistantResponse.append_current_datetime === undefined) {
      assistantResponse.append_current_datetime = false;
    }
    if (!assistantResponse.tools) {
      assistantResponse.tools = [];
    }
    if (!assistantResponse.tool_resources) {
      assistantResponse.tool_resources = {};
    }
    if (!assistantResponse.data_sources) {
      assistantResponse.data_sources = []; // ✨ Ensure data_sources exists
    }
    
    // Populate code_files
    await populateCodeFiles(assistantObj, assistantResponse);
    
    res.json(assistantResponse);
  } catch (error) {
    logger.error('[E2B Assistant] Error getting assistant:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Updates an assistant.
 */
const updateAssistant = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    const updateData = { ...req.body };
    
    logger.debug(`[E2B Assistant] Updating assistant ${assistant_id}. Payload keys: ${Object.keys(updateData).join(', ')}`);
    if (updateData.data_sources) {
      logger.info(`[E2B Assistant] Received data_sources for update: ${updateData.data_sources.length} items`);
    }
    
    // Remove immutable fields
    delete updateData.id;
    delete updateData.author;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // Map instructions to prompt if present
    if (updateData.instructions) {
      updateData.prompt = updateData.instructions;
      delete updateData.instructions;
    }

    const group = updateData.group;
    delete updateData.group;
    
    // Explicitly handle all updatable fields
    const fieldsToUpdate = {};
    
    if (updateData.name !== undefined) fieldsToUpdate.name = updateData.name;
    if (updateData.description !== undefined) fieldsToUpdate.description = updateData.description;
    if (updateData.prompt !== undefined) fieldsToUpdate.prompt = updateData.prompt;
    if (updateData.model !== undefined) fieldsToUpdate.model = updateData.model;
    if (updateData.conversation_starters !== undefined) fieldsToUpdate.conversation_starters = updateData.conversation_starters;
    if (updateData.append_current_datetime !== undefined) fieldsToUpdate.append_current_datetime = updateData.append_current_datetime;
    if (updateData.tools !== undefined) fieldsToUpdate.tools = updateData.tools;
    if (updateData.tool_resources !== undefined) fieldsToUpdate.tool_resources = updateData.tool_resources;
    if (updateData.file_ids !== undefined) fieldsToUpdate.file_ids = updateData.file_ids;
    if (updateData.avatar !== undefined) fieldsToUpdate.avatar = updateData.avatar;
    if (updateData.e2b_config !== undefined) fieldsToUpdate.e2b_config = updateData.e2b_config;
    if (updateData.allowed_libraries !== undefined) fieldsToUpdate.allowed_libraries = updateData.allowed_libraries;
    if (updateData.code_execution_mode !== undefined) fieldsToUpdate.code_execution_mode = updateData.code_execution_mode;
    if (updateData.env_vars !== undefined) fieldsToUpdate.env_vars = updateData.env_vars;
    if (updateData.has_internet_access !== undefined) fieldsToUpdate.has_internet_access = updateData.has_internet_access;
    if (updateData.is_persistent !== undefined) fieldsToUpdate.is_persistent = updateData.is_persistent;
    if (updateData.data_sources !== undefined) fieldsToUpdate.data_sources = updateData.data_sources; // ✨ Add this!
    
    // Validate ownership before update
    const assistants = await getE2BAssistantDocs({ id: assistant_id });
    if (!assistants || assistants.length === 0) {
        return res.status(404).json({ error: 'Assistant not found' });
    }
    if (req.user.role !== SystemRoles.ADMIN && assistants[0].author.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const currentAssistant = assistants[0];
    const existingMetadata = buildVisibilityMetadata(currentAssistant);
    const incomingMetadata =
      updateData.metadata && typeof updateData.metadata === 'object' ? updateData.metadata : {};

    const mergedMetadata = {
      ...existingMetadata,
      ...incomingMetadata,
      author: existingMetadata.author || req.user.id,
      role: existingMetadata.role || req.user.role,
      endpoint: EModelEndpoint.e2bAssistants,
    };

    if (group !== undefined && req.user.role === SystemRoles.ADMIN) {
      mergedMetadata.group = group && typeof group === 'object' ? (group.value ?? '') : (group || '');
    } else if (req.user.role !== SystemRoles.ADMIN && existingMetadata.group !== undefined) {
      mergedMetadata.group = existingMetadata.group;
    }

    fieldsToUpdate.metadata = mergedMetadata;

    const assistant = await updateE2BAssistantDoc(
      { id: assistant_id },
      fieldsToUpdate
    );
    
    // DEBUG: Immediate verification read
    const verifyDoc = await getE2BAssistantDocs({ id: assistant_id });
    if (verifyDoc && verifyDoc[0]) {
        logger.info(`[E2B Assistant] VERIFICATION READ: data_sources length = ${verifyDoc[0].data_sources?.length || 0}`);
        logger.info(`[E2B Assistant] VERIFICATION READ Keys: ${Object.keys(verifyDoc[0]).join(', ')}`);
        
        // 如果这里读不到，说明数据库里真没有。可能原因：
        // 1. Schema 没生效（虽然编译了，但加载的还是旧的？）
        // 2. Mongoose 过滤了字段
    }

    // Convert to object if it's a mongoose document (safety first)
    const assistantObj = assistant.toObject ? assistant.toObject() : assistant;

    // Map prompt to instructions for frontend compatibility
    const assistantResponse = {
      ...assistantObj,
      instructions: assistantObj.prompt,
      metadata: buildVisibilityMetadata(assistantObj),
    };
    
    // Ensure all frontend fields exist
    if (!assistantResponse.conversation_starters) {
      assistantResponse.conversation_starters = [];
    }
    if (assistantResponse.append_current_datetime === undefined) {
      assistantResponse.append_current_datetime = false;
    }
    if (!assistantResponse.tools) {
      assistantResponse.tools = [];
    }
    if (!assistantResponse.tool_resources) {
      assistantResponse.tool_resources = {};
    }
    if (!assistantResponse.data_sources) {
      assistantResponse.data_sources = [];
    }
    
    // Populate code_files
    await populateCodeFiles(assistantObj, assistantResponse);
    
    res.json(assistantResponse);
  } catch (error) {
    logger.error('[E2B Assistant] Error updating assistant:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Deletes an assistant.
 */
const deleteAssistant = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    
    // Validate ownership
    const assistants = await getE2BAssistantDocs({ id: assistant_id });
    if (!assistants || assistants.length === 0) {
        return res.status(404).json({ error: 'Assistant not found' });
    }
    if (req.user.role !== SystemRoles.ADMIN && assistants[0].author.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
    }

    await deleteE2BAssistantDoc({ id: assistant_id });
    
    res.json({ message: 'Assistant deleted successfully' });
  } catch (error) {
    logger.error('[E2B Assistant] Error deleting assistant:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Chat endpoint with SSE streaming.
 */
const chat = async (req, res) => {
  try {
    const assistant_id = req.params.assistant_id || req.body.assistant_id;
    const { text, conversationId, parentMessageId, files, messageId } = req.body;
    
    logger.info(`[E2B Chat] ⭐ Chat function started - assistant=${assistant_id}, conversation=${conversationId}`);
    
    if (!assistant_id) {
      return res.status(400).json({ error: 'Assistant ID is required' });
    }
    
    logger.info(`[E2B Assistant] Chat request: assistant=${assistant_id}, conversation=${conversationId}`);
    if (files && files.length > 0) {
      logger.info(`[E2B Assistant] Request contains ${files.length} files`);
    }
    
    const assistants = await getE2BAssistantDocs({ id: assistant_id });
    if (!assistants || assistants.length === 0) {
      return res.status(404).json({ error: 'Assistant not found' });
    }
    const assistant = assistants[0];

    if (
      !canAccessAssistant({
        assistant,
        userId: req.user.id,
        userRole: req.user.role,
        userGroups: req.user.groups || [],
      })
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Generate IDs (use UUID for conversationId to pass validation)
    // CRITICAL: Use client-provided messageId if available to match frontend state
    const userMessageId = messageId || uuidv4();
    // CRITICAL: Use userMessageId + '_' for response to match frontend's createdHandler logic
    const responseMessageId = userMessageId + '_'; 
    const finalConversationId = conversationId || uuidv4();

    // Create user message
    const userMessage = {
      messageId: userMessageId,
      conversationId: finalConversationId,
      parentMessageId: parentMessageId || '00000000-0000-0000-0000-000000000000',
      text,
      isCreatedByUser: true,
      sender: 'User',
      user: req.user.id,
      files: files || [], // CRITICAL: Include files so they're saved to DB and visible in frontend
    };

    // Create initial response message for sync event (matching Azure format)
    const initialResponseMessage = {
      messageId: responseMessageId,
      conversationId: finalConversationId,
      parentMessageId: userMessageId,
      sender: assistant.name || 'E2B Agent',
      text: '\u200B', // ✨ 使用零宽空格确保助手名和 Loading 正常显示
      content: [], // ✨ 恢复为空数组
      isCreatedByUser: false,
      user: req.user.id,
      endpoint: 'e2bAssistants',
      model: assistant.model || 'gpt-4o',
    };

    // Send sync event (matching Azure Assistant implementation)
    sendEvent(res, {
      sync: true,
      conversationId: finalConversationId,
      requestMessage: userMessage,
      responseMessage: initialResponseMessage,
    });
    
    // 🎯 Immediately send zero-width space TEXT event (before flush)
    // This maintains loading state while minimizing flicker
    sendEvent(res, {
      type: ContentTypes.TEXT,
      index: 0,
      [ContentTypes.TEXT]: { value: '\u200B' },
      messageId: responseMessageId,
      conversationId: finalConversationId,
    });
    
    // FLUSH: Send both events together to minimize flicker
    if (res.flush) res.flush();
    
    logger.info(`[E2B Assistant] Sent SYNC event and initial zero-width space for conversation ${finalConversationId}`);

    // CRITICAL: Save conversation FIRST (before messages)
    // This ensures conversation exists in DB so saveMessage won't fail validation
    const { saveConvo } = require('~/models/Conversation');
    await saveConvo(req, {
      conversationId: finalConversationId,
      endpoint: 'e2bAssistants',
      assistant_id,
      title: text.substring(0, 50), // Use first 50 chars as title
      model: assistant.model || 'gpt-4o',
    }, {
      context: 'api/server/routes/e2bAssistants/controller.js - save conversation BEFORE messages'
    });

    // Save user message to database
    await saveMessage(req, userMessage, { 
      context: 'api/server/routes/e2bAssistants/controller.js - user message' 
    });

    // Initialize OpenAI client
    const { openai } = await getOpenAIClient({ req, res });

    // Phase1/2 config: token budget + history compaction strategy.
    const e2bEndpointConfig =
      req.config?.endpoints?.[EModelEndpoint.e2bAssistants] ?? req.config?.endpoints?.e2bAssistants ?? {};
    const contextManagementConfig = e2bEndpointConfig?.contextManagement ?? {};

    // Load conversation history if this is a continuing conversation
    let history = [];
    // DIAGNOSTIC: Log whether conversationId was provided by frontend or generated
    logger.info(`[E2B Assistant] conversationId from frontend: ${conversationId || '(none - new conversation)'}, finalConversationId: ${finalConversationId}, isNewConversation: ${!conversationId}`);
    if (conversationId) {
      try {
        // Always filter by user to prevent cross-user contamination
        const dbMessages = await getMessages({ conversationId, user: req.user.id });
        logger.info(`[E2B Assistant] getMessages(${conversationId}) returned ${dbMessages.length} raw messages (user=${req.user.id})`);
        
        const historyBuildResult = await buildE2BHistory({
          dbMessages,
          currentUserMessageId: userMessageId,
          model: assistant.model || 'gpt-4o',
          config: {
            messageWindowSize: Number(contextManagementConfig.messageWindowSize) || 10,
            historyMaxTokens: Number(contextManagementConfig.historyMaxTokens) || 12000,
            summarySnippetChars: Number(contextManagementConfig.summarySnippetChars) || 220,
            summaryMaxUserItems: Number(contextManagementConfig.summaryMaxUserItems) || 6,
            summaryMaxAssistantItems: Number(contextManagementConfig.summaryMaxAssistantItems) || 5,
          },
        });
        history = historyBuildResult.history;

        const userInputTokens = await countTokens(text || '', assistant.model || 'gpt-4o');
        logger.info(
          `[E2B Assistant][ContextMetrics] rawMessages=${historyBuildResult.stats.rawMessages}, outputMessages=${historyBuildResult.stats.outputMessages}, rawTokens=${historyBuildResult.stats.rawTokens}, historyTokens=${historyBuildResult.stats.outputTokens}, userInputTokens=${userInputTokens}, compressed=${historyBuildResult.stats.compressed}, summaryInserted=${historyBuildResult.stats.summaryInserted}`,
        );
        
        // Check if files were uploaded in this conversation (either now or previously)
        let conversationFiles = files || [];
        
        // If no new files but history exists, check if files were mentioned in first message
        if (conversationFiles.length === 0 && history.length > 0) {
          // Look for file references in the conversation
          const firstMessage = dbMessages.find(msg => msg.isCreatedByUser);
          if (firstMessage && firstMessage.files && firstMessage.files.length > 0) {
            conversationFiles = firstMessage.files;
          }
        }
        
        // If this is a continuation and files exist in the conversation, remind the model
        if (history.length > 0 && conversationFiles.length > 0) {
          // IMPORTANT: Only use clean filename, NEVER expose file_id to prevent LLM confusion
          const fileNames = conversationFiles.map(f => f.filename || f.filepath?.split('/').pop()).filter(Boolean);
          if (fileNames.length > 0) {
            const filePathExamples = fileNames.map(name => `  • ${name} → use: /home/user/${name}`).join('\n');
            const fileContext = `## REMINDER: Available Files\nFiles uploaded in this conversation:\n${filePathExamples}\n\n⚠️ IMPORTANT: Use complete paths like /home/user/${fileNames[0]} - do NOT add UUID prefixes!`;
            // Insert context at the beginning as system-level reminder
            history.unshift({ role: 'system', content: fileContext });
          }
        }
        
        logger.info(`[E2B Assistant] Loaded ${history.length} historical messages for conversation ${conversationId}`);
        
        // Log a sample of history to debug potential cross-conversation pollution
        if (history.length > 0) {
          logger.info(`[E2B Assistant] History sample (first 2 messages):`);
          history.slice(0, 2).forEach((msg, idx) => {
            const preview = msg.content.substring(0, 100).replace(/\n/g, ' ');
            logger.info(`[E2B Assistant]   ${idx + 1}. ${msg.role}: "${preview}..."`);
          });
          
          // Check for image paths in history
          const historyText = history.map(h => h.content).join(' ');
          const imageMatches = historyText.match(/\/images\/[^\s)]+/g) || [];
          if (imageMatches.length > 0) {
            logger.info(`[E2B Assistant] Found ${imageMatches.length} image paths in history:`);
            imageMatches.slice(0, 5).forEach(img => logger.info(`[E2B Assistant]   - ${img}`));
          }
        }
      } catch (error) {
        logger.warn(`[E2B Assistant] Failed to load history: ${error.message}`);
      }
    }

    // 📝 Track content parts (TOOL_CALL + TEXT) - MUST declare before agent
    // Initialize with zero-width space TEXT at index=0 to avoid sparse array
    const contentParts = [
      { type: 'text', text: { value: '\u200B' } }  // Placeholder at index=0
    ];
    let currentTextIndex = 0;  // TEXT part already exists at index=0
    let contentIndex = 1;  // Next index starts from 1
    
    // 📝 Helper: Start a new TEXT part (called when text output resumes after tool call)
    const startNewTextPart = () => {
      currentTextIndex = contentIndex++;
      contentParts[currentTextIndex] = {
        type: 'text',
        text: { value: '' }
      };
      logger.info(`[E2B Assistant] Started new TEXT part at index ${currentTextIndex}`);
      return currentTextIndex;
    };

    const agent = new E2BDataAnalystAgent({
      req,
      res,
      openai,
      userId: req.user.id,
      conversationId: finalConversationId,
      responseMessageId,
      contentParts,  // 📝 Pass shared content array
      getContentIndex: () => contentIndex++,  // 📝 Pass index generator
      startNewTextPart,  // ✨ Pass startNewTextPart function
      assistant,
      contextConfig: contextManagementConfig,
      files,
    });

    // Accumulate full response text for final message
    let fullResponseText = '';
    let tokenCount = 0;
    let eventsSent = 0;
    
    // Stream callback - send incremental tokens for real-time streaming
    const onToken = (token) => {
      fullResponseText += token;
      tokenCount++;
      eventsSent++;
      
      // 📝 Update TEXT content at index=0 (already initialized)
      // Replace zero-width space with first token, then append subsequent tokens
      if (contentParts[currentTextIndex].text.value === '\u200B') {
        // First token: replace placeholder
        contentParts[currentTextIndex].text.value = token;
      } else {
        // Subsequent tokens: append
        contentParts[currentTextIndex].text.value += token;
      }
      
      // ✅ 添加详细调试日志
      if (eventsSent <= 5 || eventsSent % 20 === 0) {
        logger.info(`[E2B onToken] Event #${eventsSent}: index=${currentTextIndex}, cumulative_len=${fullResponseText.length}, latest_token="${token.substring(0, 30).replace(/\n/g, '\\n')}..."`);
      }
      
      // ✅ Send in OpenAI Assistants format (triggers contentHandler for streaming)
      const eventData = {
        type: 'text',
        index: currentTextIndex,  // ✨ 使用正确的 index，支持交错显示
        text: {
          value: contentParts[currentTextIndex]?.text?.value || fullResponseText
        },
        messageId: responseMessageId,
        conversationId: finalConversationId,
        // E2B doesn't use thread_id (no OpenAI threads), frontend can handle undefined
      };
      
      try {
        sendEvent(res, eventData);
        // FLUSH: Critical for real-time streaming - flush immediately for each token
        if (res.flush) res.flush();
      } catch (error) {
        logger.error(`[E2B onToken] Failed to send event: ${error.message}`);
      }
    };
    
    logger.info(`[E2B Assistant] onToken callback created for messageId=${responseMessageId}`);

    logger.info(`[E2B Assistant] Starting agent with streaming enabled`);

    // Run the agent with history and streaming callback
    const result = await agent.processMessage(text, history, onToken);
    
    // CRITICAL: Ensure final batch is flushed
    if (res.flush) res.flush();
    
    // CRITICAL: Use result.text which has image paths replaced, not fullResponseText!
    const finalText = result.text;
    
    logger.info(`[E2B Assistant] Agent finished. Accumulated: ${fullResponseText.length} chars, Final (with image paths): ${result.text?.length} chars`);
    logger.info(`[E2B Assistant] Final text preview: ${finalText?.substring(0, 200)}...`);
    
    // 📝 Replace image paths in each TEXT part
    // NOTE: Each contentPart already has correct text from streaming.
    // We only need to ensure image paths are correct (already handled by agent)
    // DO NOT overwrite with finalText (which is cumulative)!
    
    logger.info(`[E2B Assistant] Final content parts: ${contentParts.length} (${contentParts.map(p => p.type).join(', ')})`);
    
    // Create response message
    const responseMessage = {
      messageId: responseMessageId,
      conversationId: finalConversationId,
      parentMessageId: userMessageId,
      sender: assistant.name || 'E2B Agent',
      text: finalText,
      content: contentParts,  // 📝 Include content array!
      isCreatedByUser: false,
      error: false,
      unfinished: false,
      user: req.user.id,
      endpoint: 'e2bAssistants',
      model: assistant.model || 'gpt-4o',
    };

    // Save response message to database
    await saveMessage(req, responseMessage, { 
      context: 'api/server/routes/e2bAssistants/controller.js - response message' 
    });

    // Get conversation data
    let conversation = await getConvo(req.user.id, finalConversationId);
    if (!conversation) {
      conversation = {
        conversationId: finalConversationId,
        title: 'New Chat',
        endpoint: 'e2bAssistants',
        assistant_id,
      };
    }

    // Send final event (matching other endpoints' format)
    sendEvent(res, {
      final: true,
      conversation,
      title: conversation.title || 'New Chat',
      requestMessage: sanitizeMessageForTransmit(userMessage),
      responseMessage: sanitizeMessageForTransmit(responseMessage),
    });
    
    // FLUSH: Ensure final event is sent
    if (res.flush) res.flush();
    
    res.end();

  } catch (error) {
    logger.error('[E2B Assistant] Error in chat:', error);
    // If headers sent, we must stream the error
    if (res.headersSent) {
      sendEvent(res, { 
        message: {
          text: `Error: ${error.message}`,
          error: true,
        },
        error: true,
      });
      res.end();
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

/**
 * Gets documents for an assistant.
 */
const getAssistantDocuments = async (req, res) => {
  try {
    // E2B assistants currently don't store documents in the same way as OpenAI
    // Return empty list for now to satisfy frontend
    res.json([]);
  } catch (error) {
    logger.error('[E2B Assistant] Error getting documents:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Gets tools for an assistant.
 */
const getAssistantTools = async (req, res) => {
  try {
    // Return empty list or default tools
    res.json([]);
  } catch (error) {
    logger.error('[E2B Assistant] Error getting tools:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createAssistant,
  listAssistants,
  getAssistant,
  updateAssistant,
  deleteAssistant,
  chat,
  getAssistantDocuments,
  getAssistantTools,
};
