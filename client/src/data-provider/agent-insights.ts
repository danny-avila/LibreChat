/**
 * Data provider for Agent Insights Service
 * Fetches data from the agent-insights-service backend
 */

import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';

// Base URL for agent-insights service
const AGENT_INSIGHTS_BASE_URL = import.meta.env.VITE_AGENT_INSIGHTS_URL || 'http://localhost:8001';

// Types for agent insights
export interface AgentOutput {
  agent_name: string;
  timestamp: string;
  response: string;
  tool_calls: Array<Record<string, unknown>>;
  usage: Record<string, number>;
  model: string;
  iterations: number;
  prompt?: string;
}

export interface AgentSummary {
  agent_name: string;
  display_name: string;
  description: string;
  last_run?: string;
  schedule: string;
  preview?: string;
}

export interface AgentHistoryResponse {
  agent: string;
  outputs: AgentOutput[];
}

export interface AgentLatestResponse {
  agents: AgentOutput[];
}

export interface AgentSearchResponse {
  query: string;
  results: AgentOutput[];
}

// Query keys
export const AgentInsightsQueryKeys = {
  summaries: ['agent-insights', 'summaries'] as const,
  latest: ['agent-insights', 'latest'] as const,
  history: (agentName: string, limit: number) =>
    ['agent-insights', 'history', agentName, limit] as const,
  search: (query: string, limit: number) =>
    ['agent-insights', 'search', query, limit] as const,
};

// API functions
export const agentInsightsService = {
  getSummaries: async (): Promise<AgentSummary[]> => {
    const response = await fetch(`${AGENT_INSIGHTS_BASE_URL}/agents/summaries`);
    if (!response.ok) {
      throw new Error('Failed to fetch agent summaries');
    }
    return response.json();
  },

  getLatest: async (): Promise<AgentLatestResponse> => {
    const response = await fetch(`${AGENT_INSIGHTS_BASE_URL}/agents/latest`);
    if (!response.ok) {
      throw new Error('Failed to fetch latest agent outputs');
    }
    return response.json();
  },

  getHistory: async (agentName: string, limit: number = 10): Promise<AgentHistoryResponse> => {
    const response = await fetch(
      `${AGENT_INSIGHTS_BASE_URL}/agents/${encodeURIComponent(agentName)}/history?limit=${limit}`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch history for agent: ${agentName}`);
    }
    return response.json();
  },

  search: async (query: string, limit: number = 20): Promise<AgentSearchResponse> => {
    const response = await fetch(
      `${AGENT_INSIGHTS_BASE_URL}/agents/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
    if (!response.ok) {
      throw new Error('Failed to search agent outputs');
    }
    return response.json();
  },
};

// React Query hooks
export const useGetAgentSummaries = (
  config?: UseQueryOptions<AgentSummary[]>,
): QueryObserverResult<AgentSummary[], Error> => {
  return useQuery<AgentSummary[], Error>(
    AgentInsightsQueryKeys.summaries,
    () => agentInsightsService.getSummaries(),
    {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useGetLatestAgentOutputs = (
  config?: UseQueryOptions<AgentLatestResponse>,
): QueryObserverResult<AgentLatestResponse, Error> => {
  return useQuery<AgentLatestResponse, Error>(
    AgentInsightsQueryKeys.latest,
    () => agentInsightsService.getLatest(),
    {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useGetAgentHistory = (
  agentName: string,
  limit: number = 10,
  config?: UseQueryOptions<AgentHistoryResponse>,
): QueryObserverResult<AgentHistoryResponse, Error> => {
  return useQuery<AgentHistoryResponse, Error>(
    AgentInsightsQueryKeys.history(agentName, limit),
    () => agentInsightsService.getHistory(agentName, limit),
    {
      enabled: !!agentName,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useSearchAgentOutputs = (
  query: string,
  limit: number = 20,
  config?: UseQueryOptions<AgentSearchResponse>,
): QueryObserverResult<AgentSearchResponse, Error> => {
  return useQuery<AgentSearchResponse, Error>(
    AgentInsightsQueryKeys.search(query, limit),
    () => agentInsightsService.search(query, limit),
    {
      enabled: query.length > 0,
      staleTime: 1000 * 60, // 1 minute for search results
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};
