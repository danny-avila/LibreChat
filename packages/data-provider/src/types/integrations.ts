export type IntegrationConnectionStatus =
  | 'connected'
  | 'not_connected'
  | 'expired'
  | 'revoked'
  | 'disabled';

export type IntegrationProviderKey =
  | 'google-drive'
  | 'google-mail'
  | 'google-calendar'
  | 'microsoft'
  | 'dropbox'
  | 'box'
  | 'clio'
  | 'quickbooks';

export interface IntegrationProviderStatus {
  providerKey: IntegrationProviderKey;
  nangoIntegrationId: string;
  labelKey: string;
  icon: string;
  enabled: boolean;
  status: IntegrationConnectionStatus;
  connectionId?: string;
  connectedAt?: string;
  updatedAt?: string;
}

export interface IntegrationsListResponse {
  integrations: IntegrationProviderStatus[];
}

export interface IntegrationStatusResponse {
  integration: IntegrationProviderStatus;
}

export interface IntegrationConnectSessionResponse {
  sessionToken: string;
  expiresAt?: string;
  /** Connect UI iframe base URL — use this instead of startup config when present. */
  connectUrl: string;
}

export interface IntegrationSyncResponse {
  providerKey: IntegrationProviderKey;
  status: IntegrationConnectionStatus;
  connectionId: string;
}

export interface GoogleDriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string;
}

export interface GoogleDriveSearchResponse {
  files: GoogleDriveFileSummary[];
  nextPageToken?: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export interface GmailSearchResponse {
  messages: GmailMessageSummary[];
  nextPageToken?: string;
}

export interface GoogleCalendarEventSummary {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  htmlLink?: string;
}

export interface GoogleCalendarListResponse {
  events: GoogleCalendarEventSummary[];
  nextPageToken?: string;
}

export interface IntegrationAttachedFile {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface IntegrationFilesDownloadResponse {
  files: IntegrationAttachedFile[];
}

export function isIntegrationConnected(status: IntegrationConnectionStatus): boolean {
  return status === 'connected';
}

export function needsIntegrationReconnect(status: IntegrationConnectionStatus): boolean {
  return status === 'expired' || status === 'revoked';
}
