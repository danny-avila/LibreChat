import { useCallback } from 'react';
import { getResponseSender } from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { TEndpointOption, TEndpointsConfig } from 'librechat-data-provider';

export default function useGetSender() {
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  return useCallback(
    (endpointOption: TEndpointOption) => {
      const { modelDisplayLabel } = endpointsConfig[endpointOption.endpoint ?? ''] ?? {};
      return getResponseSender({ ...endpointOption, modelDisplayLabel });
    },
    [endpointsConfig],
  );
}
