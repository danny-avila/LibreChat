import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';

type MailConnectionStatus = { gmail: boolean; outlook: boolean };

export const useMailConnectionStatus = (
  config?: UseQueryOptions<MailConnectionStatus>,
): QueryObserverResult<MailConnectionStatus> => {
  return useQuery<MailConnectionStatus>(
    [QueryKeys.mailConnectionStatus],
    () => dataService.getMailConnectionStatus(),
    {
      refetchOnWindowFocus: true,
      staleTime: 60000, // 1 minute
      ...config,
    },
  );
};
