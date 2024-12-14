import { z } from 'zod';
import { ToolSchema } from '@modelcontextprotocol/sdk/types.js';

export interface StdioOptions {
  type: 'stdio';
  command: string;
  args: string[];
}

export interface WebSocketOptions {
  type: 'websocket';
  url: string;
}

export interface SSEOptions {
  type: 'sse';
  url: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string }>;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type TransportOptions = StdioOptions | WebSocketOptions | SSEOptions;

export interface MCPOptions {
  transport: TransportOptions;
}

export type Tool = z.infer<typeof ToolSchema>;
