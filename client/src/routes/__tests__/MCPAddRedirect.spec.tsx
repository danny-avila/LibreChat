import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import MCPAddRedirect from '../MCPAddRedirect';

const mockUseGetStartupConfig = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

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
  beforeEach(() => {
    mockUseGetStartupConfig.mockReturnValue({ data: { interface: {} }, isLoading: false });
  });

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

  it('should discard MCP params when deep links are disabled', async () => {
    mockUseGetStartupConfig.mockReturnValue({
      data: { interface: { mcpServers: { deepLinks: false } } },
      isLoading: false,
    });
    const router = createTestRouter(
      '/mcps/add?name=My+Server&url=https://example.com/mcp&transport=sse',
    );
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/c/new');
    });

    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.state).toBeNull();
  });

  it('should not redirect while startup config is loading', async () => {
    mockUseGetStartupConfig.mockReturnValue({ data: undefined, isLoading: true });
    const router = createTestRouter('/mcps/add?name=My+Server');
    render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);

    await waitFor(() => {
      expect(mockUseGetStartupConfig).toHaveBeenCalled();
    });
    expect(router.state.location.pathname).toBe('/mcps/add');
  });
});
