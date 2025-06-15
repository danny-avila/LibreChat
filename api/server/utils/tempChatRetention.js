const { logger } = require('~/config');

/**
 * Default retention period for temporary chats in days
 */
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Minimum allowed retention period in days
 */
const MIN_RETENTION_DAYS = 1;

/**
 * Maximum allowed retention period in days (1 year)
 */
const MAX_RETENTION_DAYS = 365;

/**
 * Gets the temporary chat retention period from environment variables or config
 * @param {TCustomConfig} [config] - The custom configuration object
 * @returns {number} The retention period in days
 */
function getTempChatRetentionDays(config) {
  let retentionDays = DEFAULT_RETENTION_DAYS;

  // Check environment variable first
  if (process.env.TEMP_CHAT_RETENTION_DAYS) {
    const envValue = parseInt(process.env.TEMP_CHAT_RETENTION_DAYS, 10);
    if (!isNaN(envValue)) {
      retentionDays = envValue;
    } else {
      logger.warn(
        `Invalid TEMP_CHAT_RETENTION_DAYS environment variable: ${process.env.TEMP_CHAT_RETENTION_DAYS}. Using default: ${DEFAULT_RETENTION_DAYS} days.`
      );
    }
  }

  // Check config file (takes precedence over environment variable)
  if (config?.interface?.temporaryChatRetentionDays !== undefined) {
    const configValue = config.interface.temporaryChatRetentionDays;
    if (typeof configValue === 'number' && !isNaN(configValue)) {
      retentionDays = configValue;
    } else {
      logger.warn(
        `Invalid temporaryChatRetentionDays in config: ${configValue}. Using ${retentionDays} days.`
      );
    }
  }

  // Validate the retention period
  if (retentionDays < MIN_RETENTION_DAYS) {
    logger.warn(
      `Temporary chat retention period ${retentionDays} is below minimum ${MIN_RETENTION_DAYS} days. Using minimum value.`
    );
    retentionDays = MIN_RETENTION_DAYS;
  } else if (retentionDays > MAX_RETENTION_DAYS) {
    logger.warn(
      `Temporary chat retention period ${retentionDays} exceeds maximum ${MAX_RETENTION_DAYS} days. Using maximum value.`
    );
    retentionDays = MAX_RETENTION_DAYS;
  }

  return retentionDays;
}

/**
 * Creates an expiration date for temporary chats
 * @param {TCustomConfig} [config] - The custom configuration object
 * @returns {Date} The expiration date
 */
function createTempChatExpirationDate(config) {
  const retentionDays = getTempChatRetentionDays(config);
  const expiredAt = new Date();
  expiredAt.setDate(expiredAt.getDate() + retentionDays);
  return expiredAt;
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  getTempChatRetentionDays,
  createTempChatExpirationDate,
}; 