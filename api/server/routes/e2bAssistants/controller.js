const { logger } = require('@librechat/data-schemas');
const { nanoid } = require('nanoid');
const { sendEvent, sanitizeMessageForTransmit } = require('@librechat/api');
const { 
  createE2BAssistantDoc, 
  getE2BAssistantDocs, 
  updateE2BAssistantDoc, 
  deleteE2BAssistantDoc 
} = require('~/models/E2BAssistant');
const E2BDataAnalystAgent = require('~/server/services/Agents/e2bAgent');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { saveMessage, getConvo } = require('~/models');

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
      // Access control defaults (to be refined by collaborators)
      is_public: false,
      access_level: 0,
    };

    const assistant = await createE2BAssistantDoc(assistantData);

    logger.info(`[E2B Assistant] Created assistant: ${assistant.id}`);
    
    // DEBUG: Ensure response is safe JSON and log it
    const responseData = assistant.toObject ? assistant.toObject() : assistant;
    
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
    
    // Return in the same format as OpenAI/Azure Assistants
    // Frontend expects { data: [...] }
    res.json({ data: assistants });
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
    
    res.json(assistant);
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

    if (updateData.instructions) {
      updateData.prompt = updateData.instructions;
    }
    
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
      updateData
    );
    
    res.json(assistant);
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

    // Generate IDs
    const userMessageId = nanoid();
    const responseMessageId = nanoid();
    const finalConversationId = conversationId || nanoid();

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

    // Save user message to database
    await saveMessage(req, userMessage, { 
      context: 'api/server/routes/e2bAssistants/controller.js - user message' 
    });

    // Initialize OpenAI client
    const { openai } = await getOpenAIClient({ req, res });

    const agent = new E2BDataAnalystAgent({
      req,
      res,
      openai,
      userId: req.user.id,
      conversationId: finalConversationId,
      assistant,
      files,
    });

    // Run the agent
    const result = await agent.processMessage(text);
    
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
