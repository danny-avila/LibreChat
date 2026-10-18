import { PrincipalType } from 'librechat-data-provider';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import { QueryClient, QueryClientProvider } from '~/admin/query';
import { useConfigBaseline } from './baseline';

const mockServer = {
  getBaseConfigFn: jest.fn(),
  getResolvedConfigFn: jest.fn(),
};

jest.mock('~/admin/api', () => ({
  baseConfigOptions: {
    queryKey: ['baseConfig'],
    queryFn: () => mockServer.getBaseConfigFn(),
    retry: false,
  },
  getResolvedConfigFn: (...args: unknown[]) => mockServer.getResolvedConfigFn(...args),
  getLangfuseConnectionFn: jest.fn(),
  LANGFUSE_CONNECTION_QUERY_KEY: ['langfuse'],
}));

const BASE: t.ScopeSelection = { type: 'BASE' };
const USER: t.ScopeSelection = {
  type: 'SCOPE',
  scope: {
    principalType: PrincipalType.ROLE,
    principalId: 'USER',
    name: 'USER',
    priority: 10,
    isActive: true,
  },
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useConfigBaseline', () => {
  beforeEach(() => {
    mockServer.getBaseConfigFn.mockReset();
    mockServer.getResolvedConfigFn.mockReset();
  });

  it('is pending until the base config arrives, then ready', async () => {
    let resolve: (value: { config: t.ConfigRecord }) => void = () => undefined;
    mockServer.getBaseConfigFn.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useConfigBaseline(BASE), { wrapper: wrapper() });
    expect(result.current.status).toBe('pending');
    act(() => resolve({ config: {} }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('reports a failed base config and retries it', async () => {
    mockServer.getBaseConfigFn.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useConfigBaseline(BASE), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('boom');
    mockServer.getBaseConfigFn.mockResolvedValueOnce({ config: {} });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('in a profile, also waits for and reports the profile overrides', async () => {
    mockServer.getBaseConfigFn.mockResolvedValue({ config: {} });
    mockServer.getResolvedConfigFn.mockRejectedValueOnce(new Error('scope down'));
    const { result } = renderHook(() => useConfigBaseline(USER), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('scope down');
    mockServer.getResolvedConfigFn.mockResolvedValueOnce({ resolvedConfig: {}, changedPaths: [] });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});
