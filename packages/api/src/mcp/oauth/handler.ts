import { randomBytes } from 'crypto';
import { logger } from '@librechat/data-schemas';
import { FetchLike } from '@modelcontextprotocol/sdk/shared/transport';
import { OAuthMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  registerClient,
  startAuthorization,
  exchangeAuthorization,
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type { MCPOptions } from 'librechat-data-provider';
import type { FlowStateManager } from '~/flow/manager';
import type {
  OAuthClientInformation,
  OAuthProtectedResourceMetadata,
  MCPOAuthFlowMetadata,
  MCPOAuthTokens,
  OAuthMetadata,
} from './types';
import { sanitizeUrlForLogging } from '~/mcp/utils';

/** Type for the OAuth metadata from the SDK */
type SDKOAuthMetadata = Parameters<typeof registerClient>[1]['metadata'];

export class MCPOAuthHandler {
  private static readonly FLOW_TYPE = 'mcp_oauth';
  private static readonly FLOW_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Creates a fetch function with custom headers injected
   */
  private static createOAuthFetch(headers: Record<string, string>): FetchLike {
    return async (url: string | URL, init?: RequestInit): Promise<Response> => {
      const newHeaders = new Headers(init?.headers ?? {});
      for (const [key, value] of Object.entries(headers)) {
        newHeaders.set(key, value);
      }
      return fetch(url, {
        ...init,
        headers: newHeaders,
      });
    };
  }

  /**
   * Discovers OAuth metadata from the server
   */
  private static async discoverMetadata(
    serverUrl: string,
    oauthHeaders: Record<string, string>,
  ): Promise<{
    metadata: OAuthMetadata;
    resourceMetadata?: OAuthProtectedResourceMetadata;
    authServerUrl: URL;
  }> {
    logger.debug(
      `[MCPOAuth] discoverMetadata called with serverUrl: ${sanitizeUrlForLogging(serverUrl)}`,
    );

    let authServerUrl = new URL(serverUrl);
    let resourceMetadata: OAuthProtectedResourceMetadata | undefined;

    const fetchFn = this.createOAuthFetch(oauthHeaders);

    try {
      // Try to discover resource metadata first
      logger.debug(
        `[MCPOAuth] Attempting to discover protected resource metadata from ${serverUrl}`,
      );
      resourceMetadata = await discoverOAuthProtectedResourceMetadata(serverUrl, {}, fetchFn);

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
    logger.debug(
      `[MCPOAuth] Discovering OAuth metadata from ${sanitizeUrlForLogging(authServerUrl)}`,
    );
    const rawMetadata = await discoverAuthorizationServerMetadata(authServerUrl, {
      fetchFn,
    });

    if (!rawMetadata) {
      /**
       * No metadata discovered - create fallback metadata using default OAuth endpoint paths.
       * This mirrors the MCP SDK's behavior where it falls back to /authorize, /token, /register
       * when metadata discovery fails (e.g., servers without .well-known endpoints).
       * See: https://github.com/modelcontextprotocol/sdk/blob/main/src/client/auth.ts
       */
      logger.warn(
        `[MCPOAuth] No OAuth metadata discovered from ${sanitizeUrlForLogging(authServerUrl)}, using legacy fallback endpoints`,
      );

      const fallbackMetadata: OAuthMetadata = {
        issuer: authServerUrl.toString(),
        authorization_endpoint: new URL('/authorize', authServerUrl).toString(),
        token_endpoint: new URL('/token', authServerUrl).toString(),
        registration_endpoint: new URL('/register', authServerUrl).toString(),
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256', 'plain'],
        token_endpoint_auth_methods_supported: [
          'client_secret_basic',
          'client_secret_post',
          'none',
        ],
      };

      logger.debug(`[MCPOAuth] Using fallback metadata:`, fallbackMetadata);
      return {
        metadata: fallbackMetadata,
        resourceMetadata,
        authServerUrl,
      };
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
    oauthHeaders: Record<string, string>,
    resourceMetadata?: OAuthProtectedResourceMetadata,
    redirectUri?: string,
  ): Promise<OAuthClientInformation> {
    logger.debug(
      `[MCPOAuth] Starting client registration for ${sanitizeUrlForLogging(serverUrl)}, server metadata:`,
      {
        grant_types_supported: metadata.grant_types_supported,
        response_types_supported: metadata.response_types_supported,
        token_endpoint_auth_methods_supported: metadata.token_endpoint_auth_methods_supported,
        scopes_supported: metadata.scopes_supported,
      },
    );

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
      logger.debug(
        `[MCPOAuth] Server ${sanitizeUrlForLogging(serverUrl)} does not support \`refresh_token\` grant type`,
      );
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

    logger.debug(
      `[MCPOAuth] Registering client for ${sanitizeUrlForLogging(serverUrl)} with metadata:`,
      clientMetadata,
    );

    const clientInfo = await registerClient(serverUrl, {
      metadata: metadata as unknown as SDKOAuthMetadata,
      clientMetadata,
      fetchFn: this.createOAuthFetch(oauthHeaders),
    });

    logger.debug(
      `[MCPOAuth] Client registered successfully for ${sanitizeUrlForLogging(serverUrl)}:`,
      {
        client_id: clientInfo.client_id,
        has_client_secret: !!clientInfo.client_secret,
        grant_types: clientInfo.grant_types,
        scope: clientInfo.scope,
      },
    );

    return clientInfo;
  }

  /**
   * Initiates the OAuth flow for an MCP server
   */
  static async initiateOAuthFlow(
    serverName: string,
    serverUrl: string,
    userId: string,
    oauthHeaders: Record<string, string>,
    config?: MCPOptions['oauth'],
  ): Promise<{ authorizationUrl: string; flowId: string; flowMetadata: MCPOAuthFlowMetadata }> {
    logger.debug(
      `[MCPOAuth] initiateOAuthFlow called for ${serverName} with URL: ${sanitizeUrlForLogging(serverUrl)}`,
    );

    const flowId = this.generateFlowId(userId, serverName);
    const state = this.generateState();

    logger.debug(`[MCPOAuth] Generated flowId: ${flowId}, state: ${state}`);

    try {
      // Check if we have pre-configured OAuth settings
      if (config?.authorization_url && config?.token_url && config?.client_id) {
        logger.debug(`[MCPOAuth] Using pre-configured OAuth settings for ${serverName}`);

        const skipCodeChallengeCheck =
          config?.skip_code_challenge_check === true ||
          process.env.MCP_SKIP_CODE_CHALLENGE_CHECK === 'true';
        let codeChallengeMethodsSupported: string[];

        if (config?.code_challenge_methods_supported !== undefined) {
          codeChallengeMethodsSupported = config.code_challenge_methods_supported;
        } else if (skipCodeChallengeCheck) {
          codeChallengeMethodsSupported = ['S256', 'plain'];
          logger.debug(
            `[MCPOAuth] Code challenge check skip enabled, forcing S256 support for ${serverName}`,
          );
        } else {
          codeChallengeMethodsSupported = ['S256', 'plain'];
        }

        /** Metadata based on pre-configured settings */
        const metadata: OAuthMetadata = {
          authorization_endpoint: config.authorization_url,
          token_endpoint: config.token_url,
          issuer: serverUrl,
          scopes_supported: config.scope?.split(' ') ?? [],
          grant_types_supported: config?.grant_types_supported ?? [
            'authorization_code',
            'refresh_token',
          ],
          token_endpoint_auth_methods_supported: config?.token_endpoint_auth_methods_supported ?? [
            'client_secret_basic',
            'client_secret_post',
          ],
          response_types_supported: config?.response_types_supported ?? ['code'],
          code_challenge_methods_supported: codeChallengeMethodsSupported,
        };
        logger.debug(`[MCPOAuth] metadata for "${serverName}": ${JSON.stringify(metadata)}`);
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

        logger.debug(
          `[MCPOAuth] Authorization URL generated: ${sanitizeUrlForLogging(authorizationUrl.toString())}`,
        );
        return {
          authorizationUrl: authorizationUrl.toString(),
          flowId,
          flowMetadata,
        };
      }

      logger.debug(
        `[MCPOAuth] Starting auto-discovery of OAuth metadata from ${sanitizeUrlForLogging(serverUrl)}`,
      );
      const { metadata, resourceMetadata, authServerUrl } = await this.discoverMetadata(
        serverUrl,
        oauthHeaders,
      );

      logger.debug(
        `[MCPOAuth] OAuth metadata discovered, auth server URL: ${sanitizeUrlForLogging(authServerUrl)}`,
      );

      /** Dynamic client registration based on the discovered metadata */
      const redirectUri = config?.redirect_uri || this.getDefaultRedirectUri(serverName);
      logger.debug(`[MCPOAuth] Registering OAuth client with redirect URI: ${redirectUri}`);

      const clientInfo = await this.registerOAuthClient(
        authServerUrl.toString(),
        metadata,
        oauthHeaders,
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
        logger.debug(
          `[MCPOAuth] Authorization URL: ${sanitizeUrlForLogging(authorizationUrl.toString())}`,
        );

        /** Add state parameter with flowId to the authorization URL */
        authorizationUrl.searchParams.set('state', flowId);
        logger.debug(`[MCPOAuth] Added state parameter to authorization URL`);

        if (resourceMetadata?.resource != null && resourceMetadata.resource) {
          authorizationUrl.searchParams.set('resource', resourceMetadata.resource);
          logger.debug(
            `[MCPOAuth] Added resource parameter to authorization URL: ${resourceMetadata.resource}`,
          );
        } else {
          logger.warn(
            `[MCPOAuth] Resource metadata missing 'resource' property for ${serverName}. ` +
              'This can cause issues with some Authorization Servers who expect a "resource" parameter.',
          );
        }
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
    oauthHeaders: Record<string, string>,
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

      let resource: URL | undefined;
      try {
        if (metadata.resourceMetadata?.resource != null && metadata.resourceMetadata.resource) {
          resource = new URL(metadata.resourceMetadata.resource);
          logger.debug(`[MCPOAuth] Resource URL for flow ${flowId}: ${resource.toString()}`);
        }
      } catch (error) {
        logger.warn(
          `[MCPOAuth] Invalid resource URL format for flow ${flowId}: '${metadata.resourceMetadata!.resource}'. ` +
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}. Proceeding without resource parameter.`,
        );
        resource = undefined;
      }

      const tokens = await exchangeAuthorization(metadata.serverUrl, {
        redirectUri: metadata.clientInfo.redirect_uris?.[0] || this.getDefaultRedirectUri(),
        metadata: metadata.metadata as unknown as SDKOAuthMetadata,
        clientInformation: metadata.clientInfo,
        codeVerifier: metadata.codeVerifier,
        authorizationCode,
        resource,
        fetchFn: this.createOAuthFetch(oauthHeaders),
      });

      logger.debug('[MCPOAuth] Token exchange successful', {
        flowId,
        has_access_token: !!tokens.access_token,
        has_refresh_token: !!tokens.refresh_token,
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
    oauthHeaders: Record<string, string>,
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
        let authMethods: string[] | undefined;
        if (config?.token_url) {
          tokenUrl = config.token_url;
          authMethods = config.token_endpoint_auth_methods_supported;
        } else if (!metadata.serverUrl) {
          throw new Error('No token URL available for refresh');
        } else {
          /** Auto-discover OAuth configuration for refresh */
          const oauthMetadata = await discoverAuthorizationServerMetadata(metadata.serverUrl, {
            fetchFn: this.createOAuthFetch(oauthHeaders),
          });
          if (!oauthMetadata) {
            /**
             * No metadata discovered - use fallback /token endpoint.
             * This mirrors the MCP SDK's behavior for legacy servers without .well-known endpoints.
             */
            logger.warn(
              `[MCPOAuth] No OAuth metadata discovered for token refresh, using fallback /token endpoint`,
            );
            tokenUrl = new URL('/token', metadata.serverUrl).toString();
            authMethods = ['client_secret_basic', 'client_secret_post', 'none'];
          } else if (!oauthMetadata.token_endpoint) {
            throw new Error('No token endpoint found in OAuth metadata');
          } else {
            tokenUrl = oauthMetadata.token_endpoint;
            authMethods = oauthMetadata.token_endpoint_auth_methods_supported;
          }
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
          ...oauthHeaders,
        };

        /** Handle authentication based on server's advertised methods */
        if (metadata.clientInfo.client_secret) {
          /** Default to client_secret_basic if no methods specified (per RFC 8414) */
          const tokenAuthMethods = authMethods ?? ['client_secret_basic'];
          const usesBasicAuth = tokenAuthMethods.includes('client_secret_basic');
          const usesClientSecretPost = tokenAuthMethods.includes('client_secret_post');

          if (usesBasicAuth) {
            /** Use Basic auth */
            logger.debug('[MCPOAuth] Using client_secret_basic authentication method');
            const clientAuth = Buffer.from(
              `${metadata.clientInfo.client_id}:${metadata.clientInfo.client_secret}`,
            ).toString('base64');
            headers['Authorization'] = `Basic ${clientAuth}`;
          } else if (usesClientSecretPost) {
            /** Use client_secret_post */
            logger.debug('[MCPOAuth] Using client_secret_post authentication method');
            body.append('client_id', metadata.clientInfo.client_id);
            body.append('client_secret', metadata.clientInfo.client_secret);
          } else {
            /** No recognized method, default to Basic auth per RFC */
            logger.debug('[MCPOAuth] No recognized auth method, defaulting to client_secret_basic');
            const clientAuth = Buffer.from(
              `${metadata.clientInfo.client_id}:${metadata.clientInfo.client_secret}`,
            ).toString('base64');
            headers['Authorization'] = `Basic ${clientAuth}`;
          }
        } else {
          /** For public clients, client_id must be in the body */
          logger.debug('[MCPOAuth] Using public client authentication (no secret)');
          body.append('client_id', metadata.clientInfo.client_id);
        }

        logger.debug(`[MCPOAuth] Refresh request to: ${sanitizeUrlForLogging(tokenUrl)}`, {
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
          ...oauthHeaders,
        };

        /** Handle authentication based on configured methods */
        if (config.client_secret) {
          /** Default to client_secret_basic if no methods specified (per RFC 8414) */
          const tokenAuthMethods = config.token_endpoint_auth_methods_supported ?? [
            'client_secret_basic',
          ];
          const usesBasicAuth = tokenAuthMethods.includes('client_secret_basic');
          const usesClientSecretPost = tokenAuthMethods.includes('client_secret_post');

          if (usesBasicAuth) {
            /** Use Basic auth */
            logger.debug(
              '[MCPOAuth] Using client_secret_basic authentication method (pre-configured)',
            );
            const clientAuth = Buffer.from(`${config.client_id}:${config.client_secret}`).toString(
              'base64',
            );
            headers['Authorization'] = `Basic ${clientAuth}`;
          } else if (usesClientSecretPost) {
            /** Use client_secret_post */
            logger.debug(
              '[MCPOAuth] Using client_secret_post authentication method (pre-configured)',
            );
            body.append('client_id', config.client_id);
            body.append('client_secret', config.client_secret);
          } else {
            /** No recognized method, default to Basic auth per RFC */
            logger.debug(
              '[MCPOAuth] No recognized auth method, defaulting to client_secret_basic (pre-configured)',
            );
            const clientAuth = Buffer.from(`${config.client_id}:${config.client_secret}`).toString(
              'base64',
            );
            headers['Authorization'] = `Basic ${clientAuth}`;
          }
        } else {
          /** For public clients, client_id must be in the body */
          logger.debug('[MCPOAuth] Using public client authentication (no secret, pre-configured)');
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
      const oauthMetadata = await discoverAuthorizationServerMetadata(metadata.serverUrl, {
        fetchFn: this.createOAuthFetch(oauthHeaders),
      });

      let tokenUrl: URL;
      if (!oauthMetadata?.token_endpoint) {
        /**
         * No metadata or token_endpoint discovered - use fallback /token endpoint.
         * This mirrors the MCP SDK's behavior for legacy servers without .well-known endpoints.
         */
        logger.warn(
          `[MCPOAuth] No OAuth metadata or token endpoint found, using fallback /token endpoint`,
        );
        tokenUrl = new URL('/token', metadata.serverUrl);
      } else {
        tokenUrl = new URL(oauthMetadata.token_endpoint);
      }

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const headers: HeadersInit = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        ...oauthHeaders,
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

  /**
   * Revokes OAuth tokens at the authorization server (RFC 7009)
   */
  public static async revokeOAuthToken(
    serverName: string,
    token: string,
    tokenType: 'refresh' | 'access',
    metadata: {
      serverUrl: string;
      clientId: string;
      clientSecret: string;
      revocationEndpoint?: string;
      revocationEndpointAuthMethodsSupported?: string[];
    },
    oauthHeaders: Record<string, string> = {},
  ): Promise<void> {
    // build the revoke URL, falling back to the server URL + /revoke if no revocation endpoint is provided
    const revokeUrl: URL =
      metadata.revocationEndpoint != null
        ? new URL(metadata.revocationEndpoint)
        : new URL('/revoke', metadata.serverUrl);

    // detect auth method to use
    const authMethods = metadata.revocationEndpointAuthMethodsSupported ?? [
      'client_secret_basic', // RFC 8414 (https://datatracker.ietf.org/doc/html/rfc8414)
    ];
    const usesBasicAuth = authMethods.includes('client_secret_basic');
    const usesClientSecretPost = authMethods.includes('client_secret_post');

    // init the request headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...oauthHeaders,
    };

    // init the request body
    const body = new URLSearchParams({ token });
    body.set('token_type_hint', tokenType === 'refresh' ? 'refresh_token' : 'access_token');

    // process auth method
    if (usesBasicAuth) {
      // encode the client id and secret and add to the headers
      const credentials = Buffer.from(`${metadata.clientId}:${metadata.clientSecret}`).toString(
        'base64',
      );
      headers['Authorization'] = `Basic ${credentials}`;
    } else if (usesClientSecretPost) {
      // add the client id and secret to the body
      body.set('client_secret', metadata.clientSecret);
      body.set('client_id', metadata.clientId);
    }

    // perform the revoke request
    logger.info(
      `[MCPOAuth] Revoking tokens for ${serverName} via ${sanitizeUrlForLogging(revokeUrl.toString())}`,
    );
    const response = await fetch(revokeUrl, {
      method: 'POST',
      body: body.toString(),
      headers,
    });

    if (!response.ok) {
      logger.error(`[MCPOAuth] Token revocation failed for ${serverName}: HTTP ${response.status}`);
      throw new Error(`Token revocation failed: HTTP ${response.status}`);
    }
  }
}
