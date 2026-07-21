import { logger, getTenantId, tenantStorage } from '@librechat/data-schemas';
import type { OAuthClientInformation } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { TokenMethods, TenantContext } from '@librechat/data-schemas';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type {
  MCPOAuthTokens,
  OAuthMetadata,
  MCPOAuthFlowMetadata,
  OAuthProtectedResourceMetadata,
} from '~/mcp/oauth';
import type { OboTokenResolver, OboTrustChecker } from '~/mcp/oauth/obo';
import type { FlowStateManager } from '~/flow/manager';
import type * as t from './types';
import {
  MCPTokenStorage,
  MCPOAuthHandler,
  OboTokenResolutionError,
  ReauthenticationRequiredError,
  resolveOboToken,
} from '~/mcp/oauth';
import { sanitizeUrlForLogging, isClientRejectionMessage, isOAuthServer } from './utils';
import { PENDING_STALE_MS, normalizeExpiresAt } from '~/flow/manager';
import { preProcessGraphTokens } from '~/utils/graph';
import { withTimeout } from '~/utils/promise';
import { MCPConnection } from './connection';
import { processMCPEnv } from '~/utils';
import { mcpConfig } from './mcpConfig';

export interface ToolDiscoveryResult {
  tools: Tool[] | null;
  connection: MCPConnection | null;
  oauthRequired: boolean;
  oauthUrl: string | null;
}

type OAuthRequiredEvent = {
  serverUrl?: string;
  error?: unknown;
  status?: number;
  statusCode?: number;
  skipSilentRefresh?: boolean;
};

/**
 * Factory for creating MCP connections with optional OAuth authentication.
 * Handles OAuth flows, token management, and connection retry logic.
 * NOTE: Much of the OAuth logic was extracted from the old MCPManager class as is.
 */
export class MCPConnectionFactory {
  protected readonly serverName: string;
  protected readonly serverConfig: t.MCPOptions;
  protected readonly logPrefix: string;
  protected readonly useOAuth: boolean;
  protected readonly useSSRFProtection: boolean;
  protected readonly allowedDomains?: string[] | null;
  protected readonly allowedAddresses?: string[] | null;
  protected readonly ephemeralConnection: boolean;

  // OAuth-related properties (only set when useOAuth is true)
  protected readonly userId?: string;
  protected readonly user?: t.OAuthConnectionOptions['user'];
  protected readonly flowManager?: FlowStateManager<MCPOAuthTokens | null>;
  protected readonly tokenMethods?: TokenMethods;
  protected signal?: AbortSignal;
  protected oauthStart?: t.OAuthStartHandler;
  protected oauthEnd?: () => Promise<void>;
  protected returnOnOAuth?: boolean;
  protected readonly connectionTimeout?: number;
  protected readonly oboTokenResolver?: OboTokenResolver;
  protected readonly oboTrustChecker?: OboTrustChecker;
  private connectionReady = false;
  /**
   * Snapshot of the tenant context at factory construction time. Captured eagerly
   * because the OAuth handler runs later inside an EventEmitter callback,
   * outside the original request's async context - `getTenantId()` called
   * from the listener would return the wrong tenant (or none at all).
   */
  protected readonly tenantId?: string;
  protected readonly tenantContext?: TenantContext;

  /**
   * Process-local in-flight silent refresh promises, keyed by
   * `tenantId:userId:serverName`. Coalesces concurrent `attemptSilentTokenRefresh`
   * calls within this process so a single refresh-token redemption serves every
   * waiter in the same tenant — important when multiple connections (or repeated
   * 401s) race the same refresh and the OAuth provider rotates refresh tokens.
   * The map only holds in-flight promises (no result caching), so each new 401
   * after the previous attempt resolves triggers a fresh redemption.
   *
   * NOTE: this is a single-process lock. Across multiple worker processes the
   * race with `getOAuthTokens()`'s `mcp_get_tokens` flow remains; that's an
   * inherent limitation of process-local coalescing and tracked separately.
   */
  private static inflightSilentRefreshes = new Map<string, Promise<MCPOAuthTokens | null>>();

  /**
   * Silent refresh is a best-effort optimization before interactive OAuth.
   * Keep the cap short so a stalled refresh still leaves most of the factory
   * connect budget for OAuth discovery, registration, and `oauthStart`.
   */
  private static readonly SILENT_REFRESH_TIMEOUT_MS = 5_000;
  private static readonly SILENT_REFRESH_ABORT_GRACE_MS = 1_000;

  /** Creates a new MCP connection with optional OAuth support */
  static async create(
    basic: t.BasicConnectionOptions,
    oauth?: t.OAuthConnectionOptions | t.UserConnectionContext,
  ): Promise<MCPConnection> {
    const factory = new this(await this.prepareBasicConnectionOptions(basic, oauth), oauth);
    return factory.createConnection();
  }

  static attachRequestOAuthHandler(
    basic: t.BasicConnectionOptions,
    oauth: t.OAuthConnectionOptions,
    connection: MCPConnection,
  ): () => void {
    const factory = new this(basic, oauth);
    return factory.handleOAuthEvents(connection, 'oauthReauthenticationRequired');
  }

  /**
   * Discovers tools from an MCP server, even when OAuth is required.
   * Per MCP spec, tool listing should be possible without authentication.
   * Returns tools if discoverable, plus OAuth status for tool execution.
   */
  static async discoverTools(
    basic: t.BasicConnectionOptions,
    options?: Omit<t.OAuthConnectionOptions, 'returnOnOAuth'> | t.UserConnectionContext,
  ): Promise<ToolDiscoveryResult> {
    const preparedBasic = await this.prepareBasicConnectionOptions(basic, options);
    if (options != null && 'useOAuth' in options) {
      const factory = new this(preparedBasic, { ...options, returnOnOAuth: true });
      return factory.discoverToolsInternal();
    }
    const factory = new this(preparedBasic, options);
    return factory.discoverToolsInternal();
  }

