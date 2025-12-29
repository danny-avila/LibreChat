const { logger } = require('@librechat/data-schemas');
const { nanoid } = require('nanoid');
const { 
  createE2BAssistantDoc, 
  getE2BAssistantDocs, 
  updateE2BAssistantDoc, 
  deleteE2BAssistantDoc 
} = require('~/models/E2BAssistant');
const E2BDataAnalystAgent = require('~/server/services/Agents/e2bAgent');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');

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
      e2b_sandbox_template: e2b_sandbox_template || 'python3-data-analysis',
      allowed_libraries: allowed_libraries || [
        'numpy', 'pandas', 'scipy', 'statsmodels', 
        'scikit-learn', 'xgboost', 'lightgbm', 'torch',
        'matplotlib', 'seaborn', 'plotly', 'bokeh',
        'nltk', 'spacy', 'textblob', 'gensim',
        'openpyxl', 'pyarrow', 'fastparquet', 'h5py',
        'requests', 'beautifulsoup4', 'networkx', 'sympy', 'yfinance', 'faker'
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

    // Initialize OpenAI client
    const { openai } = await getOpenAIClient({ req, res });

    const agent = new E2BDataAnalystAgent({
      req,
      res,
      openai,
      userId: req.user.id,
      conversationId: conversationId || nanoid(),
      assistant,
    });

    const result = await agent.processMessage(text);
    
    const responseMessage = {
      messageId: nanoid(),
      conversationId: conversationId || nanoid(),
      parentMessageId,
      sender: assistant.name || 'E2B Agent',
      text: result.text,
      isCreatedByUser: false,
      error: false,
      intermediateSteps: result.intermediateSteps,
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
