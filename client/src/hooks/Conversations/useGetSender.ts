import { useCallback } from 'react';
import { getResponseSender, getEphemeralSender } from 'librechat-data-provider';
import type { TEndpointOption, TEndpointsConfig } from 'librechat-data-provider';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import { getModelSpec } from '~/utils';

/**
 * Mirrors the server's sender resolution (`modelLabel` → spec label → endpoint
 * `modelDisplayLabel` → `getResponseSender`) so the optimistic streaming label
 * and composer placeholder match the persisted `message.sender`.
 */
export default function useGetSender() {
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  return useCallback(
    (endpointOption: TEndpointOption) => {
      const { modelDisplayLabel } = endpointsConfig?.[endpointOption.endpoint ?? ''] ?? {};
      const modelSpec = getModelSpec({ specName: endpointOption.spec, startupConfig });
      const sender = getEphemeralSender({
        modelLabel: endpointOption.modelLabel,
        specLabel: modelSpec?.label,
        modelDisplayLabel,
      });
      return sender || getResponseSender({ ...endpointOption, modelDisplayLabel });
    },
    [endpointsConfig, startupConfig],
  );
}
