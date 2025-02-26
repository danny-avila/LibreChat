const { removeNullishValues } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Loads custom token rates from the user's YAML config, merging with default token rates if available.
 *
 * @param {TCustomConfig | undefined} config - The loaded custom configuration.
 * @param {TConfigDefaults} [configDefaults] - Optional default configuration values.
 * @returns {TCustomConfig['tokenRates']} - The final token rates configuration.
 */
function loadTokenRatesConfig(config, configDefaults) {
  const userTokenRates = removeNullishValues(config?.tokenRates ?? {});

  if (!configDefaults?.tokenRates) {
    logger.info(`User tokenRates configuration:\n${JSON.stringify(userTokenRates, null, 2)}`);
    return userTokenRates;
  }

  /** @type {TCustomConfig['tokenRates']} */
  const defaultTokenRates = removeNullishValues(configDefaults.tokenRates);
  const merged = { ...defaultTokenRates, ...userTokenRates };

  logger.info(`Merged tokenRates configuration:\n${JSON.stringify(merged, null, 2)}`);
  return merged;
}

module.exports = { loadTokenRatesConfig };