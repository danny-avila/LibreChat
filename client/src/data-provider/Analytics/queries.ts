import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import store from '~/store';

interface InteractionAnalyticsParams {
  from?: string;
  to?: string;
}

interface InteractionRow {
  conversationId: string | null;
  promptLength: number;
  responseLength: number;
  latencyMs: number;
  provider: 'mock';
  status: 'success' | 'error';
  createdAt: string;
}

interface InteractionAnalyticsResponse {
  summary: {
    total: number;
    successRate: number;
    avgLatencyMs: number;
  };
  series: Array<{ date: string; count: number }>;
  recent: InteractionRow[];
}

interface MockInteractionRequest {
  prompt: string;
  conversationId?: string;
}

interface MockInteractionResponse {
  answer: string;
  latencyMs: number;
}

interface AnalyticsService {
  getInteractionAnalytics: (
    params?: InteractionAnalyticsParams,
  ) => Promise<InteractionAnalyticsResponse>;
  sendMockInteraction: (payload: MockInteractionRequest) => Promise<MockInteractionResponse>;
}

const analyticsService = dataService as unknown as AnalyticsService;
const interactionAnalyticsQueryKey = QueryKeys.health.replace('health', 'interactionAnalytics');

export const useGetInteractionAnalyticsQuery = (
  params: InteractionAnalyticsParams,
  config?: UseQueryOptions<InteractionAnalyticsResponse>,
): QueryObserverResult<InteractionAnalyticsResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);

  return useQuery<InteractionAnalyticsResponse>(
    [interactionAnalyticsQueryKey, params],
    () => analyticsService.getInteractionAnalytics(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};

export const useSendMockInteractionMutation = () => {
  return useMutation((payload: MockInteractionRequest) => analyticsService.sendMockInteraction(payload));
};