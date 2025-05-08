import { z } from 'zod';
import {
  SSEOptionsSchema,
  MCPOptionsSchema,
  MCPServersSchema,
  StdioOptionsSchema,
  WebSocketOptionsSchema,
} from 'librechat-data-provider';
import type { JsonSchemaType, TPlugin } from 'librechat-data-provider';
import { ToolSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type * as t from '@modelcontextprotocol/sdk/types.js';

export type StdioOptions = z.infer<typeof StdioOptionsSchema>;
export type WebSocketOptions = z.infer<typeof WebSocketOptionsSchema>;
export type SSEOptions = z.infer<typeof SSEOptionsSchema>;
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

export type LCToolManifest = TPlugin[];
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string }>;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MCPTool = z.infer<typeof ToolSchema>;
export type MCPToolListResponse = z.infer<typeof ListToolsResultSchema>;
export type ToolContentPart = t.TextContent | t.ImageContent | t.EmbeddedResource | t.AudioContent;
export type ImageContent = Extract<ToolContentPart, { type: 'image' }>;
export type MCPToolCallResponse =
  | undefined
  | {
      _meta?: Record<string, unknown>;
      content?: Array<ToolContentPart>;
      isError?: boolean;
    };

export type Provider = 'google' | 'anthropic' | 'openAI';

export type FormattedContent =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      inlineData: {
        mimeType: string;
        data: string;
      };
    }
  | {
      type: 'image';
      source: {
        type: 'base64';
        media_type: string;
        data: string;
      };
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
    };

export type FormattedContentResult = [
  string | FormattedContent[],
  undefined | { content: FormattedContent[] },
];

export type ImageFormatter = (item: ImageContent) => FormattedContent;

export type FormattedToolResponse = [
  string | FormattedContent[],
  { content: FormattedContent[] } | undefined,
];
