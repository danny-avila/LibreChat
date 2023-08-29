import { useUpdateUserKeysMutation } from 'librechat-data-provider';

const useToken = (endpoint: string) => {
  const updateKey = useUpdateUserKeysMutation();
  const getToken = () => localStorage.getItem(`${endpoint}_token`);
  const saveToken = (value: string, expiresAt: Date) => {
    localStorage.setItem(`${endpoint}_token`, 'saved');
    updateKey.mutate({
      key: `${endpoint}`,
      value,
      expiresAt: expiresAt.toISOString(),
    });
  };

  return { getToken, saveToken };
};

export default {
  useToken,
};
