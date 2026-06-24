import { inferMimeType } from 'librechat-data-provider';

export interface OneDriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface OneDriveSearchResult {
  files: OneDriveFileSummary[];
  nextPageToken?: string;
}

export interface OneDriveSearchOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface CreateOneDriveDocumentOptions {
  title: string;
  content?: string;
  folderId?: string;
}

export interface OneDriveDocumentCreated {
  id: string;
  name: string;
  webUrl?: string;
}

const GRAPH_URL = 'https://graph.microsoft.com/v1.0';
const DRIVE_ITEM_SELECT = 'id,name,file,folder,size,lastModifiedDateTime';
const MAX_DOCUMENT_CONTENT_CHARS = 500_000;

export const ONEDRIVE_NOT_PROVISIONED_ERROR = 'OneDrive not provisioned';

type GraphErrorPayload = {
  error?: {
    code?: string;
  };
};

export function isOneDriveNotProvisionedGraphError(status: number, errorBody: string): boolean {
  if (status !== 404) {
    return false;
  }

  try {
    const payload = JSON.parse(errorBody) as GraphErrorPayload;
    return payload.error?.code === 'itemNotFound';
  } catch {
    return errorBody.includes('itemNotFound');
  }
}

type GraphDriveItem = {
  id: string;
  name: string;
  file?: { mimeType?: string };
  folder?: Record<string, never>;
  size?: number;
  lastModifiedDateTime?: string;
};

type GraphDriveItemsResponse = {
  value?: GraphDriveItem[];
  '@odata.nextLink'?: string;
};

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(pageSize ?? 20, 1), 50);
}

function escapeGraphSearchQuery(query: string): string {
  return query.replace(/'/g, "''");
}

function resolveOneDriveMimeType(fileName: string, reportedMimeType?: string | null): string {
  const normalizedReported = reportedMimeType?.split(';')[0]?.trim() ?? '';
  return inferMimeType(fileName, normalizedReported);
}

function toFileSummary(item: GraphDriveItem): OneDriveFileSummary | null {
  if (item.folder) {
    return null;
  }

  const reportedMimeType = item.file?.mimeType ?? '';
  return {
    id: item.id,
    name: item.name,
    mimeType: resolveOneDriveMimeType(item.name, reportedMimeType),
    modifiedTime: item.lastModifiedDateTime,
    size: item.size != null ? String(item.size) : undefined,
  };
}

function mapDriveItems(items: GraphDriveItem[]): OneDriveFileSummary[] {
  const files: OneDriveFileSummary[] = [];
  for (const item of items) {
    const summary = toFileSummary(item);
    if (summary) {
      files.push(summary);
    }
  }
  return files;
}

async function graphRequest<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (isOneDriveNotProvisionedGraphError(response.status, errorBody)) {
      throw new Error(ONEDRIVE_NOT_PROVISIONED_ERROR);
    }
    throw new Error(`Microsoft Graph API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

function buildListUrl(pageSize: number): string {
  const params = new URLSearchParams({
    $top: String(pageSize),
    $select: DRIVE_ITEM_SELECT,
  });
  return `${GRAPH_URL}/me/drive/root/children?${params.toString()}`;
}

function buildSearchUrl(query: string, pageSize: number): string {
  const params = new URLSearchParams({
    $top: String(pageSize),
    $select: DRIVE_ITEM_SELECT,
  });
  return `${GRAPH_URL}/me/drive/root/search(q='${escapeGraphSearchQuery(query)}')?${params.toString()}`;
}

export async function searchMicrosoftOneDriveFiles(
  accessToken: string,
  options: OneDriveSearchOptions = {},
): Promise<OneDriveSearchResult> {
  const pageSize = clampPageSize(options.pageSize);
  const url = options.pageToken
    ? options.pageToken
    : options.query?.trim()
      ? buildSearchUrl(options.query.trim(), pageSize)
      : buildListUrl(pageSize);

  const payload = await graphRequest<GraphDriveItemsResponse>(accessToken, url);

  return {
    files: mapDriveItems(payload.value ?? []),
    nextPageToken: payload['@odata.nextLink'],
  };
}

export async function downloadMicrosoftOneDriveFile(
  accessToken: string,
  file: Pick<OneDriveFileSummary, 'id' | 'name' | 'mimeType'>,
): Promise<{ buffer: ArrayBuffer; fileName: string; mimeType: string }> {
  const response = await fetch(
    `${GRAPH_URL}/me/drive/items/${encodeURIComponent(file.id)}/content`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    if (isOneDriveNotProvisionedGraphError(response.status, errorBody)) {
      throw new Error(ONEDRIVE_NOT_PROVISIONED_ERROR);
    }
    throw new Error(`Microsoft OneDrive download failed (${response.status}): ${errorBody}`);
  }

  const buffer = await response.arrayBuffer();
  const mimeType = resolveOneDriveMimeType(file.name, response.headers.get('content-type'));

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

function encodeDrivePath(fileName: string): string {
  return fileName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildDocumentUploadUrl(folderId: string | undefined, fileName: string): string {
  const encodedName = encodeDrivePath(fileName);
  if (folderId?.trim()) {
    return `${GRAPH_URL}/me/drive/items/${encodeURIComponent(folderId.trim())}:/${encodedName}:/content`;
  }
  return `${GRAPH_URL}/me/drive/root:/${encodedName}:/content`;
}

export async function createOneDriveDocument(
  accessToken: string,
  options: CreateOneDriveDocumentOptions,
): Promise<OneDriveDocumentCreated> {
  const fileName = resolveDocumentFileName(options.title);
  const content = normalizeDocumentContent(options.content ?? '');
  const url = buildDocumentUploadUrl(options.folderId, fileName);

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'text/plain',
    },
    body: content,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (isOneDriveNotProvisionedGraphError(response.status, errorBody)) {
      throw new Error(ONEDRIVE_NOT_PROVISIONED_ERROR);
    }
    throw new Error(`Microsoft OneDrive create document failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as OneDriveDocumentCreated;
}
