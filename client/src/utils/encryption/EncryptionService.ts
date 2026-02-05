/**
 * EncryptionService - Core E2E Encryption Logic
 * LibreChat/Bytechat Implementation
 * 
 * Implements AES-256-GCM encryption with PBKDF2 key derivation
 * Zero-knowledge architecture: server cannot read encrypted messages
 */

import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { gcm } from '@noble/ciphers/aes.js';
import { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';

import type { 
  EncryptionServiceInterface, 
  EncryptionStatus,
  EncryptionVersion 
} from './types';
import {
  loadConversationKeyMetadata,
  storeConversationKeyMetadata,
  getVerificationToken,
  storeVerificationToken,
} from './storage';

const PBKDF2_ITERATIONS = 600_000; // OWASP recommendation 2024
const KEY_SIZE = 32; // 256-bit
const IV_SIZE = 12; // 96-bit for GCM
const CURRENT_VERSION: EncryptionVersion = 'v1';

/**
 * Main Encryption Service
 */
class EncryptionService implements EncryptionServiceInterface {
  private masterKey: Uint8Array | null = null;
  private conversationKeys = new Map<string, Uint8Array>();
  private lastActivity = Date.now();

  /**
   * Derive Master Key from password using PBKDF2
   */
  async deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
    return pbkdf2(sha256, password, salt, {
      c: PBKDF2_ITERATIONS,
      dkLen: KEY_SIZE,
    });
  }

  /**
   * Unlock encryption with password
   */
  async unlock(password: string, salt: Uint8Array): Promise<boolean> {
    try {
      this.masterKey = await this.deriveKey(password, salt);
      this.lastActivity = Date.now();
      
      const isValid = await this.verifyMasterKey();
      
      if (!isValid) {
        this.masterKey = null;
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('[LibreChat Encryption] Failed to unlock:', error);
      this.masterKey = null;
      return false;
    }
  }

  /**
   * Verify master key by decrypting verification token
   */
  private async verifyMasterKey(): Promise<boolean> {
    try {
      const verificationToken = getVerificationToken();
      
      if (!verificationToken) {
        // First time setup - create verification token
        const testData = 'librechat-verification-token';
        const iv = randomBytes(IV_SIZE);
        const cipher = gcm(this.masterKey!, iv);
        const encrypted = cipher.encrypt(utf8ToBytes(testData));
        
        const token = `${this.toBase64(iv)}:${this.toBase64(encrypted)}`;
        storeVerificationToken(token);
        
        return true;
      }
      
      // Verify by decrypting
      const [ivB64, ctB64] = verificationToken.split(':');
      const iv = this.fromBase64(ivB64);
      const ciphertext = this.fromBase64(ctB64);
      
      const cipher = gcm(this.masterKey!, iv);
      const decrypted = cipher.decrypt(ciphertext);
      const plaintext = bytesToUtf8(decrypted);
      
      return plaintext === 'librechat-verification-token';
    } catch (error) {
      console.error('[LibreChat Encryption] Master key verification failed:', error);
      return false;
    }
  }

  /**
   * Lock encryption (clear all keys from memory)
   */
  lock(): void {
    this.masterKey = null;
    this.conversationKeys.clear();
    console.log('[LibreChat Encryption] Locked');
  }

  /**
   * Check if encryption is unlocked
   */
  isUnlocked(): boolean {
    return this.masterKey !== null;
  }

  /**
   * Get or create conversation key
   */
  private async getConversationKey(conversationId: string): Promise<Uint8Array> {
    // Check memory cache
    let key = this.conversationKeys.get(conversationId);
    
    if (key) {
      return key;
    }
    
    // Try to load from IndexedDB
    const metadata = await loadConversationKeyMetadata(conversationId);
    
    if (metadata) {
      key = await this.unwrapConversationKey(metadata.wrappedKey);
    } else {
      // Generate new key
      key = await this.createConversationKey(conversationId);
    }
    
    // Cache in memory
    this.conversationKeys.set(conversationId, key);
    
    return key;
  }

  /**
   * Create new conversation key
   */
  private async createConversationKey(conversationId: string): Promise<Uint8Array> {
    const key = randomBytes(KEY_SIZE);
    
    // Encrypt with master key and store
    const wrappedKey = await this.wrapConversationKey(key);
    
    await storeConversationKeyMetadata(conversationId, {
      wrappedKey,
      createdAt: Date.now(),
      version: 1,
    });
    
    return key;
  }

  /**
   * Wrap (encrypt) conversation key with master key
   */
  private async wrapConversationKey(key: Uint8Array): Promise<{ iv: string; key: string }> {
    if (!this.masterKey) {
      throw new Error('Master key not available');
    }

    const iv = randomBytes(IV_SIZE);
    const cipher = gcm(this.masterKey, iv);
    const encrypted = cipher.encrypt(key);

    return {
      iv: this.toBase64(iv),
      key: this.toBase64(encrypted),
    };
  }

  /**
   * Unwrap (decrypt) conversation key with master key
   */
  private async unwrapConversationKey(wrapped: { iv: string; key: string }): Promise<Uint8Array> {
    if (!this.masterKey) {
      throw new Error('Master key not available');
    }

    const iv = this.fromBase64(wrapped.iv);
    const encrypted = this.fromBase64(wrapped.key);

    const cipher = gcm(this.masterKey, iv);
    return cipher.decrypt(encrypted);
  }

  /**
   * Encrypt message for conversation
   */
  async encrypt(conversationId: string, plaintext: string): Promise<string> {
    if (!this.isUnlocked()) {
      throw new Error('Encryption is locked. Please unlock first.');
    }

    this.lastActivity = Date.now();

    const conversationKey = await this.getConversationKey(conversationId);
    const iv = randomBytes(IV_SIZE);
    
    const cipher = gcm(conversationKey, iv);
    const data = utf8ToBytes(plaintext);
    const ciphertext = cipher.encrypt(data);

    // Format: v1:base64(iv):base64(ciphertext+authTag)
    return `${CURRENT_VERSION}:${this.toBase64(iv)}:${this.toBase64(ciphertext)}`;
  }

  /**
   * Decrypt message from conversation
   */
  async decrypt(conversationId: string, encrypted: string): Promise<string> {
    if (!this.isUnlocked()) {
      throw new Error('Encryption is locked. Please unlock first.');
    }

    this.lastActivity = Date.now();

    // Parse format: version:iv:ciphertext
    const parts = encrypted.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted message format');
    }

    const [version, ivB64, ctB64] = parts;

    if (version !== CURRENT_VERSION) {
      throw new Error(`Unsupported encryption version: ${version}`);
    }

    const conversationKey = await this.getConversationKey(conversationId);
    const iv = this.fromBase64(ivB64);
    const ciphertext = this.fromBase64(ctB64);

    const cipher = gcm(conversationKey, iv);
    const plaintext = cipher.decrypt(ciphertext);

    return bytesToUtf8(plaintext);
  }

  /**
   * Get time since last activity (for auto-lock)
   */
  getInactiveTime(): number {
    return Date.now() - this.lastActivity;
  }

  /**
   * Get encryption status
   */
  getStatus(): EncryptionStatus {
    return {
      isUnlocked: this.isUnlocked(),
      isEnabled: this.isUnlocked(),
      lastActivity: this.lastActivity,
      conversationKeysCount: this.conversationKeys.size,
    };
  }

  // Helper methods
  private toBase64(data: Uint8Array): string {
    return btoa(String.fromCharCode(...data));
  }

  private fromBase64(str: string): Uint8Array {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();

// Export class for testing
export { EncryptionService };
