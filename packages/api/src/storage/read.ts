import type { ContainerClient } from '@azure/storage-blob';
import type { Readable } from 'node:stream';
import type { AxiosInstance } from 'axios';
import type { StorageReadOptions, StorageByteRange } from './types';

export function storageRangeHeader(range?: StorageByteRange): string | undefined {
  if (!range) return undefined;
  if (
    !Number.isSafeInteger(range.start) ||
    !Number.isSafeInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start
  ) {
    throw new Error('Invalid storage byte range');
  }
  return `bytes=${range.start}-${range.end}`;
}

/** A backend ignoring Range must never be presented as the requested tail of an object. */
export function assertStorageRange(
  stream: Readable,
  range?: StorageByteRange,
  contentRange?: string,
): void {
  if (!range) return;
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange ?? '');
  if (
    !match ||
    Number(match[1]) !== range.start ||
    Number(match[2]) !== range.end ||
    Number(match[3]) <= range.end
  ) {
    stream.destroy();
    throw new Error('Storage did not return the requested byte range');
  }
}

/** Reuses the host's configured container, including Azurite's account/container path. */
export function createAzureFileStream({
  getContainerClient,
}: {
  getContainerClient(name?: string): Promise<ContainerClient>;
}) {
  return async (
    _request: unknown,
    filepath: string,
    options: StorageReadOptions = {},
  ): Promise<Readable> => {
    storageRangeHeader(options.range);
    const url = new URL(filepath);
    const configuredClient = await getContainerClient();
    const configuredURL = configuredClient.url ? new URL(configuredClient.url) : undefined;
    const configuredPrefix = configuredURL?.pathname.replace(/\/$/, '');
    let containerClient = configuredClient;
    let blobPath: string;
    if (
      configuredURL &&
      configuredPrefix &&
      url.origin === configuredURL.origin &&
      url.pathname.startsWith(`${configuredPrefix}/`)
    ) {
      blobPath = url.pathname.slice(configuredPrefix.length + 1);
    } else {
      const pathSegments = url.pathname.split('/').filter(Boolean);
      const containerName = pathSegments.shift();
      blobPath = pathSegments.join('/');
      if (containerName)
        containerClient = await getContainerClient(decodeURIComponent(containerName));
    }
    blobPath = blobPath.split('/').map(decodeURIComponent).join('/');
    if (!blobPath) throw new Error('Invalid Azure Blob URL');
    const range = options.range;
    const response = await containerClient
      .getBlockBlobClient(blobPath)
      .download(range?.start ?? 0, range ? range.end - range.start + 1 : undefined, {
        abortSignal: options.signal,
      });
    const stream = response.readableStreamBody as Readable | undefined;
    if (!stream) throw new Error('Azure Blob download returned no readable stream');
    assertStorageRange(stream, range, response.contentRange);
    return stream;
  };
}

/** Firebase's signed object URL remains the existing credential boundary. */
export function createFirebaseFileStream({
  getStorage,
  http,
}: {
  getStorage(): object | null | undefined;
  http: AxiosInstance;
}) {
  return async (
    _request: unknown,
    filepath: string,
    options: StorageReadOptions = {},
  ): Promise<Readable> => {
    if (!getStorage()) throw new Error('Firebase is not initialized');
    const range = storageRangeHeader(options.range);
    const response = await http.request<Readable>({
      method: 'get',
      url: filepath,
      responseType: 'stream',
      signal: options.signal,
      ...(range ? { headers: { Range: range }, decompress: false } : {}),
    });
    assertStorageRange(response.data, options.range, response.headers['content-range']);
    return response.data;
  };
}
