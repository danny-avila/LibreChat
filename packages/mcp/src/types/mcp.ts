import { z } from 'zod';
import { ToolSchema } from '@modelcontextprotocol/sdk/types.js';

interface StdioOptions {
  type: 'stdio';
  command: string;
  args: string[];
}

interface WebSocketOptions {
  type: 'websocket';
  url: string;
}

interface SSEOptions {
  type: 'sse';
  url: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type TransportOptions = StdioOptions | WebSocketOptions | SSEOptions;

export interface MCPOptions {
  transport: TransportOptions;
}

export type Tool = z.infer<typeof ToolSchema>;
