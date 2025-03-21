import React, { useMemo, useCallback } from 'react';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import {
  EModelEndpoint,
  PermissionTypes,
  Permissions,
  alternateName,
} from 'librechat-data-provider';
import type { Agent, Assistant } from 'librechat-data-provider';
import { useChatContext, useAgentsMapContext } from '~/Providers';
import { useHasAccess, useAssistantListMap } from '~/hooks';
import { mapEndpoints, getIconKey, getEndpointField } from '~/utils';
import { useGetEndpointsQuery } from '~/data-provider';
import { ExtendedEndpoint } from '~/common';
import { icons } from './Icons';

export const useEndpoints = () => {
  const modelsQuery = useGetModelsQuery();
  const { conversation } = useChatContext();
  const agentsMapResult = useAgentsMapContext();
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const { data: endpoints = [] } = useGetEndpointsQuery({ select: mapEndpoints });

  const { endpoint } = conversation ?? {};

  const hasAgentAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const agentsMap = useMemo(() => {
    const result: Record<string, Agent> = {};
    if (agentsMapResult) {
      Object.entries(agentsMapResult).forEach(([key, agent]) => {
        if (agent !== undefined) {
          result[key] = agent;
        }
      });
    }
    return result;
  }, [agentsMapResult]);

  const agents = useMemo(
    () =>
      Object.values(agentsMap).filter(
        (agent): agent is Agent & { name: string } =>
          agent !== undefined && 'id' in agent && 'name' in agent && agent.name !== null,
      ),
    [agentsMap],
  );

  const assistantListMap = useAssistantListMap((res) =>
    res.data.map(({ id, name, metadata, model }) => ({ id, name, metadata, model })),
  );

  const assistants = useMemo(
    () => assistantListMap[endpoint as string] ?? [],
    [endpoint, assistantListMap],
  );

  const filteredEndpoints = useMemo(() => {
    const endpointsCopy = [...endpoints];
    if (!hasAgentAccess) {
      const index = endpointsCopy.indexOf(EModelEndpoint.agents);
      if (index > -1) {
        endpointsCopy.splice(index, 1);
      }
    }
    return endpointsCopy;
  }, [endpoints, hasAgentAccess]);

  const endpointRequiresUserKey = useCallback(
    (ep: string) => {
      return !!getEndpointField(endpointsConfig, ep, 'userProvide');
    },
    [endpointsConfig],
  );

  const mappedEndpoints: ExtendedEndpoint[] = useMemo(() => {
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
      const result: ExtendedEndpoint = {
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
        result.models = agents.map((agent) => agent.id);
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
      if (ep === EModelEndpoint.assistants && assistants.length > 0) {
        result.models = assistants.map((assistant: { id: string }) => assistant.id);
        result.assistantNames = assistants.reduce(
          (acc: Record<string, string>, assistant: { id: string; name: string | null }) => {
            acc[assistant.id] = assistant.name || '';
            return acc;
          },
          {},
        );
        result.modelIcons = assistants.reduce(
          (
            acc: Record<string, string | undefined>,
            assistant: { id: string; metadata?: { avatar?: string } },
          ) => {
            acc[assistant.id] = assistant.metadata?.avatar;
            return acc;
          },
          {},
        );
      }

      // For other endpoints with models from the modelsQuery
      if (
        ep !== EModelEndpoint.agents &&
        ep !== EModelEndpoint.assistants &&
        (modelsQuery.data?.[ep]?.length ?? 0) > 0
      ) {
        result.models = modelsQuery.data?.[ep];
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
