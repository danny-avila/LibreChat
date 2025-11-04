import { useMemo } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';
import { useUserKeyQuery } from 'librechat-data-provider/react-query';

export default function useEndpointKeyStatus(
  endpoint: string | null | undefined,
  endpointsConfig?: TEndpointsConfig | null,
) {
  const config = endpoint && endpointsConfig ? endpointsConfig[endpoint] : undefined;
  const requiresKey = !!config?.userProvide;

  const queryName = useMemo(() => {
    if (!endpoint) {
      return '';
    }

    if (config?.azure) {
      return EModelEndpoint.azureOpenAI;
    }

    if (endpoint === EModelEndpoint.gptPlugins) {
      return EModelEndpoint.openAI;
    }

    return endpoint;
  }, [endpoint, config?.azure]);

  const { data: keyExpiry } = useUserKeyQuery(requiresKey ? queryName : '');

  const keyProvided = requiresKey ? !!(keyExpiry?.expiresAt ?? '') : true;

  return useMemo(
    () => ({
      requiresKey,
      keyProvided,
    }),
    [requiresKey, keyProvided],
  );
}
