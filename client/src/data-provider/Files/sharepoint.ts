import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
/** Page size for folder listings; Graph caps `$top` for driveItem children at 200. */
const FOLDER_PAGE_SIZE = 200;
/** Upper bound on folder listings per expansion, so a deep tree cannot fan out unbounded. */
const MAX_FOLDER_REQUESTS = 100;

/** The subset of a Graph driveItem the picker and download path rely on. */
export interface SharePointDriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  folder?: { childCount?: number };
  parentReference?: { driveId?: string };
  '@microsoft.graph.downloadUrl'?: string;
}

interface DriveChildrenPage {
  value?: SharePointDriveItem[];
  '@odata.nextLink'?: string;
}

export interface SharePointFile {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  downloadUrl: string;
  driveId: string;
  itemId: string;
  /** Set when the picker returned a folder rather than a file. */
  isFolder?: boolean;
  sharePointItem: SharePointDriveItem;
}

/** Outcome of walking the selected folders, including what had to be left out. */
export interface SharePointFolderExpansion {
  files: SharePointFile[];
  /** Folders whose contents could not be listed, by name. */
  unreadableFolders: string[];
  /** Whether the file limit or the folder-request budget cut the walk short. */
  truncated: boolean;
}

export interface SharePointDownloadProgress {
  fileId: string;
  fileName: string;
  loaded: number;
  total: number;
  progress: number;
}

export interface SharePointBatchProgress {
  completed: number;
  total: number;
  currentFile?: string;
  failed: string[];
}

/**
 * Converts a Graph driveItem into the descriptor the download path expects.
 * @param item - The driveItem returned by the picker or a folder listing.
 * @param driveId - Drive the item was listed from, used when the item omits its parent reference.
 */
function toSharePointFile(item: SharePointDriveItem, driveId: string): SharePointFile {
  return {
    id: item.id,
    name: item.name,
    size: item.size ?? 0,
    webUrl: item.webUrl ?? '',
    downloadUrl: item['@microsoft.graph.downloadUrl'] ?? '',
    driveId: item.parentReference?.driveId ?? driveId,
    itemId: item.id,
    isFolder: item.folder != null,
    sharePointItem: item,
  };
}

/**
 * Lists every child of a folder, following Graph's pagination to the end.
 * @throws {Error} If any page of the listing is rejected.
 */
async function listFolderChildren(
  driveId: string,
  itemId: string,
  accessToken: string,
): Promise<SharePointDriveItem[]> {
  const children: SharePointDriveItem[] = [];
  let nextUrl: string | undefined = `${GRAPH_API_BASE}/drives/${encodeURIComponent(
    driveId,
  )}/items/${encodeURIComponent(itemId)}/children?$top=${FOLDER_PAGE_SIZE}`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const page: DriveChildrenPage = await response.json();
    if (page.value) {
      children.push(...page.value);
    }
    nextUrl = page['@odata.nextLink'];
  }

  return children;
}

/**
 * Walks the folders in a picker selection breadth-first and returns the files inside
 * them, merged with the files that were selected directly. Stops at `maxFiles` and at
 * a fixed folder-request budget so a large SharePoint tree cannot stall the upload.
 * Folders the user cannot list are reported rather than failing the whole selection.
 */
export async function expandSharePointFolders({
  items,
  accessToken,
  maxFiles,
}: {
  items: SharePointFile[];
  accessToken: string;
  maxFiles?: number;
}): Promise<SharePointFolderExpansion> {
  const fileLimit = maxFiles != null && maxFiles > 0 ? maxFiles : Number.POSITIVE_INFINITY;
  const files: SharePointFile[] = [];
  const unreadableFolders: string[] = [];
  const seenFiles = new Set<string>();
  const visitedFolders = new Set<string>();
  const queue: SharePointFile[] = [];
  let requests = 0;
  let truncated = false;

  /** @returns Whether there is room for more files. */
  const collect = (file: SharePointFile): boolean => {
    const key = `${file.driveId}:${file.itemId}`;
    if (seenFiles.has(key)) {
      return true;
    }
    if (files.length >= fileLimit) {
      truncated = true;
      return false;
    }
    seenFiles.add(key);
    files.push(file);
    return true;
  };

  const enqueue = (folder: SharePointFile) => {
    const key = `${folder.driveId}:${folder.itemId}`;
    if (visitedFolders.has(key)) {
      return;
    }
    visitedFolders.add(key);
    queue.push(folder);
  };

  for (const item of items) {
    if (item.isFolder === true) {
      enqueue(item);
    } else if (!collect(item)) {
      break;
    }
  }

  while (queue.length > 0 && !truncated) {
    if (requests >= MAX_FOLDER_REQUESTS) {
      truncated = true;
      break;
    }

    const folder = queue.shift() as SharePointFile;
    requests++;

    let children: SharePointDriveItem[];
    try {
      children = await listFolderChildren(folder.driveId, folder.itemId, accessToken);
    } catch (error) {
      console.error(`Failed to list SharePoint folder ${folder.name}:`, error);
      unreadableFolders.push(folder.name);
      continue;
    }

    for (const child of children) {
      const childFile = toSharePointFile(child, folder.driveId);
      if (childFile.isFolder === true) {
        enqueue(childFile);
      } else if (!collect(childFile)) {
        break;
      }
    }
  }

  return { files, unreadableFolders, truncated };
}

