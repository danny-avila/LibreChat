import { useMemo, useCallback } from 'react';
import {
  useUpdateUserKeysMutation,
  useUserKeyQuery,
  useGetEndpointsQuery,
} from 'librechat-data-provider';

const useUserKey = (endpoint: string) => {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const config = endpointsConfig?.[endpoint];

  const { azure } = config ?? {};
  let keyEndpoint = endpoint;

  if (azure) {
    keyEndpoint = 'azureOpenAI';
  } else if (keyEndpoint === 'gptPlugins') {
    keyEndpoint = 'openAI';
  }

  const updateKey = useUpdateUserKeysMutation();
  const checkUserKey = useUserKeyQuery(keyEndpoint);
  const getExpiry = useCallback(() => {
    if (checkUserKey.data) {
      return checkUserKey.data.expiresAt;
    }
  }, [checkUserKey.data]);

  const checkExpiry = useCallback(() => {
    const expiresAt = getExpiry();
    if (!expiresAt) {
      return false;
    }

    const expiresAtDate = new Date(expiresAt);
    if (expiresAtDate < new Date()) {
      return false;
    }
    return true;
  }, [getExpiry]);

  const saveUserKey = useCallback(
    (value: string, expiresAt: number) => {
      const dateStr = new Date(expiresAt).toISOString();
      updateKey.mutate({
        name: keyEndpoint,
        value,
        expiresAt: dateStr,
      });
    },
    [updateKey, keyEndpoint],
  );

  return useMemo(
    () => ({ getExpiry, checkExpiry, saveUserKey }),
    [getExpiry, checkExpiry, saveUserKey],
  );
};

export default useUserKey;
