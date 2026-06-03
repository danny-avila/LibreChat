import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type {
  AnalyticsPeriod,
  AnalyticsQueryParams,
  AdminUsageResponse,
  ModelUsageResponse,
  AdminKpisResponse,
  AdminBudgetsResponse,
  UpdateBudgetRequest,
  UpdateBudgetResponse,
  ResetMonthResponse,
} from 'librechat-data-provider';

export const useAdminUsageQuery = (
  params: AnalyticsQueryParams,
): QueryObserverResult<AdminUsageResponse> => {
  return useQuery<AdminUsageResponse>(
    [QueryKeys.adminUsage, params.period.key, params.bu],
    () => dataService.getAdminUsage(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  );
};

export const useAdminModelUsageQuery = (
  params: AnalyticsQueryParams,
): QueryObserverResult<ModelUsageResponse> => {
  return useQuery<ModelUsageResponse>(
    [QueryKeys.adminModelUsage, params.period.key, params.bu],
    () => dataService.getAdminModelUsage(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  );
};

export const useAdminKpisQuery = (
  params: AnalyticsQueryParams,
): QueryObserverResult<AdminKpisResponse> => {
  return useQuery<AdminKpisResponse>(
    [QueryKeys.adminKpis, params.period.key, params.bu],
    () => dataService.getAdminKpis(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  );
};

export const useAdminPeriodsQuery = (
  config?: UseQueryOptions<{ periods: AnalyticsPeriod[] }>,
): QueryObserverResult<{ periods: AnalyticsPeriod[] }> => {
  return useQuery<{ periods: AnalyticsPeriod[] }>(
    [QueryKeys.adminPeriods],
    () => dataService.getAdminPeriods(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      staleTime: 5 * 60 * 1000,
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
