import { act, render, screen, waitFor } from '@testing-library/react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TStartupConfig } from 'librechat-data-provider';
import { MCPAppsPolicyProvider, useMCPAppsHost, useMCPAppsPolicy } from '../MCPAppsPolicyContext';

function PolicyProbe() {
  const policy = useMCPAppsPolicy();
  return <output>{`${policy.enabled}:${policy.legacyHtmlEnabled}`}</output>;
}

function HostProbe() {
  const { policy, userId } = useMCPAppsHost();
  return <output>{`${policy.enabled}:${policy.legacyHtmlEnabled}:${userId ?? 'none'}`}</output>;
}

function CachedPolicyProvider({ children }: { children: React.ReactNode }) {
  const { data, isSuccess, error } = useQuery<TStartupConfig>(
    ['startup-policy'],
    () => new Promise<TStartupConfig>(() => undefined),
    { retry: false },
  );
  return (
    <MCPAppsPolicyProvider startupConfig={data} ready={isSuccess && error == null}>
      {children}
    </MCPAppsPolicyProvider>
  );
}

describe('MCPAppsPolicyProvider', () => {
  it('denies executable UI without an authenticated published policy', () => {
    render(<PolicyProbe />);
    expect(screen.getByText('false:false')).toBeInTheDocument();
  });

  it('publishes only a nonempty authenticated host identity', () => {
    const config = {
      mcpApps: { enabled: true, legacyHtmlEnabled: true },
    } as TStartupConfig;
    const { rerender } = render(
      <MCPAppsPolicyProvider startupConfig={config} ready userId="   ">
        <HostProbe />
      </MCPAppsPolicyProvider>,
    );
    expect(screen.getByText('true:true:none')).toBeInTheDocument();

    rerender(
      <MCPAppsPolicyProvider startupConfig={config} ready userId="user-1">
        <HostProbe />
      </MCPAppsPolicyProvider>,
    );
    expect(screen.getByText('true:true:user-1')).toBeInTheDocument();
  });

  it('tracks the startup cache without exposing pending, missing, or malformed policy', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CachedPolicyProvider>
          <PolicyProbe />
        </CachedPolicyProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('false:false')).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData<TStartupConfig>(['startup-policy'], {
        mcpApps: { enabled: false, legacyHtmlEnabled: true },
      } as TStartupConfig);
    });
    await waitFor(() => expect(screen.getByText('false:true')).toBeInTheDocument());

    act(() => {
      queryClient.setQueryData<TStartupConfig>(['startup-policy'], {
        mcpApps: { enabled: true, legacyHtmlEnabled: true },
      } as TStartupConfig);
    });
    await waitFor(() => expect(screen.getByText('true:true')).toBeInTheDocument());

    act(() => {
      queryClient.setQueryData<TStartupConfig>(['startup-policy'], {
        mcpApps: { enabled: true, legacyHtmlEnabled: 'yes' },
      } as unknown as TStartupConfig);
    });
    await waitFor(() => expect(screen.getByText('false:false')).toBeInTheDocument());
  });

  it('denies executable UI when the startup query fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
      logger: { log: console.log, warn: console.warn, error: jest.fn() },
    });

    function FailedPolicyProvider() {
      const { data, isSuccess, error } = useQuery<TStartupConfig>(
        ['failed-startup-policy'],
        () => Promise.reject(new Error('startup unavailable')),
        { retry: false },
      );
      return (
        <MCPAppsPolicyProvider startupConfig={data} ready={isSuccess && error == null}>
          <PolicyProbe />
        </MCPAppsPolicyProvider>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <FailedPolicyProvider />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(queryClient.getQueryState(['failed-startup-policy'])?.status).toBe('error'),
    );
    expect(screen.getByText('false:false')).toBeInTheDocument();
  });
});
