import { useCallback, useMemo, useRef } from 'react';
import { v4 } from 'uuid';
import { useToastContext } from '@librechat/client';
import { useRecoilValue, useRecoilCallback } from 'recoil';
import { Constants, ContentTypes, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage, TConversation, TMessageContentParts } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import type { PendingSteer } from '~/store/families';
import { useGetMessagesByConvoId, useSteerMessageMutation } from '~/data-provider';
import { useSetFilesToDelete } from '~/hooks/Files';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';

/** During-run submit routes: inject into the live run, or queue for after it. */
export type DuringRunAction = 'steer' | 'queue';

type SteerErrorCode =
  | 'NO_ACTIVE_RUN'
  | 'RUN_PAUSED'
  | 'STEER_QUEUE_FULL'
  | 'STEER_UNSUPPORTED'
  | string;

function getSteerErrorCode(error: unknown): SteerErrorCode | undefined {
  const response = (error as { response?: { data?: { code?: string } } } | undefined)?.response;
  return response?.data?.code;
}

/** True when the latest assistant message carries an unresolved tool approval —
 *  the run is (or is about to be) paused, so a steer POST would 409. */
function hasLiveToolApproval(messages: TMessage[] | undefined): boolean {
  if (!messages || messages.length === 0) {
    return false;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.isCreatedByUser !== false) {
      continue;
    }
    const content = message.content;
    if (!Array.isArray(content)) {
      return false;
    }
    return content.some((part: TMessageContentParts | undefined) => {
      if (part?.type !== ContentTypes.TOOL_CALL) {
        return false;
      }
      const toolCall = part[ContentTypes.TOOL_CALL] as
        | { approval?: unknown; output?: string | null }
        | undefined;
      return toolCall?.approval != null && (toolCall.output?.length ?? 0) === 0;
    });
  }
  return false;
}

export interface UseSteeringParams {
  index: number;
  conversationId: string;
  conversation: TConversation | null;
  isSubmitting: boolean;
  answerModeActive: boolean;
  /** Composer attachments — consumed into queued items (steering is text-only). */
  files?: Map<string, ExtendedFile>;
  setFiles?: FileSetter;
  /** Uploads still in flight: during-run submits are held like the send button. */
  filesLoading?: boolean;
  /** Submits text (and optional attachments) as a normal new turn. */
  sendNow: (text: string, files?: TMessage['files']) => void;
  /** Stops the current generation (used by interrupt & send). */
  stopGenerating: () => void;
}

/**
 * The composer's during-run brain: decides what Enter does while a run is
 * generating (steer vs queue, per the user preference and run state), owns the
 * pending-steer / queued-message chip state, and implements the three actions
 * — steer (POST + optimistic chip), queue (client-side), and interrupt & send
 * (abort, then auto-send via the one-shot drain override).
 */
