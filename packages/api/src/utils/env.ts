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
 * Interface for conversation context used in MCP environment processing
 */
export interface MCPConversationContext {
  conversationId?: string;
  messageId?: string;
  messageFiles?: string[]; // Array of file IDs from the current message
  mcpClientId?: string;
  clientIP?: string;
  userAgent?: string;
  requestId?: string;
}

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

  // Process standard user field placeholders
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
 * Processes a string value to replace user field placeholders with conversation context
 * @param value - The string value to process
 * @param user - The user object
 * @param conversationContext - Conversation context for special placeholders
 * @returns The processed string with placeholders replaced
 */
async function processUserPlaceholdersWithContext(
  value: string,
  user?: TUser,
  conversationContext?: MCPConversationContext
): Promise<string> {
  if (!user || typeof value !== 'string') {
    return value;
  }

  // Handle special LIBRECHAT_CHAT_URL_FILE placeholder
  if (value.includes('{{LIBRECHAT_CHAT_URL_FILE}}')) {
    try {
      if (process.env.TEMP_DOWNLOAD_DETAILED_LOGGING === 'true') {
        console.log('[MCP File Placeholder] Processing placeholder with context:', {
          conversationId: conversationContext?.conversationId,
          userId: user?.id,
          mcpClientId: conversationContext?.mcpClientId,
          hasConversationContext: !!conversationContext,
          messageFilesCount: conversationContext?.messageFiles?.length || 0,
          messageFiles: conversationContext?.messageFiles,
          originalValue: value
        });
      }

      // Dynamic import to avoid circular dependencies
      const MCPFileUrlService = require('~/server/services/Files/MCPFileUrlService');

      // Generate file URLs for the current conversation context
      const fileUrls = await MCPFileUrlService.generateCurrentMessageFileUrls({
        conversationId: conversationContext?.conversationId,
        messageFiles: conversationContext?.messageFiles,
        userId: user.id,
        mcpClientId: conversationContext?.mcpClientId || 'unknown',
        clientIP: conversationContext?.clientIP,
        userAgent: conversationContext?.userAgent,
        requestId: conversationContext?.requestId,
        ttlSeconds: 900, // 15 minutes default
        singleUse: true
      });

      if (process.env.TEMP_DOWNLOAD_DEBUG === 'true') {
        console.log('[MCP File Placeholder] File URL generation completed:', {
          conversationId: conversationContext?.conversationId,
          messageFilesCount: conversationContext?.messageFiles?.length || 0,
          fileUrlsLength: fileUrls?.length || 0,
          hasFileUrls: !!fileUrls
        });
      }

      if (process.env.TEMP_DOWNLOAD_DETAILED_LOGGING === 'true') {
        console.log('[MCP File Placeholder] Generated file URLs:', fileUrls);
      }
      value = value.replace(/\{\{LIBRECHAT_CHAT_URL_FILE\}\}/g, fileUrls);
    } catch (error) {
      // Log error but don't fail the entire process
      if (process.env.TEMP_DOWNLOAD_DEBUG === 'true') {
        console.error('[MCP File Placeholder] Failed to generate file URLs:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          conversationId: conversationContext?.conversationId,
          userId: user?.id,
          mcpClientId: conversationContext?.mcpClientId
        });
      }
      // Replace with empty JSON object on error
      value = value.replace(/\{\{LIBRECHAT_CHAT_URL_FILE\}\}/g, JSON.stringify({
        files: [],
        error: `Failed to generate file URLs: ${error instanceof Error ? error.message : String(error)}`
      }));
    }
  }

  // Process standard user field placeholders
  return processUserPlaceholders(value, user);
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
 * Processes a single string value by replacing various types of placeholders with conversation context
 * @param originalValue - The original string value to process
 * @param customUserVars - Optional custom user variables to replace placeholders
 * @param user - Optional user object for replacing user field placeholders
 * @param conversationContext - Optional conversation context for special placeholders
 * @returns The processed string with all placeholders replaced
 */
