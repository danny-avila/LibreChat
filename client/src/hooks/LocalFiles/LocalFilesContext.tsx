import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { listDir, readFile, writeFile } from './operations';
import { clearStoredLocalFolder, loadStoredLocalFolder, saveStoredLocalFolder } from './storage';
import {
  isFileSystemAccessSupported,
  queryDirectoryPermission,
  requestDirectoryPermission,
} from './support';
import type { LocalFilesContextValue, LocalFolderStatus, StoredLocalFolder } from './types';

const LocalFilesContext = createContext<LocalFilesContextValue | null>(null);

function permissionToStatus(permission: PermissionState): LocalFolderStatus {
  if (permission === 'granted') {
    return 'connected';
  }
  return 'needs_reconnect';
}

export function LocalFilesProvider({ children }: { children: React.ReactNode }) {
  const supported = isFileSystemAccessSupported();
  const [status, setStatus] = useState<LocalFolderStatus>(supported ? 'loading' : 'unsupported');
  const [folderName, setFolderName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const applyStoredFolder = useCallback(async (stored: StoredLocalFolder | null) => {
    if (!stored) {
      handleRef.current = null;
      setFolderName(null);
      setStatus('disconnected');
      return;
    }

    handleRef.current = stored.handle;
    setFolderName(stored.folderName);
    const permission = await queryDirectoryPermission(stored.handle);
    setStatus(permissionToStatus(permission));
  }, []);

  useEffect(() => {
    if (!supported) {
      setStatus('unsupported');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const stored = await loadStoredLocalFolder();
        if (cancelled) {
          return;
        }
        await applyStoredFolder(stored);
      } catch {
        if (!cancelled) {
          handleRef.current = null;
          setFolderName(null);
          setStatus('disconnected');
          setError('load_failed');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyStoredFolder, supported]);

  const persistHandle = useCallback(async (handle: FileSystemDirectoryHandle) => {
    const stored: StoredLocalFolder = {
      handle,
      folderName: handle.name,
    };
    await saveStoredLocalFolder(stored);
    handleRef.current = handle;
    setFolderName(handle.name);
    setStatus('connected');
    setError(null);
  }, []);

  const connectFolder = useCallback(async () => {
    if (!supported) {
      return;
    }

    setError(null);
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const permission = await requestDirectoryPermission(handle);
      if (permission !== 'granted') {
        setStatus('needs_reconnect');
        setError('permission_denied');
        return;
      }
      await persistHandle(handle);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError('connect_failed');
    }
  }, [persistHandle, supported]);

  const reconnectFolder = useCallback(async () => {
    if (!supported || !handleRef.current) {
      return;
    }

    setError(null);
    try {
      const permission = await requestDirectoryPermission(handleRef.current);
      if (permission !== 'granted') {
        setStatus('needs_reconnect');
        setError('permission_denied');
        return;
      }
      setStatus('connected');
      setError(null);
    } catch {
      setStatus('needs_reconnect');
      setError('reconnect_failed');
    }
  }, [supported]);

  const disconnectFolder = useCallback(async () => {
    setError(null);
    try {
      await clearStoredLocalFolder();
    } catch {
      setError('disconnect_failed');
    } finally {
      handleRef.current = null;
      setFolderName(null);
      setStatus('disconnected');
    }
  }, []);

  const boundListDir = useCallback((path: string) => listDir(handleRef.current, path), []);
  const boundReadFile = useCallback((path: string) => readFile(handleRef.current, path), []);
  const boundWriteFile = useCallback(
    (path: string, content: string) => writeFile(handleRef.current, path, content),
    [],
  );

  const value = useMemo<LocalFilesContextValue>(
    () => ({
      status,
      folderName,
      isSupported: supported,
      error,
      connectFolder,
      reconnectFolder,
      disconnectFolder,
      listDir: boundListDir,
      readFile: boundReadFile,
      writeFile: boundWriteFile,
    }),
    [
      status,
      folderName,
      supported,
      error,
      connectFolder,
      reconnectFolder,
      disconnectFolder,
      boundListDir,
      boundReadFile,
      boundWriteFile,
    ],
  );

  return <LocalFilesContext.Provider value={value}>{children}</LocalFilesContext.Provider>;
}

export function useLocalFilesContext(): LocalFilesContextValue {
  const context = useContext(LocalFilesContext);
  if (!context) {
    throw new Error('useLocalFilesContext must be used within LocalFilesProvider');
  }
  return context;
}

export default useLocalFilesContext;
