const { FileContext } = require('librechat-data-provider');

/**
 * Determines the appropriate file storage strategy based on file type and configuration.
 *
 * @param {Object} config - App configuration object containing fileStrategy and fileStrategies
 * @param {Object} options - File context options
 * @param {boolean} options.isAvatar - Whether this is an avatar upload
 * @param {boolean} options.isImage - Whether this is an image upload
 * @param {string} options.context - File context from FileContext enum
 * @returns {string} Storage strategy to use (e.g., 'local', 's3', 'azure')
 *
 * @example
 * // Legacy single strategy
 * getFileStrategy({ fileStrategy: 's3' }) // Returns 's3'
 *
 * @example
 * // Granular strategies
 * getFileStrategy(
 *   {
 *     fileStrategy: 's3',
 *     fileStrategies: { avatar: 'local', document: 's3' }
 *   },
 *   { isAvatar: true }
 * ) // Returns 'local'
 */
function getFileStrategy(appLocals, { isAvatar = false, isImage = false, context = null } = {}) {
  // Handle both old (config object) and new (app.locals object) calling patterns
  const isAppLocals = appLocals.fileStrategy !== undefined;
  const config = isAppLocals ? appLocals.config : appLocals;
  const fileStrategy = isAppLocals ? appLocals.fileStrategy : appLocals.fileStrategy;

  // Fallback to legacy single strategy if no granular config
  if (!config?.fileStrategies) {
    return fileStrategy || 'local'; // Default to 'local' if undefined
  }

  const strategies = config.fileStrategies;
  const defaultStrategy = strategies.default || fileStrategy || 'local';

  // Priority order for strategy selection:
  // 1. Specific file type strategy
  // 2. Default strategy from fileStrategies
  // 3. Legacy fileStrategy
  // 4. 'local' as final fallback

  let selectedStrategy;

  if (isAvatar || context === FileContext.avatar) {
    selectedStrategy = strategies.avatar || defaultStrategy;
  } else if (isImage || context === FileContext.image_generation) {
    selectedStrategy = strategies.image || defaultStrategy;
  } else {
    // All other files (documents, attachments, etc.)
    selectedStrategy = strategies.document || defaultStrategy;
  }

  return selectedStrategy || 'local'; // Final fallback to 'local'
}

module.exports = { getFileStrategy };
