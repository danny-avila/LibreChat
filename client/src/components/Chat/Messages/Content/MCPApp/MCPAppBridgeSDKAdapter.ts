import { callMCPAppTool, fetchMCPResource } from './mcpAppUtils';
import type { MCPAppBridgeOptions } from './MCPAppBridge';
import { getHostContext } from './mcpAppTheme';

type ExtAppBridgeModule = typeof import('@modelcontextprotocol/ext-apps/app-bridge');

/**
 * Experimental bridge adapter around @modelcontextprotocol/ext-apps/app-bridge.
 * This is intentionally opt-in and keeps backend proxy calls unchanged.
 */
export class MCPAppBridgeSDKAdapter {
  private iframe: HTMLIFrameElement;
  private serverName: string;
  private options: MCPAppBridgeOptions;
  private bridge: import('@modelcontextprotocol/ext-apps/app-bridge').AppBridge | null = null;
  private initPromise: Promise<void> | null = null;
  private displayMode: 'inline' | 'fullscreen' | 'pip';
  private destroyed = false;
  private viewInitialized = false;
  private initialPayloadSent = false;
  private pendingHostContext:
    | ReturnType<typeof getHostContext>
    | null = null;
  private pendingSandboxResource:
    | {
        html: string;
        csp?: Parameters<
          import('@modelcontextprotocol/ext-apps/app-bridge').AppBridge['sendSandboxResourceReady']
        >[0]['csp'];
        permissions?: Parameters<
          import('@modelcontextprotocol/ext-apps/app-bridge').AppBridge['sendSandboxResourceReady']
        >[0]['permissions'];
      }
    | null = null;

  constructor(options: MCPAppBridgeOptions) {
    this.iframe = options.iframe;
    this.serverName = options.serverName;
    this.options = options;
    this.displayMode = options.displayMode ?? 'inline';
    this.pendingHostContext = getHostContext(
      this.options.theme,
      this.displayMode,
      this.getContainerDimensions(),
      this.options.allowFullscreen !== false,
    );
  }

  private getContainerDimensions(): { maxHeight?: number; maxWidth?: number } {
    const rect =
      typeof this.iframe.getBoundingClientRect === 'function'
        ? this.iframe.getBoundingClientRect()
        : null;
    const measuredHeight = rect?.height ?? this.iframe.clientHeight;
    const measuredWidth = rect?.width ?? this.iframe.clientWidth;
    return {
      maxHeight:
        Number.isFinite(measuredHeight) && measuredHeight > 0 ? Math.round(measuredHeight) : undefined,
      maxWidth:
        Number.isFinite(measuredWidth) && measuredWidth > 0 ? Math.round(measuredWidth) : undefined,
    };
  }

