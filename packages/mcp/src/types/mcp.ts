import { z } from 'zod';
import { ToolSchema } from '@modelcontextprotocol/sdk/types.js';
import * as s from '../schema';

export type StdioOptions = z.infer<typeof s.StdioOptionsSchema>;
export type WebSocketOptions = z.infer<typeof s.WebSocketOptionsSchema>;
export type SSEOptions = z.infer<typeof s.SSEOptionsSchema>;
export type TransportOptions = z.infer<typeof s.TransportOptionsSchema>;
export type MCPOptions = z.infer<typeof s.MCPOptionsSchema>;
export type MCPServers = z.infer<typeof s.MCPServersSchema>;
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

export type Tool = z.infer<typeof ToolSchema>;
