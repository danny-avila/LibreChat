import { useCallback } from 'react';
import { getResponseSender, SystemRoles } from 'librechat-data-provider';
import type { TEndpointOption, TEndpointsConfig } from 'librechat-data-provider';
import { useGetEndpointsQuery } from '~/data-provider';
import { useAuthContext } from '~/hooks';

export default function useGetSender() {
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  return useCallback(
    (endpointOption: TEndpointOption) => {
      const { modelDisplayLabel } = endpointsConfig?.[endpointOption.endpoint ?? ''] ?? {};
      const sender = getResponseSender({ ...endpointOption, modelDisplayLabel });
      // For regular users, replace model names with "Hyper Intelligence"
      if (!isAdmin && sender) {
        return 'Hyper Intelligence';
      }
      return sender;
    },
    [endpointsConfig, isAdmin],
  );
}
