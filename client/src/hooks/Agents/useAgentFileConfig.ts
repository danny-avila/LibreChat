import { useWatch } from 'react-hook-form';
import {
  EModelEndpoint,
  mergeFileConfig,
  resolveEndpointType,
  getEndpointFileConfig,
} from 'librechat-data-provider';
import type { EndpointFileConfig } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useGetFileConfig, useGetEndpointsQuery } from '~/data-provider';

export default function useAgentFileConfig(): {
  endpointType: EModelEndpoint | string | undefined;
  providerValue: string | undefined;
  endpointFileConfig: EndpointFileConfig;
} {
  const providerOption = useWatch<AgentForm>({ name: 'provider' });
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const providerValue =
    typeof providerOption === 'string'
      ? providerOption
      : (providerOption as { value?: string } | undefined)?.value;

  const endpointType = resolveEndpointType(endpointsConfig, EModelEndpoint.agents, providerValue);
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig,
    endpointType,
    endpoint: providerValue || EModelEndpoint.agents,
  });

  return { endpointType, providerValue, endpointFileConfig };
}
