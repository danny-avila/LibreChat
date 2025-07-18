import { extractEnvVariable } from 'librechat-data-provider';
import type { TUser, MCPOptions } from 'librechat-data-provider';

/**
 * List of allowed user fields that can be used in MCP environment variables.
 * These are non-sensitive string/boolean fields from the IUser interface.
 */
const ALLOWED_USER_FIELDS = [
  'id',
  'name',
  'username',
  'email',
  'provider',
  'role',
  'googleId',
  'facebookId',
  'openidId',
  'samlId',
  'ldapId',
  'githubId',
  'discordId',
  'appleId',
  'emailVerified',
  'twoFactorEnabled',
  'termsAccepted',
] as const;

/**
 * Processes a string value to replace user field placeholders
 * @param value - The string value to process
 * @param user - The user object
 * @returns The processed string with placeholders replaced
 */
function processUserPlaceholders(value: string, user?: TUser): string {
  if (!user || typeof value !== 'string') {
    return value;
  }

  for (const field of ALLOWED_USER_FIELDS) {
    const placeholder = `{{LIBRECHAT_USER_${field.toUpperCase()}}}`;
    if (!value.includes(placeholder)) {
      continue;
    }

    const fieldValue = user[field as keyof TUser];

    // Skip replacement if field doesn't exist in user object
    if (!(field in user)) {
      continue;
    }

    // Special case for 'id' field: skip if undefined or empty
    if (field === 'id' && (fieldValue === undefined || fieldValue === '')) {
      continue;
    }

    const replacementValue = fieldValue == null ? '' : String(fieldValue);
    value = value.replace(new RegExp(placeholder, 'g'), replacementValue);
  }

  return value;
}

/**
 * Processes a single string value by replacing various types of placeholders
 * @param originalValue - The original string value to process
 * @param customUserVars - Optional custom user variables to replace placeholders
 * @param user - Optional user object for replacing user field placeholders
 * @returns The processed string with all placeholders replaced
 */
function processSingleValue({
  originalValue,
  customUserVars,
  user,
}: {
  originalValue: string;
  customUserVars?: Record<string, string>;
  user?: TUser;
}): string {
  let value = originalValue;

  // 1. Replace custom user variables
  if (customUserVars) {
    for (const [varName, varVal] of Object.entries(customUserVars)) {
      /** Escaped varName for use in regex to avoid issues with special characters */
      const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const placeholderRegex = new RegExp(`\\{\\{${escapedVarName}\\}\\}`, 'g');
      value = value.replace(placeholderRegex, varVal);
    }
  }

  // 2. Replace user field placeholders (e.g., {{LIBRECHAT_USER_EMAIL}}, {{LIBRECHAT_USER_ID}})
  value = processUserPlaceholders(value, user);

  // 3. Replace system environment variables
  value = extractEnvVariable(value);

  return value;
}

/**
 * Recursively processes an object to replace environment variables in string values
 * @param obj - The object to process
 * @param user - The user object containing all user fields
 * @param customUserVars - vars that user set in settings
 * @returns - The processed object with environment variables replaced
 */
export function processMCPEnv(
  obj: Readonly<MCPOptions>,
  user?: TUser,
  customUserVars?: Record<string, string>,
): MCPOptions {
  if (obj === null || obj === undefined) {
    return obj;
  }

  const newObj: MCPOptions = structuredClone(obj);

  if ('env' in newObj && newObj.env) {
    const processedEnv: Record<string, string> = {};
    for (const [key, originalValue] of Object.entries(newObj.env)) {
      processedEnv[key] = processSingleValue({ originalValue, customUserVars, user });
    }
    newObj.env = processedEnv;
  }

  // Process headers if they exist (for WebSocket, SSE, StreamableHTTP types)
  // Note: `env` and `headers` are on different branches of the MCPOptions union type.
  if ('headers' in newObj && newObj.headers) {
    const processedHeaders: Record<string, string> = {};
    for (const [key, originalValue] of Object.entries(newObj.headers)) {
      processedHeaders[key] = processSingleValue({ originalValue, customUserVars, user });
    }
    newObj.headers = processedHeaders;
  }

  // Process URL if it exists (for WebSocket, SSE, StreamableHTTP types)
  if ('url' in newObj && newObj.url) {
    newObj.url = processSingleValue({ originalValue: newObj.url, customUserVars, user });
  }

  return newObj;
}

/**
 * Resolves header values by replacing user placeholders, custom variables, and environment variables
 * @param headers - The headers object to process
 * @param user - Optional user object for replacing user field placeholders (can be partial with just id)
 * @param customUserVars - Optional custom user variables to replace placeholders
 * @returns - The processed headers with all placeholders replaced
 */
export function resolveHeaders(
  headers: Record<string, string> | undefined,
  user?: Partial<TUser> | { id: string },
  customUserVars?: Record<string, string>,
) {
  const resolvedHeaders = { ...(headers ?? {}) };

  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    Object.keys(headers).forEach((key) => {
      resolvedHeaders[key] = processSingleValue({
        originalValue: headers[key],
        customUserVars,
        user: user as TUser,
      });
    });
  }

  return resolvedHeaders;
}
