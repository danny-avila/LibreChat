import { createElement } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dataService, QueryKeys, EModelEndpoint, PermissionBits } from 'librechat-data-provider';
import type { AgentListResponse } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { defaultAgentParams, useListAgentsQuery } from '../queries';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      listAgents: jest.fn(),
    },
  };
});

const listAgents = dataService.listAgents as jest.MockedFunction<typeof dataService.listAgents>;

const page = (ids: string[], after: string | null): AgentListResponse =>
  ({
    object: 'list',
    data: ids.map((id) => ({ id, name: id })),
    has_more: after != null,
    after,
    first_id: ids[0] ?? '',
    last_id: ids[ids.length - 1] ?? '',
  }) as unknown as AgentListResponse;

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };

const renderListAgents = (params: Parameters<typeof useListAgentsQuery>[0]) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  /** The hook is gated on the agents endpoint being configured. */
  queryClient.setQueryData([QueryKeys.endpoints], { [EModelEndpoint.agents]: {} });
  return renderHook(() => useListAgentsQuery(params), {
    wrapper: createWrapper(queryClient),
  });
};

describe('useListAgentsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests the server maximum page size so a typical agent set resolves in one round trip', async () => {
    listAgents.mockResolvedValue(page(['a', 'b'], null));

    const { result } = renderListAgents({ requiredPermission: PermissionBits.VIEW });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listAgents).toHaveBeenCalledTimes(1);
    expect(listAgents).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1000, requiredPermission: PermissionBits.VIEW }),
    );
  });

  it('keeps the walk page size when a caller supplies a smaller limit', async () => {
    listAgents.mockResolvedValue(page(['a'], null));

    const { result } = renderListAgents({ limit: 10, requiredPermission: PermissionBits.VIEW });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listAgents).toHaveBeenCalledWith(expect.objectContaining({ limit: 1000 }));
  });

  it('does not carry a page size in the default params', async () => {
    expect(defaultAgentParams.limit).toBeUndefined();
  });

  it('still walks every page and flattens the result when the server returns a cursor', async () => {
    listAgents
      .mockResolvedValueOnce(page(['a', 'b'], 'cursor-1'))
      .mockResolvedValueOnce(page(['c'], null));

    const { result } = renderListAgents({ requiredPermission: PermissionBits.VIEW });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listAgents).toHaveBeenCalledTimes(2);
    expect(listAgents).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1' }));
    expect(result.current.data?.data.map((agent) => agent.id)).toEqual(['a', 'b', 'c']);
    expect(result.current.data?.has_more).toBe(false);
  });
});
