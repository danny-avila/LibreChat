import { z } from 'zod';
import {
  Tools,
  SSEOptionsSchema,
  MCPServersSchema,
  StdioOptionsSchema,
  WebSocketOptionsSchema,
  StreamableHTTPOptionsSchema,
} from 'librechat-data-provider';
import type {
  EmbeddedResource,
  ListToolsResult,
  ImageContent,
  AudioContent,
  TextContent,
  ResourceLink,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { SearchResultData, UIResource, TPlugin } from 'librechat-data-provider';
import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type {
  MCPOptions,
  ParsedServerConfig,
  MCPConnectionProvenance,
  MCPToolCatalogScope,
} from '~/mcp/provenance';
import type { OboTokenResolver, OboTrustChecker } from '~/mcp/oauth/obo';
import type { GraphTokenResolver } from '~/utils/graph';
import type { FlowStateManager } from '~/flow/manager';
import type { RequestBody } from '~/types/http';
import type * as o from '~/mcp/oauth/types';

export type StdioOptions = z.infer<typeof StdioOptionsSchema>;
export type WebSocketOptions = z.infer<typeof WebSocketOptionsSchema>;
export type SSEOptions = z.infer<typeof SSEOptionsSchema>;
export type StreamableHTTPOptions = z.infer<typeof StreamableHTTPOptionsSchema>;
export type { LCAvailableTools, LCFunctionTool, MCPOptions } from '~/mcp/provenance';
export type MCPServers = z.infer<typeof MCPServersSchema>;
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export type { MCPConnectionProvenance, MCPToolCatalogScope } from '~/mcp/provenance';
export type LCManifestTool = TPlugin;
export type LCToolManifest = TPlugin[];
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string }>;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MCPTool = Tool;
export type MCPToolListResponse = ListToolsResult;
export type ToolContentPart =
  | TextContent
  | ImageContent
  | EmbeddedResource
  | AudioContent
  | ResourceLink;
export type { TextContent, ImageContent, EmbeddedResource, AudioContent, ResourceLink };
export type MCPToolCallResponse =
  | undefined
  | {
      _meta?: Record<string, unknown>;
      content?: Array<ToolContentPart>;
      isError?: boolean;
    };

export type Provider =
  | 'google'
  | 'anthropic'
  | 'openai'
  | 'azureopenai'
  | 'openrouter'
  | 'xai'
  | 'deepseek'
  | 'ollama'
  | 'bedrock';

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

