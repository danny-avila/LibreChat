import { z } from 'zod';
import type { TUser } from './types';
import { extractEnvVariable } from './utils';

const BaseOptionsSchema = z.object({
  iconPath: z.string().optional(),
  timeout: z.number().optional(),
  initTimeout: z.number().optional(),
  /** Controls visibility in chat dropdown menu (MCPSelect) */
  chatMenu: z.boolean().optional(),
  /**
   * Controls server instruction behavior:
   * - undefined/not set: No instructions included (default)
   * - true: Use server-provided instructions
   * - string: Use custom instructions (overrides server-provided)
   */
  serverInstructions: z.union([z.boolean(), z.string()]).optional(),
});

export const StdioOptionsSchema = BaseOptionsSchema.extend({
  type: z.literal('stdio').optional(),
  /**
   * The executable to run to start the server.
   */
  command: z.string(),
  /**
   * Command line arguments to pass to the executable.
   */
  args: z.array(z.string()),
  /**
   * The environment to use when spawning the process.
   *
   * If not specified, the result of getDefaultEnvironment() will be used.
   * Environment variables can be referenced using ${VAR_NAME} syntax.
   */
  env: z
    .record(z.string(), z.string())
    .optional()
    .transform((env) => {
      if (!env) {
        return env;
      }

      const processedEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(env)) {
        processedEnv[key] = extractEnvVariable(value);
      }
      return processedEnv;
    }),
  /**
   * How to handle stderr of the child process. This matches the semantics of Node's `child_process.spawn`.
   *
   * @type {import('node:child_process').IOType | import('node:stream').Stream | number}
   *
   * The default is "inherit", meaning messages to stderr will be printed to the parent process's stderr.
   */
  stderr: z.any().optional(),
});

export const WebSocketOptionsSchema = BaseOptionsSchema.extend({
  type: z.literal('websocket').optional(),
  url: z
    .string()
    .transform((val: string) => extractEnvVariable(val))
    .pipe(z.string().url())
    .refine(
      (val: string) => {
        const protocol = new URL(val).protocol;
        return protocol === 'ws:' || protocol === 'wss:';
      },
      {
        message: 'WebSocket URL must start with ws:// or wss://',
      },
    ),
});

export const SSEOptionsSchema = BaseOptionsSchema.extend({
  type: z.literal('sse').optional(),
  headers: z.record(z.string(), z.string()).optional(),
  url: z
    .string()
    .transform((val: string) => extractEnvVariable(val))
    .pipe(z.string().url())
    .refine(
      (val: string) => {
        const protocol = new URL(val).protocol;
        return protocol !== 'ws:' && protocol !== 'wss:';
      },
      {
        message: 'SSE URL must not start with ws:// or wss://',
      },
    ),
});

export const StreamableHTTPOptionsSchema = BaseOptionsSchema.extend({
  type: z.literal('streamable-http'),
  headers: z.record(z.string(), z.string()).optional(),
  url: z
    .string()
    .transform((val: string) => extractEnvVariable(val))
    .pipe(z.string().url())
    .refine(
      (val: string) => {
        const protocol = new URL(val).protocol;
        return protocol !== 'ws:' && protocol !== 'wss:';
      },
      {
        message: 'Streamable HTTP URL must not start with ws:// or wss://',
      },
    ),
});

export const MCPOptionsSchema = z.union([
  StdioOptionsSchema,
  WebSocketOptionsSchema,
  SSEOptionsSchema,
  StreamableHTTPOptionsSchema,
]);

export const MCPServersSchema = z.record(z.string(), MCPOptionsSchema);

export type MCPOptions = z.infer<typeof MCPOptionsSchema>;

/**
 * List of allowed user fields that can be used in MCP environment variables.
 * These are non-sensitive string/boolean fields from the IUser interface.
 */
const ALLOWED_USER_FIELDS = [
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
    if (value.includes(placeholder)) {
      const fieldValue = user[field as keyof TUser];
      const replacementValue = fieldValue != null ? String(fieldValue) : '';
      value = value.replace(new RegExp(placeholder, 'g'), replacementValue);
    }
  }

  return value;
}

/**
 * Recursively processes an object to replace environment variables in string values
 * @param obj - The object to process
 * @param user - The user object containing all user fields
 * @returns - The processed object with environment variables replaced
 */
export function processMCPEnv(obj: Readonly<MCPOptions>, user?: TUser): MCPOptions {
  if (obj === null || obj === undefined) {
    return obj;
  }

  const newObj: MCPOptions = structuredClone(obj);

  if ('env' in newObj && newObj.env) {
    const processedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(newObj.env)) {
      let processedValue = extractEnvVariable(value);
      processedValue = processUserPlaceholders(processedValue, user);
      processedEnv[key] = processedValue;
    }
    newObj.env = processedEnv;
  } else if ('headers' in newObj && newObj.headers) {
    const processedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(newObj.headers)) {
      const userId = user?.id;
      if (value === '{{LIBRECHAT_USER_ID}}' && userId != null) {
        processedHeaders[key] = String(userId);
        continue;
      }

      let processedValue = extractEnvVariable(value);
      processedValue = processUserPlaceholders(processedValue, user);
      processedHeaders[key] = processedValue;
    }
    newObj.headers = processedHeaders;
  }

  if ('url' in newObj && newObj.url) {
    let processedUrl = extractEnvVariable(newObj.url);
    processedUrl = processUserPlaceholders(processedUrl, user);
    newObj.url = processedUrl;
  }

  return newObj;
}
