import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import useMCPDeepLink from '../useMCPDeepLink';

function renderDeepLinkHook(state?: Record<string, unknown>) {
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter
        initialEntries={[{ pathname: '/c/new', state }]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        {children}
      </MemoryRouter>
    );
  }

  return renderHook(useMCPDeepLink, { wrapper: Wrapper });
}

describe('useMCPDeepLink', () => {
  it('should open dialog with initialValues from route state including valid transport', async () => {
    const { result } = renderDeepLinkHook({
      mcpName: 'My Server',
      mcpUrl: 'https://example.com/mcp',
      mcpTransport: 'sse',
    });

    await waitFor(() => {
      expect(result.current.isOpen).toBe(true);
      expect(result.current.initialValues).toEqual({
        title: 'My Server',
        url: 'https://example.com/mcp',
        type: 'sse',
      });
    });
  });

  it('should ignore an invalid mcpTransport value', async () => {
    const { result } = renderDeepLinkHook({
      mcpName: 'Server',
      mcpTransport: 'websocket',
    });

    await waitFor(() => {
      expect(result.current.isOpen).toBe(true);
      expect(result.current.initialValues).toEqual({ title: 'Server' });
      expect(result.current.initialValues).not.toHaveProperty('type');
    });
  });

  it('should not open the dialog when route state has no MCP params', async () => {
    const { result } = renderDeepLinkHook();

    expect(result.current.isOpen).toBe(false);
    expect(result.current.initialValues).toBeUndefined();
  });

  it('should clear initialValues when dialog is closed via onOpenChange', async () => {
    const { result } = renderDeepLinkHook({ mcpName: 'Server' });

    await waitFor(() => {
      expect(result.current.isOpen).toBe(true);
      expect(result.current.initialValues).toEqual({ title: 'Server' });
    });

    act(() => {
      result.current.onOpenChange(false);
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.initialValues).toBeUndefined();
  });
});
