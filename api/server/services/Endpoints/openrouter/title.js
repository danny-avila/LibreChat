const { safeLog } = require('~/server/utils/keyMasking');
const { logger } = require('~/config');

/**
 * Add title to OpenRouter conversation
 * @param {string} apiKey - The API key
 * @param {Object} titleData - The title data containing conversationId and title
 * @returns {Promise<Object>} The updated title data
 */
const addTitle = async (apiKey, { conversationId, title }) => {
  // Implementation for adding title if needed
  // This is typically handled by the conversation service
  safeLog('debug', '[OpenRouterService] addTitle called', { conversationId, title }, logger);
  return { conversationId, title };
};

module.exports = addTitle;
