import { useQuery } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useVerifyAgentToolAuth = (
  params: t.VerifyToolAuthParams,
  config?: Omit<
    UseQueryOptions<t.VerifyToolAuthResponse, unknown, t.VerifyToolAuthResponse>,
    'queryKey' | 'queryFn'
  >,
): UseQueryResult<t.VerifyToolAuthResponse, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.toolAuth, params.toolId],
    queryFn: () => dataService.getVerifyAgentToolAuth(params),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

export const useGetToolCalls = <TData = t.ToolCallResults>(
  params: t.GetToolCallParams,
  config?: Omit<UseQueryOptions<t.ToolCallResults, unknown, TData>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TData, unknown> => {
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
    ...config,
  });
};

export const useMCPConnectionStatusQuery = (
  config?: Omit<
    UseQueryOptions<t.MCPConnectionStatusResponse, unknown, t.MCPConnectionStatusResponse>,
    'queryKey' | 'queryFn'
  >,
): UseQueryResult<t.MCPConnectionStatusResponse, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.mcpConnectionStatus],
    queryFn: () => dataService.getMCPConnectionStatus(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    // 10 seconds
    staleTime: 10000,
    ...config,
  });
};

export const useMCPAuthValuesQuery = (
  serverName: string,
  config?: Omit<
    UseQueryOptions<t.MCPAuthValuesResponse, unknown, t.MCPAuthValuesResponse>,
    'queryKey' | 'queryFn'
  >,
): UseQueryResult<t.MCPAuthValuesResponse, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.mcpAuthValues, serverName],
    queryFn: () => dataService.getMCPAuthValues(serverName),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    enabled: !!serverName,
    ...config,
  });
};
