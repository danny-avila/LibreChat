import { callMCPAppTool, fetchMCPResource } from './mcpAppUtils';
import type { McpUiResourceCsp, McpUiResourcePermissions } from './mcpAppUtils';
import { getHostContext } from './mcpAppTheme';

type DisplayMode = 'inline' | 'fullscreen' | 'pip';

export interface MCPAppBridgeOptions {
  iframe: HTMLIFrameElement;
  serverName: string;
  theme: 'light' | 'dark';
  allowFullscreen?: boolean;
  toolResult?: unknown;
  toolArguments?: Record<string, unknown>;
  resourceMeta?: Record<string, unknown>;
  onSizeChange?: (size: { width?: number; height?: number }) => void;
  onOpenLink?: (url: string) => void;
  onMessage?: (message: { role: 'user'; content: unknown }) => void;
  onModelContextUpdate?: (context: unknown) => void;
  onDisplayModeRequest?: (mode: DisplayMode) => DisplayMode;
  displayMode?: DisplayMode;
}

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class MCPAppBridge {
  private iframe: HTMLIFrameElement;
  private serverName: string;
  private options: MCPAppBridgeOptions;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private initialized = false; // ui/initialize has completed.
  private viewInitialized = false; // ui/notifications/initialized has been received.
  private initialPayloadSent = false;
  private destroyed = false;
  private nextRequestId = 0;
  private queuedNotifications: JsonRpcMessage[] = [];
  private pendingRequests = new Map<
    number | string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private displayMode: DisplayMode;

  constructor(options: MCPAppBridgeOptions) {
    this.iframe = options.iframe;
    this.serverName = options.serverName;
    this.options = options;
    this.displayMode = options.displayMode ?? 'inline';
  }

  private getContainerDimensions(): { maxHeight?: number; maxWidth?: number } {
    const rect =
      typeof this.iframe.getBoundingClientRect === 'function'
        ? this.iframe.getBoundingClientRect()
        : null;

    const measuredHeight = rect?.height ?? this.iframe.clientHeight;
    const measuredWidth = rect?.width ?? this.iframe.clientWidth;

    const maxHeight =
      Number.isFinite(measuredHeight) && measuredHeight > 0 ? Math.round(measuredHeight) : undefined;
    const maxWidth =
      Number.isFinite(measuredWidth) && measuredWidth > 0 ? Math.round(measuredWidth) : undefined;

    return { maxHeight, maxWidth };
  }

  private getHostContext(theme: 'light' | 'dark') {
    return getHostContext(
      theme,
      this.displayMode,
      this.getContainerDimensions(),
      this.options.allowFullscreen !== false,
    );
  }

  start(): void {
    this.messageHandler = this.handleMessage.bind(this);
    window.addEventListener('message', this.messageHandler);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error('Bridge destroyed'));
    }
    this.pendingRequests.clear();
    this.queuedNotifications = [];
  }

  /** Send HTML content to the sandbox proxy */
  sendResourceToSandbox(
    html: string,
    csp?: McpUiResourceCsp,
    permissions?: Partial<McpUiResourcePermissions>,
  ): void {
    this.sendToIframe({
      jsonrpc: '2.0',
      method: 'ui/notifications/sandbox-resource-ready',
      params: { html, csp, permissions },
    });
  }

  /** Send a JSON-RPC notification to the iframe */
  sendNotification(method: string, params: Record<string, unknown>): void {
    const notification: JsonRpcMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    // Do not send View-targeted messages before initialized; queue them instead.
    if (!this.viewInitialized) {
      this.queuedNotifications.push(notification);
      return;
    }

    this.sendToIframe(notification);
  }

  /** Send theme/context update */
  sendContextUpdate(
    theme: 'light' | 'dark',
    displayMode: DisplayMode = 'inline',
  ): void {
    this.displayMode = displayMode;
    const hostContext = this.getHostContext(theme);
    this.sendNotification('ui/notifications/host-context-changed', hostContext);
  }

  async teardownResource(params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.destroyed || !this.viewInitialized) {
      return {};
    }

    return this.sendRequest('ui/resource-teardown', params);
  }

  private sendToIframe(msg: JsonRpcMessage): void {
    if (this.destroyed) {
      return;
    }
    const target = this.iframe.contentWindow;
    if (target) {
      target.postMessage(msg, '*');
    }
  }

  private sendResponse(id: number | string, result: unknown): void {
    this.sendToIframe({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  private sendError(id: number | string, code: number, message: string): void {
    this.sendToIframe({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    });
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.destroyed) {
      return Promise.reject(new Error('Bridge destroyed'));
    }

    const id = ++this.nextRequestId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.sendToIframe({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });
    });
  }

  private flushQueuedNotifications(): void {
    if (!this.viewInitialized || this.destroyed || this.queuedNotifications.length === 0) {
      return;
    }

    const pending = this.queuedNotifications;
    this.queuedNotifications = [];
    for (const notification of pending) {
      this.sendToIframe(notification);
    }
  }

  private sendInitialPayloadsIfReady(): void {
    if (!this.viewInitialized || this.initialPayloadSent || this.destroyed) {
      return;
    }

    this.initialPayloadSent = true;
    if (this.options.toolArguments) {
      this.sendNotification('ui/notifications/tool-input', {
        arguments: this.options.toolArguments,
      });
    }
    if (this.options.toolResult) {
      const result = this.options.toolResult as Record<string, unknown>;
      this.sendNotification('ui/notifications/tool-result', result);
    }
  }

  private handleMessage(event: MessageEvent): void {
    if (this.destroyed) {
      return;
    }

    // Only accept messages from our iframe
    if (event.source !== this.iframe.contentWindow) {
      return;
    }

    let msg: JsonRpcMessage;
    try {
      msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }

    if (!msg || msg.jsonrpc !== '2.0') {
      return;
    }

    // Block sandbox-* methods from inner frame (except sandbox-proxy-ready)
    if (msg.method?.startsWith('ui/notifications/sandbox-')) {
      if (msg.method === 'ui/notifications/sandbox-proxy-ready') {
        this.onSandboxReady();
      }
      return;
    }

    // Handle responses to our requests
    if (msg.id !== undefined && !msg.method) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // Handle requests/notifications from the view
    if (msg.method) {
      this.handleViewMessage(msg);
    }
  }

  private onSandboxReady(): void {
    // Sandbox proxy is ready - container will handle sending content
  }

  private async handleViewMessage(msg: JsonRpcMessage): Promise<void> {
    const { method, params, id } = msg;

    try {
      switch (method) {
        case 'ui/initialize': {
          this.initialized = true;
          const hostContext = this.getHostContext(this.options.theme);
          const result = {
            protocolVersion: '2026-01-26',
            hostCapabilities: {
              openLinks: {},
              serverTools: { listChanged: false },
              serverResources: { listChanged: false },
              logging: {},
              message: { text: {}, structuredContent: {} },
              updateModelContext: { text: {}, structuredContent: {} },
            },
            hostInfo: {
              name: 'LibreChat',
              version: '1.0.0',
            },
            hostContext,
            // Legacy compatibility for older app runtimes.
            capabilities: {
              tools: { call: true },
              resources: { read: true },
            },
          };
          if (id !== undefined) {
            this.sendResponse(id, result);
          }
          break;
        }

        case 'ui/notifications/initialized':
          this.viewInitialized = true;
          this.flushQueuedNotifications();
          this.sendInitialPayloadsIfReady();
          break;

        case 'tools/call': {
          const toolName = (params as Record<string, unknown>)?.name as string;
          const toolArgs =
            ((params as Record<string, unknown>)?.arguments as Record<string, unknown>) || {};
          const result = await callMCPAppTool(this.serverName, toolName, toolArgs);
          if (id !== undefined) {
            this.sendResponse(id, result);
          }
          break;
        }

        case 'resources/read': {
          const uri = (params as Record<string, unknown>)?.uri as string;
          const result = await fetchMCPResource(this.serverName, uri);
          if (id !== undefined) {
            this.sendResponse(id, result);
          }
          break;
        }

        case 'ui/open-link': {
          const url = (params as Record<string, unknown>)?.url as string;
          if (url && this.options.onOpenLink) {
            this.options.onOpenLink(url);
          } else if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
          if (id !== undefined) {
            this.sendResponse(id, {});
          }
          break;
        }

        case 'ui/message': {
          const message = params as { role?: unknown; content?: unknown };
          const role = message.role === 'user' ? 'user' : 'user';
          if (this.options.onMessage) {
            this.options.onMessage({ role, content: message.content });
          }
          if (id !== undefined) {
            this.sendResponse(id, {});
          }
          break;
        }

        case 'ui/update-model-context': {
          if (this.options.onModelContextUpdate) {
            this.options.onModelContextUpdate(params);
          }
          if (id !== undefined) {
            this.sendResponse(id, {});
          }
          break;
        }

        case 'ui/request-display-mode': {
          const requestedMode =
            ((params as Record<string, unknown>)?.mode as 'inline' | 'fullscreen' | 'pip') ?? 'inline';
          let actualMode: 'inline' | 'fullscreen' | 'pip' = 'inline';
          if (requestedMode === 'fullscreen' && this.options.allowFullscreen === false) {
            actualMode = 'inline';
          } else if (this.options.onDisplayModeRequest) {
            actualMode = this.options.onDisplayModeRequest(requestedMode);
          } else {
            actualMode = requestedMode;
          }
          this.displayMode = actualMode;
          if (id !== undefined) {
            this.sendResponse(id, { mode: actualMode });
          }
          break;
        }

        case 'ui/resize': {
          const size = params as { width?: number; height?: number };
          if (this.options.onSizeChange) {
            this.options.onSizeChange(size);
          }
          if (id !== undefined) {
            this.sendResponse(id, {});
          }
          break;
        }

        case 'ping':
          if (id !== undefined) {
            this.sendResponse(id, {});
          }
          break;

        case 'ui/notifications/size-changed': {
          // MCP Apps spec: view sends size-changed notifications when content resizes
          const size = params as { width?: number; height?: number };
          if (this.options.onSizeChange) {
            this.options.onSizeChange(size);
          }
          // Notifications don't get responses
          break;
        }

        case 'notifications/message':
          console.log('[MCP App]', params);
          break;

        default:
          if (id !== undefined) {
            this.sendError(id, -32601, `Method not found: ${method}`);
          }
      }
    } catch (error) {
      console.error('[MCPAppBridge] Error handling message:', method, error);
      if (id !== undefined) {
        this.sendError(id, -32603, (error as Error).message || 'Internal error');
      }
    }
  }
}
