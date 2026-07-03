import type { StoredLocalFolder } from './types';

export const LOCAL_FILES_DB_NAME = 'aiwp-local-files';
export const LOCAL_FILES_STORE_NAME = 'directory';
export const LOCAL_FILES_HANDLE_KEY = 'connected';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_FILES_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_FILES_STORE_NAME)) {
        db.createObjectStore(LOCAL_FILES_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function loadStoredLocalFolder(): Promise<StoredLocalFolder | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOCAL_FILES_STORE_NAME, 'readonly');
    const store = transaction.objectStore(LOCAL_FILES_STORE_NAME);
    const request = store.get(LOCAL_FILES_HANDLE_KEY);

    request.onsuccess = () => {
      const value = request.result as StoredLocalFolder | undefined;
      if (!value?.handle || typeof value.folderName !== 'string') {
        resolve(null);
        return;
      }
      resolve(value);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read directory handle'));
  });
}

export async function saveStoredLocalFolder(folder: StoredLocalFolder): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOCAL_FILES_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(LOCAL_FILES_STORE_NAME);
    store.put(folder, LOCAL_FILES_HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Failed to save directory handle'));
  });
}

export async function clearStoredLocalFolder(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOCAL_FILES_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(LOCAL_FILES_STORE_NAME);
    store.delete(LOCAL_FILES_HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Failed to clear directory handle'));
  });
}
