import { useEffect, useRef } from 'react';
import { isAxiosError } from 'axios';
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
  TCheckUserKeyResponse,
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
  const { scope, catchUpIntervalMs, isCurrentSession } = host;
  const client = useQueryClient();
  const query = useQuery(
    [QueryKeys.mediaCatalog, host.scope],
    async ({ signal }) =>
      current(host, mediaCatalogSchema.parse(await dataService.getMediaCatalog(signal))),
    {
      retry: false,
      refetchInterval: (data) =>
        data?.integrations?.some((item) => item.userKey) ? host.catchUpIntervalMs : false,
      refetchIntervalInBackground: false,
    },
  );
  const processed = useRef(new Map<string, string>());
  const keyNames = JSON.stringify([
    ...new Set(
      query.data?.integrations?.flatMap((item) => (item.userKey ? [item.userKey.keyName] : [])) ??
        [],
    ),
  ]);
  useEffect(() => {
    const names: string[] = JSON.parse(keyNames);
    if (!names.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (!isCurrentSession()) return;
      let delay = Infinity;
      let expired = false;
      for (const name of names) {
        const key = client.getQueryData<TCheckUserKeyResponse | null>([QueryKeys.name, name]);
        const expiry = key?.expiresAt;
        const time = expiry ? new Date(expiry).getTime() : NaN;
        if (!expiry || !Number.isFinite(time) || processed.current.get(name) === expiry) continue;
        if (time <= Date.now()) {
          processed.current.set(name, expiry);
          expired = true;
        } else delay = Math.min(delay, time - Date.now());
      }
      if (expired) void client.invalidateQueries([QueryKeys.mediaCatalog, scope]);
      // The existing catch-up interval also bounds browser timer limits for long expiries.
      if (Number.isFinite(delay)) timer = setTimeout(schedule, Math.min(delay, catchUpIntervalMs));
    };
    schedule();
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event?.query.queryKey[0] === QueryKeys.name) schedule();
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [client, scope, catchUpIntervalMs, isCurrentSession, keyNames]);
  return query;
}
export function useMediaThreads(host: MediaQueryScope, filter: MediaThreadListRequest['filter']) {
  const client = useQueryClient();
  const activity = useRef(true);
  const key = [QueryKeys.mediaThreads, host.scope, filter, 'activity'];
  return useInfiniteQuery(
    key,
    async ({ pageParam, signal }): Promise<MediaThreadPage> => {
      const params = { cursor: pageParam, filter };
      const load = async () => {
        try {
          return await dataService.listMediaThreads(
            { ...params, ...(activity.current ? { include: 'activity' as const } : {}) },
            signal,
          );
        } catch (error) {
          if (!activity.current || !isAxiosError(error) || error.response?.status !== 422)
            throw error;
          // Older servers validate query fields strictly. Keep their original response contract.
          activity.current = false;
          return dataService.listMediaThreads(params, signal);
        }
      };
      const next = current(host, mediaThreadPageSchema.parse(await load()));
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
