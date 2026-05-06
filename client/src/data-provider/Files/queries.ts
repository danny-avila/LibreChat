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
  return useQuery<t.TFile[], unknown, TData>([QueryKeys.files], () => dataService.getFiles(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
};

export const useGetAgentFiles = <TData = t.TFile[]>(
  agentId: string | undefined,
  config?: UseQueryOptions<t.TFile[], unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.TFile[], unknown, TData>(
    DynamicQueryKeys.agentFiles(agentId ?? ''),
    () => (agentId ? dataService.getAgentFiles(agentId) : Promise.resolve([])),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled && !isEphemeralAgent(agentId),
    },
  );
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

/**
 * Poll the lifecycle of an inline file preview while background HTML
 * extraction runs.
 *
 * Caller wires `enabled` to `attachment.status === 'pending'` so the
 * query is dormant for terminal-status records. Once enabled, React
 * Query's `refetchInterval` runs at 2.5s while the server keeps
 * returning `'pending'`, then auto-stops on the first `'ready'` /
 * `'failed'` response. Idle by default.
 *
 * Cache key: `[QueryKeys.filePreview, file_id]`. Sibling components
 * watching the same `file_id` get a single shared poller.
 */
export const useFilePreview = (
  file_id: string | undefined,
  config?: UseQueryOptions<t.TFilePreview, unknown, t.TFilePreview>,
): QueryObserverResult<t.TFilePreview, unknown> => {
  return useQuery<t.TFilePreview, unknown, t.TFilePreview>(
    [QueryKeys.filePreview, file_id],
    () => dataService.getFilePreview(file_id ?? ''),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      /* Note: `refetchOnMount` left at the React Query default (`true`)
       * so a freshly-mounted observer with stale cached data refetches.
       * Cross-turn filename reuse keeps the same `file_id`; the cache
       * may hold a prior turn's `'ready'` payload. `useAttachmentHandler`
       * removes the entry on every new attachment for safety, but this
       * default is the second line of defense — without it, an observer
       * that mounts before the handler runs would read the stale cache
       * and `refetchInterval` would never start polling. (Codex P1
       * round-3 review on PR #12957.) */
      retry: false,
      /* Function form: poll only while the server says 'pending'.
       * Returning `false` disables the interval, so a single 'ready'
       * or 'failed' response naturally terminates polling without the
       * caller having to also flip `enabled`. */
      refetchInterval: (data) => (data?.status === 'pending' ? 2500 : false),
      ...config,
      enabled: !!file_id && (config?.enabled ?? true),
    },
  );
};
