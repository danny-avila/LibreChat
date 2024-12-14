import { z } from 'zod';

export const StdioOptionsSchema = z.object({
  type: z.literal('stdio'),
  command: z.string(),
  args: z.array(z.string()),
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
