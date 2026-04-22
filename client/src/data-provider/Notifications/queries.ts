/* Notifications */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  QueryObserverResult,
  UseMutationOptions,
  UseQueryOptions,
} from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type {
  CreateNotificationBody,
  NotificationsListParams,
  NotificationsListResponse,
  TNotification,
} from 'librechat-data-provider';

export const useNotificationsQuery = (
  params?: NotificationsListParams,
  config?: UseQueryOptions<NotificationsListResponse>,
): QueryObserverResult<NotificationsListResponse> => {
  return useQuery<NotificationsListResponse>(
    [QueryKeys.notifications, params],
    () => dataService.getNotifications(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
    },
  );
};

export const useCreateNotificationMutation = (
  options?: UseMutationOptions<
    { created: boolean; notification: TNotification },
    Error,
    CreateNotificationBody
  >,
) => {
  const queryClient = useQueryClient();
  return useMutation((body: CreateNotificationBody) => dataService.createNotification(body), {
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries([QueryKeys.notifications]);
      options?.onSuccess?.(...args);
    },
  });
};

export const useMarkNotificationReadMutation = (
  options?: UseMutationOptions<{ updated: boolean }, Error, string>,
) => {
  const queryClient = useQueryClient();
  return useMutation((id: string) => dataService.markNotificationRead(id), {
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries([QueryKeys.notifications]);
      options?.onSuccess?.(...args);
    },
  });
};

export const useMarkAllNotificationsReadMutation = (
  options?: UseMutationOptions<{ updated: boolean; count: number }, Error, void>,
) => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.markAllNotificationsRead(), {
    mutationKey: [MutationKeys.markAllNotificationsRead],
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries([QueryKeys.notifications]);
      options?.onSuccess?.(...args);
    },
  });
};

export const useDeleteNotificationMutation = (
  options?: UseMutationOptions<void, Error, string>,
) => {
  const queryClient = useQueryClient();
  return useMutation((id: string) => dataService.deleteNotification(id), {
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries([QueryKeys.notifications]);
      options?.onSuccess?.(...args);
    },
  });
};
