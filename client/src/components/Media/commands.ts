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
import type { MediaReceipt } from '~/data-provider/Media';
import type { PendingMedia } from './state';
import { invalidateMedia, mayClearMediaDraft } from '~/data-provider/Media';
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
export function useMediaCommands(visibleThreadIds: string[]) {
  const host = useMediaHost();
  const client = useQueryClient();
  const store = useStore();
  const [pending, setPending] = useAtom(mediaPendingFamily(host.scope));
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<MediaErrorCode>();
  const observed = useRef(new Map<string, MediaReceipt['phase']>());
  const receipts = useQueries({
    queries: pending.map((command) => ({
      queryKey: receiptKey(host.scope, command),
      queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<MediaReceipt> => {
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
      refetchInterval: (data: MediaReceipt | undefined) =>
        !data || data.phase === 'preparing' ? host.pollIntervalMs : (false as const),
      refetchIntervalInBackground: false,
    })),
  });
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
        if (command.kind === 'submission')
          receipt = mediaSubmissionReceiptSchema.parse(
            await dataService.submitMedia(command.request),
          );
        else if (command.kind === 'retry')
          receipt = mediaSubmissionReceiptSchema.parse(
            await dataService.retryMediaJob(command.jobId, command.request),
          );
        else
          receipt = mediaImportReceiptSchema.parse(await dataService.importMedia(command.request));
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
        await invalidateMedia(client, host.scope);
        return receipt;
      } catch (failure) {
        if (host.isCurrentSession()) {
          setError(mediaErrorCode(failure));
          // A rejected command preserves its editable draft. A lost response keeps its identity.
          if (definitiveRejection(failure))
            setPending((previous) =>
              previous.filter((item) => item.request.clientRequestId !== id),
            );
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
    [host, client, setPending, store],
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
