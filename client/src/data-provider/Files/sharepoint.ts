import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
/** Page size for folder listings; Graph caps `$top` for driveItem children at 200. */
const FOLDER_PAGE_SIZE = 200;
/**
 * Upper bound on Graph requests per expansion, counting every page of every folder
 * listing, so neither a deep tree nor one enormous folder can fan out unbounded.
 */
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

/** Why a picked item was left out before it was ever downloaded. */
export type SharePointSkipReason = 'duplicate';

/** What ended the walk early, or null when it ran to completion. */
export type SharePointTruncation = 'fileLimit' | 'sizeLimit' | 'requestBudget';

/** Outcome of walking the selected folders, including what had to be left out. */
export interface SharePointFolderExpansion {
  files: SharePointFile[];
  /** Folders whose contents could not be listed, by name. */
  unreadableFolders: string[];
  /** Items the caller's screen rejected before download, by name and reason. */
  skippedFiles: { name: string; reason: SharePointSkipReason }[];
  /** What cut the walk short, so the caller can say which limit was hit. */
  truncatedBy: SharePointTruncation | null;
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

/** One outstanding folder listing request: the first page of a folder, or a continuation. */
interface FolderPageRequest {
  url: string;
  folder: SharePointFile;
}

function folderKey(folder: SharePointFile): string {
  return `${folder.driveId}:${folder.itemId}`;
}

function childrenUrl(driveId: string, itemId: string): string {
  return `${GRAPH_API_BASE}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(
    itemId,
  )}/children?$top=${FOLDER_PAGE_SIZE}`;
}

/**
 * Fetches a single page of a folder listing.
 * @throws {Error} If Graph rejects the request.
 */
async function fetchChildrenPage(url: string, accessToken: string): Promise<DriveChildrenPage> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Walks the folders in a picker selection breadth-first and returns the files inside
 * them, merged with the files that were selected directly. One page of one folder
 * listing is the unit of work, so `maxFiles` and the request budget are both applied
 * as pages arrive rather than after a folder has been materialized in full.
 *
 * Upload policy stays with the caller: `createScreen` builds a screen for this one
 * walk, applied to directly picked files and folder contents alike so neither can
 * consume a slot the uploader would reclaim. The screen accumulates state across the
 * walk without leaking it into the next one. Folders the user cannot list — including
 * share-only results that carry no drive identifiers to traverse — are reported
 * instead of failing the whole selection.
 */
export async function expandSharePointFolders({
  items,
  accessToken,
  maxFiles,
  maxTotalBytes,
  createScreen,
}: {
  items: SharePointFile[];
  accessToken: string;
  maxFiles?: number;
  maxTotalBytes?: number;
  createScreen?: () => (file: SharePointFile) => SharePointSkipReason | null;
}): Promise<SharePointFolderExpansion> {
  const screenFile = createScreen?.();
  const fileLimit = maxFiles == null ? Number.POSITIVE_INFINITY : Math.max(maxFiles, 0);
  const byteLimit =
    maxTotalBytes == null || maxTotalBytes <= 0 ? Number.POSITIVE_INFINITY : maxTotalBytes;
  let collectedBytes = 0;
  const files: SharePointFile[] = [];
  const unreadableFolders: string[] = [];
  const skippedFiles: { name: string; reason: SharePointSkipReason }[] = [];
  const seenFiles = new Set<string>();
  const visitedFolders = new Set<string>();
  const failedFolders = new Set<string>();
  const pages: FolderPageRequest[] = [];
  let requests = 0;
  let truncatedBy: SharePointTruncation | null = null;

  /** @returns Whether there is room for more files. */
  const collect = (file: SharePointFile): boolean => {
    const key = folderKey(file);
    if (seenFiles.has(key)) {
      return true;
    }
    const reason = screenFile?.(file) ?? null;
    if (reason != null) {
      seenFiles.add(key);
      skippedFiles.push({ name: file.name, reason });
      return true;
    }
    if (files.length >= fileLimit) {
      truncatedBy = 'fileLimit';
      return false;
    }
    /** The batch is headed for rejection once it passes the aggregate cap, so stop with
     * what fits and say so rather than downloading everything to attach none of it. */
    if (collectedBytes + file.size > byteLimit && files.length > 0) {
      truncatedBy = 'sizeLimit';
      return false;
    }
    seenFiles.add(key);
    collectedBytes += file.size;
    files.push(file);
    return true;
  };

  const enqueueFolder = (folder: SharePointFile) => {
    if (!folder.driveId || !folder.itemId) {
      /** A share-only picker result has no drive item to traverse; listing it would
       * request `/drives/undefined/items/undefined/children`. */
      unreadableFolders.push(folder.name);
      return;
    }
    const key = folderKey(folder);
    if (visitedFolders.has(key)) {
      return;
    }
    visitedFolders.add(key);
    pages.push({ url: childrenUrl(folder.driveId, folder.itemId), folder });
  };

  /** @returns Whether there is room for more files. */
  const collectChild = (child: SharePointDriveItem, driveId: string): boolean => {
    const childFile = toSharePointFile(child, driveId);
    if (childFile.isFolder === true) {
      enqueueFolder(childFile);
      return true;
    }
    return collect(childFile);
  };

  for (const item of items) {
    if (item.isFolder === true) {
      enqueueFolder(item);
    } else if (!collect(item)) {
      break;
    }
  }

  while (pages.length > 0 && truncatedBy == null) {
    /** Stop before spending a request on a page there is no room to keep. */
    if (files.length >= fileLimit) {
      truncatedBy = 'fileLimit';
      break;
    }
    if (requests >= MAX_FOLDER_REQUESTS) {
      truncatedBy = 'requestBudget';
      break;
    }

    const { url, folder } = pages.shift() as FolderPageRequest;
    if (failedFolders.has(folderKey(folder))) {
      continue;
    }
    requests++;

    let page: DriveChildrenPage;
    try {
      page = await fetchChildrenPage(url, accessToken);
    } catch (error) {
      console.error(`Failed to list SharePoint folder ${folder.name}:`, error);
      failedFolders.add(folderKey(folder));
      unreadableFolders.push(folder.name);
      continue;
    }

    const nextLink = page['@odata.nextLink'];
    if (nextLink) {
      pages.push({ url: nextLink, folder });
    }

    for (const child of page.value ?? []) {
      if (!collectChild(child, folder.driveId)) {
        break;
      }
    }
  }

  return { files, unreadableFolders, skippedFiles, truncatedBy };
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
