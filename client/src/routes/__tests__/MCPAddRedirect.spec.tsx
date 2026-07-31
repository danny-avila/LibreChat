import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import MCPAddRedirect from '../MCPAddRedirect';

const createTestRouter = (initialEntry: string) =>
  createMemoryRouter(
    [
      {
        path: 'mcps/add',
        element: <MCPAddRedirect />,
      },
      {
        path: 'c/:conversationId',
        element: <div data-testid="chat-page" />,
      },
    ],
    { initialEntries: [initialEntry] },
  );

describe('MCPAddRedirect', () => {
  it('should redirect to /c/new forwarding all params via route state', async () => {
    const router = createTestRouter(
      '/mcps/add?name=My+Server&url=https://example.com/mcp&transport=sse',
    );
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/c/new');
    });

    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.state).toEqual({
      mcpName: 'My Server',
      mcpUrl: 'https://example.com/mcp',
      mcpTransport: 'sse',
    });
  });

  it('should redirect to /c/new even when no query params are provided', async () => {
    const router = createTestRouter('/mcps/add');
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/c/new');
    });

    expect(router.state.location.state).toEqual({
      mcpName: undefined,
      mcpUrl: undefined,
      mcpTransport: undefined,
    });
  });
});
