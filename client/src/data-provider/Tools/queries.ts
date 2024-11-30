import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
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
