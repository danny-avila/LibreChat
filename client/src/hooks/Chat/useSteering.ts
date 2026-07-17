import { useCallback, useMemo, useRef } from 'react';
import { v4 } from 'uuid';
import { useToastContext } from '@librechat/client';
import { useRecoilValue, useSetRecoilState, useRecoilCallback } from 'recoil';
import { Constants, ContentTypes, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage, TConversation, TMessageContentParts } from 'librechat-data-provider';
import type { PendingSteer, QueuedMessage } from '~/store/families';
import type { ExtendedFile, FileSetter } from '~/common';
import {
  useGetMessagesByConvoId,
  useSteerMessageMutation,
  useMarkFilesUsageMutation,
} from '~/data-provider';
import { carriedSteerContext, clearAllDrafts } from '~/utils';
import { useSetFilesToDelete } from '~/hooks/Files';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';

/** During-run submit routes: inject into the live run, or queue for after it. */
export type DuringRunAction = 'steer' | 'queue';

/** Composer state consumed into a queued item alongside the text. */
export interface QueuedMessageContext {
  quotes?: string[];
  manualSkills?: string[];
}

/** Server-side cap on a usage touch (mirrors `FILES_USAGE_MAX_IDS`). */
const QUEUE_USAGE_MAX_FILES = 10;

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
  /** Submits text (and optional attachments/quotes/skills) as a normal new
   *  turn. Overrides are always explicit — a queued item is the FULL
   *  submission context, so absent fields must send as empty, never vacuum
   *  the composer. Returns `false` when `ask` refused without sending
   *  (in-flight guard, history not cached yet) so callers can restore
   *  instead of dropping. */
  sendNow: (
    text: string,
    files?: TMessage['files'],
    context?: QueuedMessageContext,
  ) => false | void;
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
  const markFilesUsage = useMarkFilesUsageMutation();
  const defaultAction = useRecoilValue<DuringRunAction>(store.duringRunDefaultAction);
  const setDefaultAction = useSetRecoilState(store.duringRunDefaultAction);

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
   * An ACK landing AFTER the run ended (final/abort/error already processed,
   * server queue drained or dropped) converts straight to a queued follow-up:
   * no later event will ever resolve a `pending` chip for a finished run.
   */
  const acknowledgeSteer = useRecoilCallback(
    ({ snapshot, set }) =>
      (convoId: string, localId: string, steer: PendingSteer) => {
        const applied = snapshot.getLoadable(store.appliedSteerIdsByConvoId(convoId)).getValue();
        const alreadyApplied = applied.includes(steer.steerId);
        const runOver = !isSubmittingRef.current;
        set(store.pendingSteersByConvoId(convoId), (prev) => {
          const next = prev.filter((item) => item.steerId !== localId);
          // Upsert: an SSE reconnect may have reseeded the chip under the
          // server id already — appending again would duplicate it.
          const alreadySeeded = next.some((item) => item.steerId === steer.steerId);
          return alreadyApplied || runOver || alreadySeeded ? next : [...next, steer];
        });
        if (alreadyApplied || !runOver) {
          return;
        }
        set(store.queuedMessagesByConvoId(convoId), (prev) =>
          prev.some((queued) => queued.id === steer.steerId)
            ? prev
            : [
                ...prev,
                {
                  id: steer.steerId,
                  text: steer.text,
                  createdAt: steer.createdAt,
                  ...(steer.files && steer.files.length > 0 && { files: steer.files }),
                  ...carriedSteerContext(steer),
                },
              ],
        );
      },
    [],
  );

  /** Fire-and-forget TTL touch for uploads entering the client queue: a
   *  queued message can outlive the upload window (long run, approval pause)
   *  and send-time marking only happens at drain. Failure is tolerated —
   *  the send-time marking remains the backstop. */
  const markQueuedFilesUsage = useCallback(
    (files?: TMessage['files']) => {
      if (files == null || files.length === 0) {
        return;
      }
      const file_ids: string[] = [];
      for (const file of files) {
        if (typeof file.file_id === 'string' && file.file_id.length > 0) {
          file_ids.push(file.file_id);
        }
        if (file_ids.length === QUEUE_USAGE_MAX_FILES) {
          break;
        }
      }
      if (file_ids.length > 0) {
        markFilesUsage.mutate({ file_ids });
      }
    },
    [markFilesUsage],
  );

  const enqueue = useRecoilCallback(
    ({ set }) =>
      (
        text: string,
        options?: {
          front?: boolean;
          files?: TMessage['files'];
          quotes?: string[];
          manualSkills?: string[];
          /** Set when the files were ALREADY queued/steered — their usage was
           *  marked when they first entered the queue (or at the steer 202). */
          skipUsageMark?: boolean;
        },
      ) => {
        const trimmed = text.trim();
        if (trimmed.length === 0) {
          return;
        }
        const item = {
          id: v4(),
          text: trimmed,
          createdAt: Date.now(),
          ...(options?.files && options.files.length > 0 && { files: options.files }),
          ...(options?.quotes && options.quotes.length > 0 && { quotes: options.quotes }),
          ...(options?.manualSkills &&
            options.manualSkills.length > 0 && { manualSkills: options.manualSkills }),
          ...(options?.front && { priority: true }),
        };
        set(store.queuedMessagesByConvoId(queueKey), (prev) =>
          options?.front ? [item, ...prev] : [...prev, item],
        );
        if (options?.skipUsageMark !== true) {
          markQueuedFilesUsage(options?.files);
        }
      },
    [queueKey, markQueuedFilesUsage],
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
      // Retained beyond the submission shape so "Edit message" can restore
      // the attachment into the composer with its real name and size.
      filename: file.filename,
      bytes: file.size,
    }));
    setFiles(new Map());
    setFilesToDelete({});
    return taken;
  }, [files, setFiles, setFilesToDelete]);

  /** Consumes staged quote chips + manual skill picks (mirroring `ask()`'s
   *  fresh-submit drain of the same atoms) so they pair with THIS queued
   *  message instead of gluing onto whatever the user sends next. */
  const takeComposerContext = useRecoilCallback(
    ({ snapshot, reset }) =>
      (): QueuedMessageContext => {
        const quotes = snapshot
          .getLoadable(store.pendingQuotesByConvoId(conversationId))
          .getValue();
        const manualSkills = snapshot
          .getLoadable(store.pendingManualSkillsByConvoId(conversationId))
          .getValue();
        if (quotes.length > 0) {
          reset(store.pendingQuotesByConvoId(conversationId));
        }
        if (manualSkills.length > 0) {
          reset(store.pendingManualSkillsByConvoId(conversationId));
        }
        return {
          ...(quotes.length > 0 && { quotes }),
          ...(manualSkills.length > 0 && { manualSkills }),
        };
      },
    [conversationId],
  );

  /** Consumes the composer's autosaved draft once its text has been taken into
   *  a steer or queued item. The composer clears via the form's `reset()`,
   *  which is programmatic and never fires the `input` event `useAutoSave`
   *  listens on — so the draft would outlive the submit. It is keyed under
   *  `PENDING_CONVO` here (every caller is gated on `duringRunActive`, which
   *  requires `isSubmitting` and rules out the answer-mode draft key), and
   *  run end migrates a surviving pending draft onto the conversation and
   *  restores it — resurfacing text the user already sent. */
  const takeComposerDraft = useCallback(() => {
    clearAllDrafts(Constants.PENDING_CONVO);
  }, []);

  const removeQueued = useRecoilCallback(
    ({ set }) =>
      (id: string) => {
        set(store.queuedMessagesByConvoId(queueKey), (prev) =>
          prev.filter((item) => item.id !== id),
        );
      },
    [queueKey],
  );

  /** Capture-then-remove, so a refused send can restore the ORIGINAL item. */
  const takeQueued = useRecoilCallback(
    ({ snapshot, set }) =>
      (id: string): QueuedMessage | undefined => {
        const queue = snapshot.getLoadable(store.queuedMessagesByConvoId(queueKey)).getValue();
        const taken = queue.find((item) => item.id === id);
        set(store.queuedMessagesByConvoId(queueKey), (prev) =>
          prev.filter((item) => item.id !== id),
        );
        return taken;
      },
    [queueKey],
  );

  /** Front restore mirroring useQueueDrain: same id, never duplicated. */
  const restoreQueued = useRecoilCallback(
    ({ set }) =>
      (item: QueuedMessage) => {
        set(store.queuedMessagesByConvoId(queueKey), (prev) =>
          prev.some((queued) => queued.id === item.id) ? prev : [item, ...prev],
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

  /** POSTs a steer (text + files only; the server never carries quotes or
   *  skill picks). `context` is the RESTORE payload for a queued-origin steer:
   *  every degradation path threads it back into the requeue/send fallback so
   *  the item's quotes and manual skills survive. Composer-origin steers pass
   *  nothing, leaving their context staged in the composer atoms. */
  const submitSteer = useCallback(
    (text: string, steerFiles?: TMessage['files'], context?: QueuedMessageContext): boolean => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || !hasRealConvoId) {
        return false;
      }
      const files = steerFiles && steerFiles.length > 0 ? steerFiles : undefined;
      /** Rides every chip state so a terminal conversion (late ACK, run-end
       *  leftover report) can restore the queued item's full context. */
      const carried = carriedSteerContext(context);
      const localId = `local-${v4()}`;
      upsertSteerChip(conversationId, {
        steerId: localId,
        text: trimmed,
        status: 'sending',
        createdAt: Date.now(),
        ...(files && { files }),
        ...carried,
      });
      steerMutation.mutate(
        { conversationId, text: trimmed, ...(files && { files }) },
        {
          onSuccess: (response) => {
            acknowledgeSteer(conversationId, localId, {
              steerId: response.steerId,
              text: trimmed,
              status: 'pending',
              createdAt: Date.now(),
              ...(files && { files }),
              ...carried,
            });
          },
          onError: (error) => {
            const code = getSteerErrorCode(error);
            if (code === 'NO_ACTIVE_RUN') {
              // The run finished before the steer landed. While the final SSE
              // is still settling, `ask()`'s in-flight guard would drop a
              // direct send — queue it so the run-end drain fires it instead.
              // The explicit empty array stops `ask` from vacuuming composer
              // files staged for a DIFFERENT draft. A refused send (`false`)
              // falls back to the queue too — the chip is already gone, so
              // dropping the text here would lose it silently.
              replaceSteerChip(conversationId, localId, null);
              if (isSubmittingRef.current || sendNow(trimmed, files ?? [], context) === false) {
                enqueue(trimmed, { files, ...context });
              }
              return;
            }
            if (
              code === 'RUN_PAUSED' ||
              code === 'STEER_UNSUPPORTED' ||
              code === 'STEER_QUEUE_FULL'
            ) {
              replaceSteerChip(conversationId, localId, null);
              // The rejection can land AFTER the final SSE consumed the
              // run-end signal (common on an unsupported SDK near run end):
              // queueing then has nothing left to drain it, so mirror the
              // NO_ACTIVE_RUN fallback and send once submission settled —
              // queueing the refusal instead of dropping the text.
              if (!isSubmittingRef.current) {
                if (sendNow(trimmed, files ?? [], context) === false) {
                  enqueue(trimmed, { files, ...context });
                }
                return;
              }
              enqueue(trimmed, { files, ...context });
              showToast({ message: localize('com_ui_steer_paused_queued'), status: 'info' });
              return;
            }
            upsertSteerChip(conversationId, {
              steerId: localId,
              text: trimmed,
              status: 'failed',
              createdAt: Date.now(),
              ...(files && { files }),
              ...carried,
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

  /** Composer-originated steer: consumes the composer's attachments so they
   *  ride the steer as one unit (the server re-fetches + encodes them at the
   *  injection boundary). Files are taken only after the guards pass. */
  const steerFromComposer = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || filesLoading || !hasRealConvoId) {
        return false;
      }
      const consumed = submitSteer(trimmed, takeComposerFiles());
      if (consumed) {
        takeComposerDraft();
      }
      return consumed;
    },
    [filesLoading, hasRealConvoId, takeComposerFiles, takeComposerDraft, submitSteer],
  );

  /** Composer-originated queue: carries the composer's attachments, quote
   *  chips, and manual skill picks as one unit. */
  const queueFromComposer = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || filesLoading) {
        return false;
      }
      enqueue(trimmed, { files: takeComposerFiles(), ...takeComposerContext() });
      takeComposerDraft();
      return true;
    },
    [filesLoading, enqueue, takeComposerFiles, takeComposerContext, takeComposerDraft],
  );

  /** Retry a failed chip through the normal steer path. */
  const retrySteer = useCallback(
    (
      steerId: string,
      text: string,
      steerFiles?: TMessage['files'],
      context?: QueuedMessageContext,
    ) => {
      replaceSteerChip(conversationId, steerId, null);
      submitSteer(text, steerFiles, context);
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
    (
      steerId: string,
      text: string,
      steerFiles?: TMessage['files'],
      context?: QueuedMessageContext,
    ) => {
      replaceSteerChip(conversationId, steerId, null);
      enqueue(text, { files: steerFiles, ...context });
    },
    [conversationId, replaceSteerChip, enqueue],
  );

  /** Chip action: send a queued message into the live run instead. Keys on
   *  steer availability, not the default action — a queue-preferring user
   *  clicking send-now explicitly asked to inject into the live run. The
   *  item's attachments ride the steer; its quotes/skills travel as the
   *  restore context so a degraded steer requeues/sends with them intact. */
  const sendQueuedNow = useCallback(
    (item: QueuedMessage) => {
      const taken = takeQueued(item.id) ?? item;
      if (duringRunActive && canSteer) {
        submitSteer(taken.text, taken.files, {
          quotes: taken.quotes,
          manualSkills: taken.manualSkills,
        });
        return;
      }
      if (!isSubmitting) {
        // Explicit (possibly empty) overrides: the queued item is the full
        // submission context, never the composer's staged files/quotes/picks.
        const accepted = sendNow(taken.text, taken.files ?? [], {
          quotes: taken.quotes,
          manualSkills: taken.manualSkills,
        });
        if (accepted === false) {
          // `ask` refused without sending — restore the chip so the user's
          // text is never silently dropped (mirrors useQueueDrain).
          restoreQueued(taken);
        }
        return;
      }
      // Files were already marked used when the item first entered the queue.
      enqueue(taken.text, {
        front: true,
        files: taken.files,
        quotes: taken.quotes,
        manualSkills: taken.manualSkills,
        skipUsageMark: true,
      });
    },
    [
      takeQueued,
      duringRunActive,
      canSteer,
      submitSteer,
      isSubmitting,
      sendNow,
      restoreQueued,
      enqueue,
    ],
  );

  /** Abort the current run and auto-send this text once the abort settles. */
  const interruptAndSend = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || filesLoading) {
        return false;
      }
      enqueue(trimmed, { front: true, files: takeComposerFiles(), ...takeComposerContext() });
      takeComposerDraft();
      armDrainAfterAbort();
      stopGenerating();
      return true;
    },
    [
      filesLoading,
      enqueue,
      takeComposerFiles,
      takeComposerContext,
      takeComposerDraft,
      armDrainAfterAbort,
      stopGenerating,
    ],
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
    setDefaultAction,
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
