import { inferMimeType } from 'librechat-data-provider';

export interface DropboxFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface DropboxSearchResult {
  files: DropboxFileSummary[];
  nextPageToken?: string;
}

export interface DropboxSearchOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface CreateDropboxDocumentOptions {
  title: string;
  content?: string;
  folderPath?: string;
}

export interface DropboxDocumentCreated {
  id: string;
  name: string;
  pathDisplay?: string;
}

const DROPBOX_API_URL = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT_URL = 'https://content.dropboxapi.com/2';
const MAX_DOCUMENT_CONTENT_CHARS = 500_000;

type DropboxFileMetadata = {
  '.tag': 'file' | 'folder' | 'deleted';
  id: string;
  name: string;
  client_modified?: string;
  size?: number;
};

function resolveDropboxMimeType(fileName: string, reportedMimeType?: string | null): string {
  const normalizedReported = reportedMimeType?.split(';')[0]?.trim() ?? '';
  return inferMimeType(fileName, normalizedReported);
}

function toFileSummary(metadata: DropboxFileMetadata): DropboxFileSummary {
  return {
    id: metadata.id,
    name: metadata.name,
    mimeType: resolveDropboxMimeType(metadata.name),
    modifiedTime: metadata.client_modified,
    size: metadata.size != null ? String(metadata.size) : undefined,
  };
}

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(pageSize ?? 20, 1), 50);
}

async function dropboxApiRequest<T>(
  accessToken: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${DROPBOX_API_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Dropbox API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

function mapFileEntries(entries: DropboxFileMetadata[]): DropboxFileSummary[] {
  const files: DropboxFileSummary[] = [];
  for (const entry of entries) {
    if (entry['.tag'] === 'file') {
      files.push(toFileSummary(entry));
    }
  }
  return files;
}

async function searchDropboxWithQuery(
  accessToken: string,
  options: DropboxSearchOptions,
): Promise<DropboxSearchResult> {
  const pageSize = clampPageSize(options.pageSize);
  const endpoint = options.pageToken ? 'files/search/continue_v2' : 'files/search_v2';
  const body = options.pageToken
    ? { cursor: options.pageToken }
    : {
        query: options.query?.trim() ?? '',
        options: {
          path: '',
          max_results: pageSize,
        },
      };

  const payload = await dropboxApiRequest<{
    matches?: Array<{ metadata: DropboxFileMetadata }>;
    has_more?: boolean;
    cursor?: string;
  }>(accessToken, endpoint, body);

  const files: DropboxFileSummary[] = [];
  for (const match of payload.matches ?? []) {
    if (match.metadata['.tag'] === 'file') {
      files.push(toFileSummary(match.metadata));
    }
  }

  return {
    files,
    nextPageToken: payload.has_more ? payload.cursor : undefined,
  };
}

async function listDropboxFolder(
  accessToken: string,
  options: DropboxSearchOptions,
): Promise<DropboxSearchResult> {
  const pageSize = clampPageSize(options.pageSize);
  const endpoint = options.pageToken ? 'files/list_folder/continue' : 'files/list_folder';
  const body = options.pageToken
    ? { cursor: options.pageToken }
    : {
        path: '',
        recursive: false,
        include_deleted: false,
        limit: pageSize,
      };

  const payload = await dropboxApiRequest<{
    entries?: DropboxFileMetadata[];
    has_more?: boolean;
    cursor?: string;
  }>(accessToken, endpoint, body);

  return {
    files: mapFileEntries(payload.entries ?? []),
    nextPageToken: payload.has_more ? payload.cursor : undefined,
  };
}

export async function searchDropboxFiles(
  accessToken: string,
  options: DropboxSearchOptions = {},
): Promise<DropboxSearchResult> {
  const query = options.query?.trim();
  if (query) {
    return searchDropboxWithQuery(accessToken, options);
  }
  return listDropboxFolder(accessToken, options);
}

export async function downloadDropboxFile(
  accessToken: string,
  file: Pick<DropboxFileSummary, 'id' | 'name' | 'mimeType'>,
): Promise<{ buffer: ArrayBuffer; fileName: string; mimeType: string }> {
  const response = await fetch(`${DROPBOX_CONTENT_URL}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: file.id }),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Dropbox download failed (${response.status}): ${errorBody}`);
  }

  const buffer = await response.arrayBuffer();
  const mimeType = resolveDropboxMimeType(file.name, response.headers.get('content-type'));

  return {
    buffer,
    fileName: file.name,
    mimeType,
  };
}

function sanitizeDocumentFileName(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .trim();
}

function normalizeDocumentTitle(title: string): string {
  const trimmed = sanitizeDocumentFileName(title);
  return trimmed || 'Untitled document';
}

function normalizeDocumentContent(content: string): string {
  if (content.length <= MAX_DOCUMENT_CONTENT_CHARS) {
    return content;
  }
  return content.slice(0, MAX_DOCUMENT_CONTENT_CHARS);
}

function resolveDocumentFileName(title: string): string {
  const base = normalizeDocumentTitle(title);
  if (/\.[a-z0-9]+$/i.test(base)) {
    return base;
  }
  return `${base}.md`;
}

function buildDropboxUploadPath(folderPath: string | undefined, fileName: string): string {
  const normalizedFolder = folderPath?.trim().replace(/\/+$/, '') ?? '';
  if (!normalizedFolder || normalizedFolder === '/') {
    return `/${fileName}`;
  }
  const folder = normalizedFolder.startsWith('/') ? normalizedFolder : `/${normalizedFolder}`;
  return `${folder}/${fileName}`;
}

export async function createDropboxDocument(
  accessToken: string,
  options: CreateDropboxDocumentOptions,
): Promise<DropboxDocumentCreated> {
  const fileName = resolveDocumentFileName(options.title);
  const content = normalizeDocumentContent(options.content ?? '');
  const path = buildDropboxUploadPath(options.folderPath, fileName);

  const response = await fetch(`${DROPBOX_CONTENT_URL}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path,
        mode: 'add',
        autorename: true,
      }),
    },
    body: content,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Dropbox create document failed (${response.status}): ${errorBody}`);
  }

  const created = (await response.json()) as {
    id: string;
    name: string;
    path_display?: string;
  };

  return {
    id: created.id,
    name: created.name,
    pathDisplay: created.path_display,
  };
}
