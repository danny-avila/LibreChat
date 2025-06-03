import { useSetRecoilState } from 'recoil';
import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TEndpointsConfig, TModelsConfig } from 'librechat-data-provider';
import { useGetEndpointsConfigOverride } from '~/data-provider';
import { QueryKeys } from 'librechat-data-provider';
import store from '~/store';

type TempOverrideType = Record<string, unknown> & {
  endpointsConfig: TEndpointsConfig;
  modelsConfig?: TModelsConfig;
  combinedOptions: unknown[];
  combined: boolean;
};

export default function useConfigOverride() {
  const setEndpointsQueryEnabled = useSetRecoilState(store.endpointsQueryEnabled);
  const overrideQuery = useGetEndpointsConfigOverride({
    staleTime: Infinity,
  });

  const queryClient = useQueryClient();

  const handleOverride = useCallback(
    async (data: unknown | boolean) => {
      const { endpointsConfig, modelsConfig } = data as TempOverrideType;
      if (endpointsConfig) {
        setEndpointsQueryEnabled(false);
        await queryClient.cancelQueries([QueryKeys.endpoints]);
        queryClient.setQueryData([QueryKeys.endpoints], endpointsConfig);
      }
      if (modelsConfig) {
        await queryClient.cancelQueries([QueryKeys.models]);
        queryClient.setQueryData([QueryKeys.models], modelsConfig);
      }
    },
    [queryClient, setEndpointsQueryEnabled],
  );

  useEffect(() => {
    if (overrideQuery.data != null) {
      handleOverride(overrideQuery.data);
    }
  }, [overrideQuery.data, handleOverride]);
}
