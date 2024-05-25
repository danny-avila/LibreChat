import { useMemo } from 'react';
import {
  useGetModelsQuery,
  useGetStartupConfig,
  useGetEndpointsQuery,
} from 'librechat-data-provider/react-query';
import { getConfigDefaults, EModelEndpoint, alternateName } from 'librechat-data-provider';
import type { AssistantsEndpoint, TAssistantsMap, TEndpointsConfig } from 'librechat-data-provider';
import type { MentionOption } from '~/common';
import useAssistantListMap from '~/hooks/Assistants/useAssistantListMap';
import { mapEndpoints, getPresetTitle } from '~/utils';
import { EndpointIcon } from '~/components/Endpoints';
import { useGetPresetsQuery } from '~/data-provider';
import useSelectMention from './useSelectMention';

const defaultInterface = getConfigDefaults().interface;

const assistantMapFn =
  ({
    endpoint,
    assistantMap,
    endpointsConfig,
  }: {
    endpoint: AssistantsEndpoint;
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

export default function useMentions({ assistantMap }: { assistantMap: TAssistantsMap }) {
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
        ?.filter(Boolean),
      [EModelEndpoint.azureAssistants]: listMap[EModelEndpoint.azureAssistants]
        ?.map(
          assistantMapFn({
            endpoint: EModelEndpoint.azureAssistants,
            assistantMap,
            endpointsConfig,
          }),
        )
        ?.filter(Boolean),
    }),
    [listMap, assistantMap, endpointsConfig],
  );

  const modelSpecs = useMemo(() => startupConfig?.modelSpecs?.list ?? [], [startupConfig]);
  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const { onSelectMention } = useSelectMention({
    modelSpecs,
    endpointsConfig,
    presets,
    assistantMap,
  });

  const options: MentionOption[] = useMemo(() => {
    const mentions = [
      ...(modelSpecs?.length > 0 ? modelSpecs : []).map((modelSpec) => ({
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
      ...(interfaceConfig.endpointsMenu ? endpoints : []).map((endpoint) => ({
        value: endpoint,
        label: alternateName[endpoint] ?? endpoint ?? '',
        type: 'endpoint' as const,
        icon: EndpointIcon({
          conversation: { endpoint },
          endpointsConfig,
          context: 'menu-item',
          size: 20,
        }),
      })),
      ...(endpointsConfig?.[EModelEndpoint.assistants]
        ? assistantListMap[EModelEndpoint.assistants]
        : []),
      ...(endpointsConfig?.[EModelEndpoint.azureAssistants]
        ? assistantListMap[EModelEndpoint.azureAssistants]
        : []),
      ...((interfaceConfig.presets ? presets : [])?.map((preset, index) => ({
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
    ];

    return mentions;
  }, [
    presets,
    endpoints,
    modelSpecs,
    assistantMap,
    endpointsConfig,
    assistantListMap,
    interfaceConfig.presets,
    interfaceConfig.endpointsMenu,
  ]);

  return {
    options,
    modelsConfig,
    onSelectMention,
    assistantListMap,
  };
}