export const useSharePointFileDownload = (): UseMutationResult<
  File,
  unknown,
  {
    file: SharePointFile;
    accessToken: string;
    onProgress?: (progress: SharePointDownloadProgress) => void;
  }
> => {
  return useMutation({
    mutationFn: async ({ file, accessToken, onProgress }) => {
      const downloadUrl =
        file.downloadUrl ||
        `https://graph.microsoft.com/v1.0/drives/${file.driveId}/items/${file.itemId}/content`;

      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0');
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      const chunks: Uint8Array[] = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        if (onProgress) {
          onProgress({
            fileId: file.id,
            fileName: file.name,
            loaded: receivedLength,
            total: contentLength || file.size,
            progress: Math.round((receivedLength / (contentLength || file.size)) * 100),
          });
        }
      }

      const allChunks = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
      }

      const contentType =
        response.headers.get('content-type') || getMimeTypeFromFileName(file.name);

      const blob = new Blob([allChunks], { type: contentType });
      const downloadedFile = new File([blob], file.name, {
        type: contentType,
        lastModified: Date.now(),
      });

      return downloadedFile;
    },
    retry: 2,
  });
};

export const useSharePointBatchDownload = (): UseMutationResult<
  File[],
  unknown,
  {
    files: SharePointFile[];
    accessToken: string;
    onProgress?: (progress: SharePointBatchProgress) => void;
  },
  unknown
> => {
  return useMutation({
    mutationFn: async ({ files, accessToken, onProgress }) => {
      const downloadedFiles: File[] = [];
      const failed: string[] = [];
      let completed = 0;

      const concurrencyLimit = 3;
      const chunks: SharePointFile[][] = [];
      for (let i = 0; i < files.length; i += concurrencyLimit) {
        chunks.push(files.slice(i, i + concurrencyLimit));
      }

      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (file) => {
          try {
            const downloadUrl =
              file.downloadUrl ||
              `https://graph.microsoft.com/v1.0/drives/${file.driveId}/items/${file.itemId}/content`;

            const response = await fetch(downloadUrl, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });

            if (!response.ok) {
              throw new Error(`${response.status} ${response.statusText}`);
            }

            const blob = await response.blob();
            const contentType =
              response.headers.get('content-type') || getMimeTypeFromFileName(file.name);

            const downloadedFile = new File([blob], file.name, {
              type: contentType,
              lastModified: Date.now(),
            });

            completed++;
            onProgress?.({
              completed,
              total: files.length,
              currentFile: file.name,
              failed,
            });

            return downloadedFile;
          } catch (error) {
            console.error(`Failed to download ${file.name}:`, error);
            failed.push(file.name);
            completed++;
            onProgress?.({
              completed,
              total: files.length,
              currentFile: `Error: ${file.name}`,
              failed,
            });
            throw error;
          }
        });

        const chunkResults = await Promise.allSettled(chunkPromises);

        chunkResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            downloadedFiles.push(result.value);
          }
        });
      }

      if (failed.length > 0) {
        console.warn(`Failed to download ${failed.length} files:`, failed);
      }

      return downloadedFiles;
    },
    retry: 1,
  });
};

function getMimeTypeFromFileName(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
    txt: 'text/plain',
    csv: 'text/csv',

    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    webp: 'image/webp',

    // Archives
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',

    // Media
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
  };

  return mimeTypes[extension || ''] || 'application/octet-stream';
}

export { getMimeTypeFromFileName };
