import React, { useMemo, useCallback } from 'react';
import {
  EModelEndpoint,
  PermissionTypes,
  Permissions,
  alternateName,
} from 'librechat-data-provider';
import { useHasAccess } from '~/hooks';
import { useGetEndpointsQuery } from '~/data-provider';
import { mapEndpoints, getIconKey, getEndpointField } from '~/utils';
import { ExtendedEndpoint } from '~/common';
import { icons } from './Icons';

export const useEndpoints = (
  endpointsConfig: Record<string, any>,
  agents: Array<{ id: string; name: string }>,
  assistants: Array<{ id: string; name: string }>,
  modelsQuery: { data?: Record<string, any[]> },
) => {
  const { data: endpoints = [] } = useGetEndpointsQuery({ select: mapEndpoints });

  const hasAgentAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

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

      const result: ExtendedEndpoint = {
        value: ep,
        label: alternateName[ep] || ep,
        hasModels,
        icon: Icon
          ? React.createElement(Icon, {
            size: 18,
            className: 'icon-md shrink-0 dark:text-white',
            iconURL: endpointIconURL,
            endpoint: ep,
            context: 'menu-item',
          })
          : null,
      };

      if (ep === EModelEndpoint.agents && agents.length > 0) {
        result.models = agents.map((agent) => agent.id);
        result.agentNames = agents.reduce((acc: Record<string, string>, agent) => {
          acc[agent.id] = agent.name || '';
          return acc;
        }, {});
      }

      if (ep === EModelEndpoint.assistants && assistants.length > 0) {
        result.models = assistants.map((assistant) => assistant.id);
        result.assistantNames = assistants.reduce((acc: Record<string, string>, assistant) => {
          acc[assistant.id] = assistant.name || '';
          return acc;
        }, {});
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
