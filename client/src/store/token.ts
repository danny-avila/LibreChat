import { useUpdateUserKeysMutation } from 'librechat-data-provider';

const useToken = (endpoint: string) => {
  const updateKey = useUpdateUserKeysMutation();
  const getToken = () => localStorage.getItem(`${endpoint}_token`);
  const saveToken = (value: string, expiresAt: number) => {
    const dateStr = new Date(expiresAt).toISOString();
    localStorage.setItem(`${endpoint}_token`, dateStr);
    updateKey.mutate({
      key: `${endpoint}`,
      value,
      expiresAt: dateStr,
    });
  };

  return { getToken, saveToken };
};

export default {
  useToken,
};
