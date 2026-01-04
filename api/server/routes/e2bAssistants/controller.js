const { logger } = require('@librechat/data-schemas');
const { nanoid } = require('nanoid');
const { v4: uuidv4 } = require('uuid');
const { sendEvent, sanitizeMessageForTransmit } = require('@librechat/api');
const { 
  createE2BAssistantDoc, 
  getE2BAssistantDocs, 
  updateE2BAssistantDoc, 
  deleteE2BAssistantDoc 
} = require('~/models/E2BAssistant');
const E2BDataAnalystAgent = require('~/server/services/Agents/e2bAgent');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { saveMessage, getConvo, getMessages } = require('~/models');

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
      // ...other fields
    } = req.body;
    
    logger.info(`[E2B Assistant] Creating assistant: ${name}`);
    
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
        timeout_ms: 300000,
        max_memory_mb: 2048,
        max_cpu_percent: 80,
      },
      code_execution_mode: code_execution_mode || 'interactive',
      // Use the specific ID provided in user config or default to a known template ID
      e2b_sandbox_template: e2b_sandbox_template || 'xed696qfsyzpaei3ulh5',
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
      // Access control defaults (to be refined by collaborators)
      is_public: false,
      access_level: 0,
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
    const query = {};
    
    // TODO: Add collaboration/public access logic here
    // For now, only show user's own assistants
    query.author = req.user.id;
    
    const assistants = await getE2BAssistantDocs(query);
    
    // Map prompt to instructions for frontend compatibility
    const mappedAssistants = assistants.map(assistant => {
      const mapped = {
        ...assistant,
        instructions: assistant.prompt,
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
    
    // TODO: Add permission check
    // We fetch by ID, but we should verify the user has access if it's private
    const assistants = await getE2BAssistantDocs({ id: assistant_id });
    
    if (!assistants || assistants.length === 0) {
      return res.status(404).json({ error: 'Assistant not found' });
    }
    
    const assistant = assistants[0];
    
    // Simple ownership check for now
    if (assistant.author.toString() !== req.user.id && !assistant.is_public) {
       // Allow if admin? Skipping for MVP
       // return res.status(403).json({ error: 'Access denied' });
    }
    
    // Map prompt back to instructions for frontend compatibility
    const assistantResponse = {
      ...assistant,
      instructions: assistant.prompt,
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
    if (updateData.metadata !== undefined) fieldsToUpdate.metadata = updateData.metadata;
    
    // Validate ownership before update
    const assistants = await getE2BAssistantDocs({ id: assistant_id });
    if (!assistants || assistants.length === 0) {
        return res.status(404).json({ error: 'Assistant not found' });
    }
    if (assistants[0].author.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const assistant = await updateE2BAssistantDoc(
      { id: assistant_id },
      fieldsToUpdate
    );
    
    // Map prompt to instructions for frontend compatibility
    const assistantResponse = {
      ...assistant,
      instructions: assistant.prompt,
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
    if (assistants[0].author.toString() !== req.user.id) {
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
    const { text, conversationId, parentMessageId, files } = req.body;
    
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

    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Generate IDs (use UUID for conversationId to pass validation)
    const userMessageId = uuidv4();
    const responseMessageId = uuidv4();
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
    };

    // Send created event (like other endpoints)
    sendEvent(res, { 
      message: userMessage, 
      created: true 
    });

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

    // Load conversation history if this is a continuing conversation
    let history = [];
    if (conversationId) {
      try {
        const dbMessages = await getMessages({ conversationId });
        // Convert database messages to OpenAI format
        history = dbMessages
          .filter(msg => msg.messageId !== userMessageId) // Exclude current message
          .map(msg => ({
            role: msg.isCreatedByUser ? 'user' : 'assistant',
            content: msg.text || ''
          }));
        logger.info(`[E2B Assistant] Loaded ${history.length} historical messages`);
      } catch (error) {
        logger.warn(`[E2B Assistant] Failed to load history: ${error.message}`);
      }
    }

    const agent = new E2BDataAnalystAgent({
      req,
      res,
      openai,
      userId: req.user.id,
      conversationId: finalConversationId,
      assistant,
      files,
    });

    // Run the agent with history
    const result = await agent.processMessage(text, history);
    
    logger.info(`[E2B Assistant] Agent finished. Final text length: ${result.text?.length}`);
    
    // Create response message
    const responseMessage = {
      messageId: responseMessageId,
      conversationId: finalConversationId,
      parentMessageId: userMessageId,
      sender: assistant.name || 'E2B Agent',
      text: result.text,
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
