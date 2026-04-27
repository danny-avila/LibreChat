import { useCallback } from 'react';
import { getResponseSender } from 'librechat-data-provider';
import type { TEndpointOption, TEndpointsConfig } from 'librechat-data-provider';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';

export default function useGetSender() {
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const { data: startupConfig } = useGetStartupConfig();
  return useCallback(
    (endpointOption: TEndpointOption) => {
      const { modelDisplayLabel } = endpointsConfig?.[endpointOption.endpoint ?? ''] ?? {};
      let { modelLabel } = endpointOption;
      if (!modelLabel && endpointOption.spec) {
        const spec = startupConfig?.modelSpecs?.list?.find((s) => s.name === endpointOption.spec);
        modelLabel = spec?.preset?.modelLabel ?? spec?.label ?? null;
      }
      return getResponseSender({ ...endpointOption, modelLabel, modelDisplayLabel });
    },
    [endpointsConfig, startupConfig],
  );
}
