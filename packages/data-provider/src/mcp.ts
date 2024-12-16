import { z } from 'zod';

const BaseOptionsSchema = z.object({
  iconPath: z.string().optional(),
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
   */
  env: z.record(z.string(), z.string()).optional(),
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
    .url()
    .refine(
      (val) => {
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
  url: z
    .string()
    .url()
    .refine(
      (val) => {
        const protocol = new URL(val).protocol;
        return protocol !== 'ws:' && protocol !== 'wss:';
      },
      {
        message: 'SSE URL must not start with ws:// or wss://',
      },
    ),
});

export const MCPOptionsSchema = z.union([
  StdioOptionsSchema,
  WebSocketOptionsSchema,
  SSEOptionsSchema,
]);

export const MCPServersSchema = z.record(z.string(), MCPOptionsSchema);
