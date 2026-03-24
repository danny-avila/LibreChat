import { logger } from '@librechat/data-schemas';
import type { OAuthClientInformation } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TokenMethods } from '@librechat/data-schemas';
import type { MCPOAuthTokens, OAuthMetadata, MCPOAuthFlowMetadata } from '~/mcp/oauth';
import type { FlowStateManager } from '~/flow/manager';
import type * as t from './types';
import { MCPTokenStorage, MCPOAuthHandler, ReauthenticationRequiredError } from '~/mcp/oauth';
import { PENDING_STALE_MS, normalizeExpiresAt } from '~/flow/manager';
import { sanitizeUrlForLogging } from './utils';
import { withTimeout } from '~/utils/promise';
import { MCPConnection } from './connection';
import { processMCPEnv } from '~/utils';

export interface ToolDiscoveryResult {
  tools: Tool[] | null;
  connection: MCPConnection | null;
  oauthRequired: boolean;
  oauthUrl: string | null;
}

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

  // OAuth-related properties (only set when useOAuth is true)
  protected readonly userId?: string;
  protected readonly flowManager?: FlowStateManager<MCPOAuthTokens | null>;
  protected readonly tokenMethods?: TokenMethods;
  protected readonly signal?: AbortSignal;
  protected readonly oauthStart?: (authURL: string) => Promise<void>;
  protected readonly oauthEnd?: () => Promise<void>;
  protected readonly returnOnOAuth?: boolean;
  protected readonly connectionTimeout?: number;

  /** Creates a new MCP connection with optional OAuth support */
  static async create(
    basic: t.BasicConnectionOptions,
    oauth?: t.OAuthConnectionOptions,
  ): Promise<MCPConnection> {
    const factory = new this(basic, oauth);
    return factory.createConnection();
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
    if (options != null && 'useOAuth' in options) {
      const factory = new this(basic, { ...options, returnOnOAuth: true });
      return factory.discoverToolsInternal();
    }
    const factory = new this(basic, options);
    return factory.discoverToolsInternal();
  }

  protected async discoverToolsInternal(): Promise<ToolDiscoveryResult> {
    const oauthUrl: string | null = null;
    let oauthRequired = false;

    const oauthTokens = this.useOAuth ? await this.getOAuthTokens() : null;
    const connection = new MCPConnection({
      serverName: this.serverName,
      serverConfig: this.serverConfig,
      userId: this.userId,
      oauthTokens,
      useSSRFProtection: this.useSSRFProtection,
    });

    const oauthHandler = async () => {
      logger.info(
        `${this.logPrefix} [Discovery] OAuth required; skipping URL generation in discovery mode`,
      );
      oauthRequired = true;
      connection.emit('oauthFailed', new Error('OAuth required during tool discovery'));
    };

    if (this.useOAuth) {
      connection.on('oauthRequired', oauthHandler);
    }

    try {
      const connectTimeout = this.connectionTimeout ?? this.serverConfig.initTimeout ?? 30000;
      await withTimeout(
        connection.connect(),
        connectTimeout,
        `Connection timeout after ${connectTimeout}ms`,
      );

      if (await connection.isConnected()) {
        const tools = await connection.fetchTools();
        if (this.useOAuth) {
          connection.removeListener('oauthRequired', oauthHandler);
        }
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
      if (this.useOAuth) {
        connection.removeListener('oauthRequired', oauthHandler);
      }
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

    if (this.useOAuth) {
      connection.removeListener('oauthRequired', oauthHandler);
    }

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
    this.serverConfig = processMCPEnv({
      user: options?.user,
      body: options?.requestBody,
      dbSourced: basic.dbSourced,
      options: basic.serverConfig,
      customUserVars: options?.customUserVars,
    });
    this.serverName = basic.serverName;
    this.useSSRFProtection = basic.useSSRFProtection === true;
    this.allowedDomains = basic.allowedDomains;
    this.connectionTimeout = options?.connectionTimeout;
    this.logPrefix = options?.user
      ? `[MCP][${basic.serverName}][${options.user.id}]`
      : `[MCP][${basic.serverName}]`;

    if (options != null && 'useOAuth' in options) {
      this.useOAuth = true;
      this.userId = options.user?.id;
      this.flowManager = options.flowManager;
      this.tokenMethods = options.tokenMethods;
      this.signal = options.signal;
      this.oauthStart = options.oauthStart;
      this.oauthEnd = options.oauthEnd;
      this.returnOnOAuth = options.returnOnOAuth;
    } else {
      this.useOAuth = false;
    }
  }

  /** Creates the base MCP connection with OAuth tokens */
  protected async createConnection(): Promise<MCPConnection> {
    const oauthTokens = this.useOAuth ? await this.getOAuthTokens() : null;
    const connection = new MCPConnection({
      serverName: this.serverName,
      serverConfig: this.serverConfig,
      userId: this.userId,
      oauthTokens,
      useSSRFProtection: this.useSSRFProtection,
    });

    let cleanupOAuthHandlers: (() => void) | null = null;
    if (this.useOAuth) {
      cleanupOAuthHandlers = this.handleOAuthEvents(connection);
    }

    try {
      await this.attemptToConnect(connection);
      if (cleanupOAuthHandlers) {
        cleanupOAuthHandlers();
      }
      return connection;
    } catch (error) {
      if (cleanupOAuthHandlers) {
        cleanupOAuthHandlers();
      }
      throw error;
    }
  }

  /** Retrieves existing OAuth tokens from storage or returns null */
  protected async getOAuthTokens(): Promise<MCPOAuthTokens | null> {
    if (!this.tokenMethods?.findToken) return null;

    try {
      const flowId = MCPOAuthHandler.generateFlowId(this.userId!, this.serverName);
      const tokens = await this.flowManager!.createFlowWithHandler(
        flowId,
        'mcp_get_tokens',
        async () => {
          return await MCPTokenStorage.getTokens({
            userId: this.userId!,
            serverName: this.serverName,
            findToken: this.tokenMethods!.findToken!,
            createToken: this.tokenMethods!.createToken,
            updateToken: this.tokenMethods!.updateToken,
            refreshTokens: this.createRefreshTokensFunction(),
          });
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
    },
  ) => Promise<MCPOAuthTokens> {
    return async (refreshToken, metadata) => {
      return await MCPOAuthHandler.refreshOAuthTokens(
        refreshToken,
        {
          serverUrl: (this.serverConfig as t.SSEOptions | t.StreamableHTTPOptions).url,
          serverName: metadata.serverName,
          clientInfo: metadata.clientInfo,
          storedTokenEndpoint: metadata.storedTokenEndpoint,
          storedAuthMethods: metadata.storedAuthMethods,
        },
        this.serverConfig.oauth_headers ?? {},
        this.serverConfig.oauth,
        this.allowedDomains,
      );
    };
  }

  /** Sets up OAuth event handlers for the connection */
  protected handleOAuthEvents(connection: MCPConnection): () => void {
    const oauthHandler = async (data: { serverUrl?: string }) => {
      logger.info(`${this.logPrefix} oauthRequired event received`);

      if (this.returnOnOAuth) {
        try {
          const config = this.serverConfig;
          const flowId = MCPOAuthHandler.generateFlowId(this.userId!, this.serverName);
          const existingFlow = await this.flowManager!.getFlowState(flowId, 'mcp_oauth');

          if (existingFlow?.status === 'PENDING') {
            const pendingAge = existingFlow.createdAt
              ? Date.now() - existingFlow.createdAt
              : Infinity;

            if (pendingAge < PENDING_STALE_MS) {
              logger.debug(
                `${this.logPrefix} Recent PENDING OAuth flow exists (${Math.round(pendingAge / 1000)}s old), skipping new initiation`,
              );
              connection.emit('oauthFailed', new Error('OAuth flow initiated - return early'));
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
          } = await MCPOAuthHandler.initiateOAuthFlow(
            this.serverName,
            data.serverUrl || '',
            this.userId!,
            config?.oauth_headers ?? {},
            config?.oauth,
            this.allowedDomains,
          );

          if (existingFlow) {
            const oldState = (existingFlow.metadata as MCPOAuthFlowMetadata)?.state;
            await this.flowManager!.deleteFlow(newFlowId, 'mcp_oauth');
            if (oldState) {
              await MCPOAuthHandler.deleteStateMapping(oldState, this.flowManager!);
            }
          }

          // Store flow state BEFORE redirecting so the callback can find it
          const metadataWithUrl = { ...flowMetadata, authorizationUrl };
          await this.flowManager!.initFlow(newFlowId, 'mcp_oauth', metadataWithUrl);
          await MCPOAuthHandler.storeStateMapping(flowMetadata.state, newFlowId, this.flowManager!);

          // Start monitoring in background — createFlow will find the existing PENDING state
          // written by initFlow above, so metadata arg is unused (pass {} to make that explicit)
          this.flowManager!.createFlow(newFlowId, 'mcp_oauth', {}, this.signal).catch((error) => {
            logger.debug(`${this.logPrefix} OAuth flow monitor ended`, error);
          });

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
        try {
          connection.setOAuthTokens(result.tokens);
          await MCPTokenStorage.storeTokens({
            userId: this.userId!,
            serverName: this.serverName,
            tokens: result.tokens,
            createToken: this.tokenMethods.createToken,
            updateToken: this.tokenMethods.updateToken,
            findToken: this.tokenMethods.findToken,
            clientInfo: result.clientInfo,
            metadata: result.metadata,
          });
          logger.info(`${this.logPrefix} OAuth tokens saved to storage`);
        } catch (error) {
          logger.error(`${this.logPrefix} Failed to save OAuth tokens to storage`, error);
        }
      }

      // Only emit oauthHandled if we actually got tokens (OAuth succeeded)
      if (result?.tokens) {
        connection.emit('oauthHandled');
      } else {
        // OAuth failed, emit oauthFailed to properly reject the promise
        logger.warn(`${this.logPrefix} OAuth failed, emitting oauthFailed event`);
        connection.emit('oauthFailed', new Error('OAuth authentication failed'));
      }
    };

    connection.on('oauthRequired', oauthHandler);

    return () => {
      connection.removeListener('oauthRequired', oauthHandler);
    };
  }

  /** Attempts to establish connection with timeout handling */
  protected async attemptToConnect(connection: MCPConnection): Promise<void> {
    const connectTimeout = this.connectionTimeout ?? this.serverConfig.initTimeout ?? 30000;
    await withTimeout(
      this.connectTo(connection),
      connectTimeout,
      `Connection timeout after ${connectTimeout}ms`,
    );

    if (await connection.isConnected()) return;
    logger.error(`${this.logPrefix} Failed to establish connection.`);
  }

  private async connectTo(connection: MCPConnection): Promise<void> {
    const maxAttempts = 3;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        await connection.connect();
        if (await connection.isConnected()) {
          return;
        }
        throw new Error('Connection attempt succeeded but status is not connected');
      } catch (error) {
        attempts++;

        if (this.useOAuth && this.isOAuthError(error)) {
          logger.info(`${this.logPrefix} OAuth required, stopping connection attempts`);
          throw error;
        }

        if (attempts === maxAttempts) {
          logger.error(`${this.logPrefix} Failed to connect after ${maxAttempts} attempts`, error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
      }
    }
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
      // Check for authentication required
      if (message.includes('authentication required') || message.includes('unauthorized')) {
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

    try {
      logger.debug(`${this.logPrefix} Checking for existing OAuth flow for ${this.serverName}...`);

      /** Flow ID to check if a flow already exists */
      const flowId = MCPOAuthHandler.generateFlowId(this.userId!, this.serverName);

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
              logger.info(
                `${this.logPrefix} Re-issuing stored authorization URL to caller while joining PENDING flow`,
              );
              await this.oauthStart(storedAuthUrl);
            }

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
      } = await MCPOAuthHandler.initiateOAuthFlow(
        this.serverName,
        serverUrl,
        this.userId!,
        this.serverConfig.oauth_headers ?? {},
        this.serverConfig.oauth,
        this.allowedDomains,
      );

      // Store flow state BEFORE redirecting so the callback can find it
      const metadataWithUrl = { ...flowMetadata, authorizationUrl };
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

      /** Client information from the flow metadata */
      const clientInfo = flowMetadata?.clientInfo;
      const metadata = flowMetadata?.metadata;

      return {
        tokens,
        clientInfo,
        metadata,
      };
    } catch (error) {
      logger.error(`${this.logPrefix} Failed to complete OAuth flow for ${this.serverName}`, error);
      return null;
    }
  }
}
