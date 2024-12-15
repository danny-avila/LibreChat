import { z } from 'zod';

export const StdioOptionsSchema = z.object({
  type: z.literal('stdio'),
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

export const WebSocketOptionsSchema = z.object({
  type: z.literal('websocket'),
  url: z.string().url(),
});

export const SSEOptionsSchema = z.object({
  type: z.literal('sse'),
  url: z.string().url(),
});

export const TransportOptionsSchema = z.discriminatedUnion('type', [
  StdioOptionsSchema,
  WebSocketOptionsSchema,
  SSEOptionsSchema,
]);

export const MCPOptionsSchema = z.object({
  transport: TransportOptionsSchema,
});

export const MCPServersSchema = z.record(z.string(), MCPOptionsSchema);
