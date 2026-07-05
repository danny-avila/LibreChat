import { LocalFilePathError, parseRelativePath } from './path';
import type { LocalDirEntry } from './types';

async function resolveDirectoryHandle(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment);
  }
  return current;
}

async function resolveParentDirectoryHandle(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<{ directory: FileSystemDirectoryHandle; name: string }> {
  if (segments.length === 0) {
    throw new LocalFilePathError('A file path is required');
  }

  const fileName = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  const directory = await resolveDirectoryHandle(root, parentSegments);
  return { directory, name: fileName };
}

function requireConnectedHandle(
  handle: FileSystemDirectoryHandle | null,
): FileSystemDirectoryHandle {
  if (!handle) {
    throw new LocalFilePathError('No local folder is connected');
  }
  return handle;
}

export async function listDir(
  root: FileSystemDirectoryHandle | null,
  path: string,
): Promise<LocalDirEntry[]> {
  const handle = requireConnectedHandle(root);
  const segments = parseRelativePath(path);
  const directory = await resolveDirectoryHandle(handle, segments);
  const entries: LocalDirEntry[] = [];

  for await (const entry of directory.values()) {
    entries.push({ name: entry.name, kind: entry.kind });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

export async function readFile(
  root: FileSystemDirectoryHandle | null,
  path: string,
): Promise<string> {
  const handle = requireConnectedHandle(root);
  const segments = parseRelativePath(path);
  const { directory, name } = await resolveParentDirectoryHandle(handle, segments);
  const fileHandle = await directory.getFileHandle(name);
  const file = await fileHandle.getFile();
  return file.text();
}

export async function writeFile(
  root: FileSystemDirectoryHandle | null,
  path: string,
  content: string,
): Promise<void> {
  const handle = requireConnectedHandle(root);
  const segments = parseRelativePath(path);
  const { directory, name } = await resolveParentDirectoryHandle(handle, segments);
  const fileHandle = await directory.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}
