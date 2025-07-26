const { getPrompt } = require('~/models/Prompt');
const { canAccessResource } = require('./canAccessResource');

/**
 * Prompt ID resolver function
 * Resolves prompt ID to MongoDB ObjectId
 *
 * @param {string} promptId - Prompt ID from route parameter
 * @returns {Promise<Object|null>} Prompt document with _id field, or null if not found
 */
const resolvePromptId = async (promptId) => {
  return await getPrompt({ _id: promptId });
};

/**
 * Prompt-specific middleware factory that creates middleware to check prompt access permissions.
 * This middleware extends the generic canAccessResource to handle prompt ID resolution.
 *
 * @param {Object} options - Configuration options
 * @param {number} options.requiredPermission - The permission bit required (1=view, 2=edit, 4=delete, 8=share)
 * @param {string} [options.resourceIdParam='promptId'] - The name of the route parameter containing the prompt ID
 * @returns {Function} Express middleware function
 *
 * @example
 * // Basic usage for viewing prompts
 * router.get('/prompts/:promptId',
 *   canAccessPromptResource({ requiredPermission: 1 }),
 *   getPrompt
 * );
 *
 * @example
 * // Custom resource ID parameter and edit permission
 * router.patch('/prompts/:id',
 *   canAccessPromptResource({
 *     requiredPermission: 2,
 *     resourceIdParam: 'id'
 *   }),
 *   updatePrompt
 * );
 */
const canAccessPromptResource = (options) => {
  const { requiredPermission, resourceIdParam = 'promptId' } = options;

  if (!requiredPermission || typeof requiredPermission !== 'number') {
    throw new Error('canAccessPromptResource: requiredPermission is required and must be a number');
  }

  return canAccessResource({
    resourceType: 'prompt',
    requiredPermission,
    resourceIdParam,
    idResolver: resolvePromptId,
  });
};

module.exports = {
  canAccessPromptResource,
};