  /**
   * Together with the constructor's processMCPEnv pass, this mirrors
   * UserConnectionManager.resolveRuntimeConfig — keep them in sync so the
   * config validated there matches the one connected with here.
   */
  private static async prepareBasicConnectionOptions(
    basic: t.BasicConnectionOptions,
    options?: t.OAuthConnectionOptions | t.UserConnectionContext,
  ): Promise<t.BasicConnectionOptions> {
    if (basic.dbSourced || !options?.graphTokenResolver) {
      return basic;
    }

    const serverConfig = await preProcessGraphTokens(basic.serverConfig, {
      user: options.user,
      graphTokenResolver: options.graphTokenResolver,
      scopes: process.env.GRAPH_API_SCOPES,
    });

    return serverConfig === basic.serverConfig ? basic : { ...basic, serverConfig };
  }

  protected async discoverToolsInternal(): Promise<ToolDiscoveryResult> {
    const oauthUrl: string | null = null;
    let oauthRequired = false;

    let oauthTokens: MCPOAuthTokens | null = null;
    if (this.usesObo) {
      oauthTokens = await this.getOboTokens();
    } else if (this.useOAuth) {
      oauthTokens = await this.getOAuthTokens();
    }
    const connection = new MCPConnection({
      serverName: this.serverName,
      serverConfig: this.serverConfig,
      userId: this.userId,
      oauthTokens,
      useSSRFProtection: this.useSSRFProtection,
      allowedAddresses: this.allowedAddresses,
      ephemeralConnection: this.ephemeralConnection,
    });

    const oauthHandler = () => {
      logger.info(
        `${this.logPrefix} [Discovery] OAuth required; skipping URL generation in discovery mode`,
      );
      oauthRequired = true;
      connection.emit('oauthFailed', new Error('OAuth required during tool discovery'));
    };

    // Register unconditionally: non-OAuth servers that return 401 also emit 'oauthRequired',
    // and without this listener, connectClient()'s oauthHandledPromise hangs for 30s+.
    connection.once('oauthRequired', oauthHandler);

    try {
      const connectTimeout = this.connectionTimeout ?? this.serverConfig.initTimeout ?? 30000;
      await withTimeout(
        connection.connect(),
        connectTimeout,
        `Connection timeout after ${connectTimeout}ms`,
      );

      if (await connection.isConnected()) {
        const tools = await connection.fetchTools();
        connection.removeListener('oauthRequired', oauthHandler);
        return { tools, connection, oauthRequired: false, oauthUrl: null };
      }
    } catch {
      MCPConnection.decrementCycleCount(this.serverName);
      logger.debug(
        `${this.logPrefix} [Discovery] Connection failed, attempting unauthenticated tool listing`,
      );
    }

    try {
      const tools = await this.attemptUnauthenticatedToolListing();
      connection.removeListener('oauthRequired', oauthHandler);
      if (tools && tools.length > 0) {
        logger.info(
          `${this.logPrefix} [Discovery] Successfully discovered ${tools.length} tools without auth`,
        );
        try {
          await connection.disconnect();
        } catch {
          // Ignore cleanup errors
        }
        return { tools, connection: null, oauthRequired, oauthUrl };
      }
      MCPConnection.decrementCycleCount(this.serverName);
    } catch (listError) {
      MCPConnection.decrementCycleCount(this.serverName);
      logger.debug(`${this.logPrefix} [Discovery] Unauthenticated tool listing failed:`, listError);
    }

    connection.removeListener('oauthRequired', oauthHandler);

    try {
      await connection.disconnect();
    } catch {
      // Ignore cleanup errors
    }

    return { tools: null, connection: null, oauthRequired, oauthUrl };
  }

  protected async attemptUnauthenticatedToolListing(): Promise<Tool[] | null> {
    const unauthConnection = new MCPConnection({
      serverName: this.serverName,
      serverConfig: this.serverConfig,
      userId: this.userId,
      oauthTokens: null,
      useSSRFProtection: this.useSSRFProtection,
      allowedAddresses: this.allowedAddresses,
      ephemeralConnection: this.ephemeralConnection,
    });

    unauthConnection.on('oauthRequired', () => {
      logger.debug(
        `${this.logPrefix} [Discovery] Unauthenticated connection requires OAuth, failing fast`,
      );
      unauthConnection.emit(
        'oauthFailed',
        new Error('OAuth not supported in unauthenticated discovery'),
      );
    });

    try {
      const connectTimeout = this.connectionTimeout ?? this.serverConfig.initTimeout ?? 15000;
      await withTimeout(unauthConnection.connect(), connectTimeout, `Unauth connection timeout`);

      if (await unauthConnection.isConnected()) {
        const tools = await unauthConnection.fetchTools();
        await unauthConnection.disconnect();
        return tools;
      }
    } catch {
      logger.debug(`${this.logPrefix} [Discovery] Unauthenticated connection attempt failed`);
    }

    try {
      await unauthConnection.disconnect();
    } catch {
      // Ignore cleanup errors
    }

    return null;
  }

  protected constructor(
    basic: t.BasicConnectionOptions,
    options?: t.OAuthConnectionOptions | t.UserConnectionContext,
  ) {
    this.serverConfig = basic.skipEnvProcessing
      ? basic.serverConfig
      : processMCPEnv({
          user: options?.user,
          body: options?.requestBody,
          dbSourced: basic.dbSourced,
          options: basic.serverConfig,
          customUserVars: options?.customUserVars,
        });
    this.serverName = basic.serverName;
    this.useSSRFProtection = basic.useSSRFProtection === true;
    this.allowedDomains = basic.allowedDomains;
    this.allowedAddresses = basic.allowedAddresses;
    this.ephemeralConnection = basic.ephemeralConnection === true;
    this.connectionTimeout = options?.connectionTimeout;
    this.tenantContext = tenantStorage?.getStore?.();
    this.tenantId = this.tenantContext?.tenantId ?? getTenantId();
    this.logPrefix = options?.user
      ? `[MCP][${basic.serverName}][${options.user.id}]`
      : `[MCP][${basic.serverName}]`;

    this.user = options?.user;

    if (options != null && 'useOAuth' in options) {
      this.useOAuth = true;
      this.userId = options.user?.id;
      this.flowManager = options.flowManager;
      this.tokenMethods = options.tokenMethods;
      this.signal = options.signal;
      this.oauthStart = options.oauthStart;
      this.oauthEnd = options.oauthEnd;
      this.returnOnOAuth = options.returnOnOAuth;
      this.oboTokenResolver = options.oboTokenResolver;
      this.oboTrustChecker = options.oboTrustChecker;
    } else {
      this.useOAuth = false;
    }
  }

