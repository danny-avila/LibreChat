import { logger, getTenantId } from '@librechat/data-schemas';
import { Constants, type MCPOptions } from 'librechat-data-provider';
import type { TokenMethods } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { ParsedServerConfig } from '~/mcp/types';
import type { MCPOAuthTokens } from './types';
import { getMCPAppToolsPublicationGeneration } from '~/mcp/toolsChanged';
import { MCPOAuthHandler } from './handler';
import { isOAuthServer } from '~/mcp/utils';
import { MCPTokenStorage } from './tokens';

export function getMCPServerGeneration(config: ParsedServerConfig): string {
  const definitionGeneration = getMCPAppToolsPublicationGeneration(config);
  if (config.dbId) {
    return `db:${config.dbId}:${definitionGeneration}`;
  }
  return `config:${definitionGeneration}`;
}

interface CleanupConfig {
  mcpSettings?: {
    allowedDomains?: string[] | null;
    allowedAddresses?: string[] | null;
  };
  mcpServers?: Record<string, MCPOptions>;
}

export interface MCPOAuthCleanupDependencies {
  flowManager: FlowStateManager<MCPOAuthTokens | null>;
  oauthHandler: Pick<
    typeof MCPOAuthHandler,
    'generateFlowId' | 'generateTokenFlowId' | 'deleteFlowAndStateMapping' | 'revokeOAuthToken'
  >;
  tokenStorage: Pick<
    typeof MCPTokenStorage,
    'deleteUserTokens' | 'getClientInfoAndMetadata' | 'getTokens' | 'assertCredentialSetBinding'
  >;
  findToken: TokenMethods['findToken'];
  deleteTokens: TokenMethods['deleteTokens'];
  getServerConfig: (serverName: string, userId: string) => Promise<MCPOptions | undefined>;
  isRegisteredOAuthServer: (serverName: string, userId: string) => Promise<boolean>;
}

interface ClearStateParams {
  userId: string;
  serverName: string;
  dependencies: Pick<
    MCPOAuthCleanupDependencies,
    'flowManager' | 'deleteTokens' | 'oauthHandler' | 'tokenStorage'
  >;
  skipOAuthFlows?: boolean;
  credentialSetId?: string | null;
  tokenSnapshot?: Map<string, string>;
}

const oauthTokenKeys = (serverName: string) => {
  const identifier = `mcp:${serverName}`;
  return [
    { type: 'mcp_oauth_client', identifier: `${identifier}:client` },
    { type: 'mcp_oauth', identifier },
    { type: 'mcp_oauth_refresh', identifier: `${identifier}:refresh` },
  ];
};

export async function clearStoredMCPOAuthState({
  userId,
  serverName,
  dependencies,
  skipOAuthFlows = false,
  credentialSetId,
  tokenSnapshot,
}: ClearStateParams): Promise<void> {
  try {
    await dependencies.tokenStorage.deleteUserTokens({
      userId,
      serverName,
      deleteToken: async (filter) => {
        const snapshotToken = tokenSnapshot?.get(`${filter.type}:${filter.identifier}`);
        if (tokenSnapshot && !snapshotToken) {
          return;
        }
        await dependencies.deleteTokens({
          ...filter,
          ...(snapshotToken && { token: snapshotToken }),
          ...(credentialSetId !== undefined && { metadataCredentialSetId: credentialSetId }),
        });
      },
    });
  } catch (error) {
    logger.warn(
      `[clearStoredMCPOAuthState] Failed to delete MCP OAuth tokens for ${serverName}:`,
      error,
    );
  }

  const tenantId = getTenantId();
  const baseFlowId = dependencies.oauthHandler.generateFlowId(userId, serverName);
  const flowDeletes = [
    [dependencies.oauthHandler.generateTokenFlowId(userId, serverName, tenantId), 'mcp_get_tokens'],
    [baseFlowId, 'mcp_get_tokens'],
    ...(!skipOAuthFlows
      ? ([
          [dependencies.oauthHandler.generateFlowId(userId, serverName, tenantId), 'mcp_oauth'],
          [baseFlowId, 'mcp_oauth'],
        ] as Array<[string, string]>)
      : []),
  ] satisfies Array<[string, string]>;
  const uniqueFlowDeletes = flowDeletes.filter(
    ([flowId, type], index, deletes) =>
      deletes.findIndex(
        ([candidateId, candidateType]) => candidateId === flowId && candidateType === type,
      ) === index,
  );
  const results = await Promise.allSettled(
    uniqueFlowDeletes.map(([flowId, type]) =>
      type === 'mcp_oauth'
        ? dependencies.oauthHandler.deleteFlowAndStateMapping(flowId, dependencies.flowManager)
        : dependencies.flowManager.deleteFlow(flowId, type),
    ),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn(
        `[clearStoredMCPOAuthState] Failed to clear MCP OAuth flow state for ${serverName}:`,
        result.reason,
      );
    }
  }
}

interface UninstallParams {
  userId: string;
  pluginKey: string;
  appConfig?: CleanupConfig;
  serverConfigOverride?: MCPOptions;
  dependencies: MCPOAuthCleanupDependencies;
}

