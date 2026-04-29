import { randomBytes } from 'crypto';
import { logger } from '@librechat/data-schemas';
import { FetchLike } from '@modelcontextprotocol/sdk/shared/transport';
import { OAuthMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  checkResourceAllowed,
  resourceUrlFromServerUrl,
} from '@modelcontextprotocol/sdk/shared/auth-utils.js';
import {
  registerClient,
  startAuthorization,
  exchangeAuthorization,
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/sdk/client/auth.js';
import { TokenExchangeMethodEnum, type MCPOptions } from 'librechat-data-provider';
import type { TokenMethods } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type {
  OAuthClientInformation,
  OAuthProtectedResourceMetadata,
  MCPOAuthFlowMetadata,
  MCPOAuthTokens,
  OAuthMetadata,
} from './types';
import {
  resolveTokenEndpointAuthMethod,
  getForcedTokenEndpointAuthMethod,
  selectRegistrationAuthMethod,
  inferClientAuthMethod,
} from './methods';
import { isSSRFTarget, resolveHostnameSSRF, isOAuthUrlAllowed } from '~/auth';
import { probeResourceMetadataHint } from './resourceHint';
import { MCPTokenStorage } from './tokens';
import { sanitizeUrlForLogging } from '~/mcp/utils';

/** Type for the OAuth metadata from the SDK */
type SDKOAuthMetadata = Parameters<typeof registerClient>[1]['metadata'];

export class MCPOAuthHandler {
  private static readonly FLOW_TYPE = 'mcp_oauth';
  private static readonly FLOW_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Creates a fetch function with custom headers injected
   */
  private static createOAuthFetch(
    headers: Record<string, string>,
    clientInfo?: OAuthClientInformation,
  ): FetchLike {
    return async (url: string | URL, init?: RequestInit): Promise<Response> => {
      const newHeaders = new Headers(init?.headers ?? {});
      for (const [key, value] of Object.entries(headers)) {
        newHeaders.set(key, value);
      }

      const method = (init?.method ?? 'GET').toUpperCase();
      const initBody = init?.body;
      let params: URLSearchParams | undefined;

      if (initBody instanceof URLSearchParams) {
        params = initBody;
      } else if (typeof initBody === 'string') {
        const parsed = new URLSearchParams(initBody);
        if (parsed.has('grant_type')) {
          params = parsed;
        }
      }

      /**
       * FastMCP 2.14+/MCP SDK 1.24+ token endpoints can be strict about:
       * - Content-Type (must be application/x-www-form-urlencoded)
       * - where client_id/client_secret are supplied (default_post vs basic header)
       */
      if (method === 'POST' && params?.has('grant_type')) {
        newHeaders.set('Content-Type', 'application/x-www-form-urlencoded');

        if (clientInfo?.client_id) {
          const authMethod =
            clientInfo.token_endpoint_auth_method ??
            inferClientAuthMethod(
              newHeaders.has('Authorization'),
              params.has('client_id'),
              params.has('client_secret'),
              !!clientInfo.client_secret,
            );

          if (!clientInfo.client_secret || authMethod === 'none') {
            newHeaders.delete('Authorization');
            if (!params.has('client_id')) {
              params.set('client_id', clientInfo.client_id);
            }
          } else if (authMethod === 'client_secret_post') {
            newHeaders.delete('Authorization');
            if (!params.has('client_id')) {
              params.set('client_id', clientInfo.client_id);
            }
            if (!params.has('client_secret')) {
              params.set('client_secret', clientInfo.client_secret);
            }
          } else if (authMethod === 'client_secret_basic') {
            /** RFC 6749 §2.3.1: credentials MUST NOT appear in both the header and the body. The SDK defaults to body params, so remove them before setting the Basic header. */
            params.delete('client_id');
            params.delete('client_secret');
            if (!newHeaders.has('Authorization')) {
              const clientAuth = Buffer.from(
                `${clientInfo.client_id}:${clientInfo.client_secret}`,
              ).toString('base64');
              newHeaders.set('Authorization', `Basic ${clientAuth}`);
            }
          }
        }

        return fetch(url, {
          ...init,
          body: params.toString(),
          headers: newHeaders,
        });
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
    allowedDomains?: string[] | null,
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

    /**
     * RFC 9728 §5.1: when the server's 401 `WWW-Authenticate` header advertises a
     * `resource_metadata` URL, use that URL as the authoritative source. Path-aware
     * `.well-known` discovery is a fallback for when the hint is absent — not the
     * other way round — or a split deployment can serve stale/wrong metadata at the
     * path-aware endpoint and strand the flow at a defunct authorization server.
     *
     * Reuse `fetchFn` so admin-configured `oauthHeaders` (e.g. a gateway API key
     * required to reach the MCP endpoint at all) are attached to the probe — without
     * them, the probe would 401 for the wrong reason and never see the real challenge.
     */
    const hint = await probeResourceMetadataHint(serverUrl, fetchFn);
    /**
     * The hint URL is attacker-controlled (it comes from the MCP server's own 401
     * challenge). Validate it through the same SSRF/allowedDomains gate used for the
     * authorization server — otherwise a malicious server could redirect discovery at
     * a private IP, the metadata service, or a host the admin never intended to reach.
     * On validation failure, discard the hint and fall back to path-aware discovery.
     */
    let hintUrl: URL | undefined;
    if (hint?.resourceMetadataUrl) {
      try {
        await this.validateOAuthUrl(
          hint.resourceMetadataUrl.toString(),
          'resource_metadata',
          allowedDomains,
        );
        hintUrl = hint.resourceMetadataUrl;
        logger.debug(
          `[MCPOAuth] Using resource_metadata URL from WWW-Authenticate: ${sanitizeUrlForLogging(hintUrl.toString())}`,
        );
      } catch (error) {
        logger.warn(
          `[MCPOAuth] Rejecting untrusted resource_metadata hint from ${sanitizeUrlForLogging(serverUrl)}; falling back to path-aware discovery`,
          { error },
        );
      }
    }

    try {
      logger.debug(
        `[MCPOAuth] Attempting to discover protected resource metadata from ${sanitizeUrlForLogging(serverUrl)}`,
      );
      resourceMetadata = await discoverOAuthProtectedResourceMetadata(
        serverUrl,
        { resourceMetadataUrl: hintUrl },
        fetchFn,
      );
    } catch (error) {
      logger.debug('[MCPOAuth] Resource metadata discovery failed, continuing with server URL', {
        error,
      });
    }

    if (resourceMetadata) {
      /**
       * RFC 9728 §3.3 / §7.3: the `resource` identifier in a Protected Resource Metadata
       * document MUST match the URL the client used to fetch it. Without this check a
       * malicious MCP server can impersonate a legitimate one by advertising the real
       * server's resource URL plus the real server's authorization server, causing tokens
       * minted for the real server to be sent to the attacker (GHSA-gvpj-vm2f-2m23).
       * On mismatch, discard the entire document: `authorization_servers` and any other
       * field on it are equally untrustworthy.
       */
      this.assertResourceBoundToServer(serverUrl, resourceMetadata);

      if (resourceMetadata.authorization_servers?.length) {
        const discoveredAuthServer = resourceMetadata.authorization_servers[0];
        await this.validateOAuthUrl(discoveredAuthServer, 'authorization_server', allowedDomains);
        authServerUrl = new URL(discoveredAuthServer);
        logger.debug(
          `[MCPOAuth] Found authorization server from resource metadata: ${authServerUrl}`,
        );
      } else {
        logger.debug(`[MCPOAuth] No authorization servers found in resource metadata`);
      }
    }

    // Discover OAuth metadata
    logger.debug(
      `[MCPOAuth] Discovering OAuth metadata from ${sanitizeUrlForLogging(authServerUrl)}`,
    );
    const rawMetadata = await this.discoverWithOriginFallback(authServerUrl, fetchFn);

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

    const endpointChecks: Promise<void>[] = [];
    if (metadata.registration_endpoint) {
      endpointChecks.push(
        this.validateOAuthUrl(
          metadata.registration_endpoint,
          'registration_endpoint',
          allowedDomains,
        ),
      );
    }
    if (metadata.token_endpoint) {
      endpointChecks.push(
        this.validateOAuthUrl(metadata.token_endpoint, 'token_endpoint', allowedDomains),
      );
    }
    if (endpointChecks.length > 0) {
      await Promise.all(endpointChecks);
    }

    logger.debug(`[MCPOAuth] OAuth metadata parsed successfully`);
    return {
      metadata: metadata as unknown as OAuthMetadata,
      resourceMetadata,
      authServerUrl,
    };
  }

  /**
   * Discovers OAuth authorization server metadata, retrying with just the origin
   * when discovery fails for a path-based URL. Shared implementation used by
   * `discoverMetadata` and both `refreshOAuthTokens` branches.
   */
  private static async discoverWithOriginFallback(
    serverUrl: URL,
    fetchFn: FetchLike,
  ): ReturnType<typeof discoverAuthorizationServerMetadata> {
    let metadata: Awaited<ReturnType<typeof discoverAuthorizationServerMetadata>>;
    try {
      metadata = await discoverAuthorizationServerMetadata(serverUrl, { fetchFn });
    } catch (err) {
      if (serverUrl.pathname === '/') {
        throw err;
      }
      const baseUrl = new URL(serverUrl.origin);
      logger.debug(
        `[MCPOAuth] Discovery threw for path URL, trying base URL: ${sanitizeUrlForLogging(baseUrl)}`,
        { error: err },
      );
      return discoverAuthorizationServerMetadata(baseUrl, { fetchFn });
    }
    if (!metadata && serverUrl.pathname !== '/') {
      const baseUrl = new URL(serverUrl.origin);
      logger.debug(
        `[MCPOAuth] Discovery failed with path, trying base URL: ${sanitizeUrlForLogging(baseUrl)}`,
      );
      return discoverAuthorizationServerMetadata(baseUrl, { fetchFn });
    }
    return metadata;
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
    tokenExchangeMethod?: TokenExchangeMethodEnum,
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
      logo_uri: undefined as string | undefined,
      tos_uri: undefined as string | undefined,
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

    const selectedAuthMethod = selectRegistrationAuthMethod(
      metadata.token_endpoint_auth_methods_supported,
      tokenExchangeMethod,
    );
    if (selectedAuthMethod) {
      clientMetadata.token_endpoint_auth_method = selectedAuthMethod;
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

    const forcedAuthMethod = getForcedTokenEndpointAuthMethod(tokenExchangeMethod);
    if (forcedAuthMethod) {
      clientInfo.token_endpoint_auth_method = forcedAuthMethod;
    } else if (!clientInfo.token_endpoint_auth_method) {
      clientInfo.token_endpoint_auth_method = clientMetadata.token_endpoint_auth_method;
    }

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
    allowedDomains?: string[] | null,
    findToken?: TokenMethods['findToken'],
  ): Promise<{ authorizationUrl: string; flowId: string; flowMetadata: MCPOAuthFlowMetadata }> {
    logger.debug(
      `[MCPOAuth] initiateOAuthFlow called for ${serverName} with URL: ${sanitizeUrlForLogging(serverUrl)}`,
    );

    const flowId = this.generateFlowId(userId, serverName);
    const state = this.generateState();

    logger.debug(`[MCPOAuth] Generated flowId: ${flowId}, state: ${state}`);

    try {
      if (config?.authorization_url && config?.token_url && config?.client_id) {
        logger.debug(`[MCPOAuth] Using pre-configured OAuth settings for ${serverName}`);

        await Promise.all([
          this.validateOAuthUrl(config.authorization_url, 'authorization_url', allowedDomains),
          this.validateOAuthUrl(config.token_url, 'token_url', allowedDomains),
        ]);

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
        let tokenEndpointAuthMethod: string;
        if (!config.client_secret) {
          tokenEndpointAuthMethod = 'none';
        } else {
          // When token_exchange_method is undefined or not DefaultPost, default to using
          // client_secret_basic (Basic Auth header) for token endpoint authentication.
          tokenEndpointAuthMethod =
            getForcedTokenEndpointAuthMethod(config.token_exchange_method) ?? 'client_secret_basic';
        }

        let defaultTokenAuthMethods: string[];
        if (tokenEndpointAuthMethod === 'none') {
          defaultTokenAuthMethods = ['none'];
        } else if (tokenEndpointAuthMethod === 'client_secret_post') {
          defaultTokenAuthMethods = ['client_secret_post', 'client_secret_basic'];
        } else {
          defaultTokenAuthMethods = ['client_secret_basic', 'client_secret_post'];
        }

        const metadata: OAuthMetadata = {
          authorization_endpoint: config.authorization_url,
          token_endpoint: config.token_url,
          issuer: serverUrl,
          scopes_supported: config.scope?.split(' ') ?? [],
          grant_types_supported: config?.grant_types_supported ?? [
            'authorization_code',
            'refresh_token',
          ],
          token_endpoint_auth_methods_supported:
            config?.token_endpoint_auth_methods_supported ?? defaultTokenAuthMethods,
          response_types_supported: config?.response_types_supported ?? ['code'],
          code_challenge_methods_supported: codeChallengeMethodsSupported,
        };
        logger.debug(`[MCPOAuth] metadata for "${serverName}": ${JSON.stringify(metadata)}`);
        const redirectUri = this.getDefaultRedirectUri(serverName);
        const clientInfo: OAuthClientInformation = {
          client_id: config.client_id,
          client_secret: config.client_secret,
          redirect_uris: [redirectUri],
          scope: config.scope,
          token_endpoint_auth_method: tokenEndpointAuthMethod,
        };

        logger.debug(`[MCPOAuth] Starting authorization with pre-configured settings`);
        const { authorizationUrl, codeVerifier } = await startAuthorization(serverUrl, {
          metadata: metadata as unknown as SDKOAuthMetadata,
          clientInformation: clientInfo,
          redirectUrl: redirectUri,
          scope: config.scope,
        });

        /** Add cryptographic state parameter to the authorization URL */
        authorizationUrl.searchParams.set('state', state);
        logger.debug(`[MCPOAuth] Added state parameter to authorization URL`);

        const flowMetadata: MCPOAuthFlowMetadata = {
          serverName,
          userId,
          serverUrl,
          state,
          codeVerifier,
          clientInfo,
          metadata,
          ...(Object.keys(oauthHeaders).length > 0 && { oauthHeaders }),
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
        allowedDomains,
      );

      logger.debug(
        `[MCPOAuth] OAuth metadata discovered, auth server URL: ${sanitizeUrlForLogging(authServerUrl)}`,
      );

      const redirectUri = this.getDefaultRedirectUri(serverName);
      logger.debug(`[MCPOAuth] Resolving OAuth client with redirect URI: ${redirectUri}`);

      let clientInfo: OAuthClientInformation | undefined;
      let reusedStoredClient = false;

      if (findToken) {
        try {
          const existing = await MCPTokenStorage.getClientInfoAndMetadata({
            userId,
            serverName,
            findToken,
          });
          if (existing?.clientInfo?.client_id) {
            const storedRedirectUri = (existing.clientInfo as OAuthClientInformation)
              .redirect_uris?.[0];
            const storedIssuer =
              typeof existing.clientMetadata?.issuer === 'string'
                ? existing.clientMetadata.issuer.replace(/\/+$/, '')
                : null;
            const currentIssuer = (metadata.issuer ?? authServerUrl.toString()).replace(/\/+$/, '');

            if (!storedRedirectUri || storedRedirectUri !== redirectUri) {
              logger.debug(
                `[MCPOAuth] Stored redirect_uri "${storedRedirectUri}" differs from current "${redirectUri}", will re-register`,
              );
            } else if (!storedIssuer || storedIssuer !== currentIssuer) {
              logger.debug(
                `[MCPOAuth] Issuer mismatch (stored: ${storedIssuer ?? 'none'}, current: ${currentIssuer}), will re-register`,
              );
            } else {
              logger.debug(
                `[MCPOAuth] Reusing existing client registration: ${existing.clientInfo.client_id}`,
              );
              clientInfo = existing.clientInfo;
              reusedStoredClient = true;
            }
          }
        } catch (error) {
          logger.warn(
            `[MCPOAuth] Failed to look up existing client registration, falling back to new registration`,
            { error, serverName, userId },
          );
        }
      }

      if (!clientInfo) {
        clientInfo = await this.registerOAuthClient(
          authServerUrl.toString(),
          metadata,
          oauthHeaders,
          resourceMetadata,
          redirectUri,
          config?.token_exchange_method,
        );
        logger.debug(`[MCPOAuth] Client registered with ID: ${clientInfo.client_id}`);
      }

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

        /** Add cryptographic state parameter to the authorization URL */
        authorizationUrl.searchParams.set('state', state);
        logger.debug(`[MCPOAuth] Added state parameter to authorization URL`);

        if (resourceMetadata?.resource) {
          /**
           * `resource` was already canonicalized and bound to `serverUrl` inside
           * {@link discoverMetadata} via {@link assertResourceBoundToServer}, so `new URL`
           * here cannot throw and the value is safe to echo back to the authorization server.
           */
          const canonicalResource = new URL(resourceMetadata.resource).href;
          authorizationUrl.searchParams.set('resource', canonicalResource);
          logger.debug(
            `[MCPOAuth] Added resource parameter to authorization URL: ${canonicalResource}`,
          );
        } else {
          /**
           * Reachable only when `discoverOAuthProtectedResourceMetadata` did not return a
           * document (404 / network error / server does not implement RFC 9728). If a PRM
           * document exists but is missing `resource`, {@link assertResourceBoundToServer}
           * rejects it before this code runs, so this branch does not warn about a
           * malformed document — it warns about the absence of one.
           */
          logger.warn(
            `[MCPOAuth] No protected resource metadata available for ${serverName}. ` +
              'This can cause issues with some Authorization Servers that expect a "resource" parameter.',
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
        ...(Object.keys(oauthHeaders).length > 0 && { oauthHeaders }),
        ...(reusedStoredClient && { reusedStoredClient }),
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
   * Completes the OAuth flow by exchanging the authorization code for tokens.
   *
   * `allowedDomains` is intentionally absent: all URLs used here (serverUrl,
   * token_endpoint) originate from {@link MCPOAuthFlowMetadata} that was
   * SSRF-validated during {@link initiateOAuthFlow}. No new URL resolution occurs.
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
      if (metadata.resourceMetadata) {
        /**
         * Defense-in-depth: re-assert the RFC 9728 §3.3 binding against the flow's stored
         * server URL. Flow state has a 10-minute TTL, so a flow initiated under older
         * (pre-fix) code could still be in-flight at upgrade time carrying unvalidated
         * resource metadata. Re-validating here closes that window without requiring ops
         * teams to flush flow state on deploy (GHSA-gvpj-vm2f-2m23).
         */
        this.assertResourceBoundToServer(metadata.serverUrl, metadata.resourceMetadata);
        if (metadata.resourceMetadata.resource) {
          resource = new URL(metadata.resourceMetadata.resource);
          logger.debug(`[MCPOAuth] Resource URL for flow ${flowId}: ${resource.toString()}`);
        }
      }

      const tokens = await exchangeAuthorization(metadata.serverUrl, {
        redirectUri: metadata.clientInfo.redirect_uris?.[0] || this.getDefaultRedirectUri(),
        metadata: metadata.metadata as unknown as SDKOAuthMetadata,
        clientInformation: metadata.clientInfo,
        codeVerifier: metadata.codeVerifier,
        authorizationCode,
        resource,
        fetchFn: this.createOAuthFetch(oauthHeaders, metadata.clientInfo),
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
   * Enforces RFC 9728 §3.3 / §7.3: the `resource` identifier advertised by an OAuth
   * Protected Resource Metadata document MUST match the URL the client used to fetch
   * the document. A mismatch means the metadata is attacker-controlled (or the server
   * is badly misconfigured); per the RFC the whole document MUST be discarded, and in
   * practice we must fail the OAuth flow because `authorization_servers` on the same
   * document is also untrustworthy and was the primary theft vector in
   * GHSA-gvpj-vm2f-2m23.
   *
   * Uses the MCP SDK's own {@link checkResourceAllowed} so the semantics (same origin
   * plus configured-path-prefix) match what the SDK enforces internally via
   * {@link selectResourceURL}, a code path LibreChat does not go through.
   */
  private static assertResourceBoundToServer(
    serverUrl: string,
    resourceMetadata: OAuthProtectedResourceMetadata,
  ): void {
    if (!resourceMetadata.resource) {
      throw new Error(
        `[MCPOAuth] Protected Resource Metadata from ${sanitizeUrlForLogging(serverUrl)} is missing the required 'resource' identifier (RFC 9728 §2). Refusing OAuth flow.`,
      );
    }

    let allowed = false;
    try {
      allowed = checkResourceAllowed({
        requestedResource: resourceUrlFromServerUrl(serverUrl),
        configuredResource: resourceMetadata.resource,
      });
    } catch (error) {
      throw new Error(
        `[MCPOAuth] Unable to validate Protected Resource Metadata 'resource' for ${sanitizeUrlForLogging(serverUrl)}: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }

    if (!allowed) {
      throw new Error(
        `[MCPOAuth] Protected Resource Metadata 'resource' (${sanitizeUrlForLogging(resourceMetadata.resource)}) does not match server URL (${sanitizeUrlForLogging(serverUrl)}). Refusing OAuth flow (RFC 9728 §3.3).`,
      );
    }
  }

  /**
   * Validates an OAuth URL is not targeting a private/internal address.
   * Skipped when the full URL (hostname + protocol + port) matches an admin-trusted
   * allowedDomains entry, honoring protocol/port constraints when the admin specifies them.
   */
  private static async validateOAuthUrl(
    url: string,
    fieldName: string,
    allowedDomains?: string[] | null,
  ): Promise<void> {
    if (isOAuthUrlAllowed(url, allowedDomains)) {
      return;
    }

    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      throw new Error(`Invalid OAuth ${fieldName}: ${sanitizeUrlForLogging(url)}`);
    }

    if (isSSRFTarget(hostname)) {
      throw new Error(`OAuth ${fieldName} targets a blocked address`);
    }

    if (await resolveHostnameSSRF(hostname)) {
      throw new Error(`OAuth ${fieldName} resolves to a private IP address`);
    }
  }

  private static readonly STATE_MAP_TYPE = 'mcp_oauth_state';

  /**
   * Stores a mapping from the opaque OAuth state parameter to the flowId.
   * This allows the callback to resolve the flowId from an unguessable state
   * value, preventing attackers from forging callback requests.
   */
  static async storeStateMapping(
    state: string,
    flowId: string,
    flowManager: FlowStateManager<MCPOAuthTokens | null>,
  ): Promise<void> {
    await flowManager.initFlow(state, this.STATE_MAP_TYPE, { flowId });
  }

  /**
   * Resolves an opaque OAuth state parameter back to the original flowId.
   * Returns null if the state is not found (expired or never stored).
   */
  static async resolveStateToFlowId(
    state: string,
    flowManager: FlowStateManager<MCPOAuthTokens | null>,
  ): Promise<string | null> {
    const mapping = await flowManager.getFlowState(state, this.STATE_MAP_TYPE);
    return (mapping?.metadata?.flowId as string) ?? null;
  }

  /**
   * Deletes an orphaned state mapping when a flow is replaced.
   * Prevents old authorization URLs from resolving after a flow restart.
   */
  static async deleteStateMapping(
    state: string,
    flowManager: FlowStateManager<MCPOAuthTokens | null>,
  ): Promise<void> {
    await flowManager.deleteFlow(state, this.STATE_MAP_TYPE);
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
   * Processes and logs a token refresh response from an OAuth server.
   * Normalizes the response to MCPOAuthTokens format and logs debug info about refresh token rotation.
   */
  private static processRefreshResponse(
    tokens: Record<string, unknown>,
    serverName: string,
    source: string,
  ): MCPOAuthTokens {
    const hasNewRefreshToken = !!tokens.refresh_token;

    logger.debug(`[MCPOAuth] Token refresh response (${source})`, {
      serverName,
      has_new_access_token: !!tokens.access_token,
      has_new_refresh_token: hasNewRefreshToken,
      refresh_token_rotated: hasNewRefreshToken,
      expires_in: tokens.expires_in,
    });

    if (!hasNewRefreshToken) {
      logger.debug(
        `[MCPOAuth] OAuth server did not return new refresh_token for ${serverName} - existing refresh token remains valid (normal for non-rotating providers)`,
      );
    }

    return {
      ...tokens,
      obtained_at: Date.now(),
      expires_at:
        typeof tokens.expires_in === 'number' ? Date.now() + tokens.expires_in * 1000 : undefined,
    } as MCPOAuthTokens;
  }

  /**
   * Refreshes OAuth tokens using a refresh token
   */
  static async refreshOAuthTokens(
    refreshToken: string,
    metadata: {
      serverName: string;
      serverUrl?: string;
      clientInfo?: OAuthClientInformation;
      storedTokenEndpoint?: string;
      storedAuthMethods?: string[];
    },
    oauthHeaders: Record<string, string>,
    config?: MCPOptions['oauth'],
    allowedDomains?: string[] | null,
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

        let tokenUrl: string;
        let authMethods: string[] | undefined;
        if (config?.token_url) {
          await this.validateOAuthUrl(config.token_url, 'token_url', allowedDomains);
          tokenUrl = config.token_url;
          authMethods = config.token_endpoint_auth_methods_supported;
        } else if (!metadata.serverUrl) {
          throw new Error('No token URL available for refresh');
        } else {
          /** Auto-discover OAuth configuration for refresh */
          const serverUrl = new URL(metadata.serverUrl);
          const fetchFn = this.createOAuthFetch(oauthHeaders);
          const oauthMetadata = await this.discoverWithOriginFallback(serverUrl, fetchFn);

          if (!oauthMetadata) {
            if (metadata.storedTokenEndpoint) {
              tokenUrl = metadata.storedTokenEndpoint;
              authMethods = metadata.storedAuthMethods;
            } else {
              /**
               * Do NOT fall back to `new URL('/token', metadata.serverUrl)`.
               * metadata.serverUrl is the MCP resource server, which may differ from the
               * authorization server. Sending refresh tokens there leaks them to the
               * resource server operator when .well-known discovery is absent.
               */
              throw new Error('No OAuth metadata discovered for token refresh');
            }
          } else if (!oauthMetadata.token_endpoint) {
            throw new Error('No token endpoint found in OAuth metadata');
          } else {
            tokenUrl = oauthMetadata.token_endpoint;
            authMethods = oauthMetadata.token_endpoint_auth_methods_supported;
          }
          await this.validateOAuthUrl(tokenUrl, 'token_url', allowedDomains);
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
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          ...oauthHeaders,
        };

        /** Handle authentication based on server's advertised methods */
        if (metadata.clientInfo.client_secret) {
          /** Default to client_secret_basic if no methods specified (per RFC 8414) */
          const tokenAuthMethods = authMethods ?? ['client_secret_basic'];
          const authMethod = resolveTokenEndpointAuthMethod({
            tokenExchangeMethod: config?.token_exchange_method,
            tokenAuthMethods,
            preferredMethod: metadata.clientInfo.token_endpoint_auth_method,
          });

          if (authMethod === 'client_secret_basic') {
            logger.debug('[MCPOAuth] Using client_secret_basic authentication method');
            const clientAuth = Buffer.from(
              `${metadata.clientInfo.client_id}:${metadata.clientInfo.client_secret}`,
            ).toString('base64');
            headers['Authorization'] = `Basic ${clientAuth}`;
          } else if (authMethod === 'client_secret_post') {
            logger.debug('[MCPOAuth] Using client_secret_post authentication method');
            body.append('client_id', metadata.clientInfo.client_id);
            body.append('client_secret', metadata.clientInfo.client_secret);
          } else {
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
          grant_type: 'refresh_token',
          has_auth_header: !!headers['Authorization'],
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
        return this.processRefreshResponse(tokens, metadata.serverName, 'stored client info');
      }

      if (config?.token_url && config?.client_id) {
        logger.debug(`[MCPOAuth] Using pre-configured OAuth settings for token refresh`);

        await this.validateOAuthUrl(config.token_url, 'token_url', allowedDomains);
        const tokenUrl = new URL(config.token_url);

        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        });

        if (config.scope) {
          body.append('scope', config.scope);
        }

        const headers: HeadersInit = {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          ...oauthHeaders,
        };

        /** Handle authentication based on configured methods */
        if (config.client_secret) {
          /** Default to client_secret_basic if no methods specified (per RFC 8414) */
          const tokenAuthMethods = config.token_endpoint_auth_methods_supported ?? [
            'client_secret_basic',
          ];
          const authMethod = resolveTokenEndpointAuthMethod({
            tokenExchangeMethod: config.token_exchange_method,
            tokenAuthMethods,
          });

          if (authMethod === 'client_secret_basic') {
            logger.debug(
              '[MCPOAuth] Using client_secret_basic authentication method (pre-configured)',
            );
            const clientAuth = Buffer.from(`${config.client_id}:${config.client_secret}`).toString(
              'base64',
            );
            headers['Authorization'] = `Basic ${clientAuth}`;
          } else if (authMethod === 'client_secret_post') {
            logger.debug(
              '[MCPOAuth] Using client_secret_post authentication method (pre-configured)',
            );
            body.append('client_id', config.client_id);
            body.append('client_secret', config.client_secret);
          } else {
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
        return this.processRefreshResponse(tokens, metadata.serverName, 'pre-configured OAuth');
      }

      /** For auto-discovered OAuth, we need the server URL */
      if (!metadata.serverUrl) {
        throw new Error('Server URL required for auto-discovered OAuth token refresh');
      }

      /** Auto-discover OAuth configuration for refresh */
      const serverUrl = new URL(metadata.serverUrl);
      const fetchFn = this.createOAuthFetch(oauthHeaders);
      const oauthMetadata = await this.discoverWithOriginFallback(serverUrl, fetchFn);

      let tokenUrl: URL;
      if (!oauthMetadata) {
        if (metadata.storedTokenEndpoint) {
          tokenUrl = new URL(metadata.storedTokenEndpoint);
        } else {
          // Same rationale as the stored-clientInfo branch above: never fall back
          // to metadata.serverUrl which is the MCP resource server, not the auth server.
          throw new Error('No OAuth metadata discovered for token refresh');
        }
      } else if (!oauthMetadata.token_endpoint) {
        throw new Error('No token endpoint found in OAuth metadata');
      } else {
        tokenUrl = new URL(oauthMetadata.token_endpoint);
      }
      await this.validateOAuthUrl(tokenUrl.href, 'token_url', allowedDomains);

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const headers: HeadersInit = {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
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
      return this.processRefreshResponse(tokens, metadata.serverName, 'auto-discovered OAuth');
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
    allowedDomains?: string[] | null,
  ): Promise<void> {
    const revokeUrl: URL =
      metadata.revocationEndpoint != null
        ? new URL(metadata.revocationEndpoint)
        : new URL('/revoke', metadata.serverUrl);
    await this.validateOAuthUrl(revokeUrl.href, 'revocation_endpoint', allowedDomains);

    const authMethods = metadata.revocationEndpointAuthMethodsSupported ?? ['client_secret_basic'];
    const authMethod = resolveTokenEndpointAuthMethod({ tokenAuthMethods: authMethods });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...oauthHeaders,
    };

    const body = new URLSearchParams({ token });
    body.set('token_type_hint', tokenType === 'refresh' ? 'refresh_token' : 'access_token');

    if (authMethod === 'client_secret_basic') {
      const credentials = Buffer.from(`${metadata.clientId}:${metadata.clientSecret}`).toString(
        'base64',
      );
      headers['Authorization'] = `Basic ${credentials}`;
    } else if (authMethod === 'client_secret_post') {
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
