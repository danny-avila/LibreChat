import { useRecoilValue } from 'recoil';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, DynamicQueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import { isEphemeralAgent } from '~/common';
import { addFileToCache } from '~/utils';
import store from '~/store';

export const useGetFiles = <TData = t.TFile[] | boolean>(
  config?: UseQueryOptions<t.TFile[], unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery({
    queryKey: [QueryKeys.files],
    queryFn: () => dataService.getFiles(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled
  });
};

export const useGetAgentFiles = <TData = t.TFile[]>(
  agentId: string | undefined,
  config?: UseQueryOptions<t.TFile[], unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery({
    queryKey: DynamicQueryKeys.agentFiles(agentId ?? ''),
    queryFn: () => (agentId ? dataService.getAgentFiles(agentId) : Promise.resolve([]))
  }, {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled && !isEphemeralAgent(agentId),
  });
};

export const useGetFileConfig = <TData = t.FileConfig>(
  config?: UseQueryOptions<t.FileConfig, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.fileConfig],
    queryFn: () => dataService.getFileConfig(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

export const useFileDownload = (userId?: string, file_id?: string): QueryObserverResult<string> => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [QueryKeys.fileDownload, file_id],
    queryFn: async () => {
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

    enabled: false,
    retry: false,
  });
};

export const useCodeOutputDownload = (url = ''): QueryObserverResult<string> => {
  return useQuery({
    queryKey: [QueryKeys.fileDownload, url],
    queryFn: async () => {
      if (!url) {
        console.warn('No user ID provided for file download');
        return;
      }
      const response = await dataService.getCodeOutputDownload(url);
      const blob = response.data;
      const downloadURL = window.URL.createObjectURL(blob);
      return downloadURL;
    },

    enabled: false,
    retry: false,
  });
};
