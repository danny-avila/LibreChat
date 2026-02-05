/**
 * TypeScript Types for E2E Encryption
 * LibreChat/Bytechat Implementation
 */

export interface EncryptedMessage {
  id: string;
  conversationId: string;
  text: string;
  encrypted: boolean;
  encryptionMetadata?: {
    version: number;
    algorithm: 'AES-256-GCM';
  };
  _decrypted?: boolean;
  _decryptionFailed?: boolean;
  sender: string;
  timestamp: number;
}

export interface ConversationKeyMetadata {
  conversationId: string;
  wrappedKey: {
    iv: string; // Base64
    key: string; // Base64
  };
  createdAt: number;
  version: number;
}

export interface EncryptionConfig {
  enabled: boolean;
  version: number;
  algorithm: 'AES-256-GCM';
  keyDerivation: 'PBKDF2' | 'Argon2id';
  iterations: number;
}

export interface EncryptionStatus {
  isUnlocked: boolean;
  isEnabled: boolean;
  lastActivity: number;
  conversationKeysCount: number;
}

export interface EncryptionServiceInterface {
  deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array>;
  unlock(password: string, salt: Uint8Array): Promise<boolean>;
  lock(): void;
  isUnlocked(): boolean;
  encrypt(conversationId: string, plaintext: string): Promise<string>;
  decrypt(conversationId: string, ciphertext: string): Promise<string>;
  getInactiveTime(): number;
  getStatus(): EncryptionStatus;
}

export type EncryptionVersion = 'v1';

export interface EncryptedPayload {
  version: EncryptionVersion;
  iv: string; // Base64
  ciphertext: string; // Base64 (includes auth tag)
}
