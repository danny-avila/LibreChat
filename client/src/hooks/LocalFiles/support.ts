export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof indexedDB !== 'undefined'
  );
}

export async function queryDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: FileSystemPermissionMode = 'readwrite',
): Promise<PermissionState> {
  const current = await handle.queryPermission({ mode });
  if (current === 'granted') {
    return 'granted';
  }
  return handle.queryPermission({ mode });
}

export async function requestDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: FileSystemPermissionMode = 'readwrite',
): Promise<PermissionState> {
  const current = await handle.queryPermission({ mode });
  if (current === 'granted') {
    return 'granted';
  }
  return handle.requestPermission({ mode });
}
