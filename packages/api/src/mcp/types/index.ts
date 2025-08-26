import { z } from 'zod';
import {
  SSEOptionsSchema,
  MCPOptionsSchema,
  MCPServersSchema,
  StdioOptionsSchema,
  WebSocketOptionsSchema,
  StreamableHTTPOptionsSchema,
} from 'librechat-data-provider';
import type { TPlugin, TUser } from 'librechat-data-provider';
import type * as t from '@modelcontextprotocol/sdk/types.js';
import type { TokenMethods } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { JsonSchemaType } from '~/types/zod';
import type { RequestBody } from '~/types/http';
import type * as o from '~/mcp/oauth/types';

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

export type ParsedServerConfig = MCPOptions & {
  url?: string;
  requiresOAuth?: boolean;
  oauthMetadata?: Record<string, unknown> | null;
  capabilities?: string;
  tools?: string;
};

export interface BasicConnectionOptions {
  serverName: string;
  serverConfig: MCPOptions;
}

export interface OAuthConnectionOptions {
  user: TUser;
  useOAuth: true;
  requestBody?: RequestBody;
  customUserVars?: Record<string, string>;
  flowManager: FlowStateManager<o.MCPOAuthTokens | null>;
  tokenMethods?: TokenMethods;
  signal?: AbortSignal;
  oauthStart?: (authURL: string) => Promise<void>;
  oauthEnd?: () => Promise<void>;
  returnOnOAuth?: boolean;
  connectionTimeout?: number;
}
