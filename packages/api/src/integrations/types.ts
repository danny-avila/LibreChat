export interface IntegrationAttachedFile {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface IntegrationFilesDownloadResponse {
  files: IntegrationAttachedFile[];
}

export interface IntegrationFileDownloadRequest {
  files: Array<{ id: string; name: string; mimeType: string }>;
}

export interface IntegrationMessagesAttachRequest {
  messageIds: string[];
}

export interface IntegrationEventsAttachRequest {
  eventIds: string[];
}
