import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import useMCPDeepLink from '../useMCPDeepLink';

if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(
      public url: string,
      public init?: RequestInit,
    ) {}
  } as any;
}

function TestWrapper({ router }: { router: ReturnType<typeof createMemoryRouter> }) {
  return <RouterProvider router={router} />;
}

function renderDeepLinkHook(state?: Record<string, unknown>) {
  let hookResult: { current: ReturnType<typeof useMCPDeepLink> };

  function HookConsumer() {
    hookResult = { current: useMCPDeepLink() };
    return null;
  }

  const router = createMemoryRouter(
    [
      {
        path: 'c/:conversationId',
        element: <HookConsumer />,
      },
    ],
    {
      initialEntries: [{ pathname: '/c/new', state }],
    },
  );

  const renderResult = renderHook(() => hookResult!.current, {
    wrapper: ({ children }) => (
      <>
        <TestWrapper router={router} />
        {children}
      </>
    ),
  });

  return { ...renderResult, router, getHook: () => hookResult!.current };
}

describe('useMCPDeepLink', () => {
  it('should open dialog with initialValues from route state including valid transport', async () => {
    const { getHook } = renderDeepLinkHook({
      mcpName: 'My Server',
      mcpUrl: 'https://example.com/mcp',
      mcpTransport: 'sse',
    });

    await act(async () => {});

    const result = getHook();
    expect(result.isOpen).toBe(true);
    expect(result.initialValues).toEqual({
      title: 'My Server',
      url: 'https://example.com/mcp',
      type: 'sse',
    });
  });

  it('should ignore an invalid mcpTransport value', async () => {
    const { getHook } = renderDeepLinkHook({
      mcpName: 'Server',
      mcpTransport: 'websocket',
    });

    await act(async () => {});

    const result = getHook();
    expect(result.isOpen).toBe(true);
    expect(result.initialValues).toEqual({ title: 'Server' });
    expect(result.initialValues).not.toHaveProperty('type');
  });

  it('should not open the dialog when route state has no MCP params', async () => {
    const { getHook } = renderDeepLinkHook(undefined);

    await act(async () => {});

    const result = getHook();
    expect(result.isOpen).toBe(false);
    expect(result.initialValues).toBeUndefined();
  });

  it('should clear initialValues when dialog is closed via onOpenChange', async () => {
    const { getHook } = renderDeepLinkHook({ mcpName: 'Server' });

    await act(async () => {});
    expect(getHook().isOpen).toBe(true);
    expect(getHook().initialValues).toEqual({ title: 'Server' });

    act(() => {
      getHook().onOpenChange(false);
    });

    expect(getHook().isOpen).toBe(false);
    expect(getHook().initialValues).toBeUndefined();
  });
});
