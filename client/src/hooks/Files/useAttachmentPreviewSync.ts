import { useEffect, useRef } from 'react';
import { useRecoilCallback, useSetRecoilState } from 'recoil';
import type { TAttachment, TFile, TFilePreview } from 'librechat-data-provider';
import { useFilePreview } from '~/data-provider';
import store from '~/store';

interface UseAttachmentPreviewSyncResult {
  /**
   * Effective lifecycle status: `'pending'` while background HTML
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
 * Bridge the deferred-preview code-execution lifecycle to the
 * attachment cache.
 *
 * The immediate persist step (in callbacks.js + processCodeOutput)
 * emits the attachment record at `status: 'pending'` so the agent's
 * response stops blocking on extraction. The background render runs
 * separately; if the SSE stream is still open when it lands, an
 * `attachment` update event arrives and the SSE handler upserts by
 * `file_id`. If the stream has already closed (the model finished
 * generating before the render resolved), this hook covers the gap by
 * polling `GET /api/files/:file_id/preview` and writing the resolved
 * record back into `messageAttachmentsMap` — which triggers
 * re-classification through `artifactTypeForAttachment`, so the file
 * chip transitions from a plain download to the rich preview card
 * (or to a download-with-error state) without remounting.
 *
 * Polling is gated on:
 *   - `attachment.file_id` present (no id → nothing to poll for)
 *   - Effective status is `'pending'` (terminal states need no work).
 *     `useFilePreview`'s `refetchInterval` returns `false` the moment
 *     the server reports `ready`/`failed`, so polling auto-terminates
 *     within one tick of resolution. Bounded ceiling: the server-side
 *     render timeout is 60s, so a stuck pending record gets ~24 polls
 *     max before the lazy sweep in the preview endpoint forces it to
 *     `'failed'`.
 *
 * NOTE: an earlier version of this hook also gated on `isAnySubmitting`
 * (the LLM still generating). That gate was removed because the
 * deferred render can complete *after* the SSE stream closes — when it
 * does, the SSE update is silently dropped, and polling is the only
 * recovery path. With the gate in place, the chip would stay stuck on
 * "Preparing preview…" forever (until manual refresh) for any render
 * that landed even seconds after submission ended. The polling itself
 * doesn't block UX; the user can keep messaging regardless.
 */
export default function useAttachmentPreviewSync(
  attachment: TAttachment | undefined,
): UseAttachmentPreviewSyncResult {
  const setAttachmentsMap = useSetRecoilState(store.messageAttachmentsMap);
  /* `useRecoilCallback` reads/writes without subscribing this hook to
   * the per-file_id flag — we only ever set it on the pending→ready
   * edge, so subscribing would cause needless re-renders. */
  const flagJustResolved = useRecoilCallback(
    ({ set }) =>
      (id: string) => {
        set(store.previewJustResolved(id), true);
      },
    [],
  );
  /* Capture `isAnySubmitting` at first render via a non-subscribing
   * snapshot read. Mirrors `ToolArtifactCard`'s `mountedDuringStreamRef`
   * pattern so this hook applies the same "is the user actively in a
   * turn?" classification as the card itself. The ref is the gate that
   * distinguishes a *fresh* deferred-preview resolution (auto-open
   * eligible) from a *stale* DB-pending record resolving on a history
   * load (auto-open must NOT fire — the user is scrolling old data,
   * not awaiting a result). Without this gate, navigating back to a
   * conversation whose immediate-persist snapshot left the message's
   * attachments at `status: 'pending'` would re-trigger auto-open
   * every time the polling layer caught up — which is exactly the
   * pre-PR "panel pops open on every visit" UX the team explicitly
   * removed. */
  const readInitialIsSubmitting = useRecoilCallback(
    ({ snapshot }) =>
      () =>
        snapshot.getLoadable(store.isSubmittingFamily(0)).valueMaybe() ?? false,
    [],
  );
  const mountedDuringStreamRef = useRef<boolean | null>(null);
  if (mountedDuringStreamRef.current === null) {
    mountedDuringStreamRef.current = readInitialIsSubmitting();
  }

  const file = (attachment ?? undefined) as Partial<TFile> | undefined;
  const fileId = file?.file_id;
  const baseStatus: 'pending' | 'ready' | 'failed' = file?.status ?? 'ready';
  const messageId = (attachment as Partial<TAttachment> | undefined)?.messageId;

  const enabled = !!fileId && baseStatus === 'pending';

  const previewQuery = useFilePreview(fileId, { enabled });

  /* Effective status: prefer the polled record once it arrives, since
   * the SSE handler may have already moved the cache forward and the
   * `attachment` prop will catch up on the next render anyway. */
  const polled = previewQuery.data as TFilePreview | undefined;
  const effectiveStatus: 'pending' | 'ready' | 'failed' = polled?.status ?? baseStatus;
  const previewError = polled?.previewError ?? file?.previewError;

  /* Track the previous effective status so we can fire the
   * pending→ready edge exactly once per session. Two gates have to
   * pass for the auto-open flag to flip:
   *   1. We actually observed the transition (prev → curr).
   *   2. The hook mounted during an active stream — i.e. the file is
   *      part of the user's current turn, not a history load. A
   *      page-navigation mount (or refresh) of a stale-pending DB
   *      record will see the same transition when polling catches
   *      up, but we must NOT auto-open in that case — the user is
   *      revisiting old work, not waiting on a fresh result.
   * Refs are read inline so the effect doesn't have to list them as
   * deps (mutating a ref doesn't subscribe). */
  const prevStatusRef = useRef<'pending' | 'ready' | 'failed' | null>(null);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = effectiveStatus;
    if (
      prev === 'pending' &&
      effectiveStatus === 'ready' &&
      fileId &&
      mountedDuringStreamRef.current === true
    ) {
      flagJustResolved(fileId);
    }
  }, [effectiveStatus, fileId, flagJustResolved]);

  /* On a terminal poll response (ready or failed), upsert into the
   * shared attachments map. Mirrors the SSE handler's by-file_id
   * upsert (`useAttachmentHandler`) — the attachment object is
   * patched in place so siblings sharing the same atom re-render
   * with the resolved data and `artifactTypeForAttachment` re-runs
   * its empty-text gate, transitioning the file chip into a panel
   * artifact card.
   *
   * Two paths:
   *   1. Live SSE flow (active turn): the SSE handler already wrote
   *      the attachment into messageAttachmentsMap. `existingIndex`
   *      finds it; we patch in place.
   *   2. Loaded conversation (no SSE): the message's `attachments`
   *      come from the DB (frozen at the immediate-persist state of
   *      `status: 'pending'`); messageAttachmentsMap is empty for
   *      this messageId. `existingIndex` is `-1`. We INSERT a new
   *      entry that overlays the polled fields onto the original
   *      `attachment` prop. `useAttachments` (the hook the renderer
   *      reads through) merges live entries onto DB entries by
   *      `file_id`, so the inserted entry takes precedence and the
   *      parent re-routes to the proper PanelArtifact card. */
  useEffect(() => {
    if (!polled || polled.status === 'pending' || !messageId || !fileId || !attachment) {
      return;
    }
    setAttachmentsMap((prevMap) => {
      const messageAttachments =
        (prevMap as Record<string, TAttachment[] | undefined>)[messageId] || [];
      const existingIndex = messageAttachments.findIndex(
        (a) => (a as Partial<TFile>).file_id === fileId,
      );
      const resolvedFields = {
        status: polled.status,
        text: polled.text ?? null,
        textFormat: polled.textFormat ?? null,
        previewError: polled.previewError,
      };
      if (existingIndex >= 0) {
        const existing = messageAttachments[existingIndex] as Partial<TFile> & TAttachment;
        const merged = [...messageAttachments];
        merged[existingIndex] = {
          ...existing,
          ...resolvedFields,
          text: polled.text ?? existing.text ?? null,
          textFormat: polled.textFormat ?? existing.textFormat ?? null,
        } as TAttachment;
        return { ...prevMap, [messageId]: merged };
      }
      const inserted = { ...attachment, ...resolvedFields } as TAttachment;
      return { ...prevMap, [messageId]: [...messageAttachments, inserted] };
    });
  }, [polled, fileId, messageId, attachment, setAttachmentsMap]);

  return {
    status: effectiveStatus,
    previewError,
    isPolling: enabled && previewQuery.isFetching,
  };
}
