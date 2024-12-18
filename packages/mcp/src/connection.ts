import { EventEmitter } from 'events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { ResourceListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Logger } from 'winston';
import type * as t from './types/mcp.js';

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
export class MCPConnection extends EventEmitter {
  private static instance: MCPConnection | null = null;
  public client: Client;
  private transport: Transport | null = null; // Make this nullable
  private connectionState: t.ConnectionState = 'disconnected';
  private connectPromise: Promise<void> | null = null;
  private lastError: Error | null = null;
  private lastConfigUpdate = 0;
  private readonly CONFIG_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  public readonly serverName: string;
  private shouldStopReconnecting = false;
  private isReconnecting = false;
  private isInitializing = false;
  private reconnectAttempts = 0;
  iconPath?: string;

  constructor(serverName: string, private readonly options: t.MCPOptions, private logger?: Logger) {
    super();
    this.serverName = serverName;
    this.logger = logger;
    this.iconPath = options.iconPath;
    this.client = new Client(
      {
        name: 'librechat-mcp-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupEventListeners();
  }

  public static getInstance(
    serverName: string,
    options: t.MCPOptions,
    logger?: Logger,
  ): MCPConnection {
    if (!MCPConnection.instance) {
      MCPConnection.instance = new MCPConnection(serverName, options, logger);
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
    this.logger?.error(`[MCP][${this.serverName}] ${errorContext}: ${errorMessage}`);
    this.emit('error', new Error(`${errorContext}: ${errorMessage}`));
  }

  private constructTransport(options: t.MCPOptions): Transport {
    try {
      let type: t.MCPOptions['type'];
      if (isStdioOptions(options)) {
        type = 'stdio';
      } else if (isWebSocketOptions(options)) {
        type = 'websocket';
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
            env: options.env,
          });

        case 'websocket':
          if (!isWebSocketOptions(options)) {
            throw new Error('Invalid options for websocket transport.');
          }
          return new WebSocketClientTransport(new URL(options.url));

        case 'sse': {
          if (!isSSEOptions(options)) {
            throw new Error('Invalid options for sse transport.');
          }
          const url = new URL(options.url);
          this.logger?.info(`[MCP][${this.serverName}] Creating SSE transport: ${url.toString()}`);
          const transport = new SSEClientTransport(url);

          transport.onclose = () => {
            this.logger?.info(`[MCP][${this.serverName}] SSE transport closed`);
            this.emit('connectionChange', 'disconnected');
          };

          transport.onerror = (error) => {
            this.logger?.error(`[MCP][${this.serverName}] SSE transport error:`, error);
            this.emitError(error, 'SSE transport error:');
          };

          transport.onmessage = (message) => {
            this.logger?.info(
              `[MCP][${this.serverName}] Message received: ${JSON.stringify(message)}`,
            );
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
      } else if (state === 'error' && !this.isReconnecting && !this.isInitializing) {
        this.handleReconnection().catch((error) => {
          this.logger?.error(`[MCP][${this.serverName}] Reconnection handler failed:`, error);
        });
      }
    });

    this.subscribeToResources();
  }

  private async handleReconnection(): Promise<void> {
    if (this.isReconnecting || this.shouldStopReconnecting || this.isInitializing) {
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

        this.logger?.info(
          `[MCP][${this.serverName}] Reconnecting ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} (delay: ${delay}ms)`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));

        try {
          await this.connect();
          this.reconnectAttempts = 0;
          return;
        } catch (error) {
          this.logger?.error(`[MCP][${this.serverName}] Reconnection attempt failed:`, error);

          if (
            this.reconnectAttempts === this.MAX_RECONNECT_ATTEMPTS ||
            (this.shouldStopReconnecting as boolean)
          ) {
            this.logger?.error(`[MCP][${this.serverName}] Stopping reconnection attempts`);
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
      this.invalidateCache();
      this.emit('resourcesChanged');
    });
  }

  private invalidateCache(): void {
    // this.cachedConfig = null;
    this.lastConfigUpdate = 0;
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
            this.logger?.warn(`[MCP][${this.serverName}] Error closing connection:`, error);
          }
        }

        this.transport = this.constructTransport(this.options);
        this.setupTransportDebugHandlers();

        const connectTimeout = 10000;
        await Promise.race([
          this.client.connect(this.transport),
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), connectTimeout),
          ),
        ]);

        this.connectionState = 'connected';
        this.emit('connectionChange', 'connected');
        this.reconnectAttempts = 0;
      } catch (error) {
        this.connectionState = 'error';
        this.emit('connectionChange', 'error');
        this.lastError = error instanceof Error ? error : new Error(String(error));
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
      this.logger?.debug(`[MCP][${this.serverName}] Transport received: ${JSON.stringify(msg)}`);
    };

    const originalSend = this.transport.send.bind(this.transport);
    this.transport.send = async (msg) => {
      this.logger?.debug(`[MCP][${this.serverName}] Transport sending: ${JSON.stringify(msg)}`);
      return originalSend(msg);
    };
  }

  async connect(): Promise<void> {
    try {
      await this.disconnect();
      await this.connectClient();
      if (!this.isConnected()) {
        throw new Error('Connection not established');
      }
    } catch (error) {
      this.logger?.error(`[MCP][${this.serverName}] Connection failed:`, error);
      throw error;
    }
  }

  private setupTransportErrorHandlers(transport: Transport): void {
    transport.onerror = (error) => {
      this.logger?.error(`[MCP][${this.serverName}] Transport error:`, error);
      this.emit('connectionChange', 'error');
    };

    const errorHandler = (error: Error) => {
      try {
        this.logger?.error(`[MCP][${this.serverName}] Uncaught transport error:`, error);
      } catch {
        console.error(`[MCP][${this.serverName}] Critical error logging failed`, error);
      }
      this.emit('connectionChange', 'error');
    };

    process.on('uncaughtException', errorHandler);
    process.on('unhandledRejection', errorHandler);
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
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this.invalidateCache();
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

  // public async modifyConfig(config: ContinueConfig): Promise<ContinueConfig> {
  //   try {
  //     // Check cache
  //     if (this.cachedConfig && Date.now() - this.lastConfigUpdate < this.CONFIG_TTL) {
  //       return this.cachedConfig;
  //     }

  //     await this.connectClient();

  //     // Fetch and process resources
  //     const resources = await this.fetchResources();
  //     const submenuItems = resources.map(resource => ({
  //       title: resource.name,
  //       description: resource.description,
  //       id: resource.uri,
  //     }));

  //     if (!config.contextProviders) {
  //       config.contextProviders = [];
  //     }

  //     config.contextProviders.push(
  //       new MCPContextProvider({
  //         submenuItems,
  //         client: this.client,
  //       }),
  //     );

  //     // Fetch and process tools
  //     const tools = await this.fetchTools();
  //     const continueTools: Tool[] = tools.map(tool => ({
  //       displayTitle: tool.name,
  //       function: {
  //         description: tool.description,
  //         name: tool.name,
  //         parameters: tool.inputSchema,
  //       },
  //       readonly: false,
  //       type: 'function',
  //       wouldLikeTo: `use the ${tool.name} tool`,
  //       uri: `mcp://${tool.name}`,
  //     }));

  //     config.tools = [...(config.tools || []), ...continueTools];

  //     // Fetch and process prompts
  //     const prompts = await this.fetchPrompts();
  //     if (!config.slashCommands) {
  //       config.slashCommands = [];
  //     }

  //     const slashCommands: SlashCommand[] = prompts.map(prompt =>
  //       constructMcpSlashCommand(
  //         this.client,
  //         prompt.name,
  //         prompt.description,
  //         prompt.arguments?.map(a => a.name),
  //       ),
  //     );
  //     config.slashCommands.push(...slashCommands);

  //     // Update cache
  //     this.cachedConfig = config;
  //     this.lastConfigUpdate = Date.now();

  //     return config;
  //   } catch (error) {
  //     this.emit('error', error);
  //     // Return original config if modification fails
  //     return config;
  //   }
  // }

  // Public getters for state information
  public getConnectionState(): t.ConnectionState {
    return this.connectionState;
  }

  public isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  public getLastError(): Error | null {
    return this.lastError;
  }
}
