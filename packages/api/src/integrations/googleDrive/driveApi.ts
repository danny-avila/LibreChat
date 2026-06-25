import { inferMimeType } from 'librechat-data-provider';

export interface GoogleDriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string;
}

export interface GoogleDriveSearchResult {
  files: GoogleDriveFileSummary[];
  nextPageToken?: string;
}

export interface GoogleDriveSearchOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface CreateGoogleDriveDocumentOptions {
  title: string;
  content: string;
  folderId?: string;
}

export interface GoogleDriveDocumentCreated {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const MAX_DOCUMENT_CONTENT_CHARS = 500_000;

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

const GOOGLE_APPS_EXPORT_MIME: Record<string, { mimeType: string; extension: string }> = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/pdf',
    extension: '.pdf',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: '.xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: '.pptx',
  },
};

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildDriveListQuery(searchQuery?: string): string {
  if (!searchQuery?.trim()) {
    return 'trashed=false';
  }
  return `trashed=false and (${searchQuery.trim()})`;
}

export async function searchGoogleDriveFiles(
  accessToken: string,
  options: GoogleDriveSearchOptions = {},
): Promise<GoogleDriveSearchResult> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 10, 1), 50);
  const params = new URLSearchParams({
    pageSize: String(pageSize),
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,size)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    orderBy: 'modifiedTime desc',
    q: buildDriveListQuery(options.query),
  });

  if (options.pageToken) {
    params.set('pageToken', options.pageToken);
  }

  const response = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    files?: GoogleDriveFileSummary[];
    nextPageToken?: string;
  };

  return {
    files: payload.files ?? [],
    nextPageToken: payload.nextPageToken,
  };
}

export function buildGoogleDriveFullTextQuery(searchTerm: string): string {
  const trimmed = searchTerm.trim();
  if (!trimmed) {
    return '';
  }
  return `fullText contains '${escapeDriveQueryValue(trimmed)}'`;
}

function resolveGoogleDriveMimeType(fileName: string, reportedMimeType?: string | null): string {
  const normalizedReported = reportedMimeType?.split(';')[0]?.trim() ?? '';
  return inferMimeType(fileName, normalizedReported);
}

export async function downloadGoogleDriveFile(
  accessToken: string,
  file: Pick<GoogleDriveFileSummary, 'id' | 'name' | 'mimeType'>,
): Promise<{ buffer: ArrayBuffer; fileName: string; mimeType: string }> {
  const exportConfig = GOOGLE_APPS_EXPORT_MIME[file.mimeType];
  const url = exportConfig
    ? `${DRIVE_FILES_URL}/${file.id}/export?mimeType=${encodeURIComponent(exportConfig.mimeType)}`
    : `${DRIVE_FILES_URL}/${file.id}?alt=media`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive download failed (${response.status}): ${body}`);
  }

  const buffer = await response.arrayBuffer();
  const fileName = exportConfig ? `${file.name}${exportConfig.extension}` : file.name;
  const reportedMimeType =
    exportConfig?.mimeType ?? response.headers.get('content-type') ?? file.mimeType ?? '';
  const mimeType = resolveGoogleDriveMimeType(fileName, reportedMimeType);

  return { buffer, fileName, mimeType };
}

function normalizeDocumentTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || 'Untitled document';
}

function normalizeDocumentContent(content: string): string {
  if (content.length <= MAX_DOCUMENT_CONTENT_CHARS) {
    return content;
  }
  return content.slice(0, MAX_DOCUMENT_CONTENT_CHARS);
}

export async function createGoogleDriveDocument(
  accessToken: string,
  options: CreateGoogleDriveDocumentOptions,
): Promise<GoogleDriveDocumentCreated> {
  const name = normalizeDocumentTitle(options.title);
  const content = normalizeDocumentContent(options.content ?? '');

  const createParams = new URLSearchParams({
    fields: 'id,name,mimeType,webViewLink',
  });

  const createBody: { name: string; mimeType: string; parents?: string[] } = {
    name,
    mimeType: GOOGLE_DOC_MIME,
  };
  if (options.folderId?.trim()) {
    createBody.parents = [options.folderId.trim()];
  }

  const createResponse = await fetch(`${DRIVE_FILES_URL}?${createParams.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createBody),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Google Drive create document failed (${createResponse.status}): ${body}`);
  }

  const created = (await createResponse.json()) as GoogleDriveDocumentCreated;

  if (content) {
    const docsResponse = await fetch(
      `https://docs.googleapis.com/v1/documents/${created.id}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        }),
      },
    );

    if (!docsResponse.ok) {
      const body = await docsResponse.text();
      throw new Error(`Google Docs update failed (${docsResponse.status}): ${body}`);
    }
  }

  return created;
}

const GOOGLE_APPS_TEXT_EXPORT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

const TEXTUAL_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/rtf',
  'application/csv',
  'application/javascript',
]);

const MAX_READ_CONTENT_CHARS = 50_000;

export interface GoogleDriveFileContent {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string;
  content: string;
  truncated: boolean;
  note?: string;
}

function isTextualMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || TEXTUAL_MIME_TYPES.has(mimeType);
}

export async function getGoogleDriveFileMetadata(
  accessToken: string,
  fileId: string,
): Promise<GoogleDriveFileSummary> {
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,webViewLink,modifiedTime,size',
    supportsAllDrives: 'true',
  });

  const response = await fetch(`${DRIVE_FILES_URL}/${fileId}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${body}`);
  }

  return (await response.json()) as GoogleDriveFileSummary;
}

export async function readGoogleDriveFileAsText(
  accessToken: string,
  fileId: string,
): Promise<GoogleDriveFileContent> {
  const metadata = await getGoogleDriveFileMetadata(accessToken, fileId);
  const exportMimeType = GOOGLE_APPS_TEXT_EXPORT[metadata.mimeType];
  const readableAsText = Boolean(exportMimeType) || isTextualMimeType(metadata.mimeType);

  if (!readableAsText) {
    return {
      ...metadata,
      content: '',
      truncated: false,
      note: `This file type (${metadata.mimeType}) cannot be read as text. Use the attach menu to add it to the conversation instead.`,
    };
  }

  const url = exportMimeType
    ? `${DRIVE_FILES_URL}/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`
    : `${DRIVE_FILES_URL}/${fileId}?alt=media&supportsAllDrives=true`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive read failed (${response.status}): ${body}`);
  }

  const rawText = await response.text();
  const truncated = rawText.length > MAX_READ_CONTENT_CHARS;
  const content = truncated ? rawText.slice(0, MAX_READ_CONTENT_CHARS) : rawText;

  return {
    ...metadata,
    content,
    truncated,
  };
}
