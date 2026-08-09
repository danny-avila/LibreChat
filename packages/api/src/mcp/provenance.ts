import { z } from 'zod';
import { MCPOptionsSchema } from 'librechat-data-provider';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { LCTool } from '@librechat/agents';

export type MCPOptions = z.infer<typeof MCPOptionsSchema> & {
  customUserVars?: Record<
    string,
    {
      title: string;
      description: string;
    }
  >;
};

export interface LCFunctionTool {
  type: 'function';
  ['function']: LCTool & Pick<Tool, 'outputSchema' | 'annotations'>;
}

export type LCAvailableTools = Record<string, LCFunctionTool>;

export type MCPServerSource = 'yaml' | 'config' | 'user' | 'plugin';

export type ParsedServerConfig = MCPOptions & {
  url?: string;
  requiresOAuth?: boolean;
  oauthMetadata?: Record<string, unknown> | null;
  capabilities?: string;
  tools?: string;
  toolFunctions?: LCAvailableTools;
  initDuration?: number;
  updatedAt?: number;
  dbId?: string;
  source?: MCPServerSource;
  consumeOnly?: boolean;
  inspectionFailed?: boolean;
  author?: string;
  catalogConfiguredRequiresOAuth?: boolean | null;
  catalogConfiguredServerInstructions?: boolean | string | null;
};

export interface MCPToolCatalogScope {
  tenant: string;
  principal: string;
  server: string;
  policy: string;
  config: string;
  credentials: string;
}

export interface MCPConnectionProvenance {
  version: 1;
  scope: MCPToolCatalogScope;
  principalKind: 'app' | 'user';
  authorizationKind: 'none' | 'oauth' | 'obo';
}

export interface MCPToolCatalogScopeInput {
  tenantId: string | null;
  userId: string;
  serverName: string;
  serverConfig: ParsedServerConfig;
  securityPolicyIdentity: string;
  customUserVars?: Record<string, string>;
  authorizationIdentity: string;
  /** Authorization mode proven by the connection that discovered these schemas. */
  authorizationKind?: MCPConnectionProvenance['authorizationKind'];
  /** Exact post-placeholder config used to construct the discovering connection. */
  effectiveServerConfig?: MCPOptions;
}

export interface MCPToolCatalogMetadata {
  version: 1;
  source: MCPServerSource | 'unknown';
  revision: string;
  authorizationKind: MCPConnectionProvenance['authorizationKind'];
  cachedAt: number;
  freshUntil: number;
  scope: MCPToolCatalogScope;
}
