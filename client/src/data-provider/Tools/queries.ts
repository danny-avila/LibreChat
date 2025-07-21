import { useQuery } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useVerifyAgentToolAuth = (
  params: t.VerifyToolAuthParams,
  config?: UseQueryOptions<t.VerifyToolAuthResponse>,
): QueryObserverResult<t.VerifyToolAuthResponse> => {
  return useQuery<t.VerifyToolAuthResponse>(
    [QueryKeys.toolAuth, params.toolId],
    () => dataService.getVerifyAgentToolAuth(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetToolCalls = <TData = t.ToolCallResults>(
  params: t.GetToolCallParams,
  config?: UseQueryOptions<t.ToolCallResults, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const { conversationId = '' } = params;
  return useQuery<t.ToolCallResults, unknown, TData>(
    [QueryKeys.toolCalls, conversationId],
    () => dataService.getToolCalls(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled:
        conversationId.length > 0 &&
        conversationId !== Constants.NEW_CONVO &&
        conversationId !== Constants.PENDING_CONVO &&
        conversationId !== Constants.SEARCH,
      ...config,
    },
  );
};

/**
 * Hook for getting MCP connection status
 */
export const useMCPConnectionStatusQuery = <TData = t.TMCPConnectionStatusResponse>(
  config?: UseQueryOptions<t.TMCPConnectionStatusResponse, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  return useQuery<t.TMCPConnectionStatusResponse, unknown, TData>(
    [QueryKeys.mcpConnectionStatus],
    () => dataService.getMCPConnectionStatus(),
    {
      // refetchOnWindowFocus: false,
      // refetchOnReconnect: false,
      // refetchOnMount: true,
      ...config,
    },
  );
};

/**
 * Hook for getting MCP auth value flags for a specific server
 */
export const useMCPAuthValuesQuery = (
  serverName: string,
  config?: UseQueryOptions<
    { success: boolean; serverName: string; authValueFlags: Record<string, boolean> },
    unknown,
    { success: boolean; serverName: string; authValueFlags: Record<string, boolean> }
  >,
): QueryObserverResult<
  { success: boolean; serverName: string; authValueFlags: Record<string, boolean> },
  unknown
> => {
  return useQuery<
    { success: boolean; serverName: string; authValueFlags: Record<string, boolean> },
    unknown,
    { success: boolean; serverName: string; authValueFlags: Record<string, boolean> }
  >([QueryKeys.mcpAuthValues, serverName], () => dataService.getMCPAuthValues(serverName), {
    // refetchOnWindowFocus: false,
    // refetchOnReconnect: false,
    // refetchOnMount: true,
    enabled: !!serverName,
    ...config,
  });
};

/**
 * Hook for getting MCP OAuth status for a specific flow
 */
export const useMCPOAuthStatusQuery = (
  flowId: string,
  config?: UseQueryOptions<
    { status: string; completed: boolean; failed: boolean; error?: string },
    unknown,
    { status: string; completed: boolean; failed: boolean; error?: string }
  >,
): QueryObserverResult<
  { status: string; completed: boolean; failed: boolean; error?: string },
  unknown
> => {
  return useQuery<
    { status: string; completed: boolean; failed: boolean; error?: string },
    unknown,
    { status: string; completed: boolean; failed: boolean; error?: string }
  >([QueryKeys.mcpOAuthStatus, flowId], () => dataService.getMCPOAuthStatus(flowId), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
    staleTime: 1000, // Consider data stale after 1 second for polling
    enabled: !!flowId,
    ...config,
  });
};
