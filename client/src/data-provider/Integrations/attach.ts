import { useMutation, useQuery, UseMutationResult, UseQueryOptions } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';

export const useGoogleDriveFilesQuery = (
  params: { query?: string; pageToken?: string; pageSize?: number; enabled?: boolean },
  config?: UseQueryOptions<t.GoogleDriveSearchResponse>,
) => {
  const { enabled = true, ...searchParams } = params;
  return useQuery<t.GoogleDriveSearchResponse>(
    [QueryKeys.integrations, 'google-drive', 'files', searchParams],
    () => dataService.searchIntegrationFiles('google-drive', searchParams),
    {
      enabled,
      staleTime: 30 * 1000,
      keepPreviousData: true,
      ...config,
    },
  );
};

export const useGmailMessagesQuery = (
  params: { query?: string; pageToken?: string; pageSize?: number; enabled?: boolean },
  config?: UseQueryOptions<t.GmailSearchResponse>,
) => {
  const { enabled = true, ...searchParams } = params;
  return useQuery<t.GmailSearchResponse>(
    [QueryKeys.integrations, 'google-mail', 'messages', searchParams],
    () => dataService.searchIntegrationMessages('google-mail', searchParams),
    {
      enabled,
      staleTime: 30 * 1000,
      keepPreviousData: true,
      ...config,
    },
  );
};

export const useGoogleCalendarEventsQuery = (
  params: {
    query?: string;
    pageToken?: string;
    pageSize?: number;
    timeMin?: string;
    timeMax?: string;
    enabled?: boolean;
  },
  config?: UseQueryOptions<t.GoogleCalendarListResponse>,
) => {
  const { enabled = true, ...searchParams } = params;
  return useQuery<t.GoogleCalendarListResponse>(
    [QueryKeys.integrations, 'google-calendar', 'events', searchParams],
    () => dataService.listIntegrationEvents('google-calendar', searchParams),
    {
      enabled,
      staleTime: 30 * 1000,
      keepPreviousData: true,
      ...config,
    },
  );
};

export const useDownloadGoogleDriveFilesMutation = (): UseMutationResult<
  t.IntegrationFilesDownloadResponse,
  Error,
  Array<{ id: string; name: string; mimeType: string }>
> => {
  return useMutation((files) => dataService.downloadIntegrationFiles('google-drive', files));
};

export const useDropboxFilesQuery = (
  params: { query?: string; pageToken?: string; pageSize?: number; enabled?: boolean },
  config?: UseQueryOptions<t.GoogleDriveSearchResponse>,
) => {
  const { enabled = true, ...searchParams } = params;
  return useQuery<t.GoogleDriveSearchResponse>(
    [QueryKeys.integrations, 'dropbox', 'files', searchParams],
    () => dataService.searchIntegrationFiles('dropbox', searchParams),
    {
      enabled,
      staleTime: 30 * 1000,
      keepPreviousData: true,
      ...config,
    },
  );
};

export const useDownloadDropboxFilesMutation = (): UseMutationResult<
  t.IntegrationFilesDownloadResponse,
  Error,
  Array<{ id: string; name: string; mimeType: string }>
> => {
  return useMutation((files) => dataService.downloadIntegrationFiles('dropbox', files));
};

export const useBoxFilesQuery = (
  params: { query?: string; pageToken?: string; pageSize?: number; enabled?: boolean },
  config?: UseQueryOptions<t.GoogleDriveSearchResponse>,
) => {
  const { enabled = true, ...searchParams } = params;
  return useQuery<t.GoogleDriveSearchResponse>(
    [QueryKeys.integrations, 'box', 'files', searchParams],
    () => dataService.searchIntegrationFiles('box', searchParams),
    {
      enabled,
      staleTime: 30 * 1000,
      keepPreviousData: true,
      ...config,
    },
  );
};

export const useDownloadBoxFilesMutation = (): UseMutationResult<
  t.IntegrationFilesDownloadResponse,
  Error,
  Array<{ id: string; name: string; mimeType: string }>
> => {
  return useMutation((files) => dataService.downloadIntegrationFiles('box', files));
};

