import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type {
  AdminUsageResponse,
  AdminBudgetsResponse,
  UpdateBudgetRequest,
  UpdateBudgetResponse,
  ResetMonthResponse,
} from 'librechat-data-provider';

export const useAdminUsageQuery = (
  config?: UseQueryOptions<AdminUsageResponse>,
): QueryObserverResult<AdminUsageResponse> => {
  return useQuery<AdminUsageResponse>(
    [QueryKeys.adminUsage],
    () => dataService.getAdminUsage(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      ...config,
    },
  );
};

export const useAdminBudgetsQuery = (
  config?: UseQueryOptions<AdminBudgetsResponse>,
): QueryObserverResult<AdminBudgetsResponse> => {
  return useQuery<AdminBudgetsResponse>(
    [QueryKeys.adminBudgets],
    () => dataService.getAdminBudgets(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      ...config,
    },
  );
};

export const useUpdateBudgetMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<UpdateBudgetResponse, Error, { userId: string; body: UpdateBudgetRequest }>(
    ({ userId, body }) => dataService.updateBudget(userId, body),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.adminBudgets]);
        queryClient.invalidateQueries([QueryKeys.adminUsage]);
      },
    },
  );
};

export const useResetMonthBudgetsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<ResetMonthResponse, Error, void>(() => dataService.resetMonthBudgets(), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminBudgets]);
    },
  });
};
