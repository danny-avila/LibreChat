import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryKeys, dataService } from 'librechat-data-provider';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import type { MCPServersResponse, MCPConnectionStatusResponse } from 'librechat-data-provider';
import { useMCPConnectionStatusQuery } from '../../Tools/queries';
import { useMCPToolsQuery } from '../queries';

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

const catalog: MCPServersResponse = { servers: {} };
const connected: MCPConnectionStatusResponse = {
  success: true,
  connectionStatus: { test: { requiresOAuth: false, connectionState: 'connected' } },
};
const disconnected: MCPConnectionStatusResponse = {
  success: true,
  connectionStatus: { test: { requiresOAuth: false, connectionState: 'disconnected' } },
};
const changedCatalog: MCPServersResponse = {
  servers: {
    test: { name: 'test', icon: '', authenticated: true, authConfig: [], tools: [] },
  },
};

function useCatalogQueries(enabled = true) {
  useMCPToolsQuery({ enabled });
  useMCPConnectionStatusQuery({ enabled });
}

describe('MCP cache freshness', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    jest.useFakeTimers();
    focusManager.setFocused(true);
    onlineManager.setOnline(true);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([QueryKeys.mcpTools], catalog);
    client.setQueryData([QueryKeys.mcpConnectionStatus], connected);
    jest.spyOn(dataService, 'getMCPTools').mockResolvedValue(changedCatalog);
    jest.spyOn(dataService, 'getMCPConnectionStatus').mockResolvedValue(disconnected);
  });

  afterEach(() => {
    client.clear();
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
    jest.useRealTimers();
  });

  it('reconciles server-side changes at bounded intervals without sending messages', async () => {
    const { rerender, unmount } = renderHook(() => useCatalogQueries(), { wrapper });
    rerender();
    expect(dataService.getMCPTools).not.toHaveBeenCalled();
    expect(dataService.getMCPConnectionStatus).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(dataService.getMCPConnectionStatus).toHaveBeenCalledTimes(1);
    expect(client.getQueryData([QueryKeys.mcpConnectionStatus])).toEqual(disconnected);
    expect(dataService.getMCPTools).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(270_000);
    });
    expect(dataService.getMCPTools).toHaveBeenCalledTimes(1);
    expect(client.getQueryData([QueryKeys.mcpTools])).toEqual(changedCatalog);
    unmount();
  });

  it('does not poll while the browser is hidden and refreshes stale data on focus', async () => {
    focusManager.setFocused(false);
    const { unmount } = renderHook(() => useCatalogQueries(), { wrapper });
    await act(async () => {
      jest.advanceTimersByTime(300_001);
    });
    expect(dataService.getMCPTools).not.toHaveBeenCalled();
    expect(dataService.getMCPConnectionStatus).not.toHaveBeenCalled();

    await act(async () => {
      focusManager.setFocused(true);
    });
    expect(dataService.getMCPTools).toHaveBeenCalledTimes(1);
    expect(dataService.getMCPConnectionStatus).toHaveBeenCalledTimes(1);
    unmount();
  });

  it.each(['mount', 'reconnect'] as const)('refreshes stale data on %s', async (event) => {
    jest.advanceTimersByTime(300_001);
    if (event === 'reconnect') {
      onlineManager.setOnline(false);
    }
    const { unmount } = renderHook(() => useCatalogQueries(), { wrapper });
    await act(async () => {
      onlineManager.setOnline(true);
    });
    expect(dataService.getMCPTools).toHaveBeenCalledTimes(1);
    expect(dataService.getMCPConnectionStatus).toHaveBeenCalledTimes(1);
    expect(client.getQueryData([QueryKeys.mcpTools])).toEqual(changedCatalog);
    expect(client.getQueryData([QueryKeys.mcpConnectionStatus])).toEqual(disconnected);
    unmount();
  });

  it('keeps disabled queries idle across polling, focus, and reconnect', async () => {
    const { unmount } = renderHook(() => useCatalogQueries(false), { wrapper });
    await act(async () => {
      jest.advanceTimersByTime(600_000);
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    expect(dataService.getMCPTools).not.toHaveBeenCalled();
    expect(dataService.getMCPConnectionStatus).not.toHaveBeenCalled();
    unmount();
  });
});
