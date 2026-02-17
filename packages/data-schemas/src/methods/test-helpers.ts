/**
 * Inlined utility functions previously imported from @librechat/api.
 * These are used only by test files in data-schemas.
 */

/**
 * Finds the first matching pattern in a tokens/values map by reverse-iterating
 * and checking if the model name (lowercased) includes the key.
 *
 * Inlined from @librechat/api findMatchingPattern
 */
export function findMatchingPattern(
  modelName: string,
  tokensMap: Record<string, unknown>,
): string | null {
  const keys = Object.keys(tokensMap);
  const lowerModelName = modelName.toLowerCase();
  for (let i = keys.length - 1; i >= 0; i--) {
    const modelKey = keys[i];
    if (lowerModelName.includes(modelKey)) {
      return modelKey;
    }
  }
  return null;
}

/**
 * Matches a model name to a canonical key. When no maxTokensMap is available
 * (as in data-schemas tests), returns the model name as-is.
 *
 * Inlined from @librechat/api matchModelName (simplified for test use)
 */
export function matchModelName(modelName: string, _endpoint?: string): string | undefined {
  if (typeof modelName !== 'string') {
    return undefined;
  }
  return modelName;
}

const DEFAULT_RETENTION_HOURS = 24 * 30; // 30 days
const MIN_RETENTION_HOURS = 1;
const MAX_RETENTION_HOURS = 8760; // 1 year

/**
 * Gets the temporary chat retention period from environment variables or config.
 *
 * Inlined from @librechat/api getTempChatRetentionHours
 */
function getTempChatRetentionHours(
  interfaceConfig?: { temporaryChatRetention?: number } | null,
): number {
  let retentionHours = DEFAULT_RETENTION_HOURS;

  if (process.env.TEMP_CHAT_RETENTION_HOURS) {
    const envValue = parseInt(process.env.TEMP_CHAT_RETENTION_HOURS, 10);
    if (!isNaN(envValue)) {
      retentionHours = envValue;
    }
  }

  if (interfaceConfig?.temporaryChatRetention !== undefined) {
    const configValue = interfaceConfig.temporaryChatRetention;
    if (typeof configValue === 'number' && !isNaN(configValue)) {
      retentionHours = configValue;
    }
  }

  if (retentionHours < MIN_RETENTION_HOURS) {
    retentionHours = MIN_RETENTION_HOURS;
  } else if (retentionHours > MAX_RETENTION_HOURS) {
    retentionHours = MAX_RETENTION_HOURS;
  }

  return retentionHours;
}

/**
 * Creates an expiration date for temporary chats based on retention hours config.
 *
 * Inlined from @librechat/api createTempChatExpirationDate
 */
export function createTempChatExpirationDate(interfaceConfig?: {
  temporaryChatRetention?: number;
}): Date {
  const retentionHours = getTempChatRetentionHours(interfaceConfig);
  return new Date(Date.now() + retentionHours * 60 * 60 * 1000);
}
