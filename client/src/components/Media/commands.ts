import { useCallback, useEffect, useState, useRef } from 'react';
import { useAtom, useStore } from 'jotai';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  dataService,
  QueryKeys,
  mediaSubmissionReceiptSchema,
  mediaImportReceiptSchema,
  mediaErrorSchema,
} from 'librechat-data-provider';
import type { MediaErrorCode } from 'librechat-data-provider';
import type { UseQueryOptions } from '@tanstack/react-query';
import type { MediaReceipt } from '~/data-provider/Media';
import type { PendingMedia } from './state';
import {
  invalidateMedia,
  mayClearMediaDraft,
  useMediaCommandMutations,
} from '~/data-provider/Media';
import { emptyDraft, mediaDraftFamily, mediaPendingFamily } from './state';
import { useMediaHost } from './host';

export function mediaErrorCode(error: unknown): MediaErrorCode {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response;
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = response.data;
      if (typeof data === 'object' && data !== null && 'error' in data) {
        const parsed = mediaErrorSchema.safeParse(data.error);
        if (parsed.success) return parsed.data.code;
      }
    }
  }
  return 'internal_error';
}
function definitiveRejection(error: unknown) {
  if (typeof error !== 'object' || error === null || !('response' in error)) return false;
  const response = error.response;
  if (typeof response !== 'object' || response === null || !('status' in response)) return false;
  return typeof response.status === 'number' && response.status >= 400 && response.status < 500;
}
const receiptKey = (scope: string, pending: PendingMedia) => [
  pending.kind === 'import' ? QueryKeys.mediaImport : QueryKeys.mediaSubmission,
  scope,
  pending.request.clientRequestId,
];
/** A receipt polls quickly until it settles. A server that answers "no such request" is not
 * going to change its mind, so the loop stops and leaves the entry to be recovered or dismissed;
 * an outage backs off to the catch-up cadence instead of hammering at the poll rate. */
export function receiptInterval(
  data: MediaReceipt | undefined,
  error: unknown,
  intervals: { pollIntervalMs: number; catchUpIntervalMs: number },
): number | false {
  if (data) return data.phase === 'preparing' ? intervals.pollIntervalMs : false;
  if (!error) return intervals.pollIntervalMs;
  return definitiveRejection(error) ? false : intervals.catchUpIntervalMs;
}
export function useMediaCommands(visibleThreadIds: string[]) {
  const host = useMediaHost();
  const client = useQueryClient();
  const store = useStore();
  const { submit, retry, importMedia } = useMediaCommandMutations(host);
  const { mutateAsync: submitAsync } = submit;
  const { mutateAsync: retryAsync } = retry;
  const { mutateAsync: importAsync } = importMedia;
  const [pending, setPending] = useAtom(mediaPendingFamily(host.scope));
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<MediaErrorCode>();
  const observed = useRef(new Map<string, MediaReceipt['phase']>());
  const queries: UseQueryOptions<MediaReceipt, unknown, MediaReceipt, string[]>[] = pending.map(
    (command) => ({
      queryKey: receiptKey(host.scope, command),
      queryFn: async ({ signal }): Promise<MediaReceipt> => {
        const receipt =
          command.kind === 'import'
            ? mediaImportReceiptSchema.parse(
                await dataService.getMediaImport(command.request.clientRequestId, signal),
              )
            : mediaSubmissionReceiptSchema.parse(
                await dataService.getMediaSubmission(command.request.clientRequestId, signal),
              );
        if (!host.isCurrentSession()) throw new Error('Session ended');
        return receipt;
      },
      retry: false,
      refetchInterval: (data, query) => receiptInterval(data, query.state.error, host),
      refetchIntervalInBackground: false,
    }),
  );
  const receipts = useQueries({ queries });
  const send = useCallback(
    async (command: PendingMedia): Promise<MediaReceipt | undefined> => {
      if (!host.canCreate || !host.isCurrentSession()) return undefined;
      const id = command.request.clientRequestId;
      setPending((previous) =>
        previous.some((p) => p.request.clientRequestId === id) ? previous : [...previous, command],
      );
      setSending((previous) => new Set(previous).add(id));
      setError(undefined);
      try {
        let receipt: MediaReceipt;
        if (command.kind === 'submission') receipt = await submitAsync(command.request);
        else if (command.kind === 'retry')
          receipt = await retryAsync({ jobId: command.jobId, request: command.request });
        else receipt = await importAsync(command.request);
        if (!host.isCurrentSession()) return undefined;
        const carried =
          command.kind === 'submission' && !command.request.threadId && receipt.phase !== 'rejected'
            ? store.get(mediaDraftFamily(command.draftKey)).compare
            : undefined;
        if (carried) {
          const target = mediaDraftFamily(`${host.scope}:${receipt.threadId}`);
          const current = store.get(target);
          store.set(target, { ...current, compare: carried, revision: current.revision + 1 });
        }
        client.setQueryData(receiptKey(host.scope, command), receipt);
        if (receipt.phase === 'rejected') setError(receipt.error.code);
        else if (command.kind !== 'retry' && !command.request.threadId)
          host.openThread(receipt.threadId);
        return receipt;
      } catch (failure) {
        if (host.isCurrentSession()) {
          setError(mediaErrorCode(failure));
          // A rejected command preserves its editable draft. A lost response keeps its identity.
          if (definitiveRejection(failure))
            setPending((previous) =>
              previous.filter((item) => item.request.clientRequestId !== id),
            );
          else void client.invalidateQueries(receiptKey(host.scope, command));
        }
        return undefined;
      } finally {
        if (host.isCurrentSession())
          setSending((previous) => {
            const next = new Set(previous);
            next.delete(id);
            return next;
          });
      }
    },
    [host, client, setPending, store, submitAsync, retryAsync, importAsync],
  );
  useEffect(() => {
    if (!host.isCurrentSession()) return;
    const published = new Set<string>();
    pending.forEach((command, index) => {
      const receipt = receipts[index]?.data;
      if (receipt && observed.current.get(command.request.clientRequestId) !== receipt.phase) {
        observed.current.set(command.request.clientRequestId, receipt.phase);
        void invalidateMedia(client, host.scope);
      }
      if (!receipt || receipt.phase !== 'accepted') return;
      const draftAtom = mediaDraftFamily(command.draftKey);
      const draft = store.get(draftAtom);
      if (mayClearMediaDraft(draft.revision, command.draftRevision, receipt.phase)) {
        store.set(draftAtom, {
          ...emptyDraft(),
          compare: draft.compare,
          revision: draft.revision + 1,
        });
      }
      if (visibleThreadIds.includes(receipt.threadId))
        published.add(command.request.clientRequestId);
    });
    if (published.size)
      setPending((previous) =>
        previous.filter((command) => !published.has(command.request.clientRequestId)),
      );
  }, [pending, receipts, visibleThreadIds, host, setPending, store, client]);
  return {
    pending,
    receipts,
    sending,
    error,
    send,
    dismiss: (id: string) =>
      setPending((previous) =>
        previous.filter((command) => command.request.clientRequestId !== id),
      ),
  };
}