export type FileSearchSource = {
  fileId: string;
  relevance: number;
  fileName?: string;
  metadata?: {
    storageType?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type Artifacts =
  | {
      content?: FormattedContent[];
      [Tools.ui_resources]?: {
        data: UIResource[];
      };
      [Tools.file_search]?: {
        sources: FileSearchSource[];
        fileCitations?: boolean;
      };
      [Tools.web_search]?: SearchResultData;
      files?: Array<{ id: string; name: string }>;
      session_id?: string;
      file_ids?: string[];
    }
  | undefined;

export type FormattedContentResult = [string, Artifacts | undefined];

export type ImageFormatter = (item: ImageContent) => FormattedContent;

export type FormattedToolResponse = FormattedContentResult;

/**
 * Origin of an MCP server definition.
 * - `'yaml'`   — operator-defined in librechat.yaml, full trust, boot-time init
 * - `'config'` — admin-defined via Config override, full trust, lazy init
 * - `'user'`   — user-provided via UI, sandboxed (restricted placeholder resolution)
 */
export type { MCPServerSource, ParsedServerConfig } from '~/mcp/provenance';

export type AddServerResult = {
  serverName: string;
  config: ParsedServerConfig;
};

export interface BasicConnectionOptions {
  serverName: string;
  serverConfig: MCPOptions;
  /** Internal pre-Graph declarative config retained for provenance fingerprints. */
  declarativeServerConfig?: MCPOptions;
  useSSRFProtection?: boolean;
  allowedDomains?: string[] | null;
  /** Admin exemption list of host:port pairs that bypass the SSRF private-IP block */
  allowedAddresses?: string[] | null;
  /** When true, only resolve customUserVars in processMCPEnv (for DB-stored servers) */
  dbSourced?: boolean;
  /** When true, serverConfig has already gone through processMCPEnv for this request */
  skipEnvProcessing?: boolean;
  /** When true, the connection is intentionally short-lived for a single request/tool call */
  ephemeralConnection?: boolean;
}

/** User context for placeholder resolution in MCP connections (non-OAuth and OAuth alike) */
export interface UserConnectionContext {
  user?: IUser;
  customUserVars?: Record<string, string>;
  /** Exact post-placeholder config issued by the host authority resolver. */
  effectiveServerConfig?: ParsedServerConfig;
  /** Exact SSRF policy issued with the resolved server config. */
  securityPolicy?: {
    allowedDomains?: string[] | null;
    allowedAddresses?: string[] | null;
    useSSRFProtection: boolean;
  };
  requestBody?: RequestBody;
  requestScopedConnections?: RequestScopedMCPConnectionStore;
  graphTokenResolver?: GraphTokenResolver;
  connectionTimeout?: number;
  /** Authority captured by the host before an interactive OAuth flow starts. */
  oauthAuthorityScope?: MCPToolCatalogScope;
  /** Authorization mode bound to the issued authority scope. */
  authorityAuthorizationKind?: MCPConnectionProvenance['authorizationKind'];
  /** Staged authority fences for refresh-token exchange, persistence, and acceptance. */
  refreshAuthorityLifecycle?: MCPRefreshAuthorityLifecycle;
}

export interface RequestScopedMCPConnectionStore {
  connections: Map<string, unknown>;
  pending: Map<string, Promise<unknown>>;
}

export interface OAuthStartOptions {
  expiresAt?: number;
}

export type OAuthStartHandler = (authURL: string, options?: OAuthStartOptions) => Promise<void>;

export interface OAuthConnectionOptions extends UserConnectionContext {
  useOAuth: true;
  flowManager: FlowStateManager<o.MCPOAuthTokens | null>;
  tokenMethods?: TokenMethods;
  signal?: AbortSignal;
  oauthStart?: OAuthStartHandler;
  oauthEnd?: () => Promise<void>;
  returnOnOAuth?: boolean;
  oboTokenResolver?: OboTokenResolver;
  oboTrustChecker?: OboTrustChecker;
}

export interface MCPRefreshAuthorityLifecycle {
  exchange<Result>(action: () => Promise<Result>): Promise<Result>;
  store<Result>(tokens: o.MCPOAuthTokens, action: () => Promise<Result>): Promise<Result>;
  accept(tokens: o.MCPOAuthTokens): Promise<void>;
}

/** Options accepted by UserConnectionManager.getUserConnection. OAuth fields are optional. */
export interface UserMCPConnectionOptions extends UserConnectionContext {
  serverName: string;
  forceNew?: boolean;
  ephemeralConnection?: boolean;
  serverConfig?: ParsedServerConfig;
  flowManager?: FlowStateManager<o.MCPOAuthTokens | null>;
  tokenMethods?: TokenMethods;
  signal?: AbortSignal;
  oauthStart?: OAuthStartHandler;
  oauthEnd?: () => Promise<void>;
  returnOnOAuth?: boolean;
  oboTokenResolver?: OboTokenResolver;
  oboTrustChecker?: OboTrustChecker;
}

export interface ToolDiscoveryOptions {
  serverName: string;
  serverConfig?: ParsedServerConfig;
  effectiveServerConfig?: ParsedServerConfig;
  securityPolicy?: UserConnectionContext['securityPolicy'];
  user?: IUser;
  flowManager?: FlowStateManager<o.MCPOAuthTokens | null>;
  tokenMethods?: TokenMethods;
  signal?: AbortSignal;
  oauthStart?: OAuthStartHandler;
  customUserVars?: Record<string, string>;
  requestBody?: RequestBody;
  graphTokenResolver?: GraphTokenResolver;
  connectionTimeout?: number;
  /** Pre-resolved config-source servers for tenant-scoped lookup */
  configServers?: Record<string, ParsedServerConfig>;
  oboTokenResolver?: OboTokenResolver;
  oboTrustChecker?: OboTrustChecker;
  refreshAuthorityLifecycle?: MCPRefreshAuthorityLifecycle;
  oauthAuthorityScope?: MCPToolCatalogScope;
  authorityAuthorizationKind?: MCPConnectionProvenance['authorizationKind'];
}

export interface ToolDiscoveryResult {
  tools: Tool[] | null;
  oauthRequired: boolean;
  oauthUrl: string | null;
  provenance: MCPConnectionProvenance | null;
}
