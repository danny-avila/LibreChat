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

/**
 * Decrypts the user's encrypted private key using the provided passphrase.
 */
async function decryptUserPrivateKey(
  encryptedPrivateKeyBase64: string,
  saltBase64: string,
  ivBase64: string,
  passphrase: string
): Promise<CryptoKey> {
  // Convert salt and IV to Uint8Array.
  const salt = new Uint8Array(window.atob(saltBase64).split('').map(c => c.charCodeAt(0)));
  const iv = new Uint8Array(window.atob(ivBase64).split('').map(c => c.charCodeAt(0)));

  // Derive symmetric key from passphrase.
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const symmetricKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt']
  );

  // Decrypt the encrypted private key.
  const encryptedPrivateKeyBuffer = new Uint8Array(
    window.atob(encryptedPrivateKeyBase64)
      .split('')
      .map(c => c.charCodeAt(0))
  );
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    symmetricKey,
    encryptedPrivateKeyBuffer
  );
  // Import the decrypted key as a CryptoKey.
  return await window.crypto.subtle.importKey(
    'pkcs8',
    decryptedBuffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  );
}

const UserKeysSettings: FC = () => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const setUser = useSetRecoilState(store.user);
  const setDecryptedPrivateKey = useSetRecoilState(store.decryptedPrivateKey);
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

      // Export the public and private keys.
      const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      const publicKeyBase64 = window.btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));
      const privateKeyBase64 = window.btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer)));
      console.debug('New public key:', publicKeyBase64);
      console.debug('New private key (plaintext):', privateKeyBase64);

      // Generate a salt (16 bytes) and IV (12 bytes) for AES-GCM.
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));

      // Derive a symmetric key from the passphrase using PBKDF2.
      const derivedKey = await deriveKey(passphrase, salt);

      // Encrypt the private key using AES-GCM.
      const encoder = new TextEncoder();
      const privateKeyBytes = encoder.encode(privateKeyBase64);
      const encryptedPrivateKeyBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        privateKeyBytes
      );
      const encryptedPrivateKeyBase64 = window.btoa(String.fromCharCode(...new Uint8Array(encryptedPrivateKeyBuffer)));

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

  const disableEncryption = async (): Promise<void> => {
    try {
      await setEncryption({
        encryptionPublicKey: null,
        encryptedPrivateKey: null,
        encryptionSalt: null,
        encryptionIV: null,
      });
      showToast({ message: localize('com_ui_upload_success') });
      setUser((prev) => ({
        ...prev,
        encryptionPublicKey: null,
        encryptedPrivateKey: null,
        encryptionSalt: null,
        encryptionIV: null,
      }) as TUser);
      setDecryptedPrivateKey(null);
    } catch (error) {
      console.error('Error disabling encryption:', error);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    const newEncryption = await activateEncryption();
    if (newEncryption) {
      try {
        await setEncryption(newEncryption);
        showToast({ message: localize('com_ui_upload_success') });
        setUser((prev) => ({
          ...prev,
          ...newEncryption,
        }) as TUser);
        // Decrypt the private key and store it in the atom.
        const decryptedKey = await decryptUserPrivateKey(
          newEncryption.encryptedPrivateKey,
          newEncryption.encryptionSalt,
          newEncryption.encryptionIV,
          passphrase
        );
        setDecryptedPrivateKey(decryptedKey);
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
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Key className="flex w-[20px] h-[20px]" />
          <span id="user-keys-label">{localize('com_nav_chat_encryption_settings')}</span>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            aria-label="Set/Change encryption keys"
            onClick={() => setDialogOpen(true)}
            data-testid="userKeysSettings"
          >
            <Lock className="mr-2 flex w-[22px] items-center stroke-1" />
            <span>{localize('com_nav_chat_change_passphrase')}</span>
          </Button>
          {user?.encryptionPublicKey && (
            <Button
              variant="outline"
              aria-label="Disable encryption"
              onClick={disableEncryption}
              data-testid="disableEncryption"
            >
              <span>Disable Encryption</span>
            </Button>
          )}
        </div>
      </div>
      {user?.encryptionPublicKey && (
        <div className="pt-2 text-xs text-gray-500">
          {localize('com_nav_chat_current_public_key')}: {user.encryptionPublicKey.slice(0, 30)}...
        </div>
      )}
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