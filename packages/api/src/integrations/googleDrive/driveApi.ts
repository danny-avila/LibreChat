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
  const mimeType =
    exportConfig?.mimeType ?? response.headers.get('content-type') ?? 'application/octet-stream';

  return { buffer, fileName, mimeType };
}