export default function useSteering({
  index,
  conversationId,
  conversation,
  isSubmitting,
  answerModeActive,
  files,
  setFiles,
  filesLoading = false,
  sendNow,
  stopGenerating,
}: UseSteeringParams) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const setFilesToDelete = useSetFilesToDelete();
  const steerMutation = useSteerMessageMutation();
  const defaultAction = useRecoilValue<DuringRunAction>(store.duringRunDefaultAction);

  const endpoint = conversation?.endpointType ?? conversation?.endpoint;
  const steerable = !isAssistantsEndpoint(endpoint);
  const hasRealConvoId =
    conversationId != null && conversationId !== '' && conversationId !== Constants.NEW_CONVO;
  /** v1 gates the during-run UI to the primary composer, like the HITL popover. */
  const enabled = steerable && index === 0;
  const duringRunActive = enabled && isSubmitting && !answerModeActive;
  const queueKey = hasRealConvoId ? conversationId : Constants.NEW_CONVO;

  const { data: messages } = useGetMessagesByConvoId(hasRealConvoId ? conversationId : '', {
    enabled: hasRealConvoId,
  });
  const pausedOnApproval = useMemo(
    () => (duringRunActive ? hasLiveToolApproval(messages) : false),
    [duringRunActive, messages],
  );

  /** Whether a steer can reach the live run right now — independent of the
   *  user's default action, so the per-send menu can always override to
   *  steer when it's genuinely available. */
  const canSteer = hasRealConvoId && !pausedOnApproval;
  /** Steering needs a live server-side job; degrade to queue otherwise. */
  const effectiveAction: DuringRunAction = canSteer ? defaultAction : 'queue';

  /** Live submission state for POST callbacks — the closure value can be
   *  stale by the time the steer response arrives. */
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  const upsertSteerChip = useRecoilCallback(
    ({ set }) =>
      (convoId: string, steer: PendingSteer) => {
        set(store.pendingSteersByConvoId(convoId), (prev) => {
          const existing = prev.findIndex((item) => item.steerId === steer.steerId);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = steer;
            return next;
          }
          return [...prev, steer];
        });
      },
    [],
  );

  const replaceSteerChip = useRecoilCallback(
    ({ set }) =>
      (convoId: string, localId: string, steer: PendingSteer | null) => {
        set(store.pendingSteersByConvoId(convoId), (prev) => {
          const next = prev.filter((item) => item.steerId !== localId);
          return steer ? [...next, steer] : next;
        });
      },
    [],
  );

  /**
   * Resolves the 202 ACK against the applied-id set: `on_steer_applied` rides
   * the SSE and can land BEFORE the HTTP response, in which case its removal
   * already passed — minting a `pending` chip here would strand it forever.
   */
  const acknowledgeSteer = useRecoilCallback(
    ({ snapshot, set }) =>
      (convoId: string, localId: string, steer: PendingSteer) => {
        const applied = snapshot.getLoadable(store.appliedSteerIdsByConvoId(convoId)).getValue();
        const alreadyApplied = applied.includes(steer.steerId);
        set(store.pendingSteersByConvoId(convoId), (prev) => {
          const next = prev.filter((item) => item.steerId !== localId);
          return alreadyApplied ? next : [...next, steer];
        });
      },
    [],
  );

  const enqueue = useRecoilCallback(
    ({ set }) =>
      (text: string, options?: { front?: boolean; files?: TMessage['files'] }) => {
        const trimmed = text.trim();
        if (trimmed.length === 0) {
          return;
        }
        const item = {
          id: v4(),
          text: trimmed,
          createdAt: Date.now(),
          ...(options?.files && options.files.length > 0 && { files: options.files }),
        };
        set(store.queuedMessagesByConvoId(queueKey), (prev) =>
          options?.front ? [item, ...prev] : [...prev, item],
        );
      },
    [queueKey],
  );

  /** Consumes completed composer attachments into message file refs (clearing
   *  the composer) so they pair with THIS queued message instead of gluing
   *  onto whatever `ask` vacuums up next. */
  const takeComposerFiles = useCallback((): TMessage['files'] => {
    if (files == null || files.size === 0 || setFiles == null) {
      return undefined;
    }
    const taken = Array.from(files.values()).map((file) => ({
      file_id: file.file_id,
      filepath: file.filepath,
      type: file.type ?? '',
      height: file.height,
      width: file.width,
    }));
    setFiles(new Map());
    setFilesToDelete({});
    return taken;
  }, [files, setFiles, setFilesToDelete]);

  const removeQueued = useRecoilCallback(
    ({ set }) =>
      (id: string) => {
        set(store.queuedMessagesByConvoId(queueKey), (prev) =>
          prev.filter((item) => item.id !== id),
        );
      },
    [queueKey],
  );

  const armDrainAfterAbort = useRecoilCallback(
    ({ set }) =>
      () => {
        set(store.drainAfterAbortByIndex(index), true);
      },
    [index],
  );

  const submitSteer = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || !hasRealConvoId) {
        return false;
      }
      const localId = `local-${v4()}`;
      upsertSteerChip(conversationId, {
        steerId: localId,
        text: trimmed,
        status: 'sending',
        createdAt: Date.now(),
      });
      steerMutation.mutate(
        { conversationId, text: trimmed },
        {
          onSuccess: (response) => {
            acknowledgeSteer(conversationId, localId, {
              steerId: response.steerId,
              text: trimmed,
              status: 'pending',
              createdAt: Date.now(),
            });
          },
          onError: (error) => {
            const code = getSteerErrorCode(error);
            if (code === 'NO_ACTIVE_RUN') {
              // The run finished before the steer landed. While the final SSE
              // is still settling, `ask()`'s in-flight guard would drop a
              // direct send — queue it so the run-end drain fires it instead.
              replaceSteerChip(conversationId, localId, null);
              if (isSubmittingRef.current) {
                enqueue(trimmed);
              } else {
                sendNow(trimmed);
              }
              return;
            }
            if (
              code === 'RUN_PAUSED' ||
              code === 'STEER_UNSUPPORTED' ||
              code === 'STEER_QUEUE_FULL'
            ) {
              replaceSteerChip(conversationId, localId, null);
              enqueue(trimmed);
              showToast({ message: localize('com_ui_steer_paused_queued'), status: 'info' });
              return;
            }
            upsertSteerChip(conversationId, {
              steerId: localId,
              text: trimmed,
              status: 'failed',
              createdAt: Date.now(),
            });
          },
        },
      );
      return true;
    },
    [
      hasRealConvoId,
      conversationId,
      upsertSteerChip,
      replaceSteerChip,
      acknowledgeSteer,
      steerMutation,
      sendNow,
      enqueue,
      showToast,
      localize,
    ],
  );

  /** Composer-originated steer: media can't ride the text-only steer channel,
   *  so a message with attachments queues as one unit (text + files) rather
   *  than splitting the words from their media. */
  const steerFromComposer = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || filesLoading) {
        return false;
      }
      if (files != null && files.size > 0) {
        enqueue(trimmed, { files: takeComposerFiles() });
        showToast({ message: localize('com_ui_steer_attachments_queued'), status: 'info' });
        return true;
      }
      return submitSteer(trimmed);
    },
    [filesLoading, files, enqueue, takeComposerFiles, showToast, localize, submitSteer],
  );

  /** Composer-originated queue: carries the composer's attachments. */
  const queueFromComposer = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || filesLoading) {
        return false;
      }
      enqueue(trimmed, { files: takeComposerFiles() });
      return true;
    },
    [filesLoading, enqueue, takeComposerFiles],
  );

  /** Retry a failed chip through the normal steer path. */
  const retrySteer = useCallback(
    (steerId: string, text: string) => {
      replaceSteerChip(conversationId, steerId, null);
      submitSteer(text);
    },
    [conversationId, replaceSteerChip, submitSteer],
  );

  const removeSteer = useCallback(
    (steerId: string) => {
      replaceSteerChip(conversationId, steerId, null);
    },
    [conversationId, replaceSteerChip],
  );

  /** Convert a failed/unsent steer chip into a queued follow-up. */
  const convertSteerToQueue = useCallback(
    (steerId: string, text: string) => {
      replaceSteerChip(conversationId, steerId, null);
      enqueue(text);
    },
    [conversationId, replaceSteerChip, enqueue],
  );

  /** Chip action: send a queued message into the live run instead. Keys on
   *  steer availability, not the default action — a queue-preferring user
   *  clicking send-now explicitly asked to inject into the live run. Items
   *  with media never steer (text-only channel): they send as a normal turn
   *  when idle or move back to the queue front. */
  const sendQueuedNow = useCallback(
    (id: string, text: string, queuedFiles?: TMessage['files']) => {
      removeQueued(id);
      const hasMedia = (queuedFiles?.length ?? 0) > 0;
      if (duringRunActive && canSteer && !hasMedia) {
        submitSteer(text);
        return;
      }
      if (!isSubmitting) {
        sendNow(text, queuedFiles);
        return;
      }
      enqueue(text, { front: true, files: queuedFiles });
    },
    [removeQueued, duringRunActive, canSteer, submitSteer, isSubmitting, sendNow, enqueue],
  );

  /** Abort the current run and auto-send this text once the abort settles. */
  const interruptAndSend = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || filesLoading) {
        return false;
      }
      enqueue(trimmed, { front: true, files: takeComposerFiles() });
      armDrainAfterAbort();
      stopGenerating();
      return true;
    },
    [filesLoading, enqueue, takeComposerFiles, armDrainAfterAbort, stopGenerating],
  );

  /** Routes a during-run submit to the effective action. Returns true when consumed. */
  const submitDuringRun = useCallback(
    (text: string): boolean => {
      if (!duringRunActive) {
        return false;
      }
      if (effectiveAction === 'steer') {
        return steerFromComposer(text);
      }
      return queueFromComposer(text);
    },
    [duringRunActive, effectiveAction, steerFromComposer, queueFromComposer],
  );

  return {
    enabled,
    queueKey,
    canSteer,
    duringRunActive,
    effectiveAction,
    defaultAction,
    pausedOnApproval,
    submitDuringRun,
    steerFromComposer,
    queueFromComposer,
    submitSteer,
    retrySteer,
    removeSteer,
    convertSteerToQueue,
    enqueue,
    removeQueued,
    sendQueuedNow,
    interruptAndSend,
  };
}

export type SteeringControls = ReturnType<typeof useSteering>;
