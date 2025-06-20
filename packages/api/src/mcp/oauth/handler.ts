import { randomBytes } from 'crypto';
import { logger } from '@librechat/data-schemas';
import {
  discoverOAuthMetadata,
  registerClient,
  startAuthorization,
  exchangeAuthorization,
  discoverOAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { MCPOptions } from 'librechat-data-provider';
import type { FlowStateManager } from '~/flow/manager';
import type {
  OAuthClientInformation,
  OAuthProtectedResourceMetadata,
  MCPOAuthFlowMetadata,
  MCPOAuthTokens,
  OAuthMetadata,
} from './types';

/** Type for the OAuth metadata from the SDK */
type SDKOAuthMetadata = Parameters<typeof registerClient>[1]['metadata'];

export class MCPOAuthHandler {
  private static readonly FLOW_TYPE = 'mcp_oauth';
  private static readonly FLOW_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Discovers OAuth metadata from the server
   */
  private static async discoverMetadata(serverUrl: string): Promise<{
    metadata: OAuthMetadata;
    resourceMetadata?: OAuthProtectedResourceMetadata;
    authServerUrl: URL;
  }> {
    logger.debug(`[MCPOAuth] discoverMetadata called with serverUrl: ${serverUrl}`);

    let authServerUrl = new URL(serverUrl);
    let resourceMetadata: OAuthProtectedResourceMetadata | undefined;

    try {
      // Try to discover resource metadata first
      logger.debug(
        `[MCPOAuth] Attempting to discover protected resource metadata from ${serverUrl}`,
      );
      resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl);

      if (resourceMetadata?.authorization_servers?.length) {
        authServerUrl = new URL(resourceMetadata.authorization_servers[0]);
        logger.debug(
          `[MCPOAuth] Found authorization server from resource metadata: ${authServerUrl}`,
        );
      } else {
        logger.debug(`[MCPOAuth] No authorization servers found in resource metadata`);
      }
    } catch (error) {
      logger.debug('[MCPOAuth] Resource metadata discovery failed, continuing with server URL', {
        error,
      });
    }

    // Discover OAuth metadata
    logger.debug(`[MCPOAuth] Discovering OAuth metadata from ${authServerUrl}`);
    const rawMetadata = await discoverOAuthMetadata(authServerUrl);

    if (!rawMetadata) {
      logger.error(`[MCPOAuth] Failed to discover OAuth metadata from ${authServerUrl}`);
      throw new Error('Failed to discover OAuth metadata');
    }

    logger.debug(`[MCPOAuth] OAuth metadata discovered successfully`);
    const metadata = await OAuthMetadataSchema.parseAsync(rawMetadata);

    logger.debug(`[MCPOAuth] OAuth metadata parsed successfully`);
    return {
      metadata: metadata as unknown as OAuthMetadata,
      resourceMetadata,
      authServerUrl,
    };
  }

  /**
   * Registers an OAuth client dynamically
   */
  private static async registerOAuthClient(
    serverUrl: string,
    metadata: OAuthMetadata,
    resourceMetadata?: OAuthProtectedResourceMetadata,
    redirectUri?: string,
  ): Promise<OAuthClientInformation> {
    logger.debug(`[MCPOAuth] Starting client registration for ${serverUrl}, server metadata:`, {
      grant_types_supported: metadata.grant_types_supported,
      response_types_supported: metadata.response_types_supported,
      token_endpoint_auth_methods_supported: metadata.token_endpoint_auth_methods_supported,
      scopes_supported: metadata.scopes_supported,
    });

    /** Client metadata based on what the server supports */
    const clientMetadata = {
      client_name: 'LibreChat MCP Client',
      redirect_uris: [redirectUri || this.getDefaultRedirectUri()],
      grant_types: ['authorization_code'] as string[],
      response_types: ['code'] as string[],
      token_endpoint_auth_method: 'client_secret_basic',
      scope: undefined as string | undefined,
    };

    const supportedGrantTypes = metadata.grant_types_supported || ['authorization_code'];
    const requestedGrantTypes = ['authorization_code'];

    if (supportedGrantTypes.includes('refresh_token')) {
      requestedGrantTypes.push('refresh_token');
      logger.debug(
        `[MCPOAuth] Server ${serverUrl} supports \`refresh_token\` grant type, adding to request`,
      );
    } else {
      logger.debug(`[MCPOAuth] Server ${serverUrl} does not support \`refresh_token\` grant type`);
    }
    clientMetadata.grant_types = requestedGrantTypes;

    clientMetadata.response_types = metadata.response_types_supported || ['code'];

    if (metadata.token_endpoint_auth_methods_supported) {
      // Prefer client_secret_basic if supported, otherwise use the first supported method
      if (metadata.token_endpoint_auth_methods_supported.includes('client_secret_basic')) {
        clientMetadata.token_endpoint_auth_method = 'client_secret_basic';
      } else if (metadata.token_endpoint_auth_methods_supported.includes('client_secret_post')) {
        clientMetadata.token_endpoint_auth_method = 'client_secret_post';
      } else if (metadata.token_endpoint_auth_methods_supported.includes('none')) {
        clientMetadata.token_endpoint_auth_method = 'none';
      } else {
        clientMetadata.token_endpoint_auth_method =
          metadata.token_endpoint_auth_methods_supported[0];
      }
    }

    const availableScopes = resourceMetadata?.scopes_supported || metadata.scopes_supported;
    if (availableScopes) {
      clientMetadata.scope = availableScopes.join(' ');
    }

    logger.debug(`[MCPOAuth] Registering client for ${serverUrl} with metadata:`, clientMetadata);

    const clientInfo = await registerClient(serverUrl, {
      metadata: metadata as unknown as SDKOAuthMetadata,
      clientMetadata,
    });

    logger.debug(`[MCPOAuth] Client registered successfully for ${serverUrl}:`, {
      client_id: clientInfo.client_id,
      has_client_secret: !!clientInfo.client_secret,
      grant_types: clientInfo.grant_types,
      scope: clientInfo.scope,
    });

    return clientInfo;
  }

  /**
   * Initiates the OAuth flow for an MCP server
   */
  static async initiateOAuthFlow(
    serverName: string,
    serverUrl: string,
    userId: string,
    config: MCPOptions['oauth'] | undefined,
  ): Promise<{ authorizationUrl: string; flowId: string; flowMetadata: MCPOAuthFlowMetadata }> {
    logger.debug(`[MCPOAuth] initiateOAuthFlow called for ${serverName} with URL: ${serverUrl}`);

    const flowId = this.generateFlowId(userId, serverName);
    const state = this.generateState();

    logger.debug(`[MCPOAuth] Generated flowId: ${flowId}, state: ${state}`);

    try {
      // Check if we have pre-configured OAuth settings
      if (config?.authorization_url && config?.token_url && config?.client_id) {
        logger.debug(`[MCPOAuth] Using pre-configured OAuth settings for ${serverName}`);
        /** Metadata based on pre-configured settings */
        const metadata: OAuthMetadata = {
          authorization_endpoint: config.authorization_url,
          token_endpoint: config.token_url,
          issuer: serverUrl,
          scopes_supported: config.scope?.split(' '),
        };

        const clientInfo: OAuthClientInformation = {
          client_id: config.client_id,
          client_secret: config.client_secret,
          redirect_uris: [config.redirect_uri || this.getDefaultRedirectUri(serverName)],
          scope: config.scope,
        };

        logger.debug(`[MCPOAuth] Starting authorization with pre-configured settings`);
        const { authorizationUrl, codeVerifier } = await startAuthorization(serverUrl, {
          metadata: metadata as unknown as SDKOAuthMetadata,
          clientInformation: clientInfo,
          redirectUrl: clientInfo.redirect_uris?.[0] || this.getDefaultRedirectUri(serverName),
          scope: config.scope,
        });

        /** Add state parameter with flowId to the authorization URL */
        authorizationUrl.searchParams.set('state', flowId);
        logger.debug(`[MCPOAuth] Added state parameter to authorization URL`);

        const flowMetadata: MCPOAuthFlowMetadata = {
          serverName,
          userId,
          serverUrl,
          state,
          codeVerifier,
          clientInfo,
          metadata,
        };

        logger.debug(`[MCPOAuth] Authorization URL generated: ${authorizationUrl.toString()}`);
        return {
          authorizationUrl: authorizationUrl.toString(),
          flowId,
          flowMetadata,
        };
      }

      logger.debug(`[MCPOAuth] Starting auto-discovery of OAuth metadata from ${serverUrl}`);
      const { metadata, resourceMetadata, authServerUrl } = await this.discoverMetadata(serverUrl);

      logger.debug(`[MCPOAuth] OAuth metadata discovered, auth server URL: ${authServerUrl}`);

      /** Dynamic client registration based on the discovered metadata */
      const redirectUri = config?.redirect_uri || this.getDefaultRedirectUri(serverName);
      logger.debug(`[MCPOAuth] Registering OAuth client with redirect URI: ${redirectUri}`);

      const clientInfo = await this.registerOAuthClient(
        authServerUrl.toString(),
        metadata,
        resourceMetadata,
        redirectUri,
      );

      logger.debug(`[MCPOAuth] Client registered with ID: ${clientInfo.client_id}`);

      /** Authorization Scope */
      const scope =
        config?.scope ||
        resourceMetadata?.scopes_supported?.join(' ') ||
        metadata.scopes_supported?.join(' ');

      logger.debug(`[MCPOAuth] Starting authorization with scope: ${scope}`);

      let authorizationUrl: URL;
      let codeVerifier: string;

      try {
        logger.debug(`[MCPOAuth] Calling startAuthorization...`);
        const authResult = await startAuthorization(serverUrl, {
          metadata: metadata as unknown as SDKOAuthMetadata,
          clientInformation: clientInfo,
          redirectUrl: redirectUri,
          scope,
        });

        authorizationUrl = authResult.authorizationUrl;
        codeVerifier = authResult.codeVerifier;

        logger.debug(`[MCPOAuth] startAuthorization completed successfully`);
        logger.debug(`[MCPOAuth] Authorization URL: ${authorizationUrl.toString()}`);

        /** Add state parameter with flowId to the authorization URL */
        authorizationUrl.searchParams.set('state', flowId);
        logger.debug(`[MCPOAuth] Added state parameter to authorization URL`);
      } catch (error) {
        logger.error(`[MCPOAuth] startAuthorization failed:`, error);
        throw error;
      }

      const flowMetadata: MCPOAuthFlowMetadata = {
        serverName,
        userId,
        serverUrl,
        state,
        codeVerifier,
        clientInfo,
        metadata,
        resourceMetadata,
      };

      logger.debug(
        `[MCPOAuth] Authorization URL generated for ${serverName}: ${authorizationUrl.toString()}`,
      );

      const result = {
        authorizationUrl: authorizationUrl.toString(),
        flowId,
        flowMetadata,
      };

      logger.debug(
        `[MCPOAuth] Returning from initiateOAuthFlow with result ${flowId} for ${serverName}`,
        result,
      );
      return result;
    } catch (error) {
      logger.error('[MCPOAuth] Failed to initiate OAuth flow', { error, serverName, userId });
      throw error;
    }
  }

  /**
   * Completes the OAuth flow by exchanging the authorization code for tokens
   */
  static async completeOAuthFlow(
    flowId: string,
    authorizationCode: string,
    flowManager: FlowStateManager<MCPOAuthTokens>,
  ): Promise<MCPOAuthTokens> {
    try {
      /** Flow state which contains our metadata */
      const flowState = await flowManager.getFlowState(flowId, this.FLOW_TYPE);
      if (!flowState) {
        throw new Error('OAuth flow not found');
      }

      const flowMetadata = flowState.metadata as MCPOAuthFlowMetadata;
      if (!flowMetadata) {
        throw new Error('OAuth flow metadata not found');
      }

      const metadata = flowMetadata;
      if (!metadata.metadata || !metadata.clientInfo || !metadata.codeVerifier) {
        throw new Error('Invalid flow metadata');
      }

      const tokens = await exchangeAuthorization(metadata.serverUrl, {
        metadata: metadata.metadata as unknown as SDKOAuthMetadata,
        clientInformation: metadata.clientInfo,
        authorizationCode,
        codeVerifier: metadata.codeVerifier,
        redirectUri: metadata.clientInfo.redirect_uris?.[0] || this.getDefaultRedirectUri(),
      });

      logger.debug('[MCPOAuth] Raw tokens from exchange:', {
        access_token: tokens.access_token ? '[REDACTED]' : undefined,
        refresh_token: tokens.refresh_token ? '[REDACTED]' : undefined,
        expires_in: tokens.expires_in,
        token_type: tokens.token_type,
        scope: tokens.scope,
      });

      const mcpTokens: MCPOAuthTokens = {
        ...tokens,
        obtained_at: Date.now(),
        expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
      };

      /** Now complete the flow with the tokens */
      await flowManager.completeFlow(flowId, this.FLOW_TYPE, mcpTokens);

      return mcpTokens;
    } catch (error) {
      logger.error('[MCPOAuth] Failed to complete OAuth flow', { error, flowId });
      await flowManager.failFlow(flowId, this.FLOW_TYPE, error as Error);
      throw error;
    }
  }

  /**
   * Gets the OAuth flow metadata
   */
  static async getFlowState(
    flowId: string,
    flowManager: FlowStateManager<MCPOAuthTokens>,
  ): Promise<MCPOAuthFlowMetadata | null> {
    const flowState = await flowManager.getFlowState(flowId, this.FLOW_TYPE);
    if (!flowState) {
      return null;
    }
    return flowState.metadata as MCPOAuthFlowMetadata;
  }

  /**
   * Generates a flow ID for the OAuth flow
   * @returns Consistent ID so concurrent requests share the same flow
   */
  public static generateFlowId(userId: string, serverName: string): string {
    return `${userId}:${serverName}`;
  }

  /**
   * Generates a secure state parameter
   */
  private static generateState(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Gets the default redirect URI for a server
   */
  private static getDefaultRedirectUri(serverName?: string): string {
    const baseUrl = process.env.DOMAIN_SERVER || 'http://localhost:3080';
    return serverName
      ? `${baseUrl}/api/mcp/${serverName}/oauth/callback`
      : `${baseUrl}/api/mcp/oauth/callback`;
  }

  /**
   * Refreshes OAuth tokens using a refresh token
   */
  static async refreshOAuthTokens(
    refreshToken: string,
    metadata: { serverName: string; serverUrl?: string; clientInfo?: OAuthClientInformation },
    config?: MCPOptions['oauth'],
  ): Promise<MCPOAuthTokens> {
    logger.debug(`[MCPOAuth] Refreshing tokens for ${metadata.serverName}`);

    try {
      /** If we have stored client information from the original flow, use that first */
      if (metadata.clientInfo?.client_id) {
        logger.debug(
          `[MCPOAuth] Using stored client information for token refresh for ${metadata.serverName}`,
        );
        logger.debug(
          `[MCPOAuth] Client ID: ${metadata.clientInfo.client_id} for ${metadata.serverName}`,
        );
        logger.debug(
          `[MCPOAuth] Has client secret: ${!!metadata.clientInfo.client_secret} for ${metadata.serverName}`,
        );
        logger.debug(`[MCPOAuth] Stored client info for ${metadata.serverName}:`, {
          client_id: metadata.clientInfo.client_id,
          has_client_secret: !!metadata.clientInfo.client_secret,
          grant_types: metadata.clientInfo.grant_types,
          scope: metadata.clientInfo.scope,
        });

        /** Use the stored client information and metadata to determine the token URL */
        let tokenUrl: string;
        if (config?.token_url) {
          tokenUrl = config.token_url;
        } else if (!metadata.serverUrl) {
          throw new Error('No token URL available for refresh');
        } else {
          /** Auto-discover OAuth configuration for refresh */
          const { metadata: oauthMetadata } = await this.discoverMetadata(metadata.serverUrl);
          if (!oauthMetadata.token_endpoint) {
            throw new Error('No token endpoint found in OAuth metadata');
          }
          tokenUrl = oauthMetadata.token_endpoint;
        }

        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        });

        /** Add scope if available */
        if (metadata.clientInfo.scope) {
          body.append('scope', metadata.clientInfo.scope);
        }

        const headers: HeadersInit = {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        };

        /** Use client_secret for authentication if available */
        if (metadata.clientInfo.client_secret) {
          const clientAuth = Buffer.from(
            `${metadata.clientInfo.client_id}:${metadata.clientInfo.client_secret}`,
          ).toString('base64');
          headers['Authorization'] = `Basic ${clientAuth}`;
        } else {
          /** For public clients, client_id must be in the body */
          body.append('client_id', metadata.clientInfo.client_id);
        }

        logger.debug(`[MCPOAuth] Refresh request to: ${tokenUrl}`, {
          body: body.toString(),
          headers,
        });

        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers,
          body,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`,
          );
        }

        const tokens = await response.json();

        return {
          ...tokens,
          obtained_at: Date.now(),
          expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
        };
      }

      // Fallback: If we have pre-configured OAuth settings, use them
      if (config?.token_url && config?.client_id) {
        logger.debug(`[MCPOAuth] Using pre-configured OAuth settings for token refresh`);

        const tokenUrl = new URL(config.token_url);
        const clientAuth = config.client_secret
          ? Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64')
          : null;

        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        });

        if (config.scope) {
          body.append('scope', config.scope);
        }

        const headers: HeadersInit = {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        };

        if (clientAuth) {
          headers['Authorization'] = `Basic ${clientAuth}`;
        } else {
          // Use client_id in body for public clients
          body.append('client_id', config.client_id);
        }

        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers,
          body,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`,
          );
        }

        const tokens = await response.json();

        return {
          ...tokens,
          obtained_at: Date.now(),
          expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
        };
      }

      /** For auto-discovered OAuth, we need the server URL */
      if (!metadata.serverUrl) {
        throw new Error('Server URL required for auto-discovered OAuth token refresh');
      }

      /** Auto-discover OAuth configuration for refresh */
      const { metadata: oauthMetadata } = await this.discoverMetadata(metadata.serverUrl);

      if (!oauthMetadata.token_endpoint) {
        throw new Error('No token endpoint found in OAuth metadata');
      }

      const tokenUrl = new URL(oauthMetadata.token_endpoint);

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const headers: HeadersInit = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      };

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const tokens = await response.json();

      return {
        ...tokens,
        obtained_at: Date.now(),
        expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
      };
    } catch (error) {
      logger.error(`[MCPOAuth] Failed to refresh tokens for ${metadata.serverName}`, error);
      throw error;
    }
  }
}
