import { useEffect, useRef, useState } from 'react';
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
const POST_SUBMIT_DISCOVERY_MS = 10_000;

/** Poll active tasks and briefly continue discovery after a submission ends. */
export const backgroundTasksRefetchInterval = (
  index: BackgroundTaskIndex | undefined,
  isSubmitting = false,
  discoveryDeadline = 0,
  now = Date.now(),
): number | false => {
  if (index?.tasks.some((task) => task.status === 'running') === true) {
    return RUNNING_REFRESH_MS;
  }
  if (now < discoveryDeadline) return RUNNING_REFRESH_MS;
  return isSubmitting ? SUBMITTING_REFRESH_MS : false;
};

export const useBackgroundTasksQuery = (
  conversationId: string,
  config?: UseQueryOptions<BackgroundTaskIndex>,
  isSubmitting = false,
) => {
  const previous = useRef({ conversationId, isSubmitting });
  const [discoveryDeadline, setDiscoveryDeadline] = useState(0);
  const query = useQuery<BackgroundTaskIndex>(
    [QueryKeys.backgroundTasks, conversationId],
    () => dataService.getBackgroundTasks(conversationId),
    {
      enabled:
        conversationId !== '' &&
        conversationId !== Constants.NEW_CONVO &&
        conversationId !== Constants.PENDING_CONVO,
      staleTime: 1_000,
      refetchOnWindowFocus: true,
      refetchInterval: (index) =>
        backgroundTasksRefetchInterval(index, isSubmitting, discoveryDeadline),
      refetchIntervalInBackground: false,
      ...config,
    },
  );

  const { refetch } = query;
  useEffect(() => {
    const last = previous.current;
    previous.current = { conversationId, isSubmitting };
    if (last.conversationId !== conversationId) {
      setDiscoveryDeadline(0);
      return;
    }
    if (last.isSubmitting && !isSubmitting) {
      setDiscoveryDeadline(Date.now() + POST_SUBMIT_DISCOVERY_MS);
      void refetch();
    }
  }, [conversationId, isSubmitting, refetch]);

  return query;
};

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
