import logger from '~/config/winston';

/**
 * Default expiration period for shared links in hours
 */
export const DEFAULT_SHARE_EXPIRATION_HOURS = 0; // never expires

/**
 * Minimum allowed expiration period in hours
 */
export const MIN_SHARE_EXPIRATION_HOURS = 1;

/**
 * Maximum allowed expiration period in hours (1 year = 8760 hours)
 */
export const MAX_SHARE_EXPIRATION_HOURS = 8760;

/**
 * Gets the shared link expiration period from environment variables
 * @returns The expiration period in hours, or 0 for no expiration
 */
export function getSharedLinkExpirationHours(): number {
  const envValue = process.env.SHARED_LINK_DEFAULT_TTL_HOURS;

  if (!envValue) {
    return DEFAULT_SHARE_EXPIRATION_HOURS;
  }

  const parsed = parseInt(envValue, 10);

  if (isNaN(parsed)) {
    logger.warn(
      `[shareExpiration] Invalid SHARED_LINK_DEFAULT_TTL_HOURS: ${envValue}, using default: ${DEFAULT_SHARE_EXPIRATION_HOURS}`,
    );
    return DEFAULT_SHARE_EXPIRATION_HOURS;
  }

  // 0 means no expiration
  if (parsed === 0) {
    return 0;
  }

  // Clamp to min/max
  if (parsed < MIN_SHARE_EXPIRATION_HOURS) {
    logger.warn(
      `[shareExpiration] SHARED_LINK_DEFAULT_TTL_HOURS too low: ${parsed}, using minimum: ${MIN_SHARE_EXPIRATION_HOURS}`,
    );
    return MIN_SHARE_EXPIRATION_HOURS;
  }

  if (parsed > MAX_SHARE_EXPIRATION_HOURS) {
    logger.warn(
      `[shareExpiration] SHARED_LINK_DEFAULT_TTL_HOURS too high: ${parsed}, using maximum: ${MAX_SHARE_EXPIRATION_HOURS}`,
    );
    return MAX_SHARE_EXPIRATION_HOURS;
  }

  return parsed;
}

/**
 * Creates an expiration date for a shared link
 * @param hours - Optional hours override. If not provided, uses environment config. 0 = no expiration.
 * @returns The expiration date, or undefined if no expiration should be set
 */
export function createShareExpirationDate(hours?: number): Date | undefined {
  const expirationHours = hours !== undefined ? hours : getSharedLinkExpirationHours();

  // 0 means no expiration
  if (expirationHours === 0) {
    return undefined;
  }

  return new Date(Date.now() + expirationHours * 60 * 60 * 1000);
}

/**
 * Checks if a shared link has expired
 * @param expiresAt - The expiration date
 * @returns True if expired, false otherwise
 */
export function isShareExpired(expiresAt?: Date | null): boolean {
  if (!expiresAt) {
    return false;
  }
  return new Date() > new Date(expiresAt);
}
