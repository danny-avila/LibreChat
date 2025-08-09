import { z } from 'zod';
import {
  SSEOptionsSchema,
  MCPOptionsSchema,
  MCPServersSchema,
  StdioOptionsSchema,
  WebSocketOptionsSchema,
  StreamableHTTPOptionsSchema,
} from 'librechat-data-provider';
import type * as t from '@modelcontextprotocol/sdk/types.js';
import type { TPlugin } from 'librechat-data-provider';
import type { JsonSchemaType } from '~/types/zod';
import {
  ElicitationActionSchema,
  ElicitationPropertySchema,
  ElicitationRequestSchemaSchema,
  ElicitationCreateRequestSchema,
  ElicitationResponseSchema,
  ElicitationStateSchema,
} from '../zod';

export type StdioOptions = z.infer<typeof StdioOptionsSchema>;
export type WebSocketOptions = z.infer<typeof WebSocketOptionsSchema>;
export type SSEOptions = z.infer<typeof SSEOptionsSchema>;
export type StreamableHTTPOptions = z.infer<typeof StreamableHTTPOptionsSchema>;
export type MCPOptions = z.infer<typeof MCPOptionsSchema> & {
  customUserVars?: Record<
    string,
    {
      title: string;
      description: string;
    }
  >;
};
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
export type LCManifestTool = TPlugin;
export type LCToolManifest = TPlugin[];
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string }>;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MCPTool = z.infer<typeof t.ToolSchema>;
export type MCPToolListResponse = z.infer<typeof t.ListToolsResultSchema>;
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

// Elicitation types
export type ElicitationAction = 'accept' | 'decline' | 'cancel';

export interface ElicitationPropertySchema {
  type: 'string' | 'number' | 'integer' | 'boolean';
  title?: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  format?: 'email' | 'uri' | 'date' | 'date-time';
  default?: string | number | boolean;
  enum?: string[];
  enumNames?: string[];
}

export interface ElicitationRequestSchema {
  type: 'object';
  properties: Record<string, ElicitationPropertySchema>;
  required?: string[];
}

// Zod inferred types
export type ElicitationActionType = z.infer<typeof ElicitationActionSchema>;
export type ElicitationPropertySchemaType = z.infer<typeof ElicitationPropertySchema>;
export type ElicitationRequestSchemaType = z.infer<typeof ElicitationRequestSchemaSchema>;
export type ElicitationCreateRequestType = z.infer<typeof ElicitationCreateRequestSchema>;
export type ElicitationResponseType = z.infer<typeof ElicitationResponseSchema>;
export type ElicitationStateType = z.infer<typeof ElicitationStateSchema>;

export interface ElicitationCreateRequest {
  message: string;
  requestedSchema: ElicitationRequestSchema;
  tool_call_id?: string;
}

export interface ElicitationResponse {
  action: ElicitationAction;
  content?: Record<string, unknown>;
}

export interface ElicitationState {
  id: string;
  serverName: string;
  userId: string;
  request: ElicitationCreateRequest;
  tool_call_id?: string;
  timestamp: number;
}

// Export Zod schemas
export {
  ElicitationActionSchema,
  ElicitationPropertySchema,
  ElicitationRequestSchemaSchema,
  ElicitationCreateRequestSchema,
  ElicitationResponseSchema,
  ElicitationStateSchema,
};
