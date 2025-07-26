import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { QueryKeys, request } from 'librechat-data-provider';
import type { QueryObserverResult } from '@tanstack/react-query';

export interface ConversationCostDisplay {
  conversationId: string;
  totalCost: string;
  totalCostRaw: number;
  primaryModel: string;
  totalTokens: number;
  lastUpdated: Date;
}

export interface ConversationCostSummary {
  conversationId: string;
  totalCost: number;
  costBreakdown: {
    prompt: number;
    completion: number;
    cacheWrite: number;
    cacheRead: number;
    reasoning: number;
  };
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    reasoningTokens: number;
  };
  modelBreakdown: Array<{
    model: string;
    provider: string;
    cost: number;
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      cacheWriteTokens: number;
      cacheReadTokens: number;
      reasoningTokens: number;
    };
    transactionCount: number;
  }>;
  lastUpdated: Date;
}

export interface MultipleConversationCosts {
  [conversationId: string]: ConversationCostDisplay | null;
}

/**
 * Hook to fetch cost display for a single conversation
 */
export const useConversationCost = (
  conversationId: string | undefined,
  options?: UseQueryOptions<ConversationCostDisplay | null>,
): QueryObserverResult<ConversationCostDisplay | null> => {
  return useQuery<ConversationCostDisplay | null>(
    [QueryKeys.conversationCost, conversationId],
    async () => {
      if (!conversationId) return null;

      try {
        const response = await request.get(`/api/convos/${conversationId}/cost`);
        // Ensure we always return a value, never undefined
        return response.data || null;
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null; // No cost data available
        }
        // For other errors, return null instead of throwing
        console.error('Cost fetch error:', error);
        return null;
      }
    },
    {
      enabled: !!conversationId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      ...options,
    },
  );
};

/**
 * Hook to fetch detailed cost breakdown for a single conversation
 */
export const useConversationCostDetail = (
  conversationId: string | undefined,
  options?: UseQueryOptions<ConversationCostSummary | null>,
): QueryObserverResult<ConversationCostSummary | null> => {
  return useQuery<ConversationCostSummary | null>(
    [QueryKeys.conversationCostDetail, conversationId],
    async () => {
      if (!conversationId) return null;

      try {
        const response = await request.get(`/api/convos/${conversationId}/cost?detailed=true`);
        return response.data;
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null; // No cost data available
        }
        throw error;
      }
    },
    {
      enabled: !!conversationId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      ...options,
    },
  );
};

/**
 * Hook to fetch costs for multiple conversations
 */
export const useMultipleConversationCosts = (
  conversationIds: string[],
  options?: UseQueryOptions<MultipleConversationCosts>,
): QueryObserverResult<MultipleConversationCosts> => {
  return useQuery<MultipleConversationCosts>(
    [QueryKeys.multipleConversationCosts, conversationIds],
    async () => {
      if (!conversationIds.length) return {};

      try {
        const response = await request.post('/api/convos/costs', {
          conversationIds,
        });
        return response.data;
      } catch (error) {
        console.error('Error fetching multiple conversation costs:', error);
        return {};
      }
    },
    {
      enabled: conversationIds.length > 0,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      ...options,
    },
  );
};

/**
 * Utility function to format cost for display
 */
export const formatCostDisplay = (cost: number): string => {
  if (cost < 0.001) {
    return '<$0.001';
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
};

/**
 * Utility function to get cost color based on amount
 */
export const getCostColor = (cost: number): string => {
  if (cost < 0.01) return 'text-green-600 dark:text-green-400';
  if (cost < 0.1) return 'text-yellow-600 dark:text-yellow-400';
  if (cost < 1) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
};