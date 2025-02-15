import React, { useState, ChangeEvent, FC } from 'react';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Input,
} from '~/components';
import { Lock, Key } from 'lucide-react';
import { useAuthContext, useLocalize } from '~/hooks';
import { useSetRecoilState } from 'recoil';
import store from '~/store';
import type { TUser } from 'librechat-data-provider';
import { useToastContext } from '~/Providers';
import { useSetUserEncryptionMutation } from '~/data-provider';

/**
 * Helper: Convert a Uint8Array to a hex string (for debugging).
 */
const uint8ArrayToHex = (array: Uint8Array): string =>
  Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/**
 * Derive an AES-GCM key from the passphrase using PBKDF2.
 */
const deriveKey = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  // Debug: export the derived key and log it.
  const rawKey = await window.crypto.subtle.exportKey('raw', derivedKey);
  console.debug('Derived key (hex):', uint8ArrayToHex(new Uint8Array(rawKey)));
  return derivedKey;
};

const UserKeysSettings: FC = () => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const setUser = useSetRecoilState(store.user);
  const { showToast } = useToastContext();
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [passphrase, setPassphrase] = useState<string>('');

  // Mutation hook for updating user encryption keys.
  const { mutateAsync: setEncryption } = useSetUserEncryptionMutation({
    onError: (error) => {
      console.error('Error updating encryption keys:', error);
      showToast({ message: localize('com_ui_upload_error'), status: 'error' });
    },
  });

  // Activation/Update flow: Generate new keys and update user encryption fields.
  const activateEncryption = async (): Promise<{
    encryptionPublicKey: string;
    encryptedPrivateKey: string;
    encryptionSalt: string;
    encryptionIV: string;
  } | void> => {
    if (!passphrase) {
      console.error('Passphrase is empty.');
      return;
    }
    if (!user) {
      console.error('User object is missing.');
      return;
    }

    try {
      console.debug('[Debug] Activating E2EE encryption...');

      // Generate a new RSA-OAEP key pair.
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
      );

      // Export public and private keys.
      const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      const publicKeyBase64 = window.btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));
      const privateKeyBase64 = window.btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer)));
      console.debug('New public key:', publicKeyBase64);
      console.debug('New private key (plaintext):', privateKeyBase64);

      // Generate a salt and IV for AES-GCM.
      const salt = window.crypto.getRandomValues(new Uint8Array(16)); // 16 bytes salt
      const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes IV

      // Derive a symmetric key from the passphrase.
      const derivedKey = await deriveKey(passphrase, salt);

      // Encrypt the private key using AES-GCM.
      const encoder = new TextEncoder();
      const privateKeyBytes = encoder.encode(privateKeyBase64);
      const encryptedPrivateKeyBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        privateKeyBytes
      );
      const encryptedPrivateKeyBase64 = window.btoa(
        String.fromCharCode(...new Uint8Array(encryptedPrivateKeyBuffer))
      );

      // Convert salt and IV to Base64 strings.
      const saltBase64 = window.btoa(String.fromCharCode(...salt));
      const ivBase64 = window.btoa(String.fromCharCode(...iv));

      console.debug('Activation complete:');
      console.debug('Encrypted private key:', encryptedPrivateKeyBase64);
      console.debug('Salt (base64):', saltBase64);
      console.debug('IV (base64):', ivBase64);

      return {
        encryptionPublicKey: publicKeyBase64,
        encryptedPrivateKey: encryptedPrivateKeyBase64,
        encryptionSalt: saltBase64,
        encryptionIV: ivBase64,
      };
    } catch (error) {
      console.error('Error during activation:', error);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    // Activate encryption by generating new keys.
    const newEncryption = await activateEncryption();
    if (newEncryption) {
      try {
        // Call the mutation to update the backend.
        await setEncryption(newEncryption);
        showToast({ message: localize('com_ui_upload_success') });
        // Update local user state with the new encryption keys.
        // Later, when the user unlocks their keys, store the decrypted private key.
        setUser((prev) => ({
          ...prev,
          ...newEncryption,
        }) as TUser);
      } catch (error) {
        console.error('Mutation error:', error);
      }
    }
    setDialogOpen(false);
    setPassphrase('');
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setPassphrase(e.target.value);
  };

  return (
    <>
      {/* List item style */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Key className="flex w-[20px] h-[20px]" />
          <span id="user-keys-label">{localize('com_nav_chat_encryption_settings')}</span>
        </div>
        <Button
          variant="outline"
          aria-label="Set/Change encryption keys"
          onClick={() => setDialogOpen(true)}
          data-testid="userKeysSettings"
        >
          <Lock className="mr-2 flex w-[22px] items-center stroke-1" />
          <span>{localize('com_nav_chat_change_passphrase')}</span>
        </Button>
      </div>

      {/* Optionally display current public key */}
      {user?.encryptionPublicKey && (
        <div className="pt-2 text-xs text-gray-500">
          {localize('com_nav_chat_current_public_key')}: {user.encryptionPublicKey.slice(0, 30)}...
        </div>
      )}

      {/* Dialog for setting/updating keys */}
      <OGDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <OGDialogContent className="w-11/12 max-w-sm" style={{ borderRadius: '12px' }}>
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_nav_chat_enter_your_passphrase')}</OGDialogTitle>
          </OGDialogHeader>
          <div className="p-4 flex flex-col gap-4">
            <Input
              type="password"
              value={passphrase}
              onChange={handleInputChange}
              placeholder={localize('com_nav_chat_passphrase_placeholder')}
              aria-label={localize('com_nav_chat_enter_your_passphrase')}
            />
            <Button variant="outline" onClick={handleSubmit}>
              {localize('com_ui_submit')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
};

export default UserKeysSettings;