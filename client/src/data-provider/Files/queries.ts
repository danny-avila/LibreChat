import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import { addFileToCache } from '~/utils';
import store from '~/store';

export const useGetFiles = <TData = t.TFile[] | boolean>(
  config?: UseQueryOptions<t.TFile[], unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.TFile[], unknown, TData>([QueryKeys.files], () => dataService.getFiles(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
};

export const useGetFileConfig = <TData = t.FileConfig>(
  config?: UseQueryOptions<t.FileConfig, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  return useQuery<t.FileConfig, unknown, TData>(
    [QueryKeys.fileConfig],
    () => dataService.getFileConfig(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useFileDownload = (userId?: string, file_id?: string): QueryObserverResult<string> => {
  const queryClient = useQueryClient();
  return useQuery(
    [QueryKeys.fileDownload, file_id],
    async () => {
      if (!userId || !file_id) {
        console.warn('No user ID provided for file download');
        return;
      }
      const response = await dataService.getFileDownload(userId, file_id);
      const blob = response.data;
      const downloadURL = window.URL.createObjectURL(blob);
      try {
        const metadata: t.TFile | undefined = JSON.parse(response.headers['x-file-metadata']);
        if (!metadata) {
          console.warn('No metadata found for file download', response.headers);
          return downloadURL;
        }

        addFileToCache(queryClient, metadata);
      } catch (e) {
        console.error('Error parsing file metadata, skipped updating file query cache', e);
      }

      return downloadURL;
    },
    {
      enabled: false,
      retry: false,
    },
  );
};

export const useCodeOutputDownload = (url = ''): QueryObserverResult<string> => {
  return useQuery(
    [QueryKeys.fileDownload, url],
    async () => {
      if (!url) {
        console.warn('No user ID provided for file download');
        return;
      }
      const response = await dataService.getCodeOutputDownload(url);
      const blob = response.data;
      const downloadURL = window.URL.createObjectURL(blob);
      return downloadURL;
    },
    {
      enabled: false,
      retry: false,
    },
  );
};
