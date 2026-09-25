import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Constants, MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type {
  BackgroundTaskCancelResponse,
  BackgroundTaskCancelRequest,
  BackgroundTaskIndex,
} from 'librechat-data-provider';
import type { UseQueryOptions } from '@tanstack/react-query';

const RUNNING_REFRESH_MS = 2_000;
const SUBMITTING_REFRESH_MS = 5_000;

/** Polls only while something can change: a running task, or a run that may
 *  dispatch one. An idle conversation refreshes on mount and focus alone. */
export const backgroundTasksRefetchInterval = (
  index: BackgroundTaskIndex | undefined,
  isSubmitting = false,
): number | false => {
  if (index?.tasks.some((task) => task.status === 'running') === true) {
    return RUNNING_REFRESH_MS;
  }
  return isSubmitting ? SUBMITTING_REFRESH_MS : false;
};

export const useBackgroundTasksQuery = (
  conversationId: string,
  config?: UseQueryOptions<BackgroundTaskIndex>,
  isSubmitting = false,
) =>
  useQuery<BackgroundTaskIndex>(
    [QueryKeys.backgroundTasks, conversationId],
    () => dataService.getBackgroundTasks(conversationId),
    {
      enabled:
        conversationId !== '' &&
        conversationId !== Constants.NEW_CONVO &&
        conversationId !== Constants.PENDING_CONVO,
      staleTime: 1_000,
      refetchOnWindowFocus: true,
      refetchInterval: (index) => backgroundTasksRefetchInterval(index, isSubmitting),
      refetchIntervalInBackground: false,
      ...config,
    },
  );

export type CancelBackgroundTasksVariables = {
  conversationId: string;
  body: BackgroundTaskCancelRequest;
};

export const useCancelBackgroundTasksMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<BackgroundTaskCancelResponse, Error, CancelBackgroundTasksVariables>(
    ({ conversationId, body }) => dataService.cancelBackgroundTasks(conversationId, body),
    {
      mutationKey: [MutationKeys.cancelBackgroundTasks],
      onSettled: (_data, _error, { conversationId }) =>
        queryClient.invalidateQueries([QueryKeys.backgroundTasks, conversationId]),
    },
  );
};
