const { ContentTypes } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Meta-prompt template for refining agent instructions
 * @param {string} currentInstructions - Current system prompt
 * @param {string} refinementRequest - User's refinement request
 * @returns {string} The meta-prompt for the LLM
 */
function createRefinementMetaPrompt(currentInstructions, refinementRequest) {
  return `You are a prompt engineering assistant. The user has a system prompt for an AI agent and wants to refine it.

Current System Prompt:
${currentInstructions}

User's Refinement Request:
${refinementRequest}

Please provide an improved version of the system prompt that incorporates the user's feedback. Maintain the core functionality while addressing the requested changes.

IMPORTANT: Return ONLY the refined system prompt text, nothing else. Do not include any explanations, comments, or additional text.`;
}

/**
 * Extracts the refined instructions from the LLM response
 * @param {Object} response - LLM response object
 * @returns {string} Extracted refined instructions
 */
function extractRefinedInstructions(response) {
  if (!response) {
    throw new Error('Empty response from LLM');
  }

  // Handle different response formats
  if (typeof response === 'string') {
    return response.trim();
  }

  // Handle streaming completion
  if (response.text) {
    return response.text.trim();
  }

  // Handle chat completion format
  if (response.choices && response.choices.length > 0) {
    const message = response.choices[0].message;
    if (message && message.content) {
      return message.content.trim();
    }
  }

  // Handle content array format
  if (response.content && Array.isArray(response.content)) {
    const textContent = response.content.find((item) => item.type === ContentTypes.TEXT);
    if (textContent && textContent.text) {
      return textContent.text.trim();
    }
  }

  // Handle direct content string
  if (response.content && typeof response.content === 'string') {
    return response.content.trim();
  }

  logger.error('[PromptRefinementService] Unexpected response format:', response);
  throw new Error('Could not extract refined instructions from LLM response');
}

/**
 * Validates refinement input parameters
 * @param {string} currentInstructions - Current system prompt
 * @param {string} refinementRequest - User's refinement request
 * @throws {Error} If validation fails
 */
function validateRefinementInput(currentInstructions, refinementRequest) {
  if (!currentInstructions || typeof currentInstructions !== 'string') {
    throw new Error('current_instructions is required and must be a string');
  }

  if (!refinementRequest || typeof refinementRequest !== 'string') {
    throw new Error('refinement_request is required and must be a string');
  }

  if (currentInstructions.length > 10000) {
    throw new Error('current_instructions exceeds maximum length of 10,000 characters');
  }

  if (refinementRequest.length > 1000) {
    throw new Error('refinement_request exceeds maximum length of 1,000 characters');
  }

  if (currentInstructions.trim().length === 0) {
    throw new Error('current_instructions cannot be empty');
  }

  if (refinementRequest.trim().length === 0) {
    throw new Error('refinement_request cannot be empty');
  }
}

/**
 * Sanitizes user input to prevent prompt injection
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeInput(text) {
  // Remove potential prompt injection patterns
  return text
    .replace(/system:/gi, 'system-')
    .replace(/assistant:/gi, 'assistant-')
    .replace(/user:/gi, 'user-')
    .trim();
}

module.exports = {
  createRefinementMetaPrompt,
  extractRefinedInstructions,
  validateRefinementInput,
  sanitizeInput,
};