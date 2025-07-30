import { z } from 'zod';
import { TokenExchangeMethodEnum } from './types/agents';
import { extractEnvVariable } from './utils';

const BaseOptionsSchema = z.object({
  /**
   * Controls whether the MCP server is initialized during application startup.
   * - true (default): Server is initialized during app startup and included in app-level connections
   * - false: Skips initialization at startup and excludes from app-level connections - useful for servers
   *   requiring manual authentication (e.g., GitHub PAT tokens) that need to be configured through the UI after startup
   */
  startup: z.boolean().optional(),
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
  /**
   * Whether this server requires OAuth authentication
   * If not specified, will be auto-detected during construction
   */
  requiresOAuth: z.boolean().optional(),
  /**
   * OAuth configuration for SSE and Streamable HTTP transports
   * - Optional: OAuth can be auto-discovered on 401 responses
   * - Pre-configured values will skip discovery steps
   */
  oauth: z
    .object({
      /** OAuth authorization endpoint (optional - can be auto-discovered) */
      authorization_url: z.string().url().optional(),
      /** OAuth token endpoint (optional - can be auto-discovered) */
      token_url: z.string().url().optional(),
      /** OAuth client ID (optional - can use dynamic registration) */
      client_id: z.string().optional(),
      /** OAuth client secret (optional - can use dynamic registration) */
      client_secret: z.string().optional(),
      /** OAuth scopes to request */
      scope: z.string().optional(),
      /** OAuth redirect URI (defaults to /api/mcp/{serverName}/oauth/callback) */
      redirect_uri: z.string().url().optional(),
      /** Token exchange method */
      token_exchange_method: z.nativeEnum(TokenExchangeMethodEnum).optional(),
      /** Supported grant types (defaults to ['authorization_code', 'refresh_token']) */
      grant_types_supported: z.array(z.string()).optional(),
      /** Supported token endpoint authentication methods (defaults to ['client_secret_basic', 'client_secret_post']) */
      token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
      /** Supported response types (defaults to ['code']) */
      response_types_supported: z.array(z.string()).optional(),
      /** Supported code challenge methods (defaults to ['S256', 'plain']) */
      code_challenge_methods_supported: z.array(z.string()).optional(),
    })
    .optional(),
  customUserVars: z
    .record(
      z.string(),
      z.object({
        title: z.string(),
        description: z.string(),
      }),
    )
    .optional(),
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
  type: z.union([z.literal('streamable-http'), z.literal('http')]),
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