export const useClioDocumentsQuery = (
  params: { query?: string; pageToken?: string; pageSize?: number; enabled?: boolean },
  config?: UseQueryOptions<t.GoogleDriveSearchResponse>,
) => {
  const { enabled = true, ...searchParams } = params;
  return useQuery<t.GoogleDriveSearchResponse>(
    [QueryKeys.integrations, 'clio', 'files', searchParams],
    () => dataService.searchIntegrationFiles('clio', searchParams),
    {
      enabled,
      staleTime: 30 * 1000,
      keepPreviousData: true,
      ...config,
    },
  );
};

export const useDownloadClioDocumentsMutation = (): UseMutationResult<
  t.IntegrationFilesDownloadResponse,
  Error,
  Array<{ id: string; name: string; mimeType: string }>
> => {
  return useMutation((files) => dataService.downloadIntegrationFiles('clio', files));
};

export const useMicrosoftOneDriveFilesQuery = (
  params: { query?: string; pageToken?: string; pageSize?: number; enabled?: boolean },
  config?: UseQueryOptions<t.GoogleDriveSearchResponse>,
) => {
  const { enabled = true, ...searchParams } = params;
  return useQuery<t.GoogleDriveSearchResponse>(
    [QueryKeys.integrations, 'microsoft', 'files', searchParams],
    () => dataService.searchIntegrationFiles('microsoft', searchParams),
    {
      enabled,
      staleTime: 30 * 1000,
      keepPreviousData: true,
      ...config,
    },
  );
};

export const useDownloadMicrosoftOneDriveFilesMutation = (): UseMutationResult<
  t.IntegrationFilesDownloadResponse,
  Error,
  Array<{ id: string; name: string; mimeType: string }>
> => {
  return useMutation((files) => dataService.downloadIntegrationFiles('microsoft', files));
};

export const useAttachGmailMessagesMutation = (): UseMutationResult<
  t.IntegrationFilesDownloadResponse,
  Error,
  string[]
> => {
  return useMutation((messageIds) =>
    dataService.attachIntegrationMessages('google-mail', messageIds),
  );
};

export const useAttachGoogleCalendarEventsMutation = (): UseMutationResult<
  t.IntegrationFilesDownloadResponse,
  Error,
  string[]
> => {
  return useMutation((eventIds) =>
    dataService.attachIntegrationEvents('google-calendar', eventIds),
  );
};

export const useMicrosoftOutlookMessagesQuery = (
  params: { query?: string; pageToken?: string; pageSize?: number; enabled?: boolean },
  config?: UseQueryOptions<t.GmailSearchResponse>,
) => {
  const { enabled = true, ...searchParams } = params;
  return useQuery<t.GmailSearchResponse>(
    [QueryKeys.integrations, 'microsoft', 'messages', searchParams],
    () => dataService.searchIntegrationMessages('microsoft', searchParams),
    {
      enabled,
      staleTime: 30 * 1000,
      keepPreviousData: true,
      ...config,
    },
  );
};

export const useMicrosoftOutlookCalendarEventsQuery = (
  params: {
    query?: string;
    pageToken?: string;
    pageSize?: number;
    timeMin?: string;
    timeMax?: string;
    enabled?: boolean;
  },
  config?: UseQueryOptions<t.GoogleCalendarListResponse>,
) => {
  const { enabled = true, ...searchParams } = params;
  return useQuery<t.GoogleCalendarListResponse>(
    [QueryKeys.integrations, 'microsoft', 'events', searchParams],
    () => dataService.listIntegrationEvents('microsoft', searchParams),
    {
      enabled,
      staleTime: 30 * 1000,
      keepPreviousData: true,
      ...config,
    },
  );
};

export const useAttachMicrosoftOutlookMessagesMutation = (): UseMutationResult<
  t.IntegrationFilesDownloadResponse,
  Error,
  string[]
> => {
  return useMutation((messageIds) =>
    dataService.attachIntegrationMessages('microsoft', messageIds),
  );
};

export const useAttachMicrosoftOutlookCalendarEventsMutation = (): UseMutationResult<
  t.IntegrationFilesDownloadResponse,
  Error,
  string[]
> => {
  return useMutation((eventIds) => dataService.attachIntegrationEvents('microsoft', eventIds));
};
