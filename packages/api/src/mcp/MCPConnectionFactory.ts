import { logger } from '@librechat/data-schemas';
import type { OAuthClientInformation } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TokenMethods } from '@librechat/data-schemas';
import type { MCPOAuthTokens, OAuthMetadata } from '~/mcp/oauth';
import type { FlowStateManager } from '~/flow/manager';
import type { FlowMetadata } from '~/flow/types';
import type * as t from './types';
import { MCPTokenStorage, MCPOAuthHandler } from '~/mcp/oauth';
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
    oauth?: Omit<t.OAuthConnectionOptions, 'returnOnOAuth'>,
  ): Promise<ToolDiscoveryResult> {
    const factory = new this(basic, oauth ? { ...oauth, returnOnOAuth: true } : undefined);
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
    } catch (listError) {
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

  protected constructor(basic: t.BasicConnectionOptions, oauth?: t.OAuthConnectionOptions) {
    this.serverConfig = processMCPEnv({
      options: basic.serverConfig,
      user: oauth?.user,
      customUserVars: oauth?.customUserVars,
      body: oauth?.requestBody,
    });
    this.serverName = basic.serverName;
    this.useOAuth = !!oauth?.useOAuth;
    this.useSSRFProtection = basic.useSSRFProtection === true;
    this.connectionTimeout = oauth?.connectionTimeout;
    this.logPrefix = oauth?.user
      ? `[MCP][${basic.serverName}][${oauth.user.id}]`
      : `[MCP][${basic.serverName}]`;

    if (oauth?.useOAuth) {
      this.userId = oauth.user?.id;
      this.flowManager = oauth.flowManager;
      this.tokenMethods = oauth.tokenMethods;
      this.signal = oauth.signal;
      this.oauthStart = oauth.oauthStart;
      this.oauthEnd = oauth.oauthEnd;
      this.returnOnOAuth = oauth.returnOnOAuth;
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
    },
  ) => Promise<MCPOAuthTokens> {
    return async (refreshToken, metadata) => {
      return await MCPOAuthHandler.refreshOAuthTokens(
        refreshToken,
        {
          serverUrl: (this.serverConfig as t.SSEOptions | t.StreamableHTTPOptions).url,
          serverName: metadata.serverName,
          clientInfo: metadata.clientInfo,
        },
        this.serverConfig.oauth_headers ?? {},
        this.serverConfig.oauth,
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
            logger.debug(
              `${this.logPrefix} PENDING OAuth flow already exists, skipping new initiation`,
            );
            connection.emit('oauthFailed', new Error('OAuth flow initiated - return early'));
            return;
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
          );

          if (existingFlow) {
            await this.flowManager!.deleteFlow(newFlowId, 'mcp_oauth');
          }

          this.flowManager!.createFlow(newFlowId, 'mcp_oauth', flowMetadata, this.signal).catch(
            () => {},
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
        logger.debug(
          `${this.logPrefix} Found existing OAuth flow (status: ${existingFlow.status}), cleaning up to start fresh`,
        );
        try {
          await this.flowManager.deleteFlow(flowId, 'mcp_oauth');
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
      );

      if (typeof this.oauthStart === 'function') {
        logger.info(`${this.logPrefix} OAuth flow started, issued authorization URL to user`);
        await this.oauthStart(authorizationUrl);
      } else {
        logger.info(
          `${this.logPrefix} OAuth flow started, no \`oauthStart\` handler defined, relying on callback endpoint`,
        );
      }

      /** Tokens from the new flow */
      const tokens = await this.flowManager.createFlow(
        newFlowId,
        'mcp_oauth',
        flowMetadata as FlowMetadata,
        this.signal,
      );
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
