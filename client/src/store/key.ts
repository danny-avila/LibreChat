import { useUpdateUserKeysMutation } from 'librechat-data-provider';

const useKey = (endpoint: string) => {
  const updateKey = useUpdateUserKeysMutation();
  const getExpiry = () => localStorage.getItem(`${endpoint}_key`);

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

  const saveKey = (value: string, expiresAt: number) => {
    const dateStr = new Date(expiresAt).toISOString();
    localStorage.setItem(`${endpoint}_key`, dateStr);
    updateKey.mutate({
      name: `${endpoint}`,
      value,
      expiresAt: dateStr,
    });
  };

  return { getExpiry, checkExpiry, saveKey };
};

export default {
  useKey,
};
