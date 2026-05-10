import logger from '~/config/winston';
import { removeNullishValues } from 'librechat-data-provider';
import type { TCustomConfig, TConfigDefaults } from 'librechat-data-provider';

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
 * @param config - The loaded custom configuration.
 * @param configDefaults - The custom configuration default values.
 * @returns The mapped Turnstile configuration.
 */
export function loadTurnstileConfig(
  config: Partial<TCustomConfig> | undefined,
  configDefaults: TConfigDefaults,
): Partial<TCustomConfig['turnstile']> {
  const { turnstile: customTurnstile } = config ?? {};
  const { turnstile: defaults } = configDefaults;

  const loadedTurnstile = removeNullishValues({
    siteKey:
      customTurnstile?.siteKey ?? (defaults as TCustomConfig['turnstile'] | undefined)?.siteKey,
    options:
      customTurnstile?.options ?? (defaults as TCustomConfig['turnstile'] | undefined)?.options,
  });

  const enabled = Boolean(loadedTurnstile.siteKey);

  if (enabled) {
    logger.debug(
      'Turnstile is ENABLED with configuration:\n' + JSON.stringify(loadedTurnstile, null, 2),
    );
  } else {
    logger.debug('Turnstile is DISABLED (no siteKey provided).');
  }

  return loadedTurnstile;
}
