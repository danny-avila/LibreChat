import { useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { TAttachment, TFile, TFilePreview } from 'librechat-data-provider';
import { useFilePreview } from '~/data-provider';
import store from '~/store';

interface UseAttachmentPreviewSyncResult {
  /**
   * Effective lifecycle status: `'pending'` while phase-2 HTML
   * extraction is in flight, `'ready'` once it completes successfully
   * (or for legacy / non-office files that never had a status), and
   * `'failed'` when extraction errored or hit the 60s ceiling. Drives
   * UI state (spinner, badge, etc.) without callers needing to read
   * the attachment shape directly.
   */
  status: 'pending' | 'ready' | 'failed';
  /** Short machine-readable failure reason from the backend. */
  previewError?: string;
  /** True while React Query is actively polling the preview endpoint. */
  isPolling: boolean;
}

/**
 * Bridge the two-phase code-execution preview lifecycle to the
 * attachment cache.
 *
 * Phase-1 (handled in callbacks.js + processCodeOutput) emits the
 * attachment record at `status: 'pending'` immediately so the agent's
 * response stops blocking on extraction. Phase-2 runs in the
 * background; if the SSE stream is still open when it lands, an
 * `attachment` update event arrives and the SSE handler upserts by
 * `file_id`. If the stream has already closed (the model finished
 * generating before phase-2 resolved), this hook covers the gap by
 * polling `GET /api/files/:file_id/preview` and writing the resolved
 * record back into `messageAttachmentsMap` — which triggers
 * re-classification through `artifactTypeForAttachment`, so the file
 * chip transitions from a plain download to the rich preview card
 * (or to a download-with-error state) without remounting.
 *
 * Polling is gated on:
 *   - `attachment.file_id` present (no id → nothing to poll for)
 *   - Effective status is `'pending'` (terminal states need no work)
 *   - Some conversation in the app is submitting (per the user's
 *     explicit gate: "only query when the preview is still live and
 *     `isSubmitting` is still true"). When the LLM finishes, polling
 *     stops; the user can refresh on demand from the next interaction.
 */
export default function useAttachmentPreviewSync(
  attachment: TAttachment | undefined,
): UseAttachmentPreviewSyncResult {
  const setAttachmentsMap = useSetRecoilState(store.messageAttachmentsMap);
  const isAnySubmitting = useRecoilValue(store.anySubmittingSelector);

  const file = (attachment ?? undefined) as Partial<TFile> | undefined;
  const fileId = file?.file_id;
  const baseStatus: 'pending' | 'ready' | 'failed' = file?.status ?? 'ready';
  const messageId = (attachment as Partial<TAttachment> | undefined)?.messageId;

  const enabled = !!fileId && baseStatus === 'pending' && isAnySubmitting;

  const previewQuery = useFilePreview(fileId, { enabled });

  /* Effective status: prefer the polled record once it arrives, since
   * the SSE handler may have already moved the cache forward and the
   * `attachment` prop will catch up on the next render anyway. */
  const polled = previewQuery.data as TFilePreview | undefined;
  const effectiveStatus: 'pending' | 'ready' | 'failed' = polled?.status ?? baseStatus;
  const previewError = polled?.previewError ?? file?.previewError;

  /* On a terminal poll response (ready or failed), upsert into the
   * shared attachments map. Mirrors the SSE handler's by-file_id
   * upsert (`useAttachmentHandler`) — the attachment object is
   * patched in place so siblings sharing the same atom re-render
   * with the resolved data and `artifactTypeForAttachment` re-runs
   * its empty-text gate, transitioning the file chip into a panel
   * artifact card. */
  useEffect(() => {
    if (!polled || polled.status === 'pending' || !messageId || !fileId) {
      return;
    }
    setAttachmentsMap((prevMap) => {
      const messageAttachments =
        (prevMap as Record<string, TAttachment[] | undefined>)[messageId] || [];
      const existingIndex = messageAttachments.findIndex(
        (a) => (a as Partial<TFile>).file_id === fileId,
      );
      if (existingIndex < 0) {
        return prevMap;
      }
      const existing = messageAttachments[existingIndex] as Partial<TFile> & TAttachment;
      const merged = [...messageAttachments];
      merged[existingIndex] = {
        ...existing,
        status: polled.status,
        text: polled.text ?? existing.text ?? null,
        textFormat: polled.textFormat ?? existing.textFormat ?? null,
        previewError: polled.previewError,
      } as TAttachment;
      return { ...prevMap, [messageId]: merged };
    });
  }, [polled, fileId, messageId, setAttachmentsMap]);

  return {
    status: effectiveStatus,
    previewError,
    isPolling: enabled && previewQuery.isFetching,
  };
}
