import { EventEmitter } from 'events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { ResourceListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { MCPOptions } from './types/mcp.js';

// Type definitions
interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string }>;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export class MCPConnection extends EventEmitter {
  private static instance: MCPConnection | null = null;
  public client: Client;
  private transport: Transport | null = null; // Make this nullable
  private connectionState: ConnectionState = 'disconnected';
  private connectPromise: Promise<void> | null = null;
  private lastError: Error | null = null;
  // private cachedConfig: ContinueConfig | null = null;
  private lastConfigUpdate = 0;
  private readonly CONFIG_TTL = 5 * 60 * 1000; // 5 minutes
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY = 1000; // 1 second

  private constructor(
    private readonly options: MCPOptions,
    private readonly clientFactory?: (transport: Transport) => Client,
  ) {
    super();
    // Don't create transport here, wait until connection is needed
    this.client = new Client(
      {
        name: 'librechat-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    // Set up event listeners
    this.setupEventListeners();
  }

  public static getInstance(options: MCPOptions): MCPConnection {
    if (!MCPConnection.instance) {
      MCPConnection.instance = new MCPConnection(options);
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

  private emitError(error: unknown, errorPrefix: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.dir(error, { depth: null });
    this.emit('error', new Error(`${errorPrefix} ${errorMessage}`));
  }

  private constructTransport(options: MCPOptions): Transport {
    try {
      switch (options.transport.type) {
        case 'stdio':
          return new StdioClientTransport({
            command: options.transport.command,
            args: options.transport.args,
          });
        case 'websocket':
          return new WebSocketClientTransport(new URL(options.transport.url));
        case 'sse': {
          const url = new URL(options.transport.url);
          console.log('Creating SSE transport with URL:', url.toString());
          const transport = new SSEClientTransport(url);

          // Add debug listeners
          transport.onclose = () => {
            console.log('SSE transport closed');
            this.emit('connectionChange', 'disconnected');
          };

          transport.onerror = (error) => {
            console.error('SSE transport error:', error);
            this.emitError(error, 'SSE transport error:');
          };

          transport.onmessage = (message) => {
            console.log('SSE transport received message:', message);
          };

          return transport;
        }
        default: {
          const transportType = (options.transport as { type: string }).type;
          throw new Error(`Unsupported transport type: ${transportType}`);
        }
      }
    } catch (error) {
      this.emitError(error, 'Failed to construct transport:');
      throw error;
    }
  }

  private setupEventListeners(): void {
    this.on('connectionChange', (state: ConnectionState) => {
      this.connectionState = state;
      if (state === 'error') {
        this.handleReconnection();
      }
    });

    // Set up resource change notification handler
    this.subscribeToResources();
  }

  private async handleReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    await new Promise((resolve) => setTimeout(resolve, this.RECONNECT_DELAY));

    try {
      await this.connectClient();
      this.reconnectAttempts = 0;
    } catch (error) {
      this.emit('error', error);
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
      await this.connectPromise;
      return;
    }

    this.emit('connectionChange', 'connecting');

    this.connectPromise = (async () => {
      try {
        // Clean up existing connection if any
        if (this.transport) {
          try {
            await this.client.close();
            this.transport = null;
          } catch (error) {
            console.warn('Error closing existing connection:', error);
          }
        }

        console.log('Creating new transport...');
        this.transport = this.constructTransport(this.options);

        // Debug transport events
        this.transport.onmessage = (msg) => {
          console.log('Transport received message:', JSON.stringify(msg, null, 2));
        };

        const originalSend = this.transport.send.bind(this.transport);
        this.transport.send = async (msg) => {
          console.log('Transport sending message:', JSON.stringify(msg, null, 2));
          return originalSend(msg);
        };

        // Connect with longer timeout for debugging
        console.log('Connecting to transport...');
        const connectPromise = this.client.connect(this.transport);
        const timeoutPromise = new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), 10000);
        });

        await Promise.race([connectPromise, timeoutPromise]);
        console.log('Successfully connected to transport');

        this.connectionState = 'connected';
        this.emit('connectionChange', 'connected');
        this.reconnectAttempts = 0;
      } catch (error) {
        console.error('Connection error:', error);
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

  public async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.client.close();
        this.transport = null;
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

  async fetchResources(): Promise<MCPResource[]> {
    try {
      const { resources } = await this.client.listResources();
      return resources;
    } catch (error) {
      this.emitError(error, 'Failed to fetch resources:');
      return [];
    }
  }

  async fetchTools(): Promise<MCPTool[]> {
    try {
      const { tools } = await this.client.listTools();
      return tools;
    } catch (error) {
      this.emitError(error, 'Failed to fetch tools:');
      return [];
    }
  }

  async fetchPrompts(): Promise<MCPPrompt[]> {
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
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  public getLastError(): Error | null {
    return this.lastError;
  }
}
