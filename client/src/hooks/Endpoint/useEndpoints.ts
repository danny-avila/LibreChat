import React, { useMemo, useCallback } from 'react';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import {
  EModelEndpoint,
  PermissionTypes,
  Permissions,
  alternateName,
} from 'librechat-data-provider';
import type {
  Agent,
  Assistant,
  TEndpointsConfig,
  TAgentsMap,
  TAssistantsMap,
  TStartupConfig,
} from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import { mapEndpoints, getIconKey, getEndpointField } from '~/utils';
import { useGetEndpointsQuery } from '~/data-provider';
import { useChatContext } from '~/Providers';
import { useHasAccess } from '~/hooks';
import { icons } from './Icons';

export const useEndpoints = ({
  agentsMap,
  assistantsMap,
  endpointsConfig,
  startupConfig,
}: {
  agentsMap?: TAgentsMap;
  assistantsMap?: TAssistantsMap;
  endpointsConfig: TEndpointsConfig;
  startupConfig: TStartupConfig | undefined;
}) => {
  const modelsQuery = useGetModelsQuery();
  const { conversation } = useChatContext();
  const { data: endpoints = [] } = useGetEndpointsQuery({ select: mapEndpoints });
  const { instanceProjectId } = startupConfig ?? {};
  const interfaceConfig = startupConfig?.interface ?? {};
  const includedEndpoints = useMemo(
    () => new Set(startupConfig?.modelSpecs?.addedEndpoints ?? []),
    [startupConfig?.modelSpecs?.addedEndpoints],
  );

  const { endpoint } = conversation ?? {};

  const hasAgentAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const agents = useMemo(
    () =>
      Object.values(agentsMap ?? {}).filter(
        (agent): agent is Agent & { name: string } =>
          agent !== undefined && 'id' in agent && 'name' in agent && agent.name !== null,
      ),
    [agentsMap],
  );

  const assistants: Assistant[] = useMemo(
    () => Object.values(assistantsMap?.[EModelEndpoint.assistants] ?? {}),
    [endpoint, assistantsMap],
  );

  const azureAssistants: Assistant[] = useMemo(
    () => Object.values(assistantsMap?.[EModelEndpoint.azureAssistants] ?? {}),
    [endpoint, assistantsMap],
  );

  const filteredEndpoints = useMemo(() => {
    if (interfaceConfig.modelSelect === true) {
      // When modelSelect is true, only allow agents and assistants endpoints
      const result: EModelEndpoint[] = [];
      if (hasAgentAccess && endpoints.includes(EModelEndpoint.agents)) {
        if (includedEndpoints.size === 0 || includedEndpoints.has(EModelEndpoint.agents)) {
          result.push(EModelEndpoint.agents);
        }
      }
      if (endpoints.includes(EModelEndpoint.assistants)) {
        if (includedEndpoints.size === 0 || includedEndpoints.has(EModelEndpoint.assistants)) {
          result.push(EModelEndpoint.assistants);
        }
      }
      if (endpoints.includes(EModelEndpoint.azureAssistants)) {
        if (includedEndpoints.size === 0 || includedEndpoints.has(EModelEndpoint.azureAssistants)) {
          result.push(EModelEndpoint.azureAssistants);
        }
      }
      return result;
    }
    if (interfaceConfig.modelSelect === false) {
      // When modelSelect is false, allow all endpoints except agents and assistants
      const result: EModelEndpoint[] = [];
      for (let i = 0; i < endpoints.length; i++) {
        if (endpoints[i] === EModelEndpoint.agents ||
            endpoints[i] === EModelEndpoint.assistants ||
            endpoints[i] === EModelEndpoint.azureAssistants) {
          continue;
        }
        if (includedEndpoints.size > 0 && !includedEndpoints.has(endpoints[i])) {
          continue;
        }
        result.push(endpoints[i]);
      }
      return result;
    }
    return [];
  }, [endpoints, hasAgentAccess, includedEndpoints, interfaceConfig.modelSelect]);

  const endpointRequiresUserKey = useCallback(
    (ep: string) => {
      return !!getEndpointField(endpointsConfig, ep, 'userProvide');
    },
    [endpointsConfig],
  );

  const mappedEndpoints: Endpoint[] = useMemo(() => {
    return filteredEndpoints.map((ep) => {
      const endpointType = getEndpointField(endpointsConfig, ep, 'type');
      const iconKey = getIconKey({ endpoint: ep, endpointsConfig, endpointType });
      const Icon = icons[iconKey];
      const endpointIconURL = getEndpointField(endpointsConfig, ep, 'iconURL');
      const hasModels =
        (ep === EModelEndpoint.agents && agents?.length > 0) ||
        (ep === EModelEndpoint.assistants && assistants?.length > 0) ||
        (ep !== EModelEndpoint.assistants &&
          ep !== EModelEndpoint.agents &&
          (modelsQuery.data?.[ep]?.length ?? 0) > 0);

      // Base result object with formatted default icon
      const result: Endpoint = {
        value: ep,
        label: alternateName[ep] || ep,
        hasModels,
        icon: Icon
          ? React.createElement(Icon, {
              size: 20,
              className: 'text-text-primary shrink-0 icon-md',
              iconURL: endpointIconURL,
              endpoint: ep,
            })
          : null,
      };

      // Handle agents case
      if (ep === EModelEndpoint.agents && agents.length > 0) {
        result.models = agents.map((agent) => ({
          name: agent.id,
          isGlobal:
            (instanceProjectId != null && agent.projectIds?.includes(instanceProjectId)) ?? false,
        }));
        result.agentNames = agents.reduce((acc, agent) => {
          acc[agent.id] = agent.name || '';
          return acc;
        }, {});
        result.modelIcons = agents.reduce((acc, agent) => {
          acc[agent.id] = agent?.avatar?.filepath;
          return acc;
        }, {});
      }

      // Handle assistants case
      else if (ep === EModelEndpoint.assistants && assistants.length > 0) {
        result.models = assistants.map((assistant: { id: string }) => ({
          name: assistant.id,
          isGlobal: false,
        }));
        result.assistantNames = assistants.reduce(
          (acc: Record<string, string>, assistant: Assistant) => {
            acc[assistant.id] = assistant.name || '';
            return acc;
          },
          {},
        );
        result.modelIcons = assistants.reduce(
          (acc: Record<string, string | undefined>, assistant: Assistant) => {
            acc[assistant.id] = assistant.metadata?.avatar;
            return acc;
          },
          {},
        );
      } else if (ep === EModelEndpoint.azureAssistants && azureAssistants.length > 0) {
        result.models = azureAssistants.map((assistant: { id: string }) => ({
          name: assistant.id,
          isGlobal: false,
        }));
        result.assistantNames = azureAssistants.reduce(
          (acc: Record<string, string>, assistant: Assistant) => {
            acc[assistant.id] = assistant.name || '';
            return acc;
          },
          {},
        );
        result.modelIcons = azureAssistants.reduce(
          (acc: Record<string, string | undefined>, assistant: Assistant) => {
            acc[assistant.id] = assistant.metadata?.avatar;
            return acc;
          },
          {},
        );
      }

      // For other endpoints with models from the modelsQuery
      else if (
        ep !== EModelEndpoint.agents &&
        ep !== EModelEndpoint.assistants &&
        (modelsQuery.data?.[ep]?.length ?? 0) > 0
      ) {
        result.models = modelsQuery.data?.[ep]?.map((model) => ({
          name: model,
          isGlobal: false,
        }));
      }

      return result;
    });
  }, [filteredEndpoints, endpointsConfig, modelsQuery.data, agents, assistants]);

  return {
    mappedEndpoints,
    endpointRequiresUserKey,
  };
};

export default useEndpoints;
