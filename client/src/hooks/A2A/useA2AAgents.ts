import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

interface A2AAgent {
  id: string;
  name: string;
  description: string;
  status: 'online' | 'offline' | 'error' | 'unknown';
  capabilities: {
    streaming?: boolean;
    push?: boolean;
    multiTurn?: boolean;
    taskBased?: boolean;
    tools?: boolean;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  transport: 'JSONRPC' | 'HTTP+JSON' | 'GRPC';
  lastHealthCheck?: string;
  createdAt: string;
}

interface A2AAgentsResponse {
  agents: A2AAgent[];
}

interface RegisterAgentParams {
  agentCardUrl: string;
  authentication?: {
    type: 'none' | 'apikey' | 'oauth2' | 'openid' | 'http' | 'mutual_tls';
    credentials?: Record<string, string>;
    headers?: Record<string, string>;
  };
  options?: {
    timeout?: number;
    maxRetries?: number;
    enableStreaming?: boolean;
    enableTasks?: boolean;
  };
}

interface RegisterAgentResponse {
  success: boolean;
  agentId: string;
  agent: {
    id: string;
    name: string;
    description: string;
    status: string;
  };
}

/**
 * Hook for managing A2A agents
 */
export const useA2AAgents = () => {
  const queryClient = useQueryClient();

  // Fetch all A2A agents
  const {
    data: agentsData,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery<A2AAgentsResponse>({
    queryKey: ['a2a-agents'],
    queryFn: async () => {
      const response = await fetch('/api/a2a/agents', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch A2A agents: ${response.status} ${response.statusText}`);
      }

      return response.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  const agents = agentsData?.agents || [];
  const error = queryError?.message || null;

  // Register new agent mutation
  const registerMutation = useMutation<RegisterAgentResponse, Error, RegisterAgentParams>({
    mutationFn: async (params) => {
      const response = await fetch('/api/a2a/agents/register', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Failed to register agent: ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch agents list
      queryClient.invalidateQueries({ queryKey: ['a2a-agents'] });
    },
  });

  // Unregister agent mutation
  const unregisterMutation = useMutation<void, Error, string>({
    mutationFn: async (agentId) => {
      const response = await fetch(`/api/a2a/agents/${agentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Failed to unregister agent: ${response.status}`);
      }
    },
    onSuccess: () => {
      // Invalidate and refetch agents list
      queryClient.invalidateQueries({ queryKey: ['a2a-agents'] });
    },
  });

  // Health check mutation
  const healthCheckMutation = useMutation<void, Error, string>({
    mutationFn: async (agentId) => {
      const response = await fetch(`/api/a2a/agents/${agentId}/health`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Health check failed: ${response.status}`);
      }
    },
    onSuccess: () => {
      // Invalidate and refetch agents list to get updated health status
      queryClient.invalidateQueries({ queryKey: ['a2a-agents'] });
    },
  });

  // Refresh agent card mutation
  const refreshAgentMutation = useMutation<void, Error, string>({
    mutationFn: async (agentId) => {
      const response = await fetch(`/api/a2a/agents/${agentId}/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Failed to refresh agent: ${response.status}`);
      }
    },
    onSuccess: () => {
      // Invalidate and refetch agents list
      queryClient.invalidateQueries({ queryKey: ['a2a-agents'] });
    },
  });

  // Callbacks
  const refreshAgents = useCallback(() => {
    refetch();
  }, [refetch]);

  const registerAgent = useCallback(async (params: RegisterAgentParams) => {
    return registerMutation.mutateAsync(params);
  }, [registerMutation]);

  const unregisterAgent = useCallback(async (agentId: string) => {
    return unregisterMutation.mutateAsync(agentId);
  }, [unregisterMutation]);

  const performHealthCheck = useCallback(async (agentId: string) => {
    return healthCheckMutation.mutateAsync(agentId);
  }, [healthCheckMutation]);

  const refreshAgent = useCallback(async (agentId: string) => {
    return refreshAgentMutation.mutateAsync(agentId);
  }, [refreshAgentMutation]);

  // Filter helpers
  const getOnlineAgents = useCallback(() => {
    return agents.filter(agent => agent.status === 'online');
  }, [agents]);

  const getAgentsByCapability = useCallback((capability: keyof A2AAgent['capabilities']) => {
    return agents.filter(agent => agent.capabilities[capability]);
  }, [agents]);

  const getAgentsBySkill = useCallback((skillName: string) => {
    return agents.filter(agent => 
      agent.skills.some(skill => 
        skill.name.toLowerCase().includes(skillName.toLowerCase())
      )
    );
  }, [agents]);

  return {
    // Data
    agents,
    loading,
    error,

    // Actions
    refreshAgents,
    registerAgent,
    unregisterAgent,
    performHealthCheck,
    refreshAgent,

    // Filters
    getOnlineAgents,
    getAgentsByCapability,
    getAgentsBySkill,

    // Mutation states
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error?.message || null,
    isUnregistering: unregisterMutation.isPending,
    unregisterError: unregisterMutation.error?.message || null,
    isPerformingHealthCheck: healthCheckMutation.isPending,
    healthCheckError: healthCheckMutation.error?.message || null,
    isRefreshingAgent: refreshAgentMutation.isPending,
    refreshAgentError: refreshAgentMutation.error?.message || null,
  };
};

/**
 * Hook for A2A service status
 */
export const useA2AStatus = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['a2a-status'],
    queryFn: async () => {
      const response = await fetch('/api/a2a/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch A2A status: ${response.status}`);
      }

      return response.json();
    },
    refetchInterval: 60000, // Refetch every minute
  });

  return {
    status: data || null,
    loading: isLoading,
    error: error?.message || null,
    refresh: refetch,
  };
};

/**
 * Hook for discovering agents at URLs
 */
export const useA2ADiscovery = () => {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const discoverAgent = useCallback(async (agentCardUrl: string) => {
    setIsDiscovering(true);
    setDiscoveryError(null);

    try {
      const response = await fetch('/api/a2a/discover', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agentCardUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Discovery failed: ${response.status}`);
      }

      const result = await response.json();
      return result.agentCard;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown discovery error';
      setDiscoveryError(errorMessage);
      throw error;
    } finally {
      setIsDiscovering(false);
    }
  }, []);

  return {
    discoverAgent,
    isDiscovering,
    discoveryError,
  };
};