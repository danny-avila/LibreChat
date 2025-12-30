import { logger } from '@brainiac/data-schemas';

/**
 * Gets the base path from the DOMAIN_CLIENT environment variable.
 * This is useful for constructing URLs when Brainiac is served from a subdirectory.
 * @returns {string} The base path (e.g., '/brainiac' or '')
 */
export function getBasePath(): string {
  if (!process.env.DOMAIN_CLIENT) {
    return '';
  }

  try {
    const clientUrl = new URL(process.env.DOMAIN_CLIENT);
    // Keep consistent with the logic in api/server/index.js
    const baseHref = clientUrl.pathname.endsWith('/')
      ? clientUrl.pathname.slice(0, -1) // Remove trailing slash for path construction
      : clientUrl.pathname;

    return baseHref === '/' ? '' : baseHref;
  } catch (error) {
    logger.warn('Error parsing DOMAIN_CLIENT for base path:', error);
    return '';
  }
}
