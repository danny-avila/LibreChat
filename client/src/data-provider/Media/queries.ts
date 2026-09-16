import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dataService,
  QueryKeys,
  mediaCatalogSchema,
  mediaThreadDetailSchema,
  mediaThreadPageSchema,
} from 'librechat-data-provider';
import type {
  MediaThreadDetail,
  MediaThreadPage,
  MediaThreadListRequest,
} from 'librechat-data-provider';
import { newerMediaSnapshot } from './reconcile';

export type MediaQueryScope = {
  scope: string;
  pollIntervalMs: number;
  catchUpIntervalMs: number;
  isCurrentSession: () => boolean;
};
const current = <T>(host: MediaQueryScope, value: T): T => {
  if (!host.isCurrentSession()) throw new Error('Session ended');
  return value;
};
export function useMediaCatalog(host: MediaQueryScope) {
  return useQuery(
    [QueryKeys.mediaCatalog, host.scope],
    async ({ signal }) =>
      current(host, mediaCatalogSchema.parse(await dataService.getMediaCatalog(signal))),
    { retry: false },
  );
}
export function useMediaThreads(host: MediaQueryScope, filter: MediaThreadListRequest['filter']) {
  const client = useQueryClient();
  const key = [QueryKeys.mediaThreads, host.scope, filter];
  return useInfiniteQuery(
    key,
    async ({ pageParam, signal }): Promise<MediaThreadPage> => {
      const next = current(
        host,
        mediaThreadPageSchema.parse(
          await dataService.listMediaThreads({ cursor: pageParam, filter }, signal),
        ),
      );
      const previous = client.getQueryData<{ pages: MediaThreadPage[] }>(key);
      const old = new Map(
        previous?.pages.flatMap((page) => page.items).map((thread) => [thread.threadId, thread]),
      );
      return {
        ...next,
        items: next.items.map((thread) => newerMediaSnapshot(old.get(thread.threadId), thread)),
      };
    },
    {
      getNextPageParam: (page) => page.nextCursor,
      refetchInterval: (data) =>
        data?.pages.some((page) => page.items.some((thread) => thread.pendingJobCount > 0))
          ? host.pollIntervalMs
          : host.catchUpIntervalMs,
      refetchIntervalInBackground: false,
      retry: false,
    },
  );
}
export function useMediaThread(host: MediaQueryScope, threadId?: string, preparing = false) {
  const client = useQueryClient();
  const key = [QueryKeys.mediaThread, host.scope, threadId];
  return useQuery(
    key,
    async ({ signal }): Promise<MediaThreadDetail> => {
      const next = current(
        host,
        mediaThreadDetailSchema.parse(await dataService.getMediaThread(threadId!, signal)),
      );
      const previous = client.getQueryData<MediaThreadDetail>(key);
      if (previous && previous.thread.version > next.thread.version) return previous;
      const turns = new Map(previous?.turns.items.map((turn) => [turn.turnId, turn]));
      return {
        ...next,
        turns: {
          ...next.turns,
          items: next.turns.items.map((turn) => newerMediaSnapshot(turns.get(turn.turnId), turn)),
        },
      };
    },
    {
      enabled: !!threadId,
      refetchInterval: (data) =>
        preparing || (data?.thread.pendingJobCount ?? 0) > 0
          ? host.pollIntervalMs
          : host.catchUpIntervalMs,
      refetchIntervalInBackground: false,
      retry: false,
    },
  );
}
export function invalidateMedia(client: ReturnType<typeof useQueryClient>, scope: string) {
  return Promise.all([
    client.invalidateQueries([QueryKeys.mediaThreads, scope]),
    client.invalidateQueries([QueryKeys.mediaThread, scope]),
    client.invalidateQueries([QueryKeys.mediaTurns, scope]),
    client.invalidateQueries([QueryKeys.mediaTurnJobs, scope]),
    client.invalidateQueries([QueryKeys.mediaJobOutputs, scope]),
  ]);
}
