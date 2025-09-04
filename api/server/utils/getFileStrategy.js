const { FileSources, FileContext } = require('librechat-data-provider');

/**
 * Determines the appropriate file storage strategy based on file type and configuration.
 *
 * @param {AppConfig} appConfig - App configuration object containing fileStrategy and fileStrategies
 * @param {Object} options - File context options
 * @param {boolean} options.isAvatar - Whether this is an avatar upload
 * @param {boolean} options.isImage - Whether this is an image upload
 * @param {string} options.context - File context from FileContext enum
 * @returns {string} Storage strategy to use (e.g., FileSources.local, 's3', 'azure')
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
 *     fileStrategies: { avatar: FileSources.local, document: 's3' }
 *   },
 *   { isAvatar: true }
 * ) // Returns FileSources.local
 */
function getFileStrategy(appConfig, { isAvatar = false, isImage = false, context = null } = {}) {
  // Fallback to legacy single strategy if no granular config
  if (!appConfig?.fileStrategies) {
    return appConfig.fileStrategy || FileSources.local; // Default to FileSources.local if undefined
  }

  const strategies = appConfig.fileStrategies;
  const defaultStrategy = strategies.default || appConfig.fileStrategy || FileSources.local;

  // Priority order for strategy selection:
  // 1. Specific file type strategy
  // 2. Default strategy from fileStrategies
  // 3. Legacy fileStrategy
  // 4. FileSources.local as final fallback

  let selectedStrategy;

  if (isAvatar || context === FileContext.avatar) {
    selectedStrategy = strategies.avatar || defaultStrategy;
  } else if (isImage || context === FileContext.image_generation) {
    selectedStrategy = strategies.image || defaultStrategy;
  } else {
    // All other files (documents, attachments, etc.)
    selectedStrategy = strategies.document || defaultStrategy;
  }

  return selectedStrategy || FileSources.local; // Final fallback to FileSources.local
}

module.exports = { getFileStrategy };