  start(): void {
    if (this.initPromise != null) {
      return;
    }
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    const targetWindow = this.iframe.contentWindow;
    if (!targetWindow || this.destroyed) {
      return;
    }

    const sdk: ExtAppBridgeModule = await import('@modelcontextprotocol/ext-apps/app-bridge');
    if (this.destroyed) {
      return;
    }

    const bridge = new sdk.AppBridge(
      null,
      { name: 'LibreChat', version: '1.0.0' },
      {
        openLinks: {},
        serverTools: { listChanged: false },
        serverResources: { listChanged: false },
        logging: {},
        message: { text: {}, structuredContent: {} },
        updateModelContext: { text: {}, structuredContent: {} },
      },
      {
        hostContext: this.pendingHostContext ?? undefined,
      },
    );

    bridge.oncalltool = async (params) => {
      const args = (params.arguments as Record<string, unknown>) ?? {};
      return (await callMCPAppTool(this.serverName, params.name, args)) as {
        content?: unknown[];
        structuredContent?: Record<string, unknown>;
        isError?: boolean;
        _meta?: Record<string, unknown>;
      };
    };

    bridge.onreadresource = async (params) => {
      return (await fetchMCPResource(this.serverName, params.uri)) as {
        contents: Array<{
          uri: string;
          mimeType?: string;
          text?: string;
          blob?: string;
          _meta?: Record<string, unknown>;
        }>;
      };
    };

    bridge.onopenlink = async (params) => {
      const url = params.url;
      if (url && this.options.onOpenLink) {
        this.options.onOpenLink(url);
      } else if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return {};
    };

    bridge.onmessage = async (params) => {
      if (this.options.onMessage) {
        this.options.onMessage({ role: 'user', content: params.content });
      }
      return {};
    };

    bridge.onupdatemodelcontext = async (params) => {
      this.options.onModelContextUpdate?.(params);
      return {};
    };

    bridge.onrequestdisplaymode = async (params) => {
      const requestedMode = params.mode ?? 'inline';
      const actualMode =
        requestedMode === 'fullscreen' && this.options.allowFullscreen === false
          ? 'inline'
          : this.options.onDisplayModeRequest
            ? this.options.onDisplayModeRequest(requestedMode)
            : requestedMode;
      this.displayMode = actualMode;
      return { mode: actualMode };
    };

    bridge.onsizechange = (params) => {
      this.options.onSizeChange?.(params);
    };

    bridge.onloggingmessage = (params) => {
      // Keep parity with custom bridge behavior.
      console.log('[MCP App]', params);
    };

    bridge.oninitialized = () => {
      this.viewInitialized = true;
      this.flushInitialPayloads();
      this.flushPendingState();
    };

    bridge.onsandboxready = () => {
      // The container handles sandbox-ready notifications and calls sendResourceToSandbox.
    };

    await bridge.connect(new sdk.PostMessageTransport(targetWindow, targetWindow));
    if (this.destroyed) {
      await bridge.close();
      return;
    }

    this.bridge = bridge;
    this.flushPendingState();
  }

  private flushInitialPayloads(): void {
    if (!this.bridge || !this.viewInitialized || this.initialPayloadSent || this.destroyed) {
      return;
    }

    this.initialPayloadSent = true;
    if (this.options.toolArguments) {
      void this.bridge.sendToolInput({ arguments: this.options.toolArguments });
    }
    if (this.options.toolResult) {
      void this.bridge.sendToolResult(this.options.toolResult as Record<string, unknown>);
    }
  }

  private flushPendingState(): void {
    if (!this.bridge || this.destroyed) {
      return;
    }

    if (this.pendingHostContext) {
      this.bridge.setHostContext(this.pendingHostContext);
      this.pendingHostContext = null;
    }

    if (this.pendingSandboxResource) {
      this.bridge.sendSandboxResourceReady(this.pendingSandboxResource);
      this.pendingSandboxResource = null;
    }
  }

  sendResourceToSandbox(
    html: string,
    csp?: Parameters<
      import('@modelcontextprotocol/ext-apps/app-bridge').AppBridge['sendSandboxResourceReady']
    >[0]['csp'],
    permissions?: Parameters<
      import('@modelcontextprotocol/ext-apps/app-bridge').AppBridge['sendSandboxResourceReady']
    >[0]['permissions'],
  ): void {
    if (this.destroyed) {
      return;
    }
    this.pendingSandboxResource = { html, csp, permissions };
    this.flushPendingState();
  }

  sendContextUpdate(
    theme: 'light' | 'dark',
    displayMode: 'inline' | 'fullscreen' | 'pip' = 'inline',
  ): void {
    if (this.destroyed) {
      return;
    }
    this.displayMode = displayMode;
    this.pendingHostContext = getHostContext(
      theme,
      this.displayMode,
      this.getContainerDimensions(),
      this.options.allowFullscreen !== false,
    );
    this.flushPendingState();
  }

  async teardownResource(params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.viewInitialized || !this.bridge || this.destroyed) {
      return {};
    }
    return this.bridge.teardownResource(params);
  }

  destroy(): void {
    this.destroyed = true;
    this.pendingHostContext = null;
    this.pendingSandboxResource = null;
    const bridge = this.bridge;
    this.bridge = null;
    if (bridge) {
      void bridge.close();
    }
  }
}
