const express = require('express');
const { z } = require('zod');
const OpenAI = require('openai');
const { ProxyAgent } = require('undici');
const { getAgent } = require('~/models/Agent');
const { logger } = require('~/config');
const { getCustomEndpointConfig } = require('@librechat/api');
const { getUserKeyValues, getUserKeyExpiry } = require('~/models');
const { EModelEndpoint, ErrorTypes, envVarRegex, extractEnvVariable } = require('librechat-data-provider');
const {
  createRefinementMetaPrompt,
  extractRefinedInstructions,
  validateRefinementInput,
  sanitizeInput,
} = require('~/server/services/PromptRefinementService');

const router = express.Router({ mergeParams: true });

/**
 * Request body validation schema
 */
const refinePromptSchema = z.object({
  current_instructions: z.string().min(1).max(10000),
  refinement_request: z.string().min(1).max(1000),
});

/**
 * Initialize OpenAI-compatible client for the agent's endpoint
 * Supports OpenAI, custom endpoints (like LM Studio), and other providers
 * @param {Object} params
 * @param {Object} params.req - Express request
 * @param {Object} params.agent - Agent configuration
 * @returns {Promise<OpenAI>}
 */
async function initializeClientForAgent({ req, agent }) {
  const { PROXY } = process.env;
  const appConfig = req.config;
  const endpoint = agent.provider || agent.endpoint || EModelEndpoint.openAI;

  let apiKey;
  let baseURL;

  // Check if this is a custom endpoint (like LM Studio)
  const customEndpointConfig = getCustomEndpointConfig({
    endpoint,
    appConfig,
  });

  if (customEndpointConfig) {
    // Custom endpoint configuration
    const CUSTOM_API_KEY = extractEnvVariable(customEndpointConfig.apiKey || '');
    const CUSTOM_BASE_URL = extractEnvVariable(customEndpointConfig.baseURL || '');

    // Check if API key is required (not if it matches the env var regex, meaning it's not set)
    const apiKeyRequired = !CUSTOM_API_KEY.match(envVarRegex);
    const baseURLRequired = !CUSTOM_BASE_URL.match(envVarRegex);

    if (apiKeyRequired) {
      // Check if user provides their own key
      const userProvidesKey = CUSTOM_API_KEY === 'user_provided';
      if (userProvidesKey) {
        const userValues = await getUserKeyValues({ 
          userId: req.user.id, 
          name: endpoint 
        });
        apiKey = userValues?.apiKey;
        
        if (!apiKey) {
          throw new Error(
            JSON.stringify({
              type: ErrorTypes.NO_USER_KEY,
              message: `API key required for ${endpoint}`,
            }),
          );
        }
      } else {
        apiKey = CUSTOM_API_KEY;
      }
    } else {
      // Use a placeholder for endpoints that don't require API keys
      apiKey = 'not-needed';
    }

    if (baseURLRequired) {
      const userProvidesURL = CUSTOM_BASE_URL === 'user_provided';
      if (userProvidesURL) {
        const userValues = await getUserKeyValues({ 
          userId: req.user.id, 
          name: endpoint 
        });
        baseURL = userValues?.baseURL;
        
        if (!baseURL) {
          throw new Error(
            JSON.stringify({
              type: ErrorTypes.NO_BASE_URL,
              message: `Base URL required for ${endpoint}`,
            }),
          );
        }
      } else {
        baseURL = CUSTOM_BASE_URL;
      }
    } else {
      throw new Error(`Base URL not configured for ${endpoint}`);
    }
  } else {
    // Standard OpenAI endpoint
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_API_URL = process.env.OPENAI_API_URL;
    
    const userProvidesKey = OPENAI_API_KEY === 'user_provided';
    const userProvidesURL = OPENAI_API_URL === 'user_provided';

    let userValues = null;
    if (userProvidesKey || userProvidesURL) {
      const expiresAt = await getUserKeyExpiry({
        userId: req.user.id,
        name: EModelEndpoint.openAI,
      });
      if (expiresAt && new Date(expiresAt) < new Date()) {
        throw new Error('User API key has expired');
      }
      userValues = await getUserKeyValues({ 
        userId: req.user.id, 
        name: EModelEndpoint.openAI 
      });
    }

    apiKey = userProvidesKey ? userValues?.apiKey : OPENAI_API_KEY;
    baseURL = userProvidesURL ? userValues?.baseURL : OPENAI_API_URL;

    if (userProvidesKey && !apiKey) {
      throw new Error(
        JSON.stringify({
          type: ErrorTypes.NO_USER_KEY,
        }),
      );
    }

    if (!apiKey) {
      throw new Error('OpenAI API key not provided. Please configure it in your environment or user settings.');
    }
  }

  const opts = { apiKey };

  if (baseURL) {
    opts.baseURL = baseURL;
  }

  if (PROXY) {
    const proxyAgent = new ProxyAgent(PROXY);
    opts.fetchOptions = {
      dispatcher: proxyAgent,
    };
  }

  return new OpenAI(opts);
}

