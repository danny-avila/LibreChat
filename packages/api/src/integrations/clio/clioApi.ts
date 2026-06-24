import { inferMimeType } from 'librechat-data-provider';

export interface ClioDocumentSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface ClioSearchResult {
  files: ClioDocumentSummary[];
  nextPageToken?: string;
}

export interface ClioSearchOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

const CLIO_API_URL = 'https://app.clio.com/api/v4';
const DOCUMENT_FIELDS = 'id,name,filename,content_type,size,updated_at';

type ClioDocument = {
  id: number;
  name?: string;
  filename?: string;
  content_type?: string;
  size?: number;
  updated_at?: string;
};

type ClioDocumentsResponse = {
  data?: ClioDocument[];
  meta?: {
    paging?: {
      next?: string;
    };
  };
};

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(pageSize ?? 20, 1), 200);
}

function resolveClioMimeType(fileName: string, reportedMimeType?: string | null): string {
  const normalizedReported = reportedMimeType?.split(';')[0]?.trim() ?? '';
  return inferMimeType(fileName, normalizedReported);
}

function toFileSummary(document: ClioDocument): ClioDocumentSummary {
  const fileName = document.filename?.trim() || document.name?.trim() || `document-${document.id}`;

  return {
    id: String(document.id),
    name: fileName,
    mimeType: resolveClioMimeType(fileName, document.content_type),
    modifiedTime: document.updated_at,
    size: document.size != null ? String(document.size) : undefined,
  };
}

function buildDocumentsUrl(options: ClioSearchOptions): string {
  if (options.pageToken?.startsWith('http')) {
    return options.pageToken;
  }

  const params = new URLSearchParams({
    fields: DOCUMENT_FIELDS,
    limit: String(clampPageSize(options.pageSize)),
    order: 'updated_at(desc)',
  });

  if (options.pageToken) {
    params.set('page_token', options.pageToken);
  }

  const query = options.query?.trim();
  if (query) {
    params.set('query', query);
  }

  return `${CLIO_API_URL}/documents.json?${params.toString()}`;
}

async function clioApiGet(accessToken: string, url: string): Promise<ClioDocumentsResponse> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Clio API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<ClioDocumentsResponse>;
}

export async function searchClioDocuments(
  accessToken: string,
  options: ClioSearchOptions = {},
): Promise<ClioSearchResult> {
  const payload = await clioApiGet(accessToken, buildDocumentsUrl(options));

  return {
    files: (payload.data ?? []).map(toFileSummary),
    nextPageToken: payload.meta?.paging?.next,
  };
}

export async function downloadClioDocument(
  accessToken: string,
  file: Pick<ClioDocumentSummary, 'id' | 'name' | 'mimeType'>,
): Promise<{ buffer: ArrayBuffer; fileName: string; mimeType: string }> {
  const response = await fetch(
    `${CLIO_API_URL}/documents/${encodeURIComponent(file.id)}/download.json`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      redirect: 'follow',
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Clio download failed (${response.status}): ${errorBody}`);
  }

  const buffer = await response.arrayBuffer();
  const mimeType = resolveClioMimeType(file.name, response.headers.get('content-type'));

  return {
    buffer,
    fileName: file.name,
    mimeType,
  };
}
