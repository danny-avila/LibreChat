import { resizeImage, supportsClientResize } from '~/utils/imageResize';
import { LocalFilePathError, parseRelativePath } from './path';
import { findEntryName, tryDecodeFileName } from './resolve';
import { isImageFileName, mimeTypeForFileName } from './mime';
import type { LocalDirEntry, LocalFileReadResult } from './types';

const LOCAL_IMAGE_VISION_MAX_BYTES = 2 * 1024 * 1024;

async function resolveDirectoryHandle(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of segments) {
    const decoded = tryDecodeFileName(segment);
    try {
      current = await current.getDirectoryHandle(decoded);
      continue;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        const names: string[] = [];
        for await (const entry of current.values()) {
          if (entry.kind === 'directory') {
            names.push(entry.name);
          }
        }
        const resolved = findEntryName(names, decoded);
        if (!resolved) {
          throw new LocalFilePathError(`Directory not found: ${decoded}`);
        }
        current = await current.getDirectoryHandle(resolved);
        continue;
      }
      throw error;
    }
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

  const fileName = tryDecodeFileName(segments[segments.length - 1]);
  const parentSegments = segments.slice(0, -1);
  const directory = await resolveDirectoryHandle(root, parentSegments);
  return { directory, name: fileName };
}

async function getFileHandleByName(
  directory: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemFileHandle> {
  const decoded = tryDecodeFileName(name);
  try {
    return await directory.getFileHandle(decoded);
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotFoundError') {
      throw error;
    }
  }

  const entries: string[] = [];
  for await (const entry of directory.values()) {
    if (entry.kind === 'file') {
      entries.push(entry.name);
    }
  }

  const resolved = findEntryName(entries, decoded);
  if (!resolved) {
    const available = entries.slice(0, 10).join(', ');
    const suffix = entries.length > 10 ? ', …' : '';
    throw new LocalFilePathError(
      `File not found: "${decoded}". Use an exact name from listDir.${available ? ` Available: ${available}${suffix}` : ''}`,
    );
  }

  return directory.getFileHandle(resolved);
}

async function prepareImageForVision(file: File): Promise<File> {
  if (file.type === 'image/gif' || !file.type.startsWith('image/')) {
    return file;
  }
  if (file.size <= LOCAL_IMAGE_VISION_MAX_BYTES && file.type !== 'image/png') {
    return file;
  }
  if (!supportsClientResize()) {
    return file;
  }
  try {
    const { file: prepared } = await resizeImage(file, { quality: 0.88, format: 'jpeg' });
    return prepared;
  } catch {
    return file;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to read file as data URL'));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
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
): Promise<LocalFileReadResult> {
  const handle = requireConnectedHandle(root);
  const segments = parseRelativePath(path);
  const { directory, name } = await resolveParentDirectoryHandle(handle, segments);
  const fileHandle = await getFileHandleByName(directory, name);
  const file = await fileHandle.getFile();

  if (isImageFileName(name)) {
    const prepared = await prepareImageForVision(file);
    const mimeType =
      prepared.type || file.type || mimeTypeForFileName(name) || 'application/octet-stream';
    const dataUrl = await readFileAsDataUrl(prepared);
    return {
      kind: 'image',
      name: file.name,
      mimeType,
      size: prepared.size,
      dataUrl,
    };
  }

  return {
    kind: 'text',
    name: file.name,
    content: await file.text(),
  };
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
