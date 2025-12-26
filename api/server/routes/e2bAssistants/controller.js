const { logger } = require('@librechat/data-schemas');
const { nanoid } = require('nanoid');
const { 
  createE2BAssistantDoc, 
  getE2BAssistantDocs, 
  updateE2BAssistantDoc, 
  deleteE2BAssistantDoc 
} = require('~/models/E2BAssistant');

/**
 * Creates an E2B Assistant.
 * 
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
const createAssistant = async (req, res) => {
  try {
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
      // ...other fields
    } = req.body;
    
    logger.info(`[E2B Assistant] Creating assistant: ${name}`);
    
    // Default values if not provided
    const assistantData = {
      id: nanoid(),
      name,
      description,
      instructions,
      author: req.user.id,
      model: model || 'gpt-4o', // Default model
      model_parameters: model_parameters || {},
      e2b_config: e2b_config || {
        timeout_ms: 300000,
        max_memory_mb: 2048,
        max_cpu_percent: 80,
      },
      code_execution_mode: code_execution_mode || 'interactive',
      e2b_sandbox_template: e2b_sandbox_template || 'python3-data-analysis',
      allowed_libraries: allowed_libraries || [
        'pandas', 'numpy', 'matplotlib', 'seaborn', 'scikit-learn', 'xgboost'
      ],
      conversation_starters: conversation_starters || [],
      // Access control defaults (to be refined by collaborators)
      is_public: false,
      access_level: 0,
    };

    const assistant = await createE2BAssistantDoc(assistantData);

    logger.info(`[E2B Assistant] Created assistant: ${assistant.id}`);
    res.status(201).json(assistant);
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
    res.json(assistants);
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
 * Chat endpoint.
 */
const chat = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    const { text, conversationId, parentMessageId } = req.body;
    
    logger.info(`[E2B Assistant] Chat request: assistant=${assistant_id}, conversation=${conversationId}`);
    
    const assistants = await getE2BAssistantDocs({ id: assistant_id });
    if (!assistants || assistants.length === 0) {
      return res.status(404).json({ error: 'Assistant not found' });
    }
    const assistant = assistants[0];

    // TODO: Implement actual Agent logic here
    // For now, return a mock response to verify routing
    
    // Use setTimeout to simulate async processing if needed, or just return directly.
    // Ideally this should stream the response, but for MVP standard JSON is easier to debug first.
    // LibreChat usually expects streaming or specific message format.
    
    // Assuming simple JSON response for now (or text/event-stream if we implement streaming)
    // We'll mimic a simple message object
    
    const responseMessage = {
      messageId: nanoid(),
      conversationId: conversationId || nanoid(),
      parentMessageId,
      sender: 'E2B Agent',
      text: `[Mock Response] I am ${assistant.name}. I received your message: "${text}".\n\nMy sandbox template is: ${assistant.e2b_sandbox_template}.`,
      isCreatedByUser: false,
      error: false,
    };

    res.json(responseMessage);

  } catch (error) {
    logger.error('[E2B Assistant] Error in chat:', error);
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
};
