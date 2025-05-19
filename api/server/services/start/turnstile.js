const { removeNullishValues } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Loads and maps the Cloudflare Turnstile configuration.
 *
 * Expected config structure:
 *
 * turnstile:
 *   siteKey: "your-site-key-here"
 *   options:
 *     language: "auto"    // "auto" or an ISO 639-1 language code (e.g. en)
 *     size: "normal"      // Options: "normal", "compact", "flexible", or "invisible"
 *
 * @param {TCustomConfig | undefined} config - The loaded custom configuration.
 * @param {TConfigDefaults} configDefaults - The custom configuration default values.
 * @returns {TCustomConfig['turnstile']} The mapped Turnstile configuration.
 */
function loadTurnstileConfig(config, configDefaults) {
  const { turnstile: customTurnstile = {} } = config ?? {};
  const { turnstile: defaults = {} } = configDefaults;

  /** @type {TCustomConfig['turnstile']} */
  const loadedTurnstile = removeNullishValues({
    siteKey: customTurnstile.siteKey ?? defaults.siteKey,
    options: customTurnstile.options ?? defaults.options,
  });

  const enabled = Boolean(loadedTurnstile.siteKey);

  if (enabled) {
    logger.info(
      'Turnstile is ENABLED with configuration:\n' + JSON.stringify(loadedTurnstile, null, 2),
    );
  } else {
    logger.info('Turnstile is DISABLED (no siteKey provided).');
  }

  return loadedTurnstile;
}

module.exports = {
  loadTurnstileConfig,
};