async function processSingleValueWithContext({
  originalValue,
  customUserVars,
  user,
  conversationContext,
}: {
  originalValue: string;
  customUserVars?: Record<string, string>;
  user?: TUser;
  conversationContext?: MCPConversationContext;
}): Promise<string> {
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
  value = await processUserPlaceholdersWithContext(value, user, conversationContext);

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
 * Recursively processes an object to replace environment variables in string values with conversation context
 * @param obj - The object to process
 * @param user - The user object containing all user fields
 * @param customUserVars - vars that user set in settings
 * @param conversationContext - Optional conversation context for special placeholders
 * @returns - The processed object with environment variables replaced
 */
export async function processMCPEnvWithContext(
  obj: Readonly<MCPOptions>,
  user?: TUser,
  customUserVars?: Record<string, string>,
  conversationContext?: MCPConversationContext,
): Promise<MCPOptions> {
  if (process.env.TEMP_DOWNLOAD_DEBUG === 'true') {
    console.log('[processMCPEnvWithContext - STEP I] Starting processing:', {
      hasObj: !!obj,
      hasUser: !!user,
      userId: user?.id,
      hasConversationContext: !!conversationContext,
      conversationId: conversationContext?.conversationId,
      messageFilesCount: conversationContext?.messageFiles?.length || 0,
      messageFiles: conversationContext?.messageFiles,
      objType: 'type' in obj ? obj.type : 'command' in obj ? 'command' : 'unknown'
    });
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  const newObj: MCPOptions = structuredClone(obj);

  if ('env' in newObj && newObj.env) {
    const processedEnv: Record<string, string> = {};
    for (const [key, originalValue] of Object.entries(newObj.env)) {
      processedEnv[key] = await processSingleValueWithContext({
        originalValue,
        customUserVars,
        user,
        conversationContext
      });
    }
    newObj.env = processedEnv;
  }

  // Process headers if they exist (for WebSocket, SSE, StreamableHTTP types)
  // Note: `env` and `headers` are on different branches of the MCPOptions union type.
  if ('headers' in newObj && newObj.headers) {
    if (process.env.TEMP_DOWNLOAD_DETAILED_LOGGING === 'true') {
      console.log('[processMCPEnvWithContext - STEP II] Processing headers:', {
        headerCount: Object.keys(newObj.headers).length,
        headerKeys: Object.keys(newObj.headers),
        headers: newObj.headers,
        conversationId: conversationContext?.conversationId,
        messageFilesCount: conversationContext?.messageFiles?.length || 0
      });
    }

    const processedHeaders: Record<string, string> = {};
    for (const [key, originalValue] of Object.entries(newObj.headers)) {
      if (process.env.TEMP_DOWNLOAD_DETAILED_LOGGING === 'true') {
        console.log('[processMCPEnvWithContext - STEP III] Processing header:', {
          key,
          originalValue,
          hasPlaceholder: originalValue.includes('{{LIBRECHAT_CHAT_URL_FILE}}'),
          conversationId: conversationContext?.conversationId,
          messageFiles: conversationContext?.messageFiles
        });
      }

      processedHeaders[key] = await processSingleValueWithContext({
        originalValue,
        customUserVars,
        user,
        conversationContext
      });

      if (process.env.TEMP_DOWNLOAD_DEBUG === 'true') {
        console.log('[processMCPEnvWithContext - STEP IV] Header processed:', {
          key,
          originalValue,
          processedValue: processedHeaders[key],
          valueChanged: originalValue !== processedHeaders[key]
        });
      }
    }
    newObj.headers = processedHeaders;

    if (process.env.TEMP_DOWNLOAD_DEBUG === 'true') {
      console.log('[processMCPEnvWithContext - STEP V] All headers processed:', {
        originalHeaders: 'headers' in obj ? obj.headers : {},
        processedHeaders: newObj.headers
      });
    }
  }

  // Process URL if it exists (for WebSocket, SSE, StreamableHTTP types)
  if ('url' in newObj && newObj.url) {
    newObj.url = await processSingleValueWithContext({
      originalValue: newObj.url,
      customUserVars,
      user,
      conversationContext
    });
  }

  if (process.env.TEMP_DOWNLOAD_DEBUG === 'true') {
    console.log('[processMCPEnvWithContext - STEP VI] Processing completed:', {
      conversationId: conversationContext?.conversationId,
      messageFilesCount: conversationContext?.messageFiles?.length || 0,
      hasHeaders: 'headers' in newObj && !!newObj.headers,
      hasEnv: 'env' in newObj && !!newObj.env,
      finalHeaders: 'headers' in newObj ? newObj.headers : undefined
    });
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

/**
 * Resolves header values by replacing user placeholders, custom variables, and environment variables with conversation context
 * @param headers - The headers object to process
 * @param user - Optional user object for replacing user field placeholders (can be partial with just id)
 * @param customUserVars - Optional custom user variables to replace placeholders
 * @param conversationContext - Optional conversation context for special placeholders
 * @returns - The processed headers with all placeholders replaced
 */
export async function resolveHeadersWithContext(
  headers: Record<string, string> | undefined,
  user?: Partial<TUser> | { id: string },
  customUserVars?: Record<string, string>,
  conversationContext?: MCPConversationContext,
) {
  const resolvedHeaders = { ...(headers ?? {}) };

  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    for (const key of Object.keys(headers)) {
      resolvedHeaders[key] = await processSingleValueWithContext({
        originalValue: headers[key],
        customUserVars,
        user: user as TUser,
        conversationContext,
      });
    }
  }

  return resolvedHeaders;
}
