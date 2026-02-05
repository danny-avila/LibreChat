/**
 * Storage Helpers for E2E Encryption
 * Manages IndexedDB and LocalStorage for encryption keys
 */

import { randomBytes } from '@noble/hashes/utils.js';
import type { ConversationKeyMetadata } from './types';

const STORAGE_KEYS = {
  SALT: 'librechat_encryption_salt',
  ENABLED: 'librechat_encryption_enabled',
  VERIFICATION: 'librechat_encryption_verification',
} as const;

const DB_NAME = 'LibreChatEncryptionDB';
const DB_VERSION = 1;
const STORE_NAME = 'conversationKeys';

/**
 * Get or generate salt for key derivation
 */
export async function getSalt(): Promise<Uint8Array> {
  let saltB64 = localStorage.getItem(STORAGE_KEYS.SALT);
  
  if (!saltB64) {
    const salt = randomBytes(32);
    saltB64 = btoa(String.fromCharCode(...salt));
    localStorage.setItem(STORAGE_KEYS.SALT, saltB64);
  }
  
  return Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
}

/**
 * Check if encryption is enabled
 */
export function isEncryptionEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEYS.ENABLED) === 'true';
}

/**
 * Enable encryption
 */
export function enableEncryption(): void {
  localStorage.setItem(STORAGE_KEYS.ENABLED, 'true');
}

/**
 * Disable encryption
 */
export function disableEncryption(): void {
  localStorage.removeItem(STORAGE_KEYS.ENABLED);
  localStorage.removeItem(STORAGE_KEYS.VERIFICATION);
}

/**
 * Store verification token
 */
export function storeVerificationToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.VERIFICATION, token);
}

/**
 * Get verification token
 */
export function getVerificationToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.VERIFICATION);
}

/**
 * Open IndexedDB connection
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'conversationId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * Store conversation key metadata in IndexedDB
 */
export async function storeConversationKeyMetadata(
  conversationId: string,
  metadata: Omit<ConversationKeyMetadata, 'conversationId'>
): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.put({
      conversationId,
      ...metadata,
    });
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load conversation key metadata from IndexedDB
 */
export async function loadConversationKeyMetadata(
  conversationId: string
): Promise<ConversationKeyMetadata | null> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.get(conversationId);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete conversation key metadata
 */
export async function deleteConversationKeyMetadata(
  conversationId: string
): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.delete(conversationId);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
