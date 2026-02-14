import { MCPAppBridge } from '../MCPAppBridge';
import { callMCPAppTool } from '../mcpAppUtils';

jest.mock('../mcpAppUtils', () => ({
  callMCPAppTool: jest.fn(),
  fetchMCPResource: jest.fn(),
}));

function createBridge(overrides?: Partial<ConstructorParameters<typeof MCPAppBridge>[0]>) {
  const postMessage = jest.fn();
  const contentWindow = {
    postMessage,
  } as unknown as Window;

  const iframe = {
    contentWindow,
  } as HTMLIFrameElement;

  const bridge = new MCPAppBridge({
    iframe,
    serverName: 'calendar',
    theme: 'light',
    ...overrides,
  });

  return { bridge, postMessage, contentWindow };
}

describe('MCPAppBridge protocol compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('responds to initialize with stable ext-apps fields', () => {
    const { bridge, postMessage, contentWindow } = createBridge();
    bridge.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: contentWindow,
        data: {
          jsonrpc: '2.0',
          id: 1,
          method: 'ui/initialize',
          params: {
            protocolVersion: '2026-01-26',
            appInfo: { name: 'app', version: '1.0.0' },
            appCapabilities: {},
          },
        },
      }),
    );

    expect(postMessage).toHaveBeenCalled();
    const initializeResponse = postMessage.mock.calls.find((call) => call[0]?.id === 1)?.[0];
    expect(initializeResponse).toBeDefined();
    expect(initializeResponse.result).toMatchObject({
      protocolVersion: '2026-01-26',
      hostInfo: { name: 'LibreChat', version: '1.0.0' },
      hostCapabilities: expect.objectContaining({
        openLinks: {},
        serverTools: { listChanged: false },
        serverResources: { listChanged: false },
      }),
      hostContext: expect.objectContaining({
        displayMode: 'inline',
        containerDimensions: expect.objectContaining({
          maxHeight: expect.any(Number),
          maxWidth: expect.any(Number),
        }),
      }),
    });
    // Legacy compatibility field for older app runtimes.
    expect(initializeResponse.result.capabilities).toEqual({
      tools: { call: true },
      resources: { read: true },
    });
  });

  it('sends tool-input exactly once after initialized, including empty arguments', () => {
    const { bridge, postMessage, contentWindow } = createBridge({
      toolArguments: undefined,
    });
    bridge.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: contentWindow,
        data: {
          jsonrpc: '2.0',
          method: 'ui/notifications/initialized',
          params: {},
        },
      }),
    );

    const toolInputNotifications = postMessage.mock.calls
      .map((call) => call[0])
      .filter((msg) => msg?.method === 'ui/notifications/tool-input');
    expect(toolInputNotifications).toHaveLength(1);
    expect(toolInputNotifications[0].params).toEqual({ arguments: {} });
  });

  it('handles display mode requests and content-block ui/message payloads', () => {
    const onDisplayModeRequest = jest.fn().mockReturnValue('fullscreen');
    const onMessage = jest.fn();
    const { bridge, postMessage, contentWindow } = createBridge({
      onDisplayModeRequest,
      onMessage,
    });
    bridge.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: contentWindow,
        data: {
          jsonrpc: '2.0',
          id: 2,
          method: 'ui/message',
          params: {
            role: 'user',
            content: [{ type: 'text', text: 'hello from app' }],
          },
        },
      }),
    );

    expect(onMessage).toHaveBeenCalledWith({
      role: 'user',
      content: [{ type: 'text', text: 'hello from app' }],
    });
    const messageResponse = postMessage.mock.calls.find((call) => call[0]?.id === 2)?.[0];
    expect(messageResponse.result).toEqual({});

    window.dispatchEvent(
      new MessageEvent('message', {
        source: contentWindow,
        data: {
          jsonrpc: '2.0',
          id: 3,
          method: 'ui/request-display-mode',
          params: { mode: 'fullscreen' },
        },
      }),
    );

    expect(onDisplayModeRequest).toHaveBeenCalledWith('fullscreen');
    const modeResponse = postMessage.mock.calls.find((call) => call[0]?.id === 3)?.[0];
    expect(modeResponse.result).toEqual({ mode: 'fullscreen' });

    bridge.sendContextUpdate('light', 'fullscreen');
    let contextUpdate = postMessage.mock.calls
      .map((call) => call[0])
      .find((msg) => msg?.method === 'ui/notifications/host-context-changed');
    expect(contextUpdate).toBeUndefined();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: contentWindow,
        data: {
          jsonrpc: '2.0',
          method: 'ui/notifications/initialized',
          params: {},
        },
      }),
    );

    contextUpdate = postMessage.mock.calls
      .map((call) => call[0])
      .find((msg) => msg?.method === 'ui/notifications/host-context-changed');
    expect(contextUpdate).toBeDefined();
    expect(contextUpdate.params).toEqual(
      expect.objectContaining({
        displayMode: 'fullscreen',
        containerDimensions: expect.objectContaining({
          maxHeight: expect.any(Number),
          maxWidth: expect.any(Number),
        }),
      }),
    );
  });

  it('forces inline display mode when fullscreen is disabled', () => {
    const onDisplayModeRequest = jest.fn().mockReturnValue('fullscreen');
    const { bridge, postMessage, contentWindow } = createBridge({
      onDisplayModeRequest,
      allowFullscreen: false,
    });
    bridge.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: contentWindow,
        data: {
          jsonrpc: '2.0',
          id: 4,
          method: 'ui/request-display-mode',
          params: { mode: 'fullscreen' },
        },
      }),
    );

    expect(onDisplayModeRequest).toHaveBeenCalledWith('inline');
    const modeResponse = postMessage.mock.calls.find((call) => call[0]?.id === 4)?.[0];
    expect(modeResponse.result).toEqual({ mode: 'inline' });

    bridge.sendContextUpdate('light', 'fullscreen');
    window.dispatchEvent(
      new MessageEvent('message', {
        source: contentWindow,
        data: {
          jsonrpc: '2.0',
          method: 'ui/notifications/initialized',
          params: {},
        },
      }),
    );

    const contextUpdate = postMessage.mock.calls
      .map((call) => call[0])
      .find((msg) => msg?.method === 'ui/notifications/host-context-changed');
    expect(contextUpdate.params).toEqual(
      expect.objectContaining({
        displayMode: 'inline',
        availableDisplayModes: ['inline'],
      }),
    );
  });

  it('enforces app-declared availableDisplayModes from ui/initialize', () => {
    const onDisplayModeRequest = jest.fn().mockReturnValue('fullscreen');
    const { bridge, postMessage, contentWindow } = createBridge({
      onDisplayModeRequest,
    });
    bridge.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: contentWindow,
        data: {
          jsonrpc: '2.0',
          id: 8,
          method: 'ui/initialize',
          params: {
            protocolVersion: '2026-01-26',
            appInfo: { name: 'app', version: '1.0.0' },
            appCapabilities: {
              availableDisplayModes: ['inline'],
            },
          },
        },
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        source: contentWindow,
        data: {
          jsonrpc: '2.0',
          id: 9,
          method: 'ui/request-display-mode',
          params: { mode: 'fullscreen' },
        },
      }),
    );

    const modeResponse = postMessage.mock.calls.find((call) => call[0]?.id === 9)?.[0];
    expect(modeResponse.result).toEqual({ mode: 'inline' });
    expect(onDisplayModeRequest).toHaveBeenCalledWith('inline');
    expect(onDisplayModeRequest).not.toHaveBeenCalledWith('fullscreen');
  });

  it('sends tool-cancelled notification when app tool call is cancelled', async () => {
    (callMCPAppTool as jest.Mock).mockRejectedValueOnce(new Error('request cancelled'));
    const { bridge, postMessage, contentWindow } = createBridge();
    bridge.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: contentWindow,
        data: {
          jsonrpc: '2.0',
          method: 'ui/notifications/initialized',
          params: {},
        },
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        source: contentWindow,
        data: {
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: { name: 'test', arguments: {} },
        },
      }),
    );

    await Promise.resolve();

    const toolCancelled = postMessage.mock.calls
      .map((call) => call[0])
      .find((msg) => msg?.method === 'ui/notifications/tool-cancelled');
    expect(toolCancelled).toBeDefined();
    expect(toolCancelled.params).toEqual({ reason: 'request cancelled' });
  });
});
