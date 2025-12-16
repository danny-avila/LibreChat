import { logger } from '@librechat/data-schemas';
import type { OAuthClientInformation } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { TokenMethods } from '@librechat/data-schemas';
import type { MCPOAuthTokens, MCPOAuthFlowMetadata, OAuthMetadata } from '~/mcp/oauth';
import type { FlowStateManager } from '~/flow/manager';
import type { FlowMetadata } from '~/flow/types';
import type * as t from './types';
import { MCPTokenStorage, MCPOAuthHandler } from '~/mcp/oauth';
import { sanitizeUrlForLogging } from './utils';
import { withTimeout } from '~/utils/promise';
import { MCPConnection } from './connection';
import { processMCPEnv } from '~/utils';

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

  protected constructor(basic: t.BasicConnectionOptions, oauth?: t.OAuthConnectionOptions) {
    this.serverConfig = processMCPEnv({
      options: basic.serverConfig,
      user: oauth?.user,
      customUserVars: oauth?.customUserVars,
      body: oauth?.requestBody,
    });
    this.serverName = basic.serverName;
    this.useOAuth = !!oauth?.useOAuth;
    this.connectionTimeout = oauth?.connectionTimeout;
    this.logPrefix = oauth?.user
      ? `[MCP][${basic.serverName}][${oauth.user.id}]`
      : `[MCP][${basic.serverName}]`;

    if (oauth?.useOAuth) {
      this.userId = oauth.user.id;
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

      // If we just want to initiate OAuth and return, handle it differently
      if (this.returnOnOAuth) {
        try {
          const config = this.serverConfig;
          const { authorizationUrl, flowId, flowMetadata } =
            await MCPOAuthHandler.initiateOAuthFlow(
              this.serverName,
              data.serverUrl || '',
              this.userId!,
              config?.oauth_headers ?? {},
              config?.oauth,
            );

          // Create the flow state so the OAuth callback can find it
          // We spawn this in the background without waiting for it
          this.flowManager!.createFlow(flowId, 'mcp_oauth', flowMetadata).catch(() => {
            // The OAuth callback will resolve this flow, so we expect it to timeout here
            // which is fine - we just need the flow state to exist
          });

          if (this.oauthStart) {
            logger.info(`${this.logPrefix} OAuth flow started, issuing authorization URL`);
            await this.oauthStart(authorizationUrl);
          }

          // Emit oauthFailed to signal that connection should not proceed
          // but OAuth was successfully initiated
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

  // Handles connection attempts with retry logic and OAuth error handling
  private async connectTo(connection: MCPConnection): Promise<void> {
    const maxAttempts = 3;
    let attempts = 0;
    let oauthHandled = false;

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
          // Only handle OAuth if this is a user connection (has oauthStart handler)
          if (this.oauthStart && !oauthHandled) {
            const errorWithFlag = error as (Error & { isOAuthError?: boolean }) | undefined;
            if (errorWithFlag?.isOAuthError) {
              oauthHandled = true;
              logger.info(`${this.logPrefix} Handling OAuth`);
              await this.handleOAuthRequired();
            }
          }
          // Don't retry on OAuth errors - just throw
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

    // Check for SSE error with 401 status
    if ('message' in error && typeof error.message === 'string') {
      return error.message.includes('401') || error.message.includes('Non-200 status code (401)');
    }

    // Check for error code
    if ('code' in error) {
      const code = (error as { code?: number }).code;
      return code === 401 || code === 403;
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

      if (existingFlow && existingFlow.status === 'PENDING') {
        logger.debug(
          `${this.logPrefix} OAuth flow already exists for ${flowId}, waiting for completion`,
        );
        /** Tokens from existing flow to complete */
        const tokens = await this.flowManager.createFlow(flowId, 'mcp_oauth');
        if (typeof this.oauthEnd === 'function') {
          await this.oauthEnd();
        }
        logger.info(
          `${this.logPrefix} OAuth flow completed, tokens received for ${this.serverName}`,
        );

        /** Client information from the existing flow metadata */
        const existingMetadata = existingFlow.metadata as unknown as MCPOAuthFlowMetadata;
        const clientInfo = existingMetadata?.clientInfo;

        return { tokens, clientInfo };
      }

      // Clean up old completed/failed flows, but only if they're actually stale
      // This prevents race conditions where we delete a flow that's still being processed
      if (existingFlow && existingFlow.status !== 'PENDING') {
        const STALE_FLOW_THRESHOLD = 2 * 60 * 1000; // 2 minutes
        const { isStale, age, status } = await this.flowManager.isFlowStale(
          flowId,
          'mcp_oauth',
          STALE_FLOW_THRESHOLD,
        );

        if (isStale) {
          try {
            await this.flowManager.deleteFlow(flowId, 'mcp_oauth');
            logger.debug(
              `${this.logPrefix} Cleared stale ${status} OAuth flow (age: ${Math.round(age / 1000)}s)`,
            );
          } catch (error) {
            logger.warn(`${this.logPrefix} Failed to clear stale OAuth flow`, error);
          }
        } else {
          logger.debug(
            `${this.logPrefix} Skipping cleanup of recent ${status} flow (age: ${Math.round(age / 1000)}s, threshold: ${STALE_FLOW_THRESHOLD / 1000}s)`,
          );
          // If flow is recent but not pending, something might be wrong
          if (status === 'FAILED') {
            logger.warn(
              `${this.logPrefix} Recent OAuth flow failed, will retry after ${Math.round((STALE_FLOW_THRESHOLD - age) / 1000)}s`,
            );
          }
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
