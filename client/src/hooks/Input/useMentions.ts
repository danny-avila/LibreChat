import { useMemo } from 'react';
import {
  useGetModelsQuery,
  useGetStartupConfig,
  useGetEndpointsQuery,
} from 'librechat-data-provider/react-query';
import { EModelEndpoint, alternateName } from 'librechat-data-provider';
import type { Assistant } from 'librechat-data-provider';
import { EndpointIcon } from '~/components/Endpoints';
import { useGetPresetsQuery, useListAssistantsQuery } from '~/data-provider';
import useSelectMention from './useSelectMention';
import { mapEndpoints } from '~/utils';

export default function useMentions({ assistantMap }: { assistantMap: Record<string, Assistant> }) {
  const { data: presets } = useGetPresetsQuery();
  const { data: modelsConfig } = useGetModelsQuery();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: endpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });
  const { data: assistants = [] } = useListAssistantsQuery(undefined, {
    select: (res) =>
      res.data
        .map(({ id, name }) => ({
          type: 'assistant',
          label: name ?? '',
          value: id,
          icon: EndpointIcon({
            conversation: { assistant_id: id, endpoint: EModelEndpoint.assistants },
            containerClassName: 'shadow-stroke overflow-hidden rounded-full',
            endpointsConfig: endpointsConfig,
            context: 'menu-item',
            assistantMap,
            size: 20,
          }),
        }))
        .filter(Boolean),
  });
  const modelSpecs = useMemo(() => startupConfig?.modelSpecs?.list ?? [], [startupConfig]);
  const { onSelectMention } = useSelectMention({
    modelSpecs,
    endpointsConfig,
    presets,
    assistantMap,
  });

  const options = useMemo(() => {
    const mentions = [
      ...modelSpecs.map((modelSpec) => ({
        value: modelSpec.name,
        label: modelSpec.label,
        icon: EndpointIcon({
          conversation: modelSpec.preset,
          endpointsConfig,
          context: 'menu-item',
          size: 20,
        }),
        type: 'modelSpec',
      })),
      ...endpoints.map((endpoint) => ({
        value: endpoint,
        label: alternateName[endpoint] ?? endpoint ?? '',
        type: 'endpoint',
        icon: EndpointIcon({
          conversation: { endpoint },
          endpointsConfig,
          context: 'menu-item',
          size: 20,
        }),
      })),
      ...assistants,
      ...(presets?.map((preset, index) => ({
        value: preset.presetId ?? `preset-${index}`,
        label: preset.title ?? preset.modelLabel ?? preset.chatGptLabel ?? '',
        icon: EndpointIcon({
          conversation: preset,
          containerClassName: 'shadow-stroke overflow-hidden rounded-full',
          endpointsConfig: endpointsConfig,
          context: 'menu-item',
          assistantMap,
          size: 20,
        }),
        type: 'preset',
      })) ?? []),
    ];

    return mentions;
  }, [modelSpecs, endpoints, presets, endpointsConfig, assistantMap, assistants]);

  return {
    options,
    assistants,
    modelsConfig,
    onSelectMention,
  };
}
