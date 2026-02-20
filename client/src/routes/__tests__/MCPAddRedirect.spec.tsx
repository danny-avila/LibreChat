import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import MCPAddRedirect from '../MCPAddRedirect';

if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(
      public url: string,
      public init?: RequestInit,
    ) {}
  } as any;
}

function CaptureState() {
  const location = useLocation();
  (window as any).__capturedState = location.state;
  return <div data-testid="chat-page">Chat</div>;
}

const createTestRouter = (initialEntry: string) =>
  createMemoryRouter(
    [
      {
        path: 'mcps/add',
        element: <MCPAddRedirect />,
      },
      {
        path: 'c/:conversationId',
        element: <CaptureState />,
      },
    ],
    { initialEntries: [initialEntry] },
  );

describe('MCPAddRedirect', () => {
  afterEach(() => {
    (window as any).__capturedState = undefined;
  });

  it('should redirect to /c/new forwarding all params via route state', async () => {
    const router = createTestRouter(
      '/mcps/add?mcp_name=My+Server&mcp_url=https://example.com/mcp&mcp_transport=sse',
    );
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/c/new');
    });

    expect(router.state.historyAction).toBe('REPLACE');
    expect((window as any).__capturedState).toEqual({
      mcpName: 'My Server',
      mcpUrl: 'https://example.com/mcp',
      mcpTransport: 'sse',
    });
  });

  it('should redirect to /c/new even when no query params are provided', async () => {
    const router = createTestRouter('/mcps/add');
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/c/new');
    });

    expect((window as any).__capturedState).toEqual({
      mcpName: undefined,
      mcpUrl: undefined,
      mcpTransport: undefined,
    });
  });
});
