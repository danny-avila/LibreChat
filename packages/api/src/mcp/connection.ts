import { EventEmitter } from 'events';
import { logger } from '@librechat/data-schemas';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { ResourceListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { MCPOAuthTokens } from './oauth/types';
import type * as t from './types';

function isStdioOptions(options: t.MCPOptions): options is t.StdioOptions {
  return 'command' in options;
}

function isWebSocketOptions(options: t.MCPOptions): options is t.WebSocketOptions {
  if ('url' in options) {
    const protocol = new URL(options.url).protocol;
    return protocol === 'ws:' || protocol === 'wss:';
  }
  return false;
}

function isSSEOptions(options: t.MCPOptions): options is t.SSEOptions {
  if ('url' in options) {
    const protocol = new URL(options.url).protocol;
    return protocol !== 'ws:' && protocol !== 'wss:';
  }
  return false;
}

/**
 * Checks if the provided options are for a Streamable HTTP transport.
 *
 * Streamable HTTP is an MCP transport that uses HTTP POST for sending messages
 * and supports streaming responses. It provides better performance than
 * SSE transport while maintaining compatibility with most network environments.
 *
 * @param options MCP connection options to check
 * @returns True if options are for a streamable HTTP transport
 */
function isStreamableHTTPOptions(options: t.MCPOptions): options is t.StreamableHTTPOptions {
  if ('url' in options && options.type === 'streamable-http') {
    const protocol = new URL(options.url).protocol;
    return protocol !== 'ws:' && protocol !== 'wss:';
  }
  return false;
}

const FIVE_MINUTES = 5 * 60 * 1000;
export class MCPConnection extends EventEmitter {
  private static instance: MCPConnection | null = null;
  public client: Client;
  private transport: Transport | null = null; // Make this nullable
  private connectionState: t.ConnectionState = 'disconnected';
  private connectPromise: Promise<void> | null = null;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  public readonly serverName: string;
  private shouldStopReconnecting = false;
  private isReconnecting = false;
  private isInitializing = false;
  private reconnectAttempts = 0;
  private readonly userId?: string;
  private lastPingTime: number;
  private oauthTokens?: MCPOAuthTokens | null;
  private oauthRequired = false;
  iconPath?: string;
  timeout?: number;
  url?: string;

  constructor(
    serverName: string,
    private readonly options: t.MCPOptions,
    userId?: string,
    oauthTokens?: MCPOAuthTokens | null,
  ) {
    super();
    this.serverName = serverName;
    this.userId = userId;
    this.iconPath = options.iconPath;
    this.timeout = options.timeout;
    this.lastPingTime = Date.now();
    if (oauthTokens) {
      this.oauthTokens = oauthTokens;
    }
    this.client = new Client(
      {
        name: '@librechat/api-client',
        version: '1.2.3',
      },
      {
        capabilities: {},
      },
    );

    this.setupEventListeners();
  }

  /** Helper to generate consistent log prefixes */
  private getLogPrefix(): string {
    const userPart = this.userId ? `[User: ${this.userId}]` : '';
    return `[MCP]${userPart}[${this.serverName}]`;
  }

  public static getInstance(
    serverName: string,
    options: t.MCPOptions,
    userId?: string,
  ): MCPConnection {
    if (!MCPConnection.instance) {
      MCPConnection.instance = new MCPConnection(serverName, options, userId);
    }
    return MCPConnection.instance;
  }

  public static getExistingInstance(): MCPConnection | null {
    return MCPConnection.instance;
  }

  public static async destroyInstance(): Promise<void> {
    if (MCPConnection.instance) {
      await MCPConnection.instance.disconnect();
      MCPConnection.instance = null;
    }
  }

  private emitError(error: unknown, errorContext: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`${this.getLogPrefix()} ${errorContext}: ${errorMessage}`);
  }

  private constructTransport(options: t.MCPOptions): Transport {
    try {
      let type: t.MCPOptions['type'];
      if (isStdioOptions(options)) {
        type = 'stdio';
      } else if (isWebSocketOptions(options)) {
        type = 'websocket';
      } else if (isStreamableHTTPOptions(options)) {
        type = 'streamable-http';
      } else if (isSSEOptions(options)) {
        type = 'sse';
      } else {
        throw new Error(
          'Cannot infer transport type: options.type is not provided and cannot be inferred from other properties.',
        );
      }

      switch (type) {
        case 'stdio':
          if (!isStdioOptions(options)) {
            throw new Error('Invalid options for stdio transport.');
          }
          return new StdioClientTransport({
            command: options.command,
            args: options.args,
            // workaround bug of mcp sdk that can't pass env:
            // https://github.com/modelcontextprotocol/typescript-sdk/issues/216
            env: { ...getDefaultEnvironment(), ...(options.env ?? {}) },
          });

        case 'websocket':
          if (!isWebSocketOptions(options)) {
            throw new Error('Invalid options for websocket transport.');
          }
          this.url = options.url;
          return new WebSocketClientTransport(new URL(options.url));

        case 'sse': {
          if (!isSSEOptions(options)) {
            throw new Error('Invalid options for sse transport.');
          }
          this.url = options.url;
          const url = new URL(options.url);
          logger.info(`${this.getLogPrefix()} Creating SSE transport: ${url.toString()}`);
          const abortController = new AbortController();

          /** Add OAuth token to headers if available */
          const headers = { ...options.headers };
          if (this.oauthTokens?.access_token) {
            headers['Authorization'] = `Bearer ${this.oauthTokens.access_token}`;
          }

          const transport = new SSEClientTransport(url, {
            requestInit: {
              headers,
              signal: abortController.signal,
            },
            eventSourceInit: {
              fetch: (url, init) => {
                const fetchHeaders = new Headers(Object.assign({}, init?.headers, headers));
                return fetch(url, {
                  ...init,
                  headers: fetchHeaders,
                });
              },
            },
          });

          transport.onclose = () => {
            logger.info(`${this.getLogPrefix()} SSE transport closed`);
            this.emit('connectionChange', 'disconnected');
          };

          transport.onerror = (error) => {
            logger.error(`${this.getLogPrefix()} SSE transport error:`, error);
            this.emitError(error, 'SSE transport error:');
          };

          transport.onmessage = (message) => {
            logger.info(`${this.getLogPrefix()} Message received: ${JSON.stringify(message)}`);
          };

          this.setupTransportErrorHandlers(transport);
          return transport;
        }

        case 'streamable-http': {
          if (!isStreamableHTTPOptions(options)) {
            throw new Error('Invalid options for streamable-http transport.');
          }
          this.url = options.url;
          const url = new URL(options.url);
          logger.info(
            `${this.getLogPrefix()} Creating streamable-http transport: ${url.toString()}`,
          );
          const abortController = new AbortController();

          // Add OAuth token to headers if available
          const headers = { ...options.headers };
          if (this.oauthTokens?.access_token) {
            headers['Authorization'] = `Bearer ${this.oauthTokens.access_token}`;
          }

          const transport = new StreamableHTTPClientTransport(url, {
            requestInit: {
              headers,
              signal: abortController.signal,
            },
          });

          transport.onclose = () => {
            logger.info(`${this.getLogPrefix()} Streamable-http transport closed`);
            this.emit('connectionChange', 'disconnected');
          };

          transport.onerror = (error: Error | unknown) => {
            logger.error(`${this.getLogPrefix()} Streamable-http transport error:`, error);
            this.emitError(error, 'Streamable-http transport error:');
          };

          transport.onmessage = (message: JSONRPCMessage) => {
            logger.info(`${this.getLogPrefix()} Message received: ${JSON.stringify(message)}`);
          };

          this.setupTransportErrorHandlers(transport);
          return transport;
        }

        default: {
          throw new Error(`Unsupported transport type: ${type}`);
        }
      }
    } catch (error) {
      this.emitError(error, 'Failed to construct transport:');
      throw error;
    }
  }

  private setupEventListeners(): void {
    this.isInitializing = true;
    this.on('connectionChange', (state: t.ConnectionState) => {
      this.connectionState = state;
      if (state === 'connected') {
        this.isReconnecting = false;
        this.isInitializing = false;
        this.shouldStopReconnecting = false;
        this.reconnectAttempts = 0;
        /**
         * // FOR DEBUGGING
         * // this.client.setRequestHandler(PingRequestSchema, async (request, extra) => {
         * //    logger.info(`[MCP][${this.serverName}] PingRequest: ${JSON.stringify(request)}`);
         * //    if (getEventListeners && extra.signal) {
         * //      const listenerCount = getEventListeners(extra.signal, 'abort').length;
         * //      logger.debug(`Signal has ${listenerCount} abort listeners`);
         * //    }
         * //    return {};
         * //  });
         */
      } else if (state === 'error' && !this.isReconnecting && !this.isInitializing) {
        this.handleReconnection().catch((error) => {
          logger.error(`${this.getLogPrefix()} Reconnection handler failed:`, error);
        });
      }
    });

    this.subscribeToResources();
  }

  private async handleReconnection(): Promise<void> {
    if (
      this.isReconnecting ||
      this.shouldStopReconnecting ||
      this.isInitializing ||
      this.oauthRequired
    ) {
      if (this.oauthRequired) {
        logger.info(`${this.getLogPrefix()} OAuth required, skipping reconnection attempts`);
      }
      return;
    }

    this.isReconnecting = true;
    const backoffDelay = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 30000);

    try {
      while (
        this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS &&
        !(this.shouldStopReconnecting as boolean)
      ) {
        this.reconnectAttempts++;
        const delay = backoffDelay(this.reconnectAttempts);

        logger.info(
          `${this.getLogPrefix()} Reconnecting ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} (delay: ${delay}ms)`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));

        try {
          await this.connect();
          this.reconnectAttempts = 0;
          return;
        } catch (error) {
          logger.error(`${this.getLogPrefix()} Reconnection attempt failed:`, error);

          if (
            this.reconnectAttempts === this.MAX_RECONNECT_ATTEMPTS ||
            (this.shouldStopReconnecting as boolean)
          ) {
            logger.error(`${this.getLogPrefix()} Stopping reconnection attempts`);
            return;
          }
        }
      }
    } finally {
      this.isReconnecting = false;
    }
  }

  private subscribeToResources(): void {
    this.client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
      this.emit('resourcesChanged');
    });
  }

  async connectClient(): Promise<void> {
    if (this.connectionState === 'connected') {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    if (this.shouldStopReconnecting) {
      return;
    }

    this.emit('connectionChange', 'connecting');

    this.connectPromise = (async () => {
      try {
        if (this.transport) {
          try {
            await this.client.close();
            this.transport = null;
          } catch (error) {
            logger.warn(`${this.getLogPrefix()} Error closing connection:`, error);
          }
        }

        this.transport = this.constructTransport(this.options);
        this.setupTransportDebugHandlers();

        const connectTimeout = this.options.initTimeout ?? 120000;
        await Promise.race([
          this.client.connect(this.transport),
          new Promise((_resolve, reject) =>
            setTimeout(
              () => reject(new Error(`Connection timeout after ${connectTimeout}ms`)),
              connectTimeout,
            ),
          ),
        ]);

        this.connectionState = 'connected';
        this.emit('connectionChange', 'connected');
        this.reconnectAttempts = 0;
      } catch (error) {
        // Check if it's an OAuth authentication error
        if (this.isOAuthError(error)) {
          logger.warn(`${this.getLogPrefix()} OAuth authentication required`);
          this.oauthRequired = true;
          const serverUrl = this.url;
          logger.debug(`${this.getLogPrefix()} Server URL for OAuth: ${serverUrl}`);

          const oauthTimeout = this.options.initTimeout ?? 60000;
          /** Promise that will resolve when OAuth is handled */
          const oauthHandledPromise = new Promise<void>((resolve, reject) => {
            let timeoutId: NodeJS.Timeout | null = null;
            let oauthHandledListener: (() => void) | null = null;
            let oauthFailedListener: ((error: Error) => void) | null = null;

            /** Cleanup function to remove listeners and clear timeout */
            const cleanup = () => {
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              if (oauthHandledListener) {
                this.off('oauthHandled', oauthHandledListener);
              }
              if (oauthFailedListener) {
                this.off('oauthFailed', oauthFailedListener);
              }
            };

            // Success handler
            oauthHandledListener = () => {
              cleanup();
              resolve();
            };

            // Failure handler
            oauthFailedListener = (error: Error) => {
              cleanup();
              reject(error);
            };

            // Timeout handler
            timeoutId = setTimeout(() => {
              cleanup();
              reject(new Error(`OAuth handling timeout after ${oauthTimeout}ms`));
            }, oauthTimeout);

            // Listen for both success and failure events
            this.once('oauthHandled', oauthHandledListener);
            this.once('oauthFailed', oauthFailedListener);
          });

          // Emit the event
          this.emit('oauthRequired', {
            serverName: this.serverName,
            error,
            serverUrl,
            userId: this.userId,
          });

          try {
            // Wait for OAuth to be handled
            await oauthHandledPromise;
            // Reset the oauthRequired flag
            this.oauthRequired = false;
            // Don't throw the error - just return so connection can be retried
            logger.info(
              `${this.getLogPrefix()} OAuth handled successfully, connection will be retried`,
            );
            return;
          } catch (oauthError) {
            // OAuth failed or timed out
            this.oauthRequired = false;
            logger.error(`${this.getLogPrefix()} OAuth handling failed:`, oauthError);
            // Re-throw the original authentication error
            throw error;
          }
        }

        this.connectionState = 'error';
        this.emit('connectionChange', 'error');
        throw error;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  private setupTransportDebugHandlers(): void {
    if (!this.transport) {
      return;
    }

    this.transport.onmessage = (msg) => {
      logger.debug(`${this.getLogPrefix()} Transport received: ${JSON.stringify(msg)}`);
    };

    const originalSend = this.transport.send.bind(this.transport);
    this.transport.send = async (msg) => {
      if ('result' in msg && !('method' in msg) && Object.keys(msg.result ?? {}).length === 0) {
        if (Date.now() - this.lastPingTime < FIVE_MINUTES) {
          throw new Error('Empty result');
        }
        this.lastPingTime = Date.now();
      }
      logger.debug(`${this.getLogPrefix()} Transport sending: ${JSON.stringify(msg)}`);
      return originalSend(msg);
    };
  }

  async connect(): Promise<void> {
    try {
      await this.disconnect();
      await this.connectClient();
      if (!(await this.isConnected())) {
        throw new Error('Connection not established');
      }
    } catch (error) {
      logger.error(`${this.getLogPrefix()} Connection failed:`, error);
      throw error;
    }
  }

  private setupTransportErrorHandlers(transport: Transport): void {
    transport.onerror = (error) => {
      logger.error(`${this.getLogPrefix()} Transport error:`, error);

      // Check if it's an OAuth authentication error
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as unknown as { code?: number }).code;
        if (errorCode === 401 || errorCode === 403) {
          logger.warn(`${this.getLogPrefix()} OAuth authentication error detected`);
          this.emit('oauthError', error);
        }
      }

      this.emit('connectionChange', 'error');
    };
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.client.close();
        this.transport = null;
      }
      if (this.connectionState === 'disconnected') {
        return;
      }
      this.connectionState = 'disconnected';
      this.emit('connectionChange', 'disconnected');
    } finally {
      this.connectPromise = null;
    }
  }

  async fetchResources(): Promise<t.MCPResource[]> {
    try {
      const { resources } = await this.client.listResources();
      return resources;
    } catch (error) {
      this.emitError(error, 'Failed to fetch resources:');
      return [];
    }
  }

  async fetchTools() {
    try {
      const { tools } = await this.client.listTools();
      return tools;
    } catch (error) {
      this.emitError(error, 'Failed to fetch tools:');
      return [];
    }
  }

  async fetchPrompts(): Promise<t.MCPPrompt[]> {
    try {
      const { prompts } = await this.client.listPrompts();
      return prompts;
    } catch (error) {
      this.emitError(error, 'Failed to fetch prompts:');
      return [];
    }
  }

  public async isConnected(): Promise<boolean> {
    try {
      await this.client.ping();
      return this.connectionState === 'connected';
    } catch (error) {
      logger.error(`${this.getLogPrefix()} Ping failed:`, error);
      return false;
    }
  }

  public setOAuthTokens(tokens: MCPOAuthTokens): void {
    this.oauthTokens = tokens;
  }

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
}
