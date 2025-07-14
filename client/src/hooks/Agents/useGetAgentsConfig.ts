import { useMemo } from 'react';
import { EModelEndpoint, AgentCapabilities } from 'librechat-data-provider';
import type { TAgentsEndpoint, TEndpointsConfig, TConfig } from 'librechat-data-provider';
import { useGetEndpointsQuery } from '~/data-provider';

interface UseGetAgentsConfigOptions {
  endpointsConfig?: TEndpointsConfig;
}

export default function useGetAgentsConfig(options?: UseGetAgentsConfigOptions): {
  agentsConfig?: TAgentsEndpoint | null;
  endpointsConfig?: TEndpointsConfig | null;
} {
  const { endpointsConfig: providedConfig } = options || {};

  const { data: queriedConfig } = useGetEndpointsQuery({
    enabled: !providedConfig,
  });

  const endpointsConfig = providedConfig || queriedConfig;

  const agentsConfig = useMemo<TAgentsEndpoint | null>(() => {
    const config = endpointsConfig?.[EModelEndpoint.agents] ?? null;
    if (!config) return null;

    return {
      ...(config as TConfig),
      capabilities: Array.isArray(config.capabilities)
        ? config.capabilities.map((cap) => cap as unknown as AgentCapabilities)
        : ([] as AgentCapabilities[]),
    } as TAgentsEndpoint;
  }, [endpointsConfig]);

  return { agentsConfig, endpointsConfig };
}
