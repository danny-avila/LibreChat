import React, { useState } from 'react';
import { Button } from '~/components';
import useLocalStorage from '~/hooks/useLocalStorage';
import HoverCardSettings from '../HoverCardSettings';
import { useAuthContext, useLocalize } from '~/hooks';

const EncryptionSettings = () => {
  const [isEncryptionEnabled, setIsEncryptionEnabled] = useLocalStorage(
    'isEncryptionEnabled',
    false,
  );
  const [passwordInput, setPasswordInput] = useState('');
  const [encryptionKey, setEncryptionKey] = useLocalStorage('encryptionKey', '');
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const { token } = useAuthContext();
  const localize = useLocalize();

  const generateKeyFromPassword = async (password: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.length >= 8) {
      const key = await generateKeyFromPassword(passwordInput);
      setEncryptionKey(key);
      setPasswordInput('');
      setIsSettingPassword(false);
      handleEncryptAll(key); // Always encrypt when setting password
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordInput(e.target.value);
  };

  const handleEncryptAll = async (providedKey?: string) => {
    try {
      setIsEncrypting(true);
      const keyToUse = providedKey || encryptionKey;

      const response = await fetch('/api/messages/encrypt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-encryption-key': keyToUse,
          'x-encryption-enabled': 'true',
        },
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Failed to encrypt messages' }));
        throw new Error(errorData.error || 'Failed to encrypt messages');
      }

      const result = await response.json();
      console.log('Encryption results:', result);
      setIsEncryptionEnabled(true);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error encrypting messages:', error);
      window.alert(error.message || 'Failed to encrypt messages');
      setIsEncryptionEnabled(false);
      setEncryptionKey('');
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleDecryptAll = async () => {
    try {
      setIsDecrypting(true);
      const response = await fetch('/api/messages/decrypt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-encryption-key': encryptionKey,
          'x-encryption-enabled': 'true',
        },
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Failed to decrypt messages' }));
        throw new Error(errorData.error || 'Failed to decrypt messages');
      }

      const result = await response.json();
      console.log('Decryption results:', result);

      // Only disable encryption after successful decryption
      setIsEncryptionEnabled(false);
      setEncryptionKey('');
      setPasswordInput('');
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error decrypting messages:', error);
      window.alert(error.message || 'Failed to decrypt messages');
    } finally {
      setIsDecrypting(false);
    }
  };

  const getToggleButtonText = () => {
    if (isEncrypting) {
      return 'Encrypting...';
    }
    if (isEncryptionEnabled) {
      return 'On';
    }
    return 'Off';
  };

  const toggleEncryption = () => {
    const newState = !isEncryptionEnabled;
    if (newState) {
      if (!encryptionKey) {
        setIsSettingPassword(true);
      } else {
        handleEncryptAll();
        setIsEncryptionEnabled(true);
      }
    } else if (encryptionKey) {
      handleDecryptAll();
    } else {
      setIsEncryptionEnabled(false);
      setPasswordInput('');
      setEncryptionKey('');
      setIsSettingPassword(false);
    }
  };

  const showPasswordInput = (isEncryptionEnabled && !encryptionKey) || isSettingPassword;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span>{localize('com_nav_encryption')}</span>
        <HoverCardSettings side="bottom" text="com_nav_info_encryption" />
        {showPasswordInput && (
          <form onSubmit={handlePasswordSubmit} className="flex items-center">
            <input
              type="password"
              value={passwordInput}
              onChange={handlePasswordChange}
              placeholder="Min. 8 chars"
              className="h-8 w-32 rounded border border-gray-600 bg-white px-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:bg-gray-800 dark:text-white"
              autoComplete="new-password"
            />
            <Button type="submit" disabled={passwordInput.length < 8} className="ml-2">
              Set
            </Button>
          </form>
        )}
      </div>
      <Button
        variant="outline"
        aria-label="Toggle encryption"
        onClick={toggleEncryption}
        disabled={isEncrypting || isDecrypting}
        className={isEncryptionEnabled ? 'bg-green-600' : ''}
      >
        {getToggleButtonText()}
      </Button>
    </div>
  );
};

export default EncryptionSettings;