  /** Resolves OBO tokens when the server config specifies obo, returns null otherwise */
  protected async getOboTokens(): Promise<MCPOAuthTokens | null> {
    const oboConfig = this.serverConfig.obo;
    if (!oboConfig || !this.oboTokenResolver || !this.user) {
      return null;
    }

    if (this.oboTrustChecker) {
      const config = this.serverConfig as t.ParsedServerConfig;
      const trusted = await this.oboTrustChecker({
        source: config.source,
        author: config.author,
        dbId: config.dbId,
      });
      if (!trusted) {
        logger.warn(
          `${this.logPrefix} OBO config not trusted (author lacks CONFIGURE_OBO permission); skipping OBO token exchange`,
        );
        return null;
      }
    }

    logger.info(`${this.logPrefix} Resolving OBO token for scopes: ${oboConfig.scopes}`);
    return resolveOboToken(this.user, oboConfig, this.oboTokenResolver);
  }

  /** Returns true if this server uses OBO instead of standard OAuth */
  protected get usesObo(): boolean {
    return !!this.serverConfig.obo && !!this.oboTokenResolver && !!this.user;
  }

  protected createOboConnectionError(error: OboTokenResolutionError): Error {
    let recoveryHint = 'Re-authenticate the user and retry.';

    if (error.retryable) {
      recoveryHint = 'Please retry.';
    } else if (error.reason === 'exchange_failed') {
      recoveryHint = 'Re-authenticate the user or verify the configured OBO scopes and retry.';
    }

    return new Error(
      `${error.userMessage} Unable to connect to OBO server "${this.serverName}". ${recoveryHint}`,
    );
  }

  /** Creates the base MCP connection with OAuth tokens */
  protected async createConnection(): Promise<MCPConnection> {
    let oauthTokens: MCPOAuthTokens | null = null;

    if (this.usesObo) {
      try {
        oauthTokens = await this.getOboTokens();
      } catch (error) {
        if (error instanceof OboTokenResolutionError) {
          throw this.createOboConnectionError(error);
        }
        throw error;
      }
      if (!oauthTokens) {
        throw new Error(`OBO token exchange failed for "${this.serverName}".`);
      }
    } else if (this.useOAuth) {
      oauthTokens = await this.getOAuthTokens();
    }

    const connection = new MCPConnection({
      serverName: this.serverName,
      serverConfig: this.serverConfig,
      userId: this.userId,
      oauthTokens,
      useSSRFProtection: this.useSSRFProtection,
      allowedAddresses: this.allowedAddresses,
      ephemeralConnection: this.ephemeralConnection,
    });

    let cleanupOAuthHandlers: (() => void) | null = null;
    if (this.useOAuth && !this.usesObo) {
      cleanupOAuthHandlers = this.handleOAuthEvents(connection);
    } else {
      const nonOAuthHandler = () => {
        logger.info(
          `${this.logPrefix} Server does not use OAuth; treating 401/403 as auth failure`,
        );
        connection.emit('oauthFailed', new Error('Server does not use OAuth'));
      };
      connection.on('oauthRequired', nonOAuthHandler);
      cleanupOAuthHandlers = () => {
        connection.removeListener('oauthRequired', nonOAuthHandler);
      };
    }

    try {
      if (this.shouldInitiateOAuthBeforeConnect(oauthTokens)) {
        await this.initiateOAuthBeforeConnect(connection);
      }
      await this.attemptToConnect(connection);
      this.connectionReady = true;
      // Keep the `oauthRequired` listener for cached-connection 401 recovery,
      // but drop response/tool-call callbacks from the completed request.
      this.releaseRequestScopedOAuthState();
      return connection;
    } catch (error) {
      if (cleanupOAuthHandlers) {
        cleanupOAuthHandlers();
      }
      try {
        await connection.dispose();
      } catch (disconnectError) {
        logger.warn(`${this.logPrefix} Failed to clean up rejected MCP connection`, {
          error: disconnectError,
        });
      }
      throw error;
    }
  }

  private shouldInitiateOAuthBeforeConnect(oauthTokens: MCPOAuthTokens | null): boolean {
    if (!this.useOAuth || oauthTokens) {
      return false;
    }
    return isOAuthServer(this.serverConfig);
  }

  protected releaseRequestScopedOAuthState(): void {
    this.signal = undefined;
    this.oauthStart = undefined;
    this.oauthEnd = undefined;
    this.returnOnOAuth = false;
  }

  private getServerUrl(): string | undefined {
    return 'url' in this.serverConfig ? this.serverConfig.url : undefined;
  }

  private async initiateOAuthBeforeConnect(connection: MCPConnection): Promise<void> {
    const serverUrl = this.getServerUrl();
    if (!serverUrl) {
      throw new Error(`${this.logPrefix} OAuth required but server URL is missing from config`);
    }

    const oauthTimeout = mcpConfig.OAUTH_HANDLING_TIMEOUT;
    logger.info(
      `${this.logPrefix} No stored tokens, proactively triggering OAuth flow before connecting (timeout: ${oauthTimeout}ms)`,
    );

    await new Promise<void>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let oauthHandledListener: (() => void) | null = null;
      let oauthFailedListener: ((error: Error) => void) | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (oauthHandledListener) {
          connection.off('oauthHandled', oauthHandledListener);
        }
        if (oauthFailedListener) {
          connection.off('oauthFailed', oauthFailedListener);
        }
      };

      oauthHandledListener = () => {
        cleanup();
        resolve();
      };

