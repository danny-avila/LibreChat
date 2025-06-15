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
  OAuthMetadata,
  OAuthClientInformation,
  OAuthProtectedResourceMetadata,
  MCPOAuthFlowMetadata,
  MCPOAuthTokens,
} from './types';

// Type for the OAuth metadata from the SDK
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
    logger.info(`[MCPOAuth] discoverMetadata called with serverUrl: ${serverUrl}`);

    let authServerUrl = new URL(serverUrl);
    let resourceMetadata: OAuthProtectedResourceMetadata | undefined;

    try {
      // Try to discover resource metadata first
      logger.info(
        `[MCPOAuth] Attempting to discover protected resource metadata from ${serverUrl}`,
      );
      resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl);

      if (resourceMetadata?.authorization_servers?.length) {
        authServerUrl = new URL(resourceMetadata.authorization_servers[0]);
        logger.info(
          `[MCPOAuth] Found authorization server from resource metadata: ${authServerUrl}`,
        );
      } else {
        logger.info(`[MCPOAuth] No authorization servers found in resource metadata`);
      }
    } catch (error) {
      logger.debug('[MCPOAuth] Resource metadata discovery failed, continuing with server URL', {
        error,
      });
    }

    // Discover OAuth metadata
    logger.info(`[MCPOAuth] Discovering OAuth metadata from ${authServerUrl}`);
    const rawMetadata = await discoverOAuthMetadata(authServerUrl);

    if (!rawMetadata) {
      logger.error(`[MCPOAuth] Failed to discover OAuth metadata from ${authServerUrl}`);
      throw new Error('Failed to discover OAuth metadata');
    }

    logger.info(`[MCPOAuth] OAuth metadata discovered successfully`);
    const metadata = await OAuthMetadataSchema.parseAsync(rawMetadata);

    logger.info(`[MCPOAuth] OAuth metadata parsed successfully`);
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
    const clientMetadata = {
      client_name: 'LibreChat MCP Client',
      redirect_uris: [redirectUri || this.getDefaultRedirectUri()],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      scope: resourceMetadata?.scopes_supported?.join(' ') || metadata.scopes_supported?.join(' '),
    };

    const clientInfo = await registerClient(serverUrl, {
      metadata: metadata as unknown as SDKOAuthMetadata,
      clientMetadata,
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
    flowManager: FlowStateManager<MCPOAuthTokens>,
  ): Promise<{ authorizationUrl: string; flowId: string }> {
    logger.info(`[MCPOAuth] initiateOAuthFlow called for ${serverName} with URL: ${serverUrl}`);

    const flowId = this.generateFlowId(userId, serverName);
    const state = this.generateState();

    logger.info(`[MCPOAuth] Generated flowId: ${flowId}, state: ${state}`);

    try {
      // Check if we have pre-configured OAuth settings
      if (config?.authorization_url && config?.token_url && config?.client_id) {
        logger.info(`[MCPOAuth] Using pre-configured OAuth settings`);
        // Use pre-configured settings
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

        logger.info(`[MCPOAuth] Starting authorization with pre-configured settings`);
        const { authorizationUrl, codeVerifier } = await startAuthorization(serverUrl, {
          metadata: metadata as unknown as SDKOAuthMetadata,
          clientInformation: clientInfo,
          redirectUrl: clientInfo.redirect_uris?.[0] || this.getDefaultRedirectUri(serverName),
          scope: config.scope,
        });

        // Add state parameter with flowId to the authorization URL
        authorizationUrl.searchParams.set('state', flowId);
        logger.info(`[MCPOAuth] Added state parameter to authorization URL`);

        const flowMetadata: MCPOAuthFlowMetadata = {
          serverName,
          userId,
          serverUrl,
          state,
          codeVerifier,
          clientInfo,
          metadata,
        };

        logger.info(`[MCPOAuth] Creating flow in flow manager`);

        // Create the flow state without waiting for completion
        const flowKey = `${this.FLOW_TYPE}:${flowId}`;
        const flowState = {
          type: this.FLOW_TYPE,
          status: 'PENDING',
          metadata: flowMetadata,
          createdAt: Date.now(),
        };

        // @ts-ignore - accessing private property temporarily
        await flowManager.keyv.set(flowKey, flowState, this.FLOW_TTL);

        logger.info(`[MCPOAuth] Authorization URL generated: ${authorizationUrl.toString()}`);
        return {
          authorizationUrl: authorizationUrl.toString(),
          flowId,
        };
      }

      logger.info(`[MCPOAuth] No pre-configured settings, starting auto-discovery`);

      // Auto-discover OAuth configuration
      logger.info(`[MCPOAuth] Discovering OAuth metadata from ${serverUrl}`);
      const { metadata, resourceMetadata, authServerUrl } = await this.discoverMetadata(serverUrl);

      logger.info(`[MCPOAuth] OAuth metadata discovered, auth server URL: ${authServerUrl}`);

      // Dynamic client registration
      const redirectUri = config?.redirect_uri || this.getDefaultRedirectUri(serverName);
      logger.info(`[MCPOAuth] Registering OAuth client with redirect URI: ${redirectUri}`);

      const clientInfo = await this.registerOAuthClient(
        authServerUrl.toString(),
        metadata,
        resourceMetadata,
        redirectUri,
      );

      logger.info(`[MCPOAuth] Client registered with ID: ${clientInfo.client_id}`);

      // Start authorization
      const scope =
        config?.scope ||
        resourceMetadata?.scopes_supported?.join(' ') ||
        metadata.scopes_supported?.join(' ');

      logger.info(`[MCPOAuth] Starting authorization with scope: ${scope}`);

      let authorizationUrl: URL;
      let codeVerifier: string;

      try {
        logger.info(`[MCPOAuth] Calling startAuthorization...`);
        const authResult = await startAuthorization(serverUrl, {
          metadata: metadata as unknown as SDKOAuthMetadata,
          clientInformation: clientInfo,
          redirectUrl: redirectUri,
          scope,
        });

        authorizationUrl = authResult.authorizationUrl;
        codeVerifier = authResult.codeVerifier;

        logger.info(`[MCPOAuth] startAuthorization completed successfully`);
        logger.info(`[MCPOAuth] Authorization URL: ${authorizationUrl.toString()}`);

        // Add state parameter with flowId to the authorization URL
        authorizationUrl.searchParams.set('state', flowId);
        logger.info(`[MCPOAuth] Added state parameter to authorization URL`);
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

      logger.info(`[MCPOAuth] Creating flow in flow manager`);

      // Create the flow state without waiting for completion
      const flowKey = `${this.FLOW_TYPE}:${flowId}`;
      const flowState = {
        type: this.FLOW_TYPE,
        status: 'PENDING',
        metadata: flowMetadata,
        createdAt: Date.now(),
      };

      // @ts-ignore - accessing private property temporarily
      await flowManager.keyv.set(flowKey, flowState, this.FLOW_TTL);

      logger.info(`[MCPOAuth] Authorization URL generated: ${authorizationUrl.toString()}`);

      const result = {
        authorizationUrl: authorizationUrl.toString(),
        flowId,
      };

      logger.info(`[MCPOAuth] Returning from initiateOAuthFlow with result:`, result);
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
      const flowState = await flowManager.getFlowState(flowId, this.FLOW_TYPE);
      if (!flowState) {
        throw new Error('OAuth flow not found or expired');
      }

      const metadata = flowState.metadata as unknown as MCPOAuthFlowMetadata;
      if (!metadata.metadata || !metadata.clientInfo || !metadata.codeVerifier) {
        throw new Error('Invalid flow state');
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

      await flowManager.completeFlow(flowId, this.FLOW_TYPE, mcpTokens);

      return mcpTokens;
    } catch (error) {
      logger.error('[MCPOAuth] Failed to complete OAuth flow', { error, flowId });
      await flowManager.failFlow(flowId, this.FLOW_TYPE, error as Error);
      throw error;
    }
  }

  /**
   * Gets the OAuth flow state
   */
  static async getFlowState(
    flowId: string,
    flowManager: FlowStateManager<MCPOAuthTokens>,
  ): Promise<MCPOAuthFlowMetadata | null> {
    const state = await flowManager.getFlowState(flowId, this.FLOW_TYPE);
    return state?.metadata as unknown as MCPOAuthFlowMetadata | null;
  }

  /**
   * Generates a unique flow ID
   */
  private static generateFlowId(userId: string, serverName: string): string {
    return `${userId}:${serverName}:${Date.now()}`;
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
}
