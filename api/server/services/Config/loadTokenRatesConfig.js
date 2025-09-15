const { removeNullishValues } = require('librechat-data-provider');
const { logger } = require('~/config');
const { setCustomTokenOverrides, setCustomCacheOverrides } = require('~/models/tx');

/**
 * Loads token rates from the user's configuration, merging with default token rates if available.
 *
 * @param {TCustomConfig | undefined} config - The loaded custom configuration.
 * @param {TConfigDefaults} [configDefaults] - Optional default configuration values.
 * @returns {TCustomConfig['tokenRates']} - The final token rates configuration.
 */
function loadTokenRatesConfig(config, configDefaults) {
  const userTokenRates = removeNullishValues(config?.tokenRates ?? {});

  if (!configDefaults?.tokenRates) {
    logger.info(`User tokenRates configuration:\n${JSON.stringify(userTokenRates, null, 2)}`);
    // Apply custom token rates even if there are no defaults
    applyCustomTokenRates(userTokenRates);
    return userTokenRates;
  }

  /** @type {TCustomConfig['tokenRates']} */
  const defaultTokenRates = removeNullishValues(configDefaults.tokenRates);
  const merged = { ...defaultTokenRates, ...userTokenRates };

  // Apply custom token rates configuration
  applyCustomTokenRates(merged);

  logger.info(`Merged tokenRates configuration:\n${JSON.stringify(merged, null, 2)}`);
  return merged;
}

/**
 * Processes the token rates configuration to set up custom overrides for each model.
 *
 * The configuration is expected to be specified per model:
 *
 * For each model in the tokenRates configuration, this function will call the tx.js
 * override functions to apply the custom token and cache multipliers.
 *
 * @param {TModelTokenRates} tokenRates - The token rates configuration mapping models to token costs.
 */
function applyCustomTokenRates(tokenRates) {
  // Iterate over each model in the tokenRates configuration.
  Object.keys(tokenRates).forEach((model) => {
    const rate = tokenRates[model];
    // If token multipliers are provided, set custom token overrides.
    if (rate.prompt != null || rate.completion != null) {
      setCustomTokenOverrides({
        [model]: {
          prompt: rate.prompt,
          completion: rate.completion,
        },
      });
    }
    // Check for cache overrides.
    const cacheOverrides = rate.cache;
    if (cacheOverrides && (cacheOverrides.write != null || cacheOverrides.read != null)) {
      setCustomCacheOverrides({
        [model]: {
          cache: {
            write: cacheOverrides.write,
            read: cacheOverrides.read,
          },
        },
      });
    }
  });
}

module.exports = { loadTokenRatesConfig };