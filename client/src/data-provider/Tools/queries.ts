import { useQuery } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useVerifyAgentToolAuth = (
  params: t.VerifyToolAuthParams,
  config?: UseQueryOptions<t.VerifyToolAuthResponse>,
): QueryObserverResult<t.VerifyToolAuthResponse> => {
  return useQuery({
    queryKey: [QueryKeys.toolAuth, params.toolId],
    queryFn: () => dataService.getVerifyAgentToolAuth(params),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config
  });
};

export const useGetToolCalls = <TData = t.ToolCallResults>(
  params: t.GetToolCallParams,
  config?: UseQueryOptions<t.ToolCallResults, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const { conversationId = '' } = params;
  return useQuery({
    queryKey: [QueryKeys.toolCalls, conversationId],
    queryFn: () => dataService.getToolCalls(params),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,

    enabled:
      conversationId.length > 0 &&
      conversationId !== Constants.NEW_CONVO &&
      conversationId !== Constants.PENDING_CONVO &&
      conversationId !== Constants.SEARCH,

    ...config
  });
};

export const useMCPConnectionStatusQuery = (
  config?: UseQueryOptions<t.MCPConnectionStatusResponse>,
): QueryObserverResult<t.MCPConnectionStatusResponse> => {
  return useQuery({
    queryKey: [QueryKeys.mcpConnectionStatus],
    queryFn: () => dataService.getMCPConnectionStatus(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,

    // 10 seconds
    staleTime: 10000,

    ...config
  });
};

export const useMCPAuthValuesQuery = (
  serverName: string,
  config?: UseQueryOptions<t.MCPAuthValuesResponse>,
): QueryObserverResult<t.MCPAuthValuesResponse> => {
  return useQuery({
    queryKey: [QueryKeys.mcpAuthValues, serverName],
    queryFn: () => dataService.getMCPAuthValues(serverName),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    enabled: !!serverName,
    ...config
  });
};
