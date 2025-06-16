const { logger } = require('~/config');

/**
 * Default retention period for temporary chats in hours
 */
const DEFAULT_RETENTION_HOURS = 24 * 30; // 30 days

/**
 * Minimum allowed retention period in hours
 */
const MIN_RETENTION_HOURS = 1;

/**
 * Maximum allowed retention period in hours (1 year = 8760 hours)
 */
const MAX_RETENTION_HOURS = 8760;

/**
 * Gets the temporary chat retention period from environment variables or config
 * @param {TCustomConfig} [config] - The custom configuration object
 * @returns {number} The retention period in hours
 */
function getTempChatRetentionHours(config) {
  let retentionHours = DEFAULT_RETENTION_HOURS;

  // Check environment variable first
  if (process.env.TEMP_CHAT_RETENTION_HOURS) {
    const envValue = parseInt(process.env.TEMP_CHAT_RETENTION_HOURS, 10);
    if (!isNaN(envValue)) {
      retentionHours = envValue;
    } else {
      logger.warn(
        `Invalid TEMP_CHAT_RETENTION_HOURS environment variable: ${process.env.TEMP_CHAT_RETENTION_HOURS}. Using default: ${DEFAULT_RETENTION_HOURS} hours.`,
      );
    }
  }

  // Check config file (takes precedence over environment variable)
  if (config?.interface?.temporaryChatRetention !== undefined) {
    const configValue = config.interface.temporaryChatRetention;
    if (typeof configValue === 'number' && !isNaN(configValue)) {
      retentionHours = configValue;
    } else {
      logger.warn(
        `Invalid temporaryChatRetention in config: ${configValue}. Using ${retentionHours} hours.`,
      );
    }
  }

  // Validate the retention period
  if (retentionHours < MIN_RETENTION_HOURS) {
    logger.warn(
      `Temporary chat retention period ${retentionHours} is below minimum ${MIN_RETENTION_HOURS} hours. Using minimum value.`,
    );
    retentionHours = MIN_RETENTION_HOURS;
  } else if (retentionHours > MAX_RETENTION_HOURS) {
    logger.warn(
      `Temporary chat retention period ${retentionHours} exceeds maximum ${MAX_RETENTION_HOURS} hours. Using maximum value.`,
    );
    retentionHours = MAX_RETENTION_HOURS;
  }

  return retentionHours;
}

/**
 * Creates an expiration date for temporary chats
 * @param {TCustomConfig} [config] - The custom configuration object
 * @returns {Date} The expiration date
 */
function createTempChatExpirationDate(config) {
  const retentionHours = getTempChatRetentionHours(config);
  const expiredAt = new Date();
  expiredAt.setHours(expiredAt.getHours() + retentionHours);
  return expiredAt;
}

module.exports = {
  DEFAULT_RETENTION_HOURS,
  MIN_RETENTION_HOURS,
  MAX_RETENTION_HOURS,
  getTempChatRetentionHours,
  createTempChatExpirationDate,
};
