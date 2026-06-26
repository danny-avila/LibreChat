import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService, EModelEndpoint, PermissionBits } from 'librechat-data-provider';
import type {
  QueryObserverResult,
  UseQueryOptions,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import { isEphemeralAgent } from '~/common';

/**
 * AGENTS
 */
export const defaultAgentParams: t.AgentListParams = {
  limit: 10,
  requiredPermission: PermissionBits.EDIT,
};

/** Walk the cursor pagination and return all pages flattened into one `AgentListResponse`. */
async function fetchAllAgentPages(params: t.AgentListParams): Promise<t.AgentListResponse> {
  const pages: t.AgentListResponse[] = [];
  let cursor: string | null | undefined = params.cursor;
  do {
    const page = await dataService.listAgents({
      ...params,
      ...(cursor ? { cursor } : {}),
    });
    pages.push(page);
    cursor = page.after;
  } while (cursor);

  const lastPage = pages[pages.length - 1];
  return {
    object: 'list',
    data: pages.flatMap((p) => p.data),
    has_more: false,
    after: undefined,
    first_id: pages[0]?.first_id ?? '',
    last_id: lastPage?.last_id ?? '',
  };
}

/**
 * Hook for getting all available tools for A
 */
export const useAvailableAgentToolsQuery = (): QueryObserverResult<t.TPlugin[]> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<t.TEndpointsConfig>([QueryKeys.endpoints]);

  const enabled = !!endpointsConfig?.[EModelEndpoint.agents];
  return useQuery<t.TPlugin[]>([QueryKeys.tools], () => dataService.getAvailableAgentTools(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    enabled,
  });
};

/**
 * Hook for listing all Agents the user has access to. Follows cursor
 * pagination internally and resolves with every page concatenated.
 * Cache key shape matches `allAgentViewAndEditQueryKeys` in `./mutations.ts`.
 */
export const useListAgentsQuery = <TData = t.AgentListResponse>(
  params: t.AgentListParams = defaultAgentParams,
  config?: UseQueryOptions<t.AgentListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<t.TEndpointsConfig>([QueryKeys.endpoints]);

  const enabled = !!endpointsConfig?.[EModelEndpoint.agents];
  return useQuery<t.AgentListResponse, unknown, TData>(
    [QueryKeys.agents, params],
    () => fetchAllAgentPages(params),
    {
      staleTime: 1000 * 5,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled,
    },
  );
};

/**
 * Hook for retrieving basic details about a single agent (VIEW permission)
 */
export const useGetAgentByIdQuery = (
  agent_id: string | null | undefined,
  config?: UseQueryOptions<t.Agent>,
): QueryObserverResult<t.Agent> => {
  const isValidAgentId = !!agent_id && !isEphemeralAgent(agent_id);

  return useQuery<t.Agent>(
    [QueryKeys.agent, agent_id],
    () =>
      dataService.getAgentById({
        agent_id: agent_id as string,
      }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: isValidAgentId && (config?.enabled ?? true),
    },
  );
};

/**
 * Hook for retrieving full agent details including sensitive configuration (EDIT permission)
 */
export const useGetExpandedAgentByIdQuery = (
  agent_id: string,
  config?: UseQueryOptions<t.Agent>,
): QueryObserverResult<t.Agent> => {
  return useQuery<t.Agent>(
    [QueryKeys.agent, agent_id, 'expanded'],
    () =>
      dataService.getExpandedAgentById({
        agent_id,
      }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

/**
 * MARKETPLACE
 */
/**
 * Hook for getting agent categories for marketplace tabs
 */
export const useGetAgentCategoriesQuery = (
  config?: UseQueryOptions<t.TMarketplaceCategory[]>,
): QueryObserverResult<t.TMarketplaceCategory[]> => {
  return useQuery<t.TMarketplaceCategory[]>(
    [QueryKeys.agentCategories],
    () => dataService.getAgentCategories(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      ...config,
    },
  );
};

/**
 * Hook for infinite loading of marketplace agents with cursor-based pagination
 */
export const useMarketplaceAgentsInfiniteQuery = (
  params: {
    requiredPermission: number;
    category?: string;
    search?: string;
    limit?: number;
    promoted?: 0 | 1;
    cursor?: string; // For pagination
  },
  config?: UseInfiniteQueryOptions<t.AgentListResponse, unknown>,
) => {
  return useInfiniteQuery<t.AgentListResponse>({
    queryKey: [QueryKeys.marketplaceAgents, params],
    queryFn: ({ pageParam }) => {
      const queryParams = { ...params };
      if (pageParam) {
        queryParams.cursor = pageParam.toString();
      }
      return dataService.getMarketplaceAgents(queryParams);
    },
    getNextPageParam: (lastPage) => lastPage?.after ?? undefined,
    enabled: !!params.requiredPermission,
    keepPreviousData: true,
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};
