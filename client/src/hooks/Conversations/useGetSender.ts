import { useCallback } from 'react';
import { getResponseSender } from 'librechat-data-provider';
import type { TEndpointOption, TEndpointsConfig } from 'librechat-data-provider';
import { useGetEndpointsQuery } from '~/data-provider';
import { getAssistantDisplayName, shouldWhiteLabelEndpoint } from '~/utils/branding';

export default function useGetSender() {
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  return useCallback(
    (endpointOption: TEndpointOption) => {
      if (shouldWhiteLabelEndpoint(endpointOption.endpoint)) {
        return getAssistantDisplayName(endpointOption.modelLabel);
      }
      const { modelDisplayLabel } = endpointsConfig?.[endpointOption.endpoint ?? ''] ?? {};
      return getResponseSender({ ...endpointOption, modelDisplayLabel });
    },
    [endpointsConfig],
  );
}