/**
 * Refines an agent's system prompt using an LLM
 * This router is mounted at /:id/refine-prompt in v1.js
 * Final route: POST /api/agents/:id/refine-prompt
 * @param {Object} req.params.id - Agent ID (from parent router)
 * @param {Object} req.body.current_instructions - Current system prompt
 * @param {Object} req.body.refinement_request - User's refinement request
 * @returns {Object} 200 - { refined_instructions: string }
 * @throws {Error} 400 - Validation error
 * @throws {Error} 403 - Permission denied
 * @throws {Error} 404 - Agent not found
 * @throws {Error} 500 - Server error
 */
router.post('/', async (req, res) => {
  try {
    const { id: agentId } = req.params;
    const userId = req.user.id;

    // Validate request body
    const validation = refinePromptSchema.safeParse(req.body);
    if (!validation.success) {
      logger.warn('[refinePrompt] Validation error:', validation.error.errors);
      return res.status(400).json({
        error: 'Invalid request body',
        details: validation.error.errors,
      });
    }

    const { current_instructions, refinement_request } = validation.data;

    // Additional validation
    try {
      validateRefinementInput(current_instructions, refinement_request);
    } catch (validationError) {
      logger.warn('[refinePrompt] Input validation failed:', validationError.message);
      return res.status(400).json({ error: validationError.message });
    }

    // Fetch the agent
    const agent = await getAgent({ id: agentId }, '-__v');
    if (!agent) {
      logger.warn(`[refinePrompt] Agent not found: ${agentId}`);
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check permissions - agent routes should already be protected by middleware
    // Additional permission checks can be added here if needed

    // Sanitize inputs to prevent prompt injection
    const sanitizedInstructions = sanitizeInput(current_instructions);
    const sanitizedRequest = sanitizeInput(refinement_request);

    // Create meta-prompt for refinement
    const metaPrompt = createRefinementMetaPrompt(sanitizedInstructions, sanitizedRequest);

    // Get model to use (prefer agent's model, fallback to gpt-3.5-turbo)
    const model = agent.model_parameters?.model || agent.model || 'gpt-3.5-turbo';
    
    logger.info(`[refinePrompt] Refining prompt for agent ${agentId} using model ${model}`);

    // Initialize client for the agent's endpoint
    let client;
    try {
      client = await initializeClientForAgent({ req, agent });
    } catch (initError) {
      logger.error('[refinePrompt] Failed to initialize client:', initError);
      return res.status(500).json({
        error: 'Failed to initialize LLM client',
        details: initError.message,
      });
    }

    // Call the LLM
    let llmResponse;
    try {
      const completion = await client.chat.completions.create({
        model: model,
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful assistant that refines AI system prompts based on user feedback.' 
          },
          { role: 'user', content: metaPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      llmResponse = completion.choices[0].message.content;
    } catch (llmError) {
      logger.error('[refinePrompt] LLM call failed:', llmError);
      return res.status(500).json({
        error: 'Failed to refine prompt',
        details: llmError.message,
      });
    }

    // Extract refined instructions from LLM response
    let refinedInstructions;
    try {
      refinedInstructions = extractRefinedInstructions(llmResponse);
    } catch (extractionError) {
      logger.error('[refinePrompt] Failed to extract refined instructions:', extractionError);
      return res.status(500).json({
        error: 'Failed to process LLM response',
        details: extractionError.message,
      });
    }

    // Validate the refined output
    if (!refinedInstructions || refinedInstructions.length === 0) {
      logger.error('[refinePrompt] Empty refined instructions');
      return res.status(500).json({ error: 'Received empty refined instructions from LLM' });
    }

    logger.info(`[refinePrompt] Successfully refined prompt for agent ${agentId}`);

    // Return the refined instructions
    return res.status(200).json({
      refined_instructions: refinedInstructions,
    });
  } catch (error) {
    logger.error('[refinePrompt] Unexpected error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
});

module.exports = router;