      oauthFailedListener = (error: Error) => {
        cleanup();
        reject(error);
      };

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Proactive OAuth flow timeout after ${oauthTimeout}ms`));
      }, oauthTimeout);

      connection.once('oauthHandled', oauthHandledListener);
      connection.once('oauthFailed', oauthFailedListener);

      const emitted = connection.emit('oauthRequired', {
        serverName: this.serverName,
        error: new Error('OAuth tokens missing before connection'),
        serverUrl,
        userId: this.userId,
        /** `getOAuthTokens` just exhausted the stored-token/refresh path; go straight to interactive OAuth */
        skipSilentRefresh: true,
      });

      if (!emitted) {
        cleanup();
        reject(new Error('OAuth required but no handler is registered'));
      }
    });
  }

  private async runWithCapturedTenant<T>(fn: () => Promise<T>): Promise<T> {
    const context = this.tenantContext ?? (this.tenantId ? { tenantId: this.tenantId } : undefined);
    if (!context || !tenantStorage?.run) {
      return fn();
    }
    return tenantStorage.run(context, fn);
  }

  private getConnectionOAuthTimeoutMs(): number {
    const factoryConnectTimeout = this.connectionTimeout ?? this.serverConfig.initTimeout ?? 30000;
    const connectionOAuthTimeout = this.serverConfig.initTimeout ?? 60000 * 2;
    return Math.min(factoryConnectTimeout, connectionOAuthTimeout);
  }

  private getSilentRefreshTimeoutMs(): number {
    const oauthTimeout = this.getConnectionOAuthTimeoutMs();
    const silentRefreshBudgetMs = Math.floor(oauthTimeout * 0.4);
    return Math.max(
      1,
      Math.min(MCPConnectionFactory.SILENT_REFRESH_TIMEOUT_MS, silentRefreshBudgetMs),
    );
  }

  private getBaseFlowId(): string {
    return MCPOAuthHandler.generateFlowId(this.userId!, this.serverName, this.tenantId);
  }

  private getTokenFlowId(): string {
    return MCPOAuthHandler.generateTokenFlowId(this.userId!, this.serverName, this.tenantId);
  }

  /** Retrieves existing OAuth tokens from storage or returns null */
  protected async getOAuthTokens(): Promise<MCPOAuthTokens | null> {
    if (!this.tokenMethods?.findToken) return null;

    try {
      const flowId = this.getTokenFlowId();
      const tokens = await this.flowManager!.createFlowWithHandler(
        flowId,
        'mcp_get_tokens',
        async () => {
          return await this.runWithCapturedTenant(async () =>
            MCPTokenStorage.getTokens({
              userId: this.userId!,
              serverName: this.serverName,
              findToken: this.tokenMethods!.findToken!,
              createToken: this.tokenMethods!.createToken,
              updateToken: this.tokenMethods!.updateToken,
              deleteTokens: this.tokenMethods!.deleteTokens,
              refreshTokens: this.createRefreshTokensFunction(),
            }),
          );
        },
        this.signal,
      );

      if (tokens) logger.info(`${this.logPrefix} Loaded OAuth tokens`);
      return tokens;
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        logger.info(`${this.logPrefix} ${error.message}, will trigger OAuth flow`);
        return null;
      }
      logger.debug(`${this.logPrefix} No existing tokens found or error loading tokens`, error);
      return null;
    }
  }

  /** Creates a function to refresh OAuth tokens when they expire */
  protected createRefreshTokensFunction(): (
    refreshToken: string,
    metadata: {
      userId: string;
      serverName: string;
      identifier: string;
      clientInfo?: OAuthClientInformation;
      storedTokenEndpoint?: string;
      storedAuthMethods?: string[];
      resource?: string;
    },
    signal?: AbortSignal,
  ) => Promise<MCPOAuthTokens> {
    return async (refreshToken, metadata, signal) => {
      return await MCPOAuthHandler.refreshOAuthTokens(
        refreshToken,
        {
          serverUrl: (this.serverConfig as t.SSEOptions | t.StreamableHTTPOptions).url,
          serverName: metadata.serverName,
          clientInfo: metadata.clientInfo,
          storedTokenEndpoint: metadata.storedTokenEndpoint,
          storedAuthMethods: metadata.storedAuthMethods,
          resource: metadata.resource,
        },
        this.serverConfig.oauth_headers ?? {},
        this.serverConfig.oauth,
        this.allowedDomains,
        this.allowedAddresses,
        signal,
      );
    };
  }

  /**
   * Attempts to silently refresh OAuth tokens using the stored refresh token,
   * bypassing the local `expires_at` check. Use this when the server has
   * signaled token invalidity (a 401 emitted as `oauthRequired`) to avoid
   * forcing the user through an interactive OAuth flow when the refresh token
   * is still valid.
   *
   * Coalesces via `inflightSilentRefreshes` rather than `FlowStateManager` —
   * the latter caches the completed result for the new token's TTL, which
   * would hand back stale tokens on a subsequent 401 (e.g. when the freshly
   * minted token is revoked before its local expiry). Caching only the
   * in-flight promise means every fresh 401 after settlement triggers a
   * fresh redemption.
   */
  protected async attemptSilentTokenRefresh(): Promise<MCPOAuthTokens | null> {
    if (!this.tokenMethods?.findToken || !this.tokenMethods?.createToken) {
      return null;
    }

    // Scope the lock by tenant so two tenants that share the same `userId`
    // and `serverName` (common with username-based IDs in multi-tenant setups)
    // can never join each other's refresh and have those tokens applied to the
    // wrong connection.
    const lockKey = `${this.tenantId ?? ''}:${this.userId ?? ''}:${this.serverName}`;
    const inflight = MCPConnectionFactory.inflightSilentRefreshes.get(lockKey);
    if (inflight) {
      logger.debug(`${this.logPrefix} Joining in-flight silent refresh attempt`);
      return inflight;
    }

    const timeoutMs = this.getSilentRefreshTimeoutMs();
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let abortGraceTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const refreshPromise = this.runSilentRefresh(abortController.signal);
    const promise = new Promise<MCPOAuthTokens | null>((resolve) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        abortGraceTimeoutId = setTimeout(
          releaseLock,
          MCPConnectionFactory.SILENT_REFRESH_ABORT_GRACE_MS,
        );
        logger.info(
          `${this.logPrefix} Silent token refresh timed out after ${timeoutMs}ms, falling back to interactive OAuth`,
        );
        resolve(null);
      }, timeoutMs);

      refreshPromise.then(resolve, (error: unknown) => {
        logger.info(
          `${this.logPrefix} Silent token refresh failed, falling back to interactive OAuth`,
          error,
        );
        resolve(null);
      });
    }).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
    function releaseLock() {
      if (abortGraceTimeoutId) {
        clearTimeout(abortGraceTimeoutId);
        abortGraceTimeoutId = null;
      }
      if (MCPConnectionFactory.inflightSilentRefreshes.get(lockKey) === promise) {
        MCPConnectionFactory.inflightSilentRefreshes.delete(lockKey);
      }
    }
    MCPConnectionFactory.inflightSilentRefreshes.set(lockKey, promise);
    void refreshPromise.then(releaseLock, releaseLock);
    return await promise;
  }

  /**
   * Executes a single force-refresh attempt against the OAuth provider and
   * persists the new tokens. Called by `attemptSilentTokenRefresh` under the
   * `inflightSilentRefreshes` coalescing lock.
   */
  private async runSilentRefresh(signal: AbortSignal): Promise<MCPOAuthTokens | null> {
    try {
      const tokens = await this.runWithCapturedTenant(async () =>
        MCPTokenStorage.forceRefreshTokens({
          userId: this.userId!,
          serverName: this.serverName,
          findToken: this.tokenMethods!.findToken!,
          createToken: this.tokenMethods!.createToken,
          updateToken: this.tokenMethods!.updateToken,
          deleteTokens: this.tokenMethods!.deleteTokens,
          refreshTokens: this.createRefreshTokensFunction(),
          signal,
        }),
      );

      if (tokens) {
        // Drop any previously cached `mcp_get_tokens` result so the next call
        // to `getOAuthTokens` reads the freshly persisted tokens from the
        // token store rather than the now-stale flow-cached value.
        await this.invalidateGetTokensFlow(tokens);
      }

      if (tokens) {
        logger.info(`${this.logPrefix} Silent token refresh succeeded`);
      } else {
        logger.info(`${this.logPrefix} Silent token refresh returned no tokens`);
      }
      return tokens;
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        logger.info(`${this.logPrefix} ${error.message}, falling back to interactive OAuth`);
      } else {
        logger.info(
          `${this.logPrefix} Silent token refresh failed, falling back to interactive OAuth`,
          error,
        );
      }
      return null;
    }
  }

  /**
   * Clears stale token-fetch cache after fresh credentials are known. COMPLETED
   * entries are deleted; PENDING entries are completed with fresh tokens so
   * concurrent waiters do not fail or later publish server-rejected tokens.
   */
  protected async invalidateGetTokensFlow(freshTokens?: MCPOAuthTokens): Promise<void> {
    if (!this.flowManager || !this.userId) {
      return;
    }
    const flowId = this.getTokenFlowId();
    try {
      const state = await this.flowManager.getFlowState(flowId, 'mcp_get_tokens');
      if (!state) {
        return;
      }
      if (state.status === 'PENDING' && freshTokens) {
        await this.flowManager.completeFlow(flowId, 'mcp_get_tokens', freshTokens);
        return;
      }
      if (state.status !== 'COMPLETED') {
        return;
      }
      await this.flowManager.deleteFlow(flowId, 'mcp_get_tokens');
    } catch (err) {
      logger.debug(`${this.logPrefix} Failed to invalidate mcp_get_tokens cache`, err);
    }
  }

  /**
   * Drops any cached COMPLETED `mcp_oauth` flow state so that
   * `handleOAuthRequired`'s recent-completion fast path can't re-serve the
   * tokens that the resource server just rejected.
   */
  protected async invalidateCompletedOAuthFlow(): Promise<void> {
    if (!this.flowManager || !this.userId) {
      return;
    }
    const flowId = this.getBaseFlowId();
    try {
      const existing = await this.flowManager.getFlowState(flowId, 'mcp_oauth');
      if (!existing || existing.status !== 'COMPLETED') {
        return;
      }
      const meta = existing.metadata as MCPOAuthFlowMetadata | undefined;
      if (!this.isCurrentTenantOAuthFlow(meta)) {
        logger.debug(
          `${this.logPrefix} Skipping completed mcp_oauth invalidation for a different tenant`,
        );
        return;
      }
      const oldState = meta?.state;
      await this.flowManager.deleteFlow(flowId, 'mcp_oauth');
      if (oldState) {
        await MCPOAuthHandler.deleteStateMapping(oldState, this.flowManager);
      }
    } catch (err) {
      logger.debug(`${this.logPrefix} Failed to invalidate completed mcp_oauth cache`, err);
    }
  }

  private isCurrentTenantOAuthFlow(meta: MCPOAuthFlowMetadata | undefined): boolean {
    const flowTenantId = meta?.tenantId;
    if (!this.tenantId) {
      return !flowTenantId;
    }
    return flowTenantId === this.tenantId;
  }

  private getOAuthRequiredStatusCode(data: OAuthRequiredEvent): number | undefined {
    if (typeof data.status === 'number') {
      return data.status;
    }
    if (typeof data.statusCode === 'number') {
      return data.statusCode;
    }

    const error = data.error;
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const errorLike = error as {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      message?: unknown;
    };
    for (const value of [errorLike.code, errorLike.status, errorLike.statusCode]) {
      if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
      }
    }

    if (typeof errorLike.message === 'string') {
      const statusMatch = errorLike.message.match(/\b(4\d{2}|5\d{2})\b/);
      if (statusMatch) {
        return Number.parseInt(statusMatch[1], 10);
      }
    }

    return undefined;
  }

  private shouldAttemptSilentTokenRefresh(data: OAuthRequiredEvent): boolean {
    const statusCode = this.getOAuthRequiredStatusCode(data);
    if (statusCode === 403) {
      logger.info(
        `${this.logPrefix} OAuth server returned 403; skipping silent refresh and starting interactive OAuth`,
      );
      return false;
    }

    const error = data.error;
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string') {
        const normalized = message.toLowerCase();
        if (
          normalized.includes('insufficient_scope') ||
          normalized.includes('insufficient scope')
        ) {
          logger.info(
            `${this.logPrefix} OAuth server reported insufficient scope; skipping silent refresh`,
          );
          return false;
        }
      }
    }

    return true;
  }

  private getOAuthReplayExpiresAt(createdAt?: number): number | undefined {
    if (!createdAt) {
      return undefined;
    }

    const expiresAt = createdAt + PENDING_STALE_MS;
    return expiresAt > Date.now() ? expiresAt : undefined;
  }

  /** Sets up OAuth event handlers for the connection */
  protected handleOAuthEvents(
    connection: MCPConnection,
    eventName: 'oauthRequired' | 'oauthReauthenticationRequired' = 'oauthRequired',
  ): () => void {
    const oauthHandler = async (data: OAuthRequiredEvent) => {
      logger.info(`${this.logPrefix} oauthRequired event received`);

      if (!data.skipSilentRefresh && this.shouldAttemptSilentTokenRefresh(data)) {
        const refreshedTokens = await this.attemptSilentTokenRefresh();
        if (refreshedTokens) {
          connection.setOAuthTokens(refreshedTokens);
          connection.emit('oauthHandled');
          return;
        }
      }

      // Silent refresh failed and we're about to fall through to interactive
      // OAuth. Invalidate any COMPLETED `mcp_oauth` flow first so
      // `handleOAuthRequired`'s recent-completion fast path can't re-serve the
      // tokens the resource server just rejected (see the `PENDING_STALE_MS`
      // window in `handleOAuthRequired`).
      await this.invalidateCompletedOAuthFlow();

      if (this.connectionReady) {
        const emitted = connection.emit('oauthReauthenticationRequired', {
          ...data,
          skipSilentRefresh: true,
        });
        if (emitted) {
          return;
        }
        logger.info(
          `${this.logPrefix} Silent refresh did not recover cached connection; requiring fresh OAuth prompt`,
        );
        connection.emit('oauthFailed', new Error('OAuth reauthentication required'));
        return;
      }

      if (this.returnOnOAuth) {
        try {
          const config = this.serverConfig;
          const flowId = this.getBaseFlowId();
          const existingFlow = await this.flowManager!.getFlowState(flowId, 'mcp_oauth');

          if (existingFlow?.status === 'PENDING') {
            const pendingAge = existingFlow.createdAt
              ? Date.now() - existingFlow.createdAt
              : Infinity;

            if (pendingAge < PENDING_STALE_MS) {
              logger.debug(
                `${this.logPrefix} Recent PENDING OAuth flow exists (${Math.round(pendingAge / 1000)}s old), skipping new initiation`,
              );
              const flowMeta = existingFlow.metadata as MCPOAuthFlowMetadata | undefined;
              const storedAuthUrl = flowMeta?.authorizationUrl;
              if (storedAuthUrl && typeof this.oauthStart === 'function') {
                const expiresAt = this.getOAuthReplayExpiresAt(existingFlow.createdAt);
                if (!expiresAt) {
                  logger.debug(`${this.logPrefix} PENDING OAuth flow expired before replay`);
                  connection.emit(
                    'oauthFailed',
                    new Error('Pending OAuth flow expired before replay'),
                  );
                  return;
                }
                logger.info(
                  `${this.logPrefix} Re-issuing stored authorization URL while reusing PENDING flow`,
                );
                await this.oauthStart(storedAuthUrl, { expiresAt });
              }
              connection.emit('oauthFailed', new Error('Pending OAuth flow reused - return early'));
              return;
            }

            logger.debug(
              `${this.logPrefix} Found stale PENDING OAuth flow (${Math.round(pendingAge / 1000)}s old), will replace`,
            );
          }

          const {
            authorizationUrl,
            flowId: newFlowId,
            flowMetadata,
          } = await this.runWithCapturedTenant(() =>
            MCPOAuthHandler.initiateOAuthFlow(
              this.serverName,
              data.serverUrl || '',
              this.userId!,
              config?.oauth_headers ?? {},
              config?.oauth,
              this.allowedDomains,
              // Only reuse stored client when deleteTokens is available for stale-client cleanup
              this.tokenMethods?.deleteTokens ? this.tokenMethods.findToken : undefined,
              this.allowedAddresses,
              this.tenantId,
            ),
          );

          if (existingFlow) {
            const oldMeta = existingFlow.metadata as MCPOAuthFlowMetadata | undefined;
            const oldState = oldMeta?.state;
            await this.flowManager!.deleteFlow(flowId, 'mcp_oauth');
            if (oldState) {
              await MCPOAuthHandler.deleteStateMapping(oldState, this.flowManager!);
            }
          }

          // Store flow state BEFORE redirecting so the callback can find it
          const metadataWithUrl = { ...flowMetadata, authorizationUrl, tenantId: this.tenantId };
          await this.flowManager!.initFlow(newFlowId, 'mcp_oauth', metadataWithUrl);
          await MCPOAuthHandler.storeStateMapping(flowMetadata.state, newFlowId, this.flowManager!);

          // Start monitoring in background — createFlow will find the existing PENDING state
          // written by initFlow above, so metadata arg is unused (pass {} to make that explicit)
          this.flowManager!.createFlow(newFlowId, 'mcp_oauth', {}, this.signal).catch(
            async (error) => {
              logger.debug(`${this.logPrefix} OAuth flow monitor ended`, error);
              await this.clearStaleClientIfRejected(flowMetadata.reusedStoredClient, error);
            },
          );

          if (this.oauthStart) {
            logger.info(`${this.logPrefix} OAuth flow started, issuing authorization URL`);
            await this.oauthStart(authorizationUrl);
          }

          connection.emit('oauthFailed', new Error('OAuth flow initiated - return early'));
          return;
        } catch (error) {
          logger.error(`${this.logPrefix} Failed to initiate OAuth flow`, error);
          connection.emit('oauthFailed', new Error('OAuth initiation failed'));
          return;
        }
      }

      // Normal OAuth handling - wait for completion
      const result = await this.handleOAuthRequired();

      if (result?.tokens && this.tokenMethods?.createToken) {
        const { tokens } = result;
        try {
          connection.setOAuthTokens(tokens);
          await this.runWithCapturedTenant(() =>
            MCPTokenStorage.storeTokens({
              userId: this.userId!,
              serverName: this.serverName,
              tokens,
              createToken: this.tokenMethods!.createToken,
              updateToken: this.tokenMethods!.updateToken,
              findToken: this.tokenMethods!.findToken,
              clientInfo: result.clientInfo,
              metadata: MCPOAuthHandler.buildStoredClientMetadata(
                result.metadata,
                result.resourceMetadata,
              ),
            }),
          );
          // Same rationale as the silent-refresh success path: invalidate the
          // `mcp_get_tokens` cache so the next `getOAuthTokens` reads the
          // freshly stored tokens rather than the just-rejected ones the
          // interactive flow replaced.
          await this.invalidateGetTokensFlow(tokens);
          logger.info(`${this.logPrefix} OAuth tokens saved to storage`);
        } catch (error) {
          logger.error(`${this.logPrefix} Failed to save OAuth tokens to storage`, error);
        }
      }

      // Only emit oauthHandled if we actually got tokens (OAuth succeeded)
      if (result?.tokens) {
        connection.emit('oauthHandled');
      } else {
        await this.clearStaleClientIfRejected(result?.reusedStoredClient, result?.error);
        logger.warn(`${this.logPrefix} OAuth failed, emitting oauthFailed event`);
        connection.emit('oauthFailed', new Error('OAuth authentication failed'));
      }
    };

    connection.on(eventName, oauthHandler);

    return () => {
      connection.removeListener(eventName, oauthHandler);
    };
  }

  /** Attempts to establish connection with timeout handling */
  protected async attemptToConnect(connection: MCPConnection): Promise<void> {
    const baseTimeout = this.connectionTimeout ?? this.serverConfig.initTimeout ?? 30000;
    // OAuth servers may pause mid-connect to wait for the user to authorize in the browser.
    // The transport connect itself is still bounded by initTimeout inside connection.connect(),
    // so this floor only extends the window for an active OAuth wait, not ordinary failures.
    // The grace covers the reconnect after `oauthHandled` (retry backoff + transport connect),
    // which happens *after* the handling wait, so a user who authorizes near the deadline still
    // gets a connection instead of a timeout.
    const oauthHandlingTimeout = Number.isFinite(mcpConfig.OAUTH_HANDLING_TIMEOUT)
      ? mcpConfig.OAUTH_HANDLING_TIMEOUT
      : 10 * 60 * 1000;
    const connectTimeout = this.useOAuth
      ? Math.max(baseTimeout, oauthHandlingTimeout + 60000)
      : baseTimeout;
    const retryController = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        retryController.abort();
        reject(new Error(`Connection timeout after ${connectTimeout}ms`));
      }, connectTimeout);
    });

    try {
      await Promise.race([this.connectTo(connection, retryController.signal), timeout]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      retryController.abort();
    }

    if (await connection.isConnected()) return;
    logger.error(`${this.logPrefix} Failed to establish connection.`);
  }

  private waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Connection retry cancelled'));
        return;
      }

      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(new Error('Connection retry cancelled'));
      };
      const timeoutId = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, delayMs);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async connectTo(connection: MCPConnection, signal: AbortSignal): Promise<void> {
    const maxAttempts = 3;
    let attempts = 0;

    while (attempts < maxAttempts) {
      if (signal.aborted) {
        throw new Error('Connection retry cancelled');
      }
      try {
        await connection.connect();
        if (await connection.isConnected()) {
          return;
        }
        throw new Error('Connection attempt succeeded but status is not connected');
      } catch (error) {
        attempts++;

        if (signal.aborted) {
          throw error;
        }

        if (this.useOAuth && this.isOAuthError(error)) {
          logger.info(`${this.logPrefix} OAuth required, stopping connection attempts`);
          throw error;
        }

        if (attempts === maxAttempts) {
          logger.error(`${this.logPrefix} Failed to connect after ${maxAttempts} attempts`, error);
          throw error;
        }
        await this.waitForRetry(2000 * attempts, signal);
      }
    }
  }

  /** Clears stored client registration if the error indicates client rejection */
  private async clearStaleClientIfRejected(
    reusedStoredClient: boolean | undefined,
    error: unknown,
  ): Promise<void> {
    if (!reusedStoredClient || !this.tokenMethods?.deleteTokens) {
      return;
    }
    if (!MCPConnectionFactory.isClientRejection(error)) {
      return;
    }
    await this.runWithCapturedTenant(() =>
      MCPTokenStorage.deleteClientRegistration({
        userId: this.userId!,
        serverName: this.serverName,
        deleteTokens: this.tokenMethods!.deleteTokens,
      }),
    ).catch((err) => {
      logger.warn(`${this.logPrefix} Failed to clear stale client registration`, err);
    });
  }

  /**
   * Checks whether an error indicates the OAuth client registration was rejected.
   * Includes RFC 6749 §5.2 standard codes (`invalid_client`, `unauthorized_client`)
   * and known vendor-specific patterns (Okta: `client_id mismatch`, Auth0: `client not found`,
   * generic: `unknown client`).
   */
  static isClientRejection(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    if ('message' in error && typeof error.message === 'string') {
      return isClientRejectionMessage(error.message);
    }
    return false;
  }

  // Determines if an error indicates OAuth authentication is required
  private isOAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    // Check for error code
    if ('code' in error) {
      const code = (error as { code?: number }).code;
      if (code === 401 || code === 403) {
        return true;
      }
    }

    // Check message for various auth error indicators
    if ('message' in error && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
      // Check for 401 status
      if (message.includes('401') || message.includes('non-200 status code (401)')) {
        return true;
      }
      // Check for invalid_token (OAuth servers return this for expired/revoked tokens)
      if (message.includes('invalid_token')) {
        return true;
      }
      // Check for invalid_grant (OAuth servers return this for expired/revoked grants)
      if (message.includes('invalid_grant')) {
        return true;
      }
      // Check for authentication required
      if (message.includes('authentication required') || message.includes('unauthorized')) {
        return true;
      }
      // Check for missing authorization values (e.g., Amazon Ads MCP returns HTTP 400 with this)
      if (message.includes('no authorization')) {
        return true;
      }
    }

    return false;
  }

  /** Manages OAuth flow initiation and completion */
  protected async handleOAuthRequired(): Promise<{
    tokens: MCPOAuthTokens | null;
    clientInfo?: OAuthClientInformation;
    metadata?: OAuthMetadata;
    resourceMetadata?: OAuthProtectedResourceMetadata;
    reusedStoredClient?: boolean;
    error?: unknown;
  } | null> {
    const serverUrl = (this.serverConfig as t.SSEOptions | t.StreamableHTTPOptions).url;
    logger.debug(
      `${this.logPrefix} \`handleOAuthRequired\` called with serverUrl: ${serverUrl ? sanitizeUrlForLogging(serverUrl) : 'undefined'}`,
    );

    if (!this.flowManager || !serverUrl) {
      logger.error(
        `${this.logPrefix} OAuth required but flow manager not available or server URL missing for ${this.serverName}`,
      );
      logger.warn(`${this.logPrefix} Please configure OAuth credentials for ${this.serverName}`);
      return null;
    }

    let reusedStoredClient = false;

    try {
      logger.debug(`${this.logPrefix} Checking for existing OAuth flow for ${this.serverName}...`);

      /** Flow ID to check if a flow already exists */
      const flowId = this.getBaseFlowId();

      /** Check if there's already an ongoing OAuth flow for this flowId */
      const existingFlow = await this.flowManager.getFlowState(flowId, 'mcp_oauth');

      if (existingFlow) {
        const flowMeta = existingFlow.metadata as MCPOAuthFlowMetadata | undefined;

        if (existingFlow.status === 'PENDING') {
          const pendingAge = existingFlow.createdAt
            ? Date.now() - existingFlow.createdAt
            : Infinity;

          if (pendingAge < PENDING_STALE_MS) {
            logger.debug(
              `${this.logPrefix} Found recent PENDING OAuth flow (${Math.round(pendingAge / 1000)}s old), joining instead of creating new one`,
            );

            const storedAuthUrl = flowMeta?.authorizationUrl;
            if (storedAuthUrl && typeof this.oauthStart === 'function') {
              const expiresAt = this.getOAuthReplayExpiresAt(existingFlow.createdAt);
              if (!expiresAt) {
                throw new Error('Pending OAuth flow expired before replay');
              }
              logger.info(
                `${this.logPrefix} Re-issuing stored authorization URL to caller while joining PENDING flow`,
              );
              await this.oauthStart(storedAuthUrl, { expiresAt });
            }

            reusedStoredClient = flowMeta?.reusedStoredClient === true;
            const tokens = await this.flowManager.createFlow(flowId, 'mcp_oauth', {}, this.signal);
            if (typeof this.oauthEnd === 'function') {
              await this.oauthEnd();
            }
            logger.info(
              `${this.logPrefix} Joined existing OAuth flow completed for ${this.serverName}`,
            );
            return {
              tokens,
              clientInfo: flowMeta?.clientInfo,
              metadata: flowMeta?.metadata,
              resourceMetadata: flowMeta?.resourceMetadata,
              reusedStoredClient,
            };
          }

          logger.debug(
            `${this.logPrefix} Found stale PENDING OAuth flow (${Math.round(pendingAge / 1000)}s old), will delete and start fresh`,
          );
        }

        if (existingFlow.status === 'COMPLETED') {
          const completedAge = existingFlow.completedAt
            ? Date.now() - existingFlow.completedAt
            : Infinity;
          const cachedTokens = existingFlow.result as MCPOAuthTokens | null | undefined;
          const isTokenExpired =
            cachedTokens?.expires_at != null &&
            normalizeExpiresAt(cachedTokens.expires_at) < Date.now();

          if (completedAge <= PENDING_STALE_MS && cachedTokens !== undefined && !isTokenExpired) {
            logger.debug(
              `${this.logPrefix} Found non-stale COMPLETED OAuth flow, reusing cached tokens`,
            );
            return {
              tokens: cachedTokens,
              clientInfo: flowMeta?.clientInfo,
              metadata: flowMeta?.metadata,
              resourceMetadata: flowMeta?.resourceMetadata,
            };
          }
        }

        logger.debug(
          `${this.logPrefix} Found existing OAuth flow (status: ${existingFlow.status}), cleaning up to start fresh`,
        );
        try {
          const oldState = flowMeta?.state;
          await this.flowManager.deleteFlow(flowId, 'mcp_oauth');
          if (oldState) {
            await MCPOAuthHandler.deleteStateMapping(oldState, this.flowManager);
          }
        } catch (error) {
          logger.warn(`${this.logPrefix} Failed to clean up existing OAuth flow`, error);
        }
      }

      logger.debug(`${this.logPrefix} Initiating new OAuth flow for ${this.serverName}...`);
      const {
        authorizationUrl,
        flowId: newFlowId,
        flowMetadata,
      } = await this.runWithCapturedTenant(() =>
        MCPOAuthHandler.initiateOAuthFlow(
          this.serverName,
          serverUrl,
          this.userId!,
          this.serverConfig.oauth_headers ?? {},
          this.serverConfig.oauth,
          this.allowedDomains,
          this.tokenMethods?.deleteTokens ? this.tokenMethods.findToken : undefined,
          this.allowedAddresses,
          this.tenantId,
        ),
      );

      reusedStoredClient = flowMetadata.reusedStoredClient === true;

      // Store flow state BEFORE redirecting so the callback can find it
      const metadataWithUrl = { ...flowMetadata, authorizationUrl, tenantId: this.tenantId };
      await this.flowManager.initFlow(newFlowId, 'mcp_oauth', metadataWithUrl);
      await MCPOAuthHandler.storeStateMapping(flowMetadata.state, newFlowId, this.flowManager);

      if (typeof this.oauthStart === 'function') {
        logger.info(`${this.logPrefix} OAuth flow started, issued authorization URL to user`);
        await this.oauthStart(authorizationUrl);
      } else {
        logger.info(
          `${this.logPrefix} OAuth flow started, no \`oauthStart\` handler defined, relying on callback endpoint`,
        );
      }

      // createFlow will find the existing PENDING state written by initFlow above,
      // so metadata arg is unused (pass {} to make that explicit)
      const tokens = await this.flowManager.createFlow(newFlowId, 'mcp_oauth', {}, this.signal);
      if (typeof this.oauthEnd === 'function') {
        await this.oauthEnd();
      }
      logger.info(`${this.logPrefix} OAuth flow completed, tokens received for ${this.serverName}`);

      return {
        tokens,
        clientInfo: flowMetadata.clientInfo,
        metadata: flowMetadata.metadata,
        resourceMetadata: flowMetadata.resourceMetadata,
        reusedStoredClient,
      };
    } catch (error) {
      logger.error(`${this.logPrefix} Failed to complete OAuth flow for ${this.serverName}`, error);
      return { tokens: null, reusedStoredClient, error };
    }
  }
}
