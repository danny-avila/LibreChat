import { useMemo, useCallback } from 'react';
import { useUpdateUserKeysMutation, useUserKeyQuery } from 'librechat-data-provider';

const useUserKey = (endpoint: string) => {
  const updateKey = useUpdateUserKeysMutation();
  const checkUserKey = useUserKeyQuery(endpoint);
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
        name: `${endpoint}`,
        value,
        expiresAt: dateStr,
      });
    },
    [updateKey, endpoint],
  );

  return useMemo(
    () => ({ getExpiry, checkExpiry, saveUserKey }),
    [getExpiry, checkExpiry, saveUserKey],
  );
};

export default useUserKey;
