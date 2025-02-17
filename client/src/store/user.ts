import { atom } from 'recoil';
import type { TUser, TPlugin } from 'librechat-data-provider';

const user = atom<TUser | undefined>({
  key: 'user',
  default: undefined,
});

const availableTools = atom<Record<string, TPlugin>>({
  key: 'availableTools',
  default: {},
});

// New atom to hold the decrypted private key (as a CryptoKey)
const decryptedPrivateKey = atom<CryptoKey | null>({
  key: 'decryptedPrivateKey',
  default: null,
});

export default {
  user,
  availableTools,
  decryptedPrivateKey,
};