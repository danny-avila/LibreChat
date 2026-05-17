import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions } from '@tanstack/react-query';
import type { TScheduledTask } from 'librechat-data-provider';

/**
 * Skip the query entirely when the caller can't access the feature; the
 * backend would return 403 via `generateCheckAccess(SCHEDULED_TASKS/USE)`,
 * which floods devtools with errors during sign-out / role downgrade.
 */
type Options = Pick<UseQueryOptions<TScheduledTask[]>, 'enabled'>;

export const useGetScheduledTasks = (options?: Options) => {
  return useQuery({
    queryKey: [QueryKeys.scheduledTasks],
    queryFn: () => dataService.getScheduledTasks(),
    enabled: options?.enabled,
  });
};