export async function cleanupMCPServerOAuth({
  userId,
  pluginKey,
  appConfig,
  serverConfigOverride,
  dependencies,
}: UninstallParams): Promise<void> {
  if (!pluginKey.startsWith(Constants.mcp_prefix)) {
    return;
  }

  const serverName = pluginKey.replace(Constants.mcp_prefix, '');
  /** Snapshot exact encrypted values before cancelling the flow. Later cleanup can then remove
   * this authorization without matching credentials written by a replacement attempt. */
  const tokenSnapshot = new Map<string, string>();
  const snapshotResults = await Promise.allSettled(
    oauthTokenKeys(serverName).map(async ({ type, identifier }) => {
      const record = await dependencies.findToken({ userId, type, identifier });
      if (record?.token) {
        tokenSnapshot.set(`${type}:${identifier}`, record.token);
      }
    }),
  );
  for (const result of snapshotResults) {
    if (result.status === 'rejected') {
      logger.warn(
        `[maybeUninstallOAuthMCP] Failed to snapshot OAuth token state for ${serverName}:`,
        result.reason,
      );
    }
  }
  const flowIds = [
    dependencies.oauthHandler.generateFlowId(userId, serverName, getTenantId()),
    dependencies.oauthHandler.generateFlowId(userId, serverName),
  ];
  const flowResults = await Promise.allSettled(
    [...new Set(flowIds)].map((flowId) =>
      dependencies.oauthHandler.deleteFlowAndStateMapping(flowId, dependencies.flowManager),
    ),
  );
  for (const result of flowResults) {
    if (result.status === 'rejected') {
      logger.warn(
        `[clearStoredMCPOAuthState] Failed to clear MCP OAuth flow state for ${serverName}:`,
        result.reason,
      );
    }
  }

  const serverConfig =
    serverConfigOverride ??
    (await dependencies.getServerConfig(serverName, userId)) ??
    appConfig?.mcpServers?.[serverName];
  const oauthServer = serverConfigOverride
    ? isOAuthServer(serverConfigOverride)
    : await dependencies.isRegisteredOAuthServer(serverName, userId);
  if (!oauthServer || !serverConfig) {
    await clearStoredMCPOAuthState({
      userId,
      serverName,
      dependencies,
      skipOAuthFlows: true,
      tokenSnapshot,
    });
    return;
  }

  let clientTokenData;
  try {
    clientTokenData = await dependencies.tokenStorage.getClientInfoAndMetadata({
      userId,
      serverName,
      findToken: dependencies.findToken,
    });
  } catch (error) {
    logger.warn(
      `[maybeUninstallOAuthMCP] Unable to load OAuth client metadata for ${serverName}; clearing local MCP OAuth state only.`,
      error,
    );
    await clearStoredMCPOAuthState({
      userId,
      serverName,
      dependencies,
      skipOAuthFlows: true,
      tokenSnapshot,
    });
    return;
  }
  if (!clientTokenData) {
    await clearStoredMCPOAuthState({
      userId,
      serverName,
      dependencies,
      skipOAuthFlows: true,
      tokenSnapshot,
    });
    return;
  }

  const { clientInfo, clientMetadata } = clientTokenData;
  const credentialSetId = clientMetadata.credential_set_id;
  const storedServerUrl = clientMetadata.server_url;
  const storedClientSource = clientMetadata.client_source;
  if (
    typeof storedServerUrl !== 'string' ||
    typeof clientMetadata.token_endpoint !== 'string' ||
    typeof clientMetadata.revocation_endpoint !== 'string' ||
    typeof credentialSetId !== 'string' ||
    (storedClientSource !== 'configured' && storedClientSource !== 'dynamic')
  ) {
    logger.warn(
      `[maybeUninstallOAuthMCP] Stored binding is incomplete for ${serverName}; clearing local state.`,
    );
    await clearStoredMCPOAuthState({
      userId,
      serverName,
      dependencies,
      skipOAuthFlows: true,
      credentialSetId: typeof credentialSetId === 'string' ? credentialSetId : null,
      tokenSnapshot,
    });
    return;
  }

  let tokens = null;
  try {
    tokens = await dependencies.tokenStorage.getTokens({
      userId,
      serverName,
      findToken: dependencies.findToken,
    });
    if (tokens) {
      dependencies.tokenStorage.assertCredentialSetBinding(
        serverName,
        tokens.credential_set_id,
        clientMetadata,
      );
    }
  } catch (error) {
    tokens = null;
    logger.warn(
      `[maybeUninstallOAuthMCP] Unable to load OAuth tokens for ${serverName}; clearing local token state.`,
      error,
    );
  }

  const revocationMetadata = {
    serverUrl: storedServerUrl,
    clientId: clientInfo.client_id,
    clientSecret: clientInfo.client_secret ?? '',
    revocationEndpoint: clientMetadata.revocation_endpoint,
    revocationEndpointAuthMethodsSupported: Array.isArray(
      clientMetadata.revocation_endpoint_auth_methods_supported,
    )
      ? clientMetadata.revocation_endpoint_auth_methods_supported.filter(
          (method): method is string => typeof method === 'string',
        )
      : undefined,
  };
  const oauthHeaders = serverConfig.oauth_headers ?? {};
  const allowedDomains = appConfig?.mcpSettings?.allowedDomains;
  const allowedAddresses = appConfig?.mcpSettings?.allowedAddresses;
  for (const [tokenType, token] of [
    ['access', tokens?.access_token],
    ['refresh', tokens?.refresh_token],
  ] as const) {
    if (!token) {
      continue;
    }
    try {
      await dependencies.oauthHandler.revokeOAuthToken(
        serverName,
        token,
        tokenType,
        revocationMetadata,
        oauthHeaders,
        allowedDomains,
        allowedAddresses,
      );
    } catch (error) {
      logger.error(`[maybeUninstallOAuthMCP] Error revoking ${tokenType} token:`, error);
    }
  }

  await clearStoredMCPOAuthState({
    userId,
    serverName,
    dependencies,
    skipOAuthFlows: true,
    credentialSetId,
    tokenSnapshot,
  });
}
