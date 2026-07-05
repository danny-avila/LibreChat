import {
  LOCAL_FILES_DB_NAME,
  LOCAL_FILES_STORE_NAME,
  clearStoredLocalFolder,
  loadStoredLocalFolder,
  saveStoredLocalFolder,
} from './storage';

type MockRequestEvent = {
  result?: IDBDatabase;
  error?: DOMException | null;
  onsuccess: ((event: MockRequestEvent) => void) | null;
  onerror: ((event: MockRequestEvent) => void) | null;
  onupgradeneeded: ((event: MockRequestEvent) => void) | null;
};

function createMockRequest(): MockRequestEvent {
  return {
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
}

function createMockStore() {
  const values = new Map<IDBValidKey, unknown>();
  return {
    put(value: unknown, key: IDBValidKey) {
      values.set(key, value);
    },
    get(key: IDBValidKey) {
      const request = createMockRequest();
      queueMicrotask(() => {
        request.result = values.get(key);
        request.onsuccess?.(request);
      });
      return request;
    },
    delete(key: IDBValidKey) {
      values.delete(key);
    },
    values,
  };
}

describe('local folder storage', () => {
  beforeEach(() => {
    const store = createMockStore();
    const db = {
      objectStoreNames: {
        contains: (name: string) => name === LOCAL_FILES_STORE_NAME,
      },
      createObjectStore: jest.fn(),
      transaction: jest.fn(() => {
        const tx = {
          objectStore: () => store,
          oncomplete: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
        };
        queueMicrotask(() => {
          tx.oncomplete?.(new Event('complete'));
        });
        return tx;
      }),
    } as unknown as IDBDatabase;

    const openRequest = createMockRequest();
    global.indexedDB = {
      open: jest.fn(() => {
        queueMicrotask(() => {
          openRequest.result = db;
          openRequest.onupgradeneeded?.(openRequest);
          openRequest.onsuccess?.(openRequest);
        });
        return openRequest as unknown as IDBOpenDBRequest;
      }),
    } as IDBFactory;
  });

  it('persists and reloads a directory handle', async () => {
    const handle = { name: 'Projects' } as FileSystemDirectoryHandle;
    await saveStoredLocalFolder({ handle, folderName: 'Projects' });

    await expect(loadStoredLocalFolder()).resolves.toEqual({
      handle,
      folderName: 'Projects',
    });
  });

  it('clears a stored directory handle', async () => {
    const handle = { name: 'Projects' } as FileSystemDirectoryHandle;
    await saveStoredLocalFolder({ handle, folderName: 'Projects' });
    await clearStoredLocalFolder();

    await expect(loadStoredLocalFolder()).resolves.toBeNull();
  });

  it('opens the expected IndexedDB database', async () => {
    await loadStoredLocalFolder();
    expect(indexedDB.open).toHaveBeenCalledWith(LOCAL_FILES_DB_NAME, 1);
  });

  it('stores handles under the connected key', async () => {
    const handle = { name: 'Projects' } as FileSystemDirectoryHandle;
    await saveStoredLocalFolder({ handle, folderName: 'Projects' });

    await expect(loadStoredLocalFolder()).resolves.toEqual({
      handle,
      folderName: 'Projects',
    });
  });
});
