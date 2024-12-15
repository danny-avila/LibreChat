import { z } from 'zod';
import {
  StdioOptionsSchema,
  WebSocketOptionsSchema,
  SSEOptionsSchema,
  TransportOptionsSchema,
  MCPOptionsSchema,
  MCPServersSchema,
} from 'librechat-data-provider';
import type { JsonSchemaType } from 'librechat-data-provider';
import { ToolSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';

export type StdioOptions = z.infer<typeof StdioOptionsSchema>;
export type WebSocketOptions = z.infer<typeof WebSocketOptionsSchema>;
export type SSEOptions = z.infer<typeof SSEOptionsSchema>;
export type TransportOptions = z.infer<typeof TransportOptionsSchema>;
export type MCPOptions = z.infer<typeof MCPOptionsSchema>;
export type MCPServers = z.infer<typeof MCPServersSchema>;
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}
export interface LCTool {
  name: string;
  description?: string;
  parameters: JsonSchemaType;
}

export interface LCFunctionTool {
  type: 'function';
  ['function']: LCTool;
}

export type LCAvailableTools = Record<string, LCFunctionTool>;

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string }>;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MCPTool = z.infer<typeof ToolSchema>;
export type MCPToolListResponse = z.infer<typeof ListToolsResultSchema>;

export type MCPToolCallResponse = {
  _meta?: Record<string, unknown>;
  content: Array<
    | {
        type: 'text';
        text: string;
      }
    | {
        type: 'image';
        data: string;
        mimeType: string;
      }
    | {
        type: 'resource';
        resource: {
          uri: string;
          mimeType?: string;
          text?: string;
          blob?: string;
        };
      }
  >;
  isError?: boolean;
};
