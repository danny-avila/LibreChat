import { useUpdateUserKeysMutation, useUserKeyQuery } from 'librechat-data-provider';

const useUserKey = (endpoint: string) => {
  const updateKey = useUpdateUserKeysMutation();
  const checkUserKey = useUserKeyQuery(endpoint);
  const getExpiry = () => {
    if (checkUserKey.data) {
      return checkUserKey.data.expiresAt;
    }
  };

  const checkExpiry = () => {
    const expiresAt = getExpiry();
    if (!expiresAt) {
      return false;
    }

    const expiresAtDate = new Date(expiresAt);
    if (expiresAtDate < new Date()) {
      return false;
    }
    return true;
  };

  const saveUserKey = (value: string, expiresAt: number) => {
    const dateStr = new Date(expiresAt).toISOString();
    updateKey.mutate({
      name: `${endpoint}`,
      value,
      expiresAt: dateStr,
    });
  };

  return { getExpiry, checkExpiry, saveUserKey };
};

export default useUserKey;
