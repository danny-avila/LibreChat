import { useMemo } from 'react';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import {
  Permissions,
  alternateName,
  EModelEndpoint,
  PermissionTypes,
  isAgentsEndpoint,
  getConfigDefaults,
  isAssistantsEndpoint,
  PERMISSION_BITS,
} from 'librechat-data-provider';
import type { TAssistantsMap, TEndpointsConfig } from 'librechat-data-provider';
import type { MentionOption } from '~/common';
import {
  useGetPresetsQuery,
  useGetEndpointsQuery,
  useListAgentsQuery,
  useGetStartupConfig,
} from '~/data-provider';
import useAssistantListMap from '~/hooks/Assistants/useAssistantListMap';
import { mapEndpoints, getPresetTitle } from '~/utils';
import { EndpointIcon } from '~/components/Endpoints';
import useHasAccess from '~/hooks/Roles/useHasAccess';

const defaultInterface = getConfigDefaults().interface;

const assistantMapFn =
  ({
    endpoint,
    assistantMap,
    endpointsConfig,
  }: {
    endpoint: EModelEndpoint | string;
    assistantMap: TAssistantsMap;
    endpointsConfig: TEndpointsConfig;
  }) =>
  ({ id, name, description }) => ({
    type: endpoint,
    label: name ?? '',
    value: id,
    description: description ?? '',
    icon: EndpointIcon({
      conversation: { assistant_id: id, endpoint },
      containerClassName: 'shadow-stroke overflow-hidden rounded-full',
      endpointsConfig: endpointsConfig,
      context: 'menu-item',
      assistantMap,
      size: 20,
    }),
  });

export default function useMentions({
  assistantMap,
  includeAssistants,
}: {
  assistantMap: TAssistantsMap;
  includeAssistants: boolean;
}) {
  const hasAgentAccess = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const { data: presets } = useGetPresetsQuery();
  const { data: modelsConfig } = useGetModelsQuery();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: endpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });
  const listMap = useAssistantListMap((res) =>
    res.data.map(({ id, name, description }) => ({
      id,
      name,
      description,
    })),
  );
  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig?.interface],
  );
  const { data: agentsList = null } = useListAgentsQuery(
    { requiredPermission: PERMISSION_BITS.VIEW },
    {
      enabled: hasAgentAccess && interfaceConfig.modelSelect === true,
      select: (res) => {
        const { data } = res;
        return data.map(({ id, name, avatar }) => ({
          value: id,
          label: name ?? '',
          type: EModelEndpoint.agents,
          icon: EndpointIcon({
            conversation: {
              agent_id: id,
              endpoint: EModelEndpoint.agents,
              iconURL: avatar?.filepath,
            },
            containerClassName: 'shadow-stroke overflow-hidden rounded-full',
            endpointsConfig: endpointsConfig,
            context: 'menu-item',
            size: 20,
          }),
        }));
      },
    },
  );
  const assistantListMap = useMemo(
    () => ({
      [EModelEndpoint.assistants]: listMap[EModelEndpoint.assistants]
        ?.map(
          assistantMapFn({
            endpoint: EModelEndpoint.assistants,
            assistantMap,
            endpointsConfig,
          }),
        )
        .filter(Boolean),
      [EModelEndpoint.azureAssistants]: listMap[EModelEndpoint.azureAssistants]
        ?.map(
          assistantMapFn({
            endpoint: EModelEndpoint.azureAssistants,
            assistantMap,
            endpointsConfig,
          }),
        )
        .filter(Boolean),
    }),
    [listMap, assistantMap, endpointsConfig],
  );

  const modelSpecs = useMemo(() => startupConfig?.modelSpecs?.list ?? [], [startupConfig]);

  const options: MentionOption[] = useMemo(() => {
    let validEndpoints = endpoints;
    if (!includeAssistants) {
      validEndpoints = endpoints.filter((endpoint) => !isAssistantsEndpoint(endpoint));
    }

    const modelOptions = validEndpoints.flatMap((endpoint) => {
      if (isAssistantsEndpoint(endpoint) || isAgentsEndpoint(endpoint)) {
        return [];
      }

      if (interfaceConfig.modelSelect !== true) {
        return [];
      }

      const models = (modelsConfig?.[endpoint] ?? []).map((model) => ({
        value: endpoint,
        label: model,
        type: 'model' as const,
        icon: EndpointIcon({
          conversation: { endpoint, model },
          endpointsConfig,
          context: 'menu-item',
          size: 20,
        }),
      }));
      return models;
    });

    const mentions = [
      ...(modelSpecs.length > 0 ? modelSpecs : []).map((modelSpec) => ({
        value: modelSpec.name,
        label: modelSpec.label,
        description: modelSpec.description,
        icon: EndpointIcon({
          conversation: {
            ...modelSpec.preset,
            iconURL: modelSpec.iconURL,
          },
          endpointsConfig,
          context: 'menu-item',
          size: 20,
        }),
        type: 'modelSpec' as const,
      })),
      ...(interfaceConfig.modelSelect === true ? validEndpoints : []).map((endpoint) => ({
        value: endpoint,
        label: alternateName[endpoint as string] ?? endpoint ?? '',
        type: 'endpoint' as const,
        icon: EndpointIcon({
          conversation: { endpoint },
          endpointsConfig,
          context: 'menu-item',
          size: 20,
        }),
      })),
      ...(interfaceConfig.modelSelect === true ? (agentsList ?? []) : []),
      ...(endpointsConfig?.[EModelEndpoint.assistants] &&
      includeAssistants &&
      interfaceConfig.modelSelect === true
        ? assistantListMap[EModelEndpoint.assistants] || []
        : []),
      ...(endpointsConfig?.[EModelEndpoint.azureAssistants] &&
      includeAssistants &&
      interfaceConfig.modelSelect === true
        ? assistantListMap[EModelEndpoint.azureAssistants] || []
        : []),
      ...((interfaceConfig.modelSelect === true && interfaceConfig.presets === true
        ? presets
        : []
      )?.map((preset, index) => ({
        value: preset.presetId ?? `preset-${index}`,
        label: preset.title ?? preset.modelLabel ?? preset.chatGptLabel ?? '',
        description: getPresetTitle(preset, true),
        icon: EndpointIcon({
          conversation: preset,
          containerClassName: 'shadow-stroke overflow-hidden rounded-full',
          endpointsConfig: endpointsConfig,
          context: 'menu-item',
          assistantMap,
          size: 20,
        }),
        type: 'preset' as const,
      })) ?? []),
      ...modelOptions,
    ];

    return mentions;
  }, [
    presets,
    endpoints,
    modelSpecs,
    agentsList,
    assistantMap,
    modelsConfig,
    endpointsConfig,
    assistantListMap,
    includeAssistants,
    interfaceConfig.presets,
    interfaceConfig.modelSelect,
  ]);

  return {
    options,
    presets,
    modelSpecs,
    agentsList,
    modelsConfig,
    endpointsConfig,
    assistantListMap,
  };
}
