import useLocalStorage from './useLocalStorage';
export const useEncryptionHeaders = () => {
  const [isEncryptionEnabled] = useLocalStorage('isEncryptionEnabled', false);
  const [encryptionKey] = useLocalStorage('encryptionKey', '');
  return {
    'x-encryption-enabled': isEncryptionEnabled.toString(),
    'x-encryption-key': encryptionKey,
  };
};