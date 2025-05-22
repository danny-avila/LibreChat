import { z } from 'zod';
import { extractEnvVariable } from './utils';

const BaseOptionsSchema = z.object({
  iconPath: z.string().optional(),
  timeout: z.number().optional(),
  initTimeout: z.number().optional(),
  /** Controls visibility in chat dropdown menu (MCPSelect) */
  chatMenu: z.boolean().optional(),
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
 * Recursively processes an object to replace environment variables in string values
 * @param {MCPOptions} obj - The object to process
 * @param {string} [userId] - The user ID
 * @returns {MCPOptions} - The processed object with environment variables replaced
 */
export function processMCPEnv(obj: Readonly<MCPOptions>, userId?: string): MCPOptions {
  if (obj === null || obj === undefined) {
    return obj;
  }

  const newObj: MCPOptions = structuredClone(obj);

  if ('env' in newObj && newObj.env) {
    const processedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(newObj.env)) {
      processedEnv[key] = extractEnvVariable(value);
    }
    newObj.env = processedEnv;
  } else if ('headers' in newObj && newObj.headers) {
    const processedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(newObj.headers)) {
      if (value === '{{LIBRECHAT_USER_ID}}' && userId != null && userId) {
        processedHeaders[key] = userId;
        continue;
      }
      processedHeaders[key] = extractEnvVariable(value);
    }
    newObj.headers = processedHeaders;
  }

  if ('url' in newObj && newObj.url) {
    newObj.url = extractEnvVariable(newObj.url);
  }

  return newObj;
}
