import { useMemo } from 'react';
import {
  // useGetModelsQuery,
  useGetStartupConfig,
  useGetEndpointsQuery,
} from 'librechat-data-provider/react-query';
import { alternateName } from 'librechat-data-provider';
import type { Assistant } from 'librechat-data-provider';
import { EndpointIcon } from '~/components/Endpoints';
import { useGetPresetsQuery } from '~/data-provider';
import { mapEndpoints } from '~/utils';

export default function useMentions({ assistantMap }: { assistantMap: Record<string, Assistant> }) {
  // const { data: models } = useGetModelsQuery();
  const { data: presets } = useGetPresetsQuery();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: endpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });
  const modelSpecs = useMemo(() => startupConfig?.modelSpecs?.list ?? [], [startupConfig]);

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
  }, [modelSpecs, endpoints, presets, endpointsConfig, assistantMap]);

  return {
    options,
  };
}
