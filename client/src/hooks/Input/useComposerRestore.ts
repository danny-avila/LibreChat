import { useRef, useEffect, useCallback } from 'react';
import { useRecoilCallback } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import type { QueuedMessageContext } from '~/hooks/Chat/useSteering';
import type { ExtendedFile, FileSetter } from '~/common';
import type { useChatFormContext } from '~/Providers';
import store from '~/store';

export interface ComposerRestore {
  /** Chip "Edit message": replaces the draft outright. The caller has already
   *  decided this is wanted, so nothing is guarded. */
  editToComposer: (text: string, files?: TMessage['files'], context?: QueuedMessageContext) => void;
  /** The same restore for a steer whose reclaim was a round-trip, guarded
   *  against everything that can change while it is in flight. Returns whether
   *  the words were taken, so a refusal can be re-homed rather than dropped. */
  restoreReclaimedSteer: (
    text: string,
    files: TMessage['files'],
    context: QueuedMessageContext,
    originConversationId: string,
  ) => boolean;
}

interface UseComposerRestoreParams {
  conversationId: string;
  methods: ReturnType<typeof useChatFormContext>;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  /** A paused `ask_user_question` owns the composer; see `restoreReclaimedSteer`. */
  answerModeActive: boolean;
}

/**
 * Putting a message back into the composer: the queue rail's "Edit message",
 * and the guarded restore a reclaimed steer resolves into.
 *
 * Extracted from `ChatForm` because the guarded path is the only one in the
 * composer that can destroy text outright, and every one of its conditions is
 * about time passing between a click and its answer — which is exactly what a
 * component holding half a dozen other concerns makes impossible to test.
 */
export default function useComposerRestore({
  conversationId,
  methods,
  files,
  setFiles,
  textAreaRef,
  answerModeActive,
}: UseComposerRestoreParams): ComposerRestore {
  /** Chip "Edit message" restore: quote chips + skill picks merge back into
   *  their compose-time atoms (the chips above the textarea re-render them). */
  const restoreComposerContext = useRecoilCallback(
    ({ set }) =>
      (context?: QueuedMessageContext) => {
        const { quotes, manualSkills } = context ?? {};
        if (quotes != null && quotes.length > 0) {
          set(store.pendingQuotesByConvoId(conversationId), (prev) => [
            ...new Set([...prev, ...quotes]),
          ]);
        }
        if (manualSkills != null && manualSkills.length > 0) {
          set(store.pendingManualSkillsByConvoId(conversationId), (prev) => [
            ...new Set([...prev, ...manualSkills]),
          ]);
        }
      },
    [conversationId],
  );

  /** The text replaces the composer draft and the chip's attachments merge back
   *  into the composer file map (already uploaded, so they restore as completed
   *  entries — same shape as draft recovery). */
  const editToComposer = useCallback(
    (text: string, chipFiles?: TMessage['files'], context?: QueuedMessageContext) => {
      methods.setValue('text', text, { shouldDirty: true });
      if (chipFiles != null && chipFiles.length > 0) {
        setFiles((prev) => {
          const next = new Map(prev);
          for (const file of chipFiles) {
            if (!file.file_id) {
              continue;
            }
            next.set(file.file_id, {
              file_id: file.file_id,
              filename: file.filename,
              filepath: file.filepath,
              type: file.type ?? '',
              height: file.height,
              width: file.width,
              size: file.bytes ?? 0,
              progress: 1,
              attached: true,
            });
          }
          return next;
        });
      }
      restoreComposerContext(context);
      textAreaRef.current?.focus();
    },
    [methods, setFiles, restoreComposerContext, textAreaRef],
  );

  /** Read at call time, not captured: a reclaim resolves into the callback from
   *  the render it was clicked in, so the closure's `conversationId` is the OLD
   *  chat — comparing it against itself would pass while `methods` (one form,
   *  reused across conversations) writes into the chat now on screen. */
  const liveConversationIdRef = useRef(conversationId);
  liveConversationIdRef.current = conversationId;
  /** Same reason: attachments staged after the click must be seen. */
  const liveFilesRef = useRef(files);
  liveFilesRef.current = files;
  /** Same reason: the run can pause on `ask_user_question` mid-reclaim. */
  const liveAnswerModeRef = useRef(answerModeActive);
  liveAnswerModeRef.current = answerModeActive;
  /** A reclaim can resolve after the composer unmounts (left the route, closed
   *  the pane). Its refs still hold the origin chat, so the restore would pass
   *  its checks and write into a dead form — reporting success and making the
   *  caller drop the steer, losing the text. Track mount so the restore refuses
   *  and the caller queues it instead. */
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  /** A draft is anything the user has staged, not just typed: `editToComposer`
   *  MERGES the steer's attachments into the composer's file map and its quotes
   *  and skill picks into their atoms, so restoring over staged context would
   *  glue the two submissions together. */
  const hasStagedContext = useRecoilCallback(
    ({ snapshot }) =>
      (convoId: string) =>
        snapshot.getLoadable(store.pendingQuotesByConvoId(convoId)).getValue().length > 0 ||
        snapshot.getLoadable(store.pendingManualSkillsByConvoId(convoId)).getValue().length > 0,
    [],
  );

  /**
   * `editToComposer` for a steer whose reclaim was a round-trip: by the time it
   * resolves the composer may have moved on. Refuses (returning false, so the
   * caller re-homes the words instead of dropping them) rather than overwrite a
   * draft the user has since staged, or drop a steer into whatever chat they
   * navigated to.
   */
  const restoreReclaimedSteer = useCallback(
    (
      text: string,
      steerFiles: TMessage['files'],
      context: QueuedMessageContext,
      originConversationId: string,
    ): boolean => {
      if (!mountedRef.current) {
        return false;
      }
      const liveConversationId = liveConversationIdRef.current;
      if (originConversationId !== liveConversationId) {
        return false;
      }
      /** Answer mode owns the composer: `onSubmit` hands its text to
       *  `answerMode.submitText` before any send/steer routing, so restoring
       *  here would turn the steer into the tool's answer on the next Enter. */
      if (liveAnswerModeRef.current) {
        return false;
      }
      if (
        (methods.getValues('text') ?? '').trim().length > 0 ||
        (liveFilesRef.current?.size ?? 0) > 0 ||
        hasStagedContext(liveConversationId)
      ) {
        return false;
      }
      editToComposer(text, steerFiles, context);
      return true;
    },
    [methods, editToComposer, hasStagedContext],
  );

  return { editToComposer, restoreReclaimedSteer };
}
