import type { TSyncArtifactAppRequest } from 'librechat-data-provider';

const DATABASE_NAME = 'librechat-artifact-sync';
const DATABASE_VERSION = 1;
const STORE_NAME = 'registrations';

export interface ArtifactSyncQueueEntry {
  id: string;
  ownerId: string;
  request: TSyncArtifactAppRequest;
  signature: string;
  failures: number;
  nextAttemptAt: number;
  updatedAt: number;
}

type QueueListener = () => void;

const memoryQueue = new Map<string, ArtifactSyncQueueEntry>();
const listeners = new Set<QueueListener>();
let hydrationPromise: Promise<void> | null = null;
let persistencePromise: Promise<void> = Promise.resolve();

/** Order operations before opening IndexedDB; connection timing must not reorder snapshots. */
function persistQueueChange(operation: () => Promise<void>): Promise<void> {
  persistencePromise = persistencePromise.then(operation).catch(() => undefined);
  return persistencePromise;
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open artifact sync queue'));
  });
}

function isQueueEntry(value: unknown): value is ArtifactSyncQueueEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ArtifactSyncQueueEntry>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.ownerId === 'string' &&
    typeof candidate.signature === 'string' &&
    typeof candidate.failures === 'number' &&
    typeof candidate.nextAttemptAt === 'number' &&
    typeof candidate.updatedAt === 'number' &&
    candidate.request != null
  );
}

async function readStoredEntries(): Promise<ArtifactSyncQueueEntry[]> {
  const database = await openDatabase();
  if (!database) {
    return [];
  }
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.filter(isQueueEntry));
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to read artifact sync queue'));
    transaction.oncomplete = () => database.close();
  });
}

async function hydrateQueue(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = readStoredEntries()
      .catch(() => [])
      .then((entries) => {
        for (const entry of entries) {
          const current = memoryQueue.get(entry.id);
          if (!current || current.updatedAt < entry.updatedAt) {
            memoryQueue.set(entry.id, entry);
          }
        }
      });
  }
  await hydrationPromise;
}

async function writeStoredEntry(entry: ArtifactSyncQueueEntry, retry = false): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const readRequest = store.get(entry.id);
    readRequest.onsuccess = () => {
      const stored = readRequest.result;
      if (!retry || !isQueueEntry(stored) || stored.signature === entry.signature) {
        store.put(entry);
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save sync item'));
  });
}

async function deleteStoredEntry(id: string, signature: string): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const readRequest = store.get(id);
    readRequest.onsuccess = () => {
      if (isQueueEntry(readRequest.result) && readRequest.result.signature === signature) {
        store.delete(id);
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Unable to remove artifact sync item'));
  });
}

export function getArtifactSyncQueueId(ownerId: string, request: TSyncArtifactAppRequest): string {
  return `${ownerId}\u0000${request.source.conversationId}\u0000${request.source.sourceKey}`;
}

export async function enqueueArtifactSync(
  ownerId: string,
  request: TSyncArtifactAppRequest,
  signature: string,
  delayMs: number,
): Promise<void> {
  await hydrateQueue();
  const id = getArtifactSyncQueueId(ownerId, request);
  const current = memoryQueue.get(id);
  const entry: ArtifactSyncQueueEntry = {
    id,
    ownerId,
    request,
    signature,
    failures: current?.signature === signature ? current.failures : 0,
    nextAttemptAt: Date.now() + delayMs,
    updatedAt: Date.now(),
  };
  memoryQueue.set(id, entry);
  const persisted = persistQueueChange(() => writeStoredEntry(entry));
  notifyListeners();
  await persisted;
}

export async function listArtifactSyncQueue(ownerId: string): Promise<ArtifactSyncQueueEntry[]> {
  await hydrateQueue();
  return Array.from(memoryQueue.values()).filter((entry) => entry.ownerId === ownerId);
}

export async function completeArtifactSync(id: string, signature: string): Promise<void> {
  await hydrateQueue();
  if (memoryQueue.get(id)?.signature !== signature) {
    return;
  }
  memoryQueue.delete(id);
  const persisted = persistQueueChange(() => deleteStoredEntry(id, signature));
  notifyListeners();
  await persisted;
}

export async function rescheduleArtifactSync(
  id: string,
  signature: string,
  delayMs: number,
): Promise<void> {
  await hydrateQueue();
  const current = memoryQueue.get(id);
  if (!current || current.signature !== signature) {
    return;
  }
  const updated: ArtifactSyncQueueEntry = {
    ...current,
    failures: current.failures + 1,
    nextAttemptAt: Date.now() + delayMs,
    updatedAt: Date.now(),
  };
  memoryQueue.set(id, updated);
  const persisted = persistQueueChange(() => writeStoredEntry(updated, true));
  notifyListeners();
  await persisted;
}

export function subscribeToArtifactSyncQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only reset; production callers must retain queued registrations. */
export async function clearArtifactSyncQueueForTests(): Promise<void> {
  await persistencePromise;
  memoryQueue.clear();
  hydrationPromise = null;
  const database = await openDatabase();
  if (!database) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Unable to clear sync queue'));
  });
}
