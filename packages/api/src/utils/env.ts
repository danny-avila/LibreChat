import { extractEnvVariable } from 'librechat-data-provider';
import type { TUser, MCPOptions } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import type { RequestBody } from '~/types';

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

type AllowedUserField = (typeof ALLOWED_USER_FIELDS)[number];
type SafeUser = Pick<IUser, AllowedUserField>;

/**
 * Creates a safe user object containing only allowed fields.
 * Optimized for performance while maintaining type safety.
 *
 * @param user - The user object to extract safe fields from
 * @returns A new object containing only allowed fields
 */
export function createSafeUser(user: IUser | null | undefined): Partial<SafeUser> {
  if (!user) {
    return {};
  }

  const safeUser: Partial<SafeUser> = {};
  for (const field of ALLOWED_USER_FIELDS) {
    if (field in user) {
      safeUser[field] = user[field];
    }
  }

  return safeUser;
}

/**
 * List of allowed request body fields that can be used in header placeholders.
 * These are common fields from the request body that are safe to expose in headers.
 */
const ALLOWED_BODY_FIELDS = ['conversationId', 'parentMessageId', 'messageId'] as const;

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
 * Replaces request body field placeholders within a string.
 * Recognized placeholders: `{{LIBRECHAT_BODY_<FIELD>}}` where `<FIELD>` ∈ ALLOWED_BODY_FIELDS.
 * If a body field is absent or null/undefined, it is replaced with an empty string.
 *
 * @param value - The string value to process
 * @param body - The request body object
 * @returns The processed string with placeholders replaced
 */
function processBodyPlaceholders(value: string, body: RequestBody): string {
  for (const field of ALLOWED_BODY_FIELDS) {
    const placeholder = `{{LIBRECHAT_BODY_${field.toUpperCase()}}}`;
    if (!value.includes(placeholder)) {
      continue;
    }

    const fieldValue = body[field];
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
 * @param body - Optional request body object for replacing body field placeholders
 * @returns The processed string with all placeholders replaced
 */
function processSingleValue({
  originalValue,
  customUserVars,
  user,
  body = undefined,
}: {
  originalValue: string;
  customUserVars?: Record<string, string>;
  user?: TUser;
  body?: RequestBody;
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

  // 3. Replace body field placeholders (e.g., {{LIBRECHAT_BODY_CONVERSATIONID}}, {{LIBRECHAT_BODY_PARENTMESSAGEID}})
  if (body) {
    value = processBodyPlaceholders(value, body);
  }

  // 4. Replace system environment variables
  value = extractEnvVariable(value);

  return value;
}

/**
 * Recursively processes an object to replace environment variables in string values
 * @param params - Processing parameters
 * @param params.options - The MCP options to process
 * @param params.user - The user object containing all user fields
 * @param params.customUserVars - vars that user set in settings
 * @param params.body - the body of the request that is being processed
 * @returns - The processed object with environment variables replaced
 */
export function processMCPEnv(params: {
  options: Readonly<MCPOptions>;
  user?: TUser;
  customUserVars?: Record<string, string>;
  body?: RequestBody;
}): MCPOptions {
  const { options, user, customUserVars, body } = params;

  if (options === null || options === undefined) {
    return options;
  }

  const newObj: MCPOptions = structuredClone(options);

  if ('env' in newObj && newObj.env) {
    const processedEnv: Record<string, string> = {};
    for (const [key, originalValue] of Object.entries(newObj.env)) {
      processedEnv[key] = processSingleValue({ originalValue, customUserVars, user, body });
    }
    newObj.env = processedEnv;
  }

  if ('args' in newObj && newObj.args) {
    const processedArgs: string[] = [];
    for (const originalValue of newObj.args) {
      processedArgs.push(processSingleValue({ originalValue, customUserVars, user, body }));
    }
    newObj.args = processedArgs;
  }

  // Process headers if they exist (for WebSocket, SSE, StreamableHTTP types)
  // Note: `env` and `headers` are on different branches of the MCPOptions union type.
  if ('headers' in newObj && newObj.headers) {
    const processedHeaders: Record<string, string> = {};
    for (const [key, originalValue] of Object.entries(newObj.headers)) {
      processedHeaders[key] = processSingleValue({ originalValue, customUserVars, user, body });
    }
    newObj.headers = processedHeaders;
  }

  // Process URL if it exists (for WebSocket, SSE, StreamableHTTP types)
  if ('url' in newObj && newObj.url) {
    newObj.url = processSingleValue({ originalValue: newObj.url, customUserVars, user, body });
  }

  // Process OAuth configuration if it exists (for all transport types)
  if ('oauth' in newObj && newObj.oauth) {
    const processedOAuth: Record<string, string | string[] | undefined> = {};
    for (const [key, originalValue] of Object.entries(newObj.oauth)) {
      // Only process string values for environment variables
      // token_exchange_method is an enum and shouldn't be processed
      if (typeof originalValue === 'string') {
        processedOAuth[key] = processSingleValue({ originalValue, customUserVars, user, body });
      } else {
        processedOAuth[key] = originalValue;
      }
    }
    newObj.oauth = processedOAuth;
  }

  return newObj;
}

/**
 * Resolves header values by replacing user placeholders, body variables, custom variables, and environment variables.
 *
 * @param options - Optional configuration object.
 * @param options.headers - The headers object to process.
 * @param options.user - Optional user object for replacing user field placeholders (can be partial with just id).
 * @param options.body - Optional request body object for replacing body field placeholders.
 * @param options.customUserVars - Optional custom user variables to replace placeholders.
 * @returns The processed headers with all placeholders replaced.
 */
export function resolveHeaders(options?: {
  headers: Record<string, string> | undefined;
  user?: Partial<TUser> | { id: string };
  body?: RequestBody;
  customUserVars?: Record<string, string>;
}) {
  const { headers, user, body, customUserVars } = options ?? {};
  const inputHeaders = headers ?? {};

  const resolvedHeaders: Record<string, string> = { ...inputHeaders };

  if (inputHeaders && typeof inputHeaders === 'object' && !Array.isArray(inputHeaders)) {
    Object.keys(inputHeaders).forEach((key) => {
      resolvedHeaders[key] = processSingleValue({
        originalValue: inputHeaders[key],
        customUserVars,
        user: user as TUser,
        body,
      });
    });
  }

  return resolvedHeaders;
}
