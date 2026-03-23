import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import MCPAppContainer from '../MCPAppContainer';
import { MessagesViewContext } from '~/Providers/MessagesViewContext';

const bridgeInstances: Array<{
  options: any;
  start: jest.Mock;
  destroy: jest.Mock;
  teardownResource: jest.Mock;
  sendContextUpdate: jest.Mock;
  sendResourceToSandbox: jest.Mock;
}> = [];

jest.mock('@librechat/client', () => {
  const React = require('react');
  return {
    ThemeContext: React.createContext({ theme: 'light' }),
    isDark: () => false,
  };
});

jest.mock('../createMCPAppBridge', () => ({
  createMCPAppBridge: jest.fn().mockImplementation((options: any) => {
    const instance = {
      options,
      start: jest.fn(),
      destroy: jest.fn(),
      teardownResource: jest.fn().mockResolvedValue({}),
      sendContextUpdate: jest.fn(),
      sendResourceToSandbox: jest.fn(),
    };
    bridgeInstances.push(instance);
    return instance;
  }),
}));

describe('MCPAppContainer fullscreen lifecycle', () => {
  const ask = jest.fn();
  const setMcpAppModelContext = jest.fn();
  const viewContextValue = {
    conversation: null,
    conversationId: null,
    isSubmitting: false,
    abortScroll: false,
    setAbortScroll: jest.fn(),
    ask,
    regenerate: jest.fn(),
    handleContinue: jest.fn(),
    mcpAppModelContext: null,
    setMcpAppModelContext,
    index: 0,
    latestMessage: null,
    setLatestMessage: jest.fn(),
    getMessages: jest.fn(() => []),
    setMessages: jest.fn(),
  } as const;

  const renderWithContext = (node: React.ReactNode) =>
    render(<MessagesViewContext.Provider value={viewContextValue as any}>{node}</MessagesViewContext.Provider>);

  beforeEach(() => {
    bridgeInstances.length = 0;
    jest.clearAllMocks();
    (global.fetch as unknown as jest.Mock | undefined)?.mockReset?.();
    global.fetch = jest.fn().mockImplementation(
      () => new Promise(() => undefined),
    ) as unknown as typeof fetch;
  });

  it('keeps the same bridge/iframe instance when switching to fullscreen', async () => {
    renderWithContext(
      <MCPAppContainer
        html="<html><head></head><body>app</body></html>"
        resourceMeta={null}
        serverName="calendar"
        toolResult={{ ok: true }}
        toolArguments={{ id: '123' }}
      />,
    );

    const inlineIframe = screen.getByTitle('MCP App') as HTMLIFrameElement;
    expect(bridgeInstances).toHaveLength(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: inlineIframe.contentWindow,
          data: { method: 'ui/notifications/sandbox-proxy-ready' },
        }),
      );
    });

    expect(bridgeInstances[0].sendResourceToSandbox).toHaveBeenCalledTimes(1);

    act(() => {
      bridgeInstances[0].options.onDisplayModeRequest('fullscreen');
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Close fullscreen')).toBeInTheDocument();
    });

    const fullscreenIframe = screen.getByTitle('MCP App') as HTMLIFrameElement;
    expect(fullscreenIframe).toBe(inlineIframe);
    expect(bridgeInstances).toHaveLength(1);
    expect(bridgeInstances[0].destroy).not.toHaveBeenCalled();
  });

  it('does not re-send sandbox resource on fullscreen transition, preserving app state', async () => {
    renderWithContext(
      <MCPAppContainer
        html="<html><head></head><body>app</body></html>"
        resourceMeta={null}
        serverName="calendar"
        toolResult={{ ok: true }}
        toolArguments={{ id: '123' }}
      />,
    );

    const iframe = screen.getByTitle('MCP App') as HTMLIFrameElement;
    expect(bridgeInstances).toHaveLength(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: iframe.contentWindow,
          data: { method: 'ui/notifications/sandbox-proxy-ready' },
        }),
      );
    });
    expect(bridgeInstances[0].sendResourceToSandbox).toHaveBeenCalledTimes(1);

    act(() => {
      bridgeInstances[0].options.onDisplayModeRequest('fullscreen');
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Close fullscreen')).toBeInTheDocument();
    });

    // Even if a proxy-ready signal arrives again during transition, the host should
    // not re-inject initial HTML, which would reset app state (e.g. PDP -> carousel).
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: iframe.contentWindow,
          data: { method: 'ui/notifications/sandbox-proxy-ready' },
        }),
      );
    });

    expect(bridgeInstances[0].sendResourceToSandbox).toHaveBeenCalledTimes(1);
  });

  it('restores inline view after closing fullscreen without remounting bridge', async () => {
    const { container } = renderWithContext(
      <MCPAppContainer
        html="<html><head></head><body>app</body></html>"
        resourceMeta={null}
        serverName="calendar"
        toolResult={{ ok: true }}
        toolArguments={{ id: '123' }}
      />,
    );

    const iframe = screen.getByTitle('MCP App') as HTMLIFrameElement;
    expect(bridgeInstances).toHaveLength(1);

    act(() => {
      bridgeInstances[0].options.onDisplayModeRequest('fullscreen');
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Close fullscreen')).toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByLabelText('Close fullscreen'));

    await waitFor(() => {
      expect(screen.queryByLabelText('Close fullscreen')).not.toBeInTheDocument();
    });

    const inlineContainer = container.querySelector('.mcp-app-container') as HTMLElement;
    expect(inlineContainer).toBeTruthy();
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByTitle('MCP App')).toBe(iframe);
    expect(bridgeInstances).toHaveLength(1);
    expect(bridgeInstances[0].destroy).not.toHaveBeenCalled();
  });

  it('preserves inline requested height after fullscreen close', async () => {
    const { container } = renderWithContext(
      <MCPAppContainer
        html="<html><head></head><body>app</body></html>"
        resourceMeta={null}
        serverName="calendar"
        toolResult={{ ok: true }}
        toolArguments={{ id: '123' }}
      />,
    );

    expect(bridgeInstances).toHaveLength(1);
    act(() => {
      bridgeInstances[0].options.onSizeChange({ height: 320 });
    });

    const inlineContainer = container.querySelector('.mcp-app-container') as HTMLElement;
    expect(inlineContainer.style.height).toBe('320px');

    act(() => {
      bridgeInstances[0].options.onDisplayModeRequest('fullscreen');
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Close fullscreen')).toBeInTheDocument();
    });

    // Fullscreen resizes should not overwrite saved inline size.
    act(() => {
      bridgeInstances[0].options.onSizeChange({ height: 900 });
    });

    fireEvent.click(screen.getByLabelText('Close fullscreen'));

    await waitFor(() => {
      expect(screen.queryByLabelText('Close fullscreen')).not.toBeInTheDocument();
    });

    expect(inlineContainer.style.height).toBe('320px');
  });

  it('enforces maxHeight from resource metadata for inline resize requests', () => {
    const { container } = renderWithContext(
      <MCPAppContainer
        html="<html><head></head><body>app</body></html>"
        resourceMeta={{ ui: { maxHeight: 280 } }}
        serverName="calendar"
        toolResult={{ ok: true }}
        toolArguments={{ id: '123' }}
      />,
    );

    expect(bridgeInstances).toHaveLength(1);
    act(() => {
      bridgeInstances[0].options.onSizeChange({ height: 900 });
    });

    const inlineContainer = container.querySelector('.mcp-app-container') as HTMLElement;
    expect(inlineContainer.style.height).toBe('280px');
  });

  it('keeps inline mode when fullscreen is disallowed by resource metadata', async () => {
    renderWithContext(
      <MCPAppContainer
        html="<html><head></head><body>app</body></html>"
        resourceMeta={{ ui: { allowFullscreen: false } }}
        serverName="calendar"
        toolResult={{ ok: true }}
        toolArguments={{ id: '123' }}
      />,
    );

    expect(bridgeInstances).toHaveLength(1);
    let mode;
    act(() => {
      mode = bridgeInstances[0].options.onDisplayModeRequest('fullscreen');
    });

    expect(mode).toBe('inline');
    await waitFor(() => {
      expect(screen.queryByLabelText('Close fullscreen')).not.toBeInTheDocument();
    });
  });

  it('uses flush inline geometry without right-edge overdraw', async () => {
    const { container } = renderWithContext(
      <MCPAppContainer
        html="<html><head></head><body>app</body></html>"
        resourceMeta={null}
        serverName="calendar"
        toolResult={{ ok: true }}
        toolArguments={{ id: '123' }}
      />,
    );

    expect(bridgeInstances).toHaveLength(1);

    const anchor = container.querySelector('.mcp-app-container > div') as HTMLDivElement;
    expect(anchor).toBeTruthy();
    const scrollViewport = anchor.parentElement as HTMLDivElement;
    scrollViewport.classList.add('scrollbar-gutter-stable');

    const anchorRect = {
      x: 120.75,
      y: 40,
      width: 345.25,
      height: 200,
      top: 40,
      right: 466,
      bottom: 240,
      left: 120.75,
      toJSON: () => ({}),
    } as DOMRect;

    const viewportRect = {
      x: 0,
      y: 80,
      width: 900,
      height: 620,
      top: 80,
      right: 900,
      bottom: 700,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect;

    Object.defineProperty(anchor, 'getBoundingClientRect', {
      configurable: true,
      value: jest.fn(() => anchorRect),
    });
    Object.defineProperty(scrollViewport, 'getBoundingClientRect', {
      configurable: true,
      value: jest.fn(() => viewportRect),
    });

    act(() => {
      bridgeInstances[0].options.onSizeChange({ height: 200 });
      window.dispatchEvent(new Event('resize'));
    });

    const iframe = screen.getByTitle('MCP App');
    const portalWrapper = iframe.parentElement?.parentElement?.parentElement as HTMLElement;
    await waitFor(() => {
      expect(portalWrapper.style.left).toBe('120.75px');
      expect(portalWrapper.style.width).toBe('345.25px');
      expect(portalWrapper.style.clipPath).toMatch(/^inset\(40px 0(?:px)? 0px 0(?:px)?\)$/);
    });
  });

  it('loads sandbox from opaque-origin data URL bootstrap', async () => {
    (global.fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => '<!DOCTYPE html><html><body>sandbox</body></html>',
    });

    renderWithContext(
      <MCPAppContainer
        html="<html><head></head><body>app</body></html>"
        resourceMeta={null}
        serverName="calendar"
        toolResult={{ ok: true }}
        toolArguments={{ id: '123' }}
      />,
    );

    const iframe = screen.getByTitle('MCP App') as HTMLIFrameElement;
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/mcp/sandbox', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      expect(iframe.getAttribute('src')).toContain('data:text/html');
    });
  });

  it('forwards ui/message and ui/update-model-context callbacks into chat context handlers', () => {
    renderWithContext(
      <MCPAppContainer
        html="<html><head></head><body>app</body></html>"
        resourceMeta={null}
        serverName="calendar"
        toolResult={{ ok: true }}
        toolArguments={{ id: '123' }}
      />,
    );

    expect(bridgeInstances).toHaveLength(1);
    act(() => {
      bridgeInstances[0].options.onMessage({ role: 'user', content: [{ type: 'text', text: 'hello' }] });
    });
    expect(ask).toHaveBeenCalledWith({ text: 'hello' });

    act(() => {
      bridgeInstances[0].options.onModelContextUpdate({
        content: [{ type: 'text', text: 'ctx' }],
        structuredContent: { key: 'value' },
      });
    });
    expect(setMcpAppModelContext).toHaveBeenCalledWith({
      content: [{ type: 'text', text: 'ctx' }],
      structuredContent: { key: 'value' },
    });

    act(() => {
      bridgeInstances[0].options.onModelContextUpdate({ content: [], structuredContent: {} });
    });
    expect(setMcpAppModelContext).toHaveBeenCalledWith(null);
  });
});
