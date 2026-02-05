/**
 * Encryption Hook and Context for LibreChat
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { encryptionService } from '~/utils/encryption';
import { getSalt, isEncryptionEnabled, enableEncryption as enableEncryptionStorage } from '~/utils/encryption/storage';
import type { EncryptionStatus } from '~/utils/encryption/types';

interface EncryptionContextType {
  isUnlocked: boolean;
  isEnabled: boolean;
  status: EncryptionStatus | null;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  enable: () => Promise<void>;
  getInactiveTime: () => number;
}

const EncryptionContext = createContext<EncryptionContextType | null>(null);

interface EncryptionProviderProps {
  children: ReactNode;
  autoLockMinutes?: number;
}

export function EncryptionProvider({ 
  children, 
  autoLockMinutes = 15 
}: EncryptionProviderProps) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isEnabled, setIsEnabled] = useState(isEncryptionEnabled());
  const [status, setStatus] = useState<EncryptionStatus | null>(null);

  // Update status periodically
  useEffect(() => {
    if (isUnlocked) {
      const updateStatus = () => {
        setStatus(encryptionService.getStatus());
      };

      updateStatus();
      const interval = setInterval(updateStatus, 5000);

      return () => clearInterval(interval);
    } else {
      setStatus(null);
    }
  }, [isUnlocked]);

  // Auto-lock after inactivity
  useEffect(() => {
    if (!isUnlocked) return;

    const checkInactivity = () => {
      const inactiveTime = encryptionService.getInactiveTime();
      const threshold = autoLockMinutes * 60 * 1000;

      if (inactiveTime > threshold) {
        console.log('[LibreChat Encryption] Auto-locking due to inactivity');
        lock();
      }
    };

    const interval = setInterval(checkInactivity, 60 * 1000);

    return () => clearInterval(interval);
  }, [isUnlocked, autoLockMinutes]);

  const unlock = async (password: string): Promise<boolean> => {
    try {
      const salt = await getSalt();
      const success = await encryptionService.unlock(password, salt);
      
      if (success) {
        setIsUnlocked(true);
        console.log('[LibreChat Encryption] Successfully unlocked');
      } else {
        console.warn('[LibreChat Encryption] Failed to unlock - invalid password');
      }
      
      return success;
    } catch (error) {
      console.error('[LibreChat Encryption] Unlock error:', error);
      return false;
    }
  };

  const lock = () => {
    encryptionService.lock();
    setIsUnlocked(false);
  };

  const enable = async () => {
    enableEncryptionStorage();
    setIsEnabled(true);
    console.log('[LibreChat Encryption] Enabled');
  };

  const getInactiveTime = () => {
    return encryptionService.getInactiveTime();
  };

  return (
    <EncryptionContext.Provider 
      value={{ 
        isUnlocked, 
        isEnabled, 
        status,
        unlock, 
        lock, 
        enable,
        getInactiveTime,
      }}
    >
      {children}
    </EncryptionContext.Provider>
  );
}

/**
 * Hook to access encryption context
 */
export function useEncryption() {
  const context = useContext(EncryptionContext);
  
  if (!context) {
    throw new Error('useEncryption must be used within EncryptionProvider');
  }
  
  return context;
}
