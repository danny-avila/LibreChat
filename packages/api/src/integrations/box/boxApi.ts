import { inferMimeType } from 'librechat-data-provider';

export interface BoxFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface BoxSearchResult {
  files: BoxFileSummary[];
  nextPageToken?: string;
}

export interface BoxSearchOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

const BOX_API_URL = 'https://api.box.com/2.0';
const BOX_FOLDER_FIELDS = 'id,name,type,size,modified_at';

type BoxItemEntry = {
  type: 'file' | 'folder';
  id: string;
  name: string;
  modified_at?: string;
  size?: number;
};

type BoxFolderItemsResponse = {
  entries?: BoxItemEntry[];
  next_marker?: string;
};

type BoxSearchResponse = {
  entries?: BoxItemEntry[];
  offset?: number;
  limit?: number;
  total_count?: number;
};

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(pageSize ?? 20, 1), 50);
}

function resolveBoxMimeType(fileName: string, reportedMimeType?: string | null): string {
  const normalizedReported = reportedMimeType?.split(';')[0]?.trim() ?? '';
  return inferMimeType(fileName, normalizedReported);
}

function toFileSummary(entry: BoxItemEntry): BoxFileSummary {
  return {
    id: entry.id,
    name: entry.name,
    mimeType: resolveBoxMimeType(entry.name),
    modifiedTime: entry.modified_at,
    size: entry.size != null ? String(entry.size) : undefined,
  };
}

function mapFileEntries(entries: BoxItemEntry[]): BoxFileSummary[] {
  const files: BoxFileSummary[] = [];
  for (const entry of entries) {
    if (entry.type === 'file') {
      files.push(toFileSummary(entry));
    }
  }
  return files;
}

async function boxApiGet<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${BOX_API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Box API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

async function listBoxRootFolder(
  accessToken: string,
  options: BoxSearchOptions,
): Promise<BoxSearchResult> {
  const pageSize = clampPageSize(options.pageSize);
  const params = new URLSearchParams({
    limit: String(pageSize),
    usemarker: 'true',
    fields: BOX_FOLDER_FIELDS,
  });

  if (options.pageToken) {
    params.set('marker', options.pageToken);
  }

  const payload = await boxApiGet<BoxFolderItemsResponse>(
    accessToken,
    `/folders/0/items?${params.toString()}`,
  );

  return {
    files: mapFileEntries(payload.entries ?? []),
    nextPageToken: payload.next_marker,
  };
}

async function searchBoxWithQuery(
  accessToken: string,
  options: BoxSearchOptions,
): Promise<BoxSearchResult> {
  const pageSize = clampPageSize(options.pageSize);
  const offset = options.pageToken ? Number(options.pageToken) : 0;
  const params = new URLSearchParams({
    query: options.query?.trim() ?? '',
    type: 'file',
    limit: String(pageSize),
    offset: String(Number.isFinite(offset) ? offset : 0),
    fields: BOX_FOLDER_FIELDS,
  });

  const payload = await boxApiGet<BoxSearchResponse>(accessToken, `/search?${params.toString()}`);

  const nextOffset = offset + (payload.entries?.length ?? 0);
  const totalCount = payload.total_count ?? 0;
  const hasMore = nextOffset < totalCount;

  return {
    files: mapFileEntries(payload.entries ?? []),
    nextPageToken: hasMore ? String(nextOffset) : undefined,
  };
}

export async function searchBoxFiles(
  accessToken: string,
  options: BoxSearchOptions = {},
): Promise<BoxSearchResult> {
  const query = options.query?.trim();
  if (query && query.length >= 3) {
    return searchBoxWithQuery(accessToken, options);
  }
  return listBoxRootFolder(accessToken, options);
}

export async function downloadBoxFile(
  accessToken: string,
  file: Pick<BoxFileSummary, 'id' | 'name' | 'mimeType'>,
): Promise<{ buffer: ArrayBuffer; fileName: string; mimeType: string }> {
  const response = await fetch(`${BOX_API_URL}/files/${encodeURIComponent(file.id)}/content`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Box download failed (${response.status}): ${errorBody}`);
  }

  const buffer = await response.arrayBuffer();
  const mimeType = resolveBoxMimeType(file.name, response.headers.get('content-type'));

  return {
    buffer,
    fileName: file.name,
    mimeType,
  };
}
