import { callMCPAppTool, fetchMCPResource } from './mcpAppUtils';
import type { McpUiResourceCsp, McpUiResourcePermissions } from './mcpAppUtils';
import { getHostContext } from './mcpAppTheme';
import {
  LIBRECHAT_MCP_HOST_NAME,
  LIBRECHAT_MCP_HOST_VERSION,
  MCP_APPS_PROTOCOL_VERSION,
} from 'librechat-data-provider';

const MCP_PROTOCOL_VERSION = MCP_APPS_PROTOCOL_VERSION ?? '2026-01-26';
const MCP_HOST_NAME = LIBRECHAT_MCP_HOST_NAME ?? 'LibreChat';
const MCP_HOST_VERSION = LIBRECHAT_MCP_HOST_VERSION ?? '1.0.0';

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

type AppCapabilities = {
  availableDisplayModes?: Array<'inline' | 'fullscreen' | 'pip'>;
};

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
  private appAvailableDisplayModes: Set<DisplayMode> | null = null;

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
      Number.isFinite(measuredHeight) && measuredHeight > 0
        ? Math.round(measuredHeight)
        : undefined;
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
  sendContextUpdate(theme: 'light' | 'dark', displayMode: DisplayMode = 'inline'): void {
    this.displayMode = displayMode;
    const hostContext = this.getHostContext(theme);
    this.sendNotification(
      'ui/notifications/host-context-changed',
      hostContext as unknown as Record<string, unknown>,
    );
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
    this.sendNotification('ui/notifications/tool-input', {
      arguments: this.options.toolArguments ?? {},
    });
    if (this.options.toolResult) {
      const result = this.options.toolResult as Record<string, unknown>;
      this.sendNotification('ui/notifications/tool-result', result);
    }
  }

  private isCancellationError(error: unknown): boolean {
    if (!error) {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    return (
      normalized.includes('abort') ||
      normalized.includes('cancel') ||
      normalized.includes('canceled') ||
      normalized.includes('cancelled')
    );
  }

  private sendToolCancelled(reason?: string): void {
    this.sendNotification('ui/notifications/tool-cancelled', {
      reason: reason ?? 'cancelled',
    });
  }

  private normalizeMode(mode: unknown): DisplayMode {
    return mode === 'fullscreen' || mode === 'pip' ? mode : 'inline';
  }

  private isHostModeAllowed(mode: DisplayMode): boolean {
    if (mode === 'pip') {
      return false;
    }
    if (mode === 'fullscreen' && this.options.allowFullscreen === false) {
      return false;
    }
    return true;
  }

  private isAppModeAllowed(mode: DisplayMode): boolean {
    if (!this.appAvailableDisplayModes || this.appAvailableDisplayModes.size === 0) {
      return true;
    }
    return this.appAvailableDisplayModes.has(mode);
  }

  private resolveDisplayMode(mode: DisplayMode): DisplayMode {
    if (!this.isHostModeAllowed(mode) || !this.isAppModeAllowed(mode)) {
      return 'inline';
    }
    return mode;
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
          const appCapabilities = (params as { appCapabilities?: AppCapabilities } | undefined)
            ?.appCapabilities;
          const appModes = Array.isArray(appCapabilities?.availableDisplayModes)
            ? appCapabilities?.availableDisplayModes
                .map((mode) => this.normalizeMode(mode))
                .filter((mode, index, list) => list.indexOf(mode) === index)
            : [];
          this.appAvailableDisplayModes = appModes.length > 0 ? new Set(appModes) : null;
          const hostContext = this.getHostContext(this.options.theme);
          const result = {
            protocolVersion: MCP_PROTOCOL_VERSION,
            hostCapabilities: {
              openLinks: {},
              serverTools: { listChanged: false },
              serverResources: { listChanged: false },
              logging: {},
              message: { text: {}, structuredContent: {} },
              updateModelContext: { text: {}, structuredContent: {} },
            },
            hostInfo: {
              name: MCP_HOST_NAME,
              version: MCP_HOST_VERSION,
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
          try {
            const toolName = (params as Record<string, unknown>)?.name as string;
            const toolArgs =
              ((params as Record<string, unknown>)?.arguments as Record<string, unknown>) || {};
            const result = await callMCPAppTool(this.serverName, toolName, toolArgs);
            if (id !== undefined) {
              this.sendResponse(id, result);
            }
            break;
          } catch (error) {
            if (this.isCancellationError(error)) {
              this.sendToolCancelled(error instanceof Error ? error.message : undefined);
              break;
            }
            throw error;
          }
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
          if (message.role !== 'user') {
            if (id !== undefined) {
              this.sendError(id, -32602, 'ui/message role must be "user"');
            }
            break;
          }
          const role = 'user';
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
          const requestedMode = this.normalizeMode((params as Record<string, unknown>)?.mode);
          let actualMode: DisplayMode = this.resolveDisplayMode(requestedMode);
          if (actualMode !== 'inline' && this.options.onDisplayModeRequest) {
            actualMode = this.normalizeMode(this.options.onDisplayModeRequest(actualMode));
          } else if (actualMode === 'inline' && this.options.onDisplayModeRequest) {
            actualMode = this.normalizeMode(this.options.onDisplayModeRequest('inline'));
          }
          actualMode = this.resolveDisplayMode(actualMode);
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
