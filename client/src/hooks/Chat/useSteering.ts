import { useCallback, useEffect, useMemo, useRef } from 'react';
import { v4 } from 'uuid';
import { useRecoilValue } from 'recoil';
import { useAtomValue, useStore } from 'jotai';
import { useToastContext } from '@librechat/client';
import { hasQueuedIntent, acquireQueueSendLock, releaseQueueSendLock } from '@librechat/chat';
import {
  hasLiveRunPause,
  getSteerErrorCode,
  selectLiveMessageState,
  isDefiniteSteerRejection,
} from '@librechat/chat';
import {
  Constants,
  isAgentsEndpoint,
  isAssistantsEndpoint,
  DEFAULT_QUEUED_SEND_LOCK_TIMEOUT_MS,
} from 'librechat-data-provider';
import type { QueueSendLock, SubmitSteerOptions, QueuedMessageContext } from '@librechat/chat';
import type { TMessage, TConversation, CodeEnvironmentMode } from 'librechat-data-provider';
import type { QueuedMessage, QueuedMessageOrigin } from '~/hooks/Chat/queue';
import type { ExtendedFile, FileSetter } from '~/common';
import type { PendingSteer } from '~/hooks/Chat/queue';
import type { DuringRunAction } from './contract';
import {
  useCancelSteerMutation,
  useSteerMessageMutation,
  supportsGenerationProtocolV2,
} from '~/data-provider';
import {
  getReasoningStateKey,
  pendingReasoningOverrideFamily,
} from '~/components/Chat/Input/Composer/state';
import {
  recoveryDispositionsFamily,
  recoveryDisposition,
} from '~/components/Chat/Steering/recovery';
import { useChatSettings } from '~/Providers/ChatSettingsContext';
import useCodeApprovalMode from '../Agents/useCodeApprovalMode';
import { useSteerRehome } from '~/hooks/Chat/useSteerCancel';
import useSteerConvert from '~/hooks/Chat/useSteerConvert';
import { revealedQueuedTurnFamily } from '~/store/steer';
import useQueuedTurnReceipts from './steering/receipts';
import { useLatestMessage } from '~/hooks/Messages';
import useQueuedRecovery from './steering/recovery';
import useComposerTake from './steering/composer';
import useQueueEnqueue from './steering/enqueue';
import { carriedSteerContext } from '~/utils';
import useLocalize from '~/hooks/useLocalize';
import useSteerChips from './steering/chips';
import useQueueRows from './steering/rows';
import store from '~/store';

export type { DuringRunAction };

export type { QueuedMessageContext } from '@librechat/chat';
export { resolveAcknowledgedSteer } from './steering/chips';

export {
  getSteerErrorCode,
  hasLiveRunPause,
  hasLiveToolApproval,
  isDefiniteSteerRejection,
} from '@librechat/chat';
export { hydrateFileDeliveryMetadata as mergeQueuedTurnFileMetadata } from '@librechat/chat';
export type { SteerErrorCode } from '@librechat/chat';

export interface UseSteeringParams {
  /** Consume the actual storage key selected by the composer’s autosave owner. */
  consumeDraft: () => void;
  index: number;
  conversationId: string;
  conversation: TConversation | null;
  addedConversation?: TConversation | null;
  /** The workspace mode the composer resolved for the next turn. */
  codeEnvironmentMode?: CodeEnvironmentMode;
  isSubmitting: boolean;
  answerModeActive: boolean;
  /** Host-owned preparation hold; existing queued-message and Stop actions remain independent. */
  composerDisabled?: boolean;
  /** Composer attachments: consumed into queued items (steering is text-only). */
  files?: Map<string, ExtendedFile>;
  setFiles?: FileSetter;
  /** Uploads still in flight: during-run submits are held like the send button. */
  filesLoading?: boolean;
  /** Submits text (and optional attachments/quotes/skills) as a normal new
   *  turn. Overrides are always explicit; a queued item is the FULL
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
 * pending-steer / queued-message chip state, and implements the three actions:
 * steer (POST + optimistic chip), queue (client-side), and interrupt & send
 * (abort, then auto-send via the one-shot drain override).
 */
export default function useSteering({
  consumeDraft: takeComposerDraft,
  index,
  conversationId,
  conversation,
  addedConversation,
  codeEnvironmentMode,
  isSubmitting,
  answerModeActive,
  composerDisabled = false,
  files,
  setFiles,
  filesLoading = false,
  sendNow,
  stopGenerating,
}: UseSteeringParams) {
  const localize = useLocalize();
  const composerDisabledRef = useRef(composerDisabled);
  composerDisabledRef.current = composerDisabled;
  const { showToast } = useToastContext();
  const jotaiStore = useStore();
  const convertSteersToQueued = useSteerConvert();
  /* The single boundary a steer's words return through, wherever the cancel
     that reclaimed them was decided. */
  const rehomeSteer = useSteerRehome(conversationId);
  /** `mutate` is a stable callback; the mutation result objects are fresh
   * every render and would defeat the memoized return value below. */
  const { mutate: steerMessage } = useSteerMessageMutation();
  const { mutateAsync: cancelSteer } = useCancelSteerMutation();
  const {
    config,
    duringRunDefaultAction: defaultAction,
    setDuringRunDefaultAction: setDefaultAction,
  } = useChatSettings();

  const { selected: codeApprovalMode } = useCodeApprovalMode(
    conversation,
    addedConversation,
    codeEnvironmentMode,
  );
  const endpoint = conversation?.endpointType ?? conversation?.endpoint;
  const steerable = !isAssistantsEndpoint(endpoint);
  const hasRealConvoId =
    conversationId != null && conversationId !== '' && conversationId !== Constants.NEW_CONVO;
  const serverQueueEnabled = isAgentsEndpoint(endpoint) && hasRealConvoId;
  /** v1 gates the during-run UI to the primary composer, like the HITL popover. */
  const enabled = steerable && index === 0;
  const queueKey = hasRealConvoId ? conversationId : Constants.NEW_CONVO;
  const reasoningStateKey = getReasoningStateKey(conversationId, index);
  const sendLockTimeoutMs = config.queuedSendLockTimeoutMs ?? DEFAULT_QUEUED_SEND_LOCK_TIMEOUT_MS;
  const pendingReasoningOverride = useAtomValue(pendingReasoningOverrideFamily(reasoningStateKey));
  const { applyQueuedTurnReceipts, finishQueuedTurnEnqueue } = useQueuedTurnReceipts({
    conversationId,
    queueKey,
    serverQueueEnabled,
  });
  /** Retain admission ownership through history hydration and stream attach;
   * ordinary sends must not overtake the server-owned successor. */
  const pendingReveal = useAtomValue(revealedQueuedTurnFamily(queueKey));
  const revealPending = pendingReveal != null;
  const activeGenerationCreatedAt = useRecoilValue(
    store.activeGenerationCreatedAtByConvoId(queueKey),
  );
  const activeGenerationProtocolVersion = useRecoilValue(
    store.activeGenerationProtocolVersionByConvoId(queueKey),
  );

  /** The start POST installs this epoch before any live mutation may be sent.
   * `isSubmitting` flips earlier so the user can keep typing; during that
   * bounded interval submits degrade to the local queue and Stop/steer refuse. */
  const canControlGeneration = activeGenerationCreatedAt != null;
  const duringRunActive = enabled && (isSubmitting || revealPending) && !answerModeActive;
  /** First-party FIFO admission: validation inside the steer route can await
   * agent ACL and attachment reads, so overlapping POSTs could otherwise reach
   * the durable queue out of submission order. Keep one request in flight per
   * conversation; later optimistic chips retain the epoch/id/time captured at
   * submission and dispatch only after the prior request settles. */
  const steerDispatchQueuesRef = useRef<
    Map<
      string,
      {
        active: boolean;
        pending: Array<(settle: () => void) => void>;
      }
    >
  >(new Map());
  const scheduleSteerDispatch = useCallback(
    (convoId: string, dispatch: (settle: () => void) => void) => {
      const existing = steerDispatchQueuesRef.current.get(convoId);
      const state = existing ?? { active: false, pending: [] };
      if (existing == null) {
        steerDispatchQueuesRef.current.set(convoId, state);
      }
      state.pending.push(dispatch);

      const startNext = () => {
        if (state.active) {
          return;
        }
        const next = state.pending[0];
        if (next == null) {
          if (steerDispatchQueuesRef.current.get(convoId) === state) {
            steerDispatchQueuesRef.current.delete(convoId);
          }
          return;
        }
        state.active = true;
        let settled = false;
        const settle = () => {
          if (settled) {
            return;
          }
          settled = true;
          const index = state.pending.indexOf(next);
          if (index >= 0) {
            state.pending.splice(index, 1);
          }
          state.active = false;
          startNext();
        };
        try {
          next(settle);
        } catch (error) {
          settle();
          throw error;
        }
      };

      startNext();
    },
    [],
  );
  /** `ask()` does not flip `isSubmitting` until the submission effect renders.
   * Two queued-row clicks in the same browser task would otherwise both remove
   * their items and the second submission could overwrite the first; and the
   * run-end drain, which submits into the SAME pane slot, cannot see a ref that
   * lives in this hook. The claim is shared with `useQueueDrain` and keyed by
   * pane, because the contended resource is `isSubmittingFamily(index)`. */
  const sendLockKey = String(index);
  const idleSendLockRef = useRef<QueueSendLock | null>(null);
  const pendingSteers = useRecoilValue(store.pendingSteersByConvoId(queueKey));

  /** Held only until the pane's submission state moves or it changes chat: past
   * either, both callers gate on `isSubmitting` directly and the claim is spent.
   *
   * Released from a cleanup rather than an effect body, because React runs every
   * cleanup in a commit before any effect body: this can never free a slot the
   * drain's effect claimed in the same commit. */
  useEffect(
    () => () => {
      releaseQueueSendLock(idleSendLockRef.current);
      idleSendLockRef.current = null;
    },
    [isSubmitting, sendLockKey, queueKey],
  );

  const {
    updateQueuedMessage,
    removeQueued,
    holdQueued,
    toggleQueuedHold,
    downgradeServerQueuedTurn,
    reorderQueued,
    restoreQueuedOrder,
    takeQueued,
    releaseQueuedOrigin,
    registerQueuedOrigin,
    restoreQueued,
    rewakeDrain,
    armDrainAfterAbort,
  } = useQueueRows({
    index,
    queueKey,
    conversationId,
    isSubmitting,
    pendingSteers,
    activeGenerationCreatedAt,
  });
  /** Capture a durable branch anchor into a server queued turn. Optimistic
   * assistant placeholders are siblings of their eventual persisted response,
   * so they anchor through their stable user parent. */
  const latestMessage = useLatestMessage(index, hasRealConvoId ? conversationId : null);
  const liveMessageState = useMemo(() => selectLiveMessageState(latestMessage), [latestMessage]);
  /** Both approval cards and `ask_user_question` suspend the current
   * generation while keeping its submission slot occupied. Answer mode hides
   * the ordinary during-run composer, but waiting-message controls still need
   * to know a live generation exists so they remain discoverable and disabled
   * instead of looking as though the action disappeared. */
  const pausedOnApproval =
    enabled && isSubmitting ? answerModeActive || hasLiveRunPause(latestMessage) : false;
  const canSteer = hasRealConvoId && canControlGeneration && !pausedOnApproval;
  const canSendQueuedNow = (!isSubmitting && !revealPending) || (duringRunActive && canSteer);

  /** A live steer cannot change the provider request already in flight.
   * Stage a full queued turn instead, and expose that same effective action to
   * Enter, the button and the hint. */
  const effectiveAction: DuringRunAction =
    canSteer && pendingReasoningOverride == null ? defaultAction : 'queue';
  /** Live submission state for POST callbacks: the closure value can be
   *  stale by the time the steer response arrives. */
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;
  const visibleConversationRef = useRef(conversationId);
  visibleConversationRef.current = conversationId;

  const {
    upsertSteerChip,
    replaceSteerChip,
    acknowledgeSteer,
    settleReceiptReplay,
    isSteerAcceptedOrSettled,
    hasPendingSteerCancel,
    clearPendingSteerCancel,
    reclaimRejectedChipQuotes,
  } = useSteerChips({ visibleConversationRef, isSubmittingRef });
  const { enqueue } = useQueueEnqueue({
    queueKey,
    conversationId,
    serverQueueEnabled,
    codeApprovalMode,
    liveParentMessageId: liveMessageState?.parentMessageId,
    pendingReveal,
    activeGenerationCreatedAt,
    applyQueuedTurnReceipts,
    finishQueuedTurnEnqueue,
    updateQueuedMessage,
  });
  const { discardQueued, dismissRecovery } = useQueuedRecovery({
    queueKey,
    conversationId,
    hasRealConvoId,
    applyQueuedTurnReceipts,
    downgradeServerQueuedTurn,
    removeQueued,
  });
  const { takeComposerFiles, takeComposerContext, takeComposerQuotes } = useComposerTake({
    conversationId,
    reasoningStateKey,
    files,
    setFiles,
  });

  /** Restore a server-owned steer as the same queued follow-up and wake a
   * drain whose one-shot completion signal may already have been consumed
   * while the recovery request was in flight. Shared by reclaim and durable
   * receipt replay so neither round-trip can strand accepted words. */
  const queueRecoveredSteer = useCallback(
    (steer: PendingSteer) => {
      convertSteersToQueued(
        conversationId,
        [
          {
            steerId: steer.steerId,
            ...(steer.clientSteerId && { clientSteerId: steer.clientSteerId }),
            text: steer.text,
            createdAt: steer.createdAt,
            ...(steer.files && steer.files.length > 0 && { files: steer.files }),
            ...carriedSteerContext(steer),
            ...(steer.queuedOrigin && { queuedOrigin: steer.queuedOrigin }),
          },
        ],
        {
          /** A durable receipt belongs to the generation that produced it. The
           * visible conversation may already advertise a replacement/legacy
           * generation by the time this late ACK lands, but that must not strip
           * the receipt-bound recovery identity from the queued item. */
          generationProtocolVersion: steer.generationProtocolVersion,
        },
      );
      rewakeDrain(conversationId);
    },
    [conversationId, convertSteersToQueued, rewakeDrain],
  );

  /** POSTs a steer (text + files + quotes; the server merges the quotes into
   *  the model-bound turn at the injection boundary). `context` doubles as the
   *  RESTORE payload: every degradation path threads it back into the
   *  requeue/send fallback so the item's quotes and manual skills survive.
   *  Skill picks never ride the POST — they configure a NEW turn's run, so a
   *  queued-origin steer only carries them for restoration. */
  const submitSteer = useCallback(
    (
      text: string,
      steerFiles?: TMessage['files'],
      context?: QueuedMessageContext,
      opts?: SubmitSteerOptions,
    ): boolean => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || !hasRealConvoId) {
        return false;
      }
      const preempt = opts?.preempt === true;
      const targetGenerationCreatedAt =
        opts?.generationCreatedAt ?? activeGenerationCreatedAt ?? undefined;
      if (targetGenerationCreatedAt == null) {
        return false;
      }
      const files = steerFiles && steerFiles.length > 0 ? steerFiles : undefined;
      const targetGenerationProtocolVersion =
        opts?.generationProtocolVersion ?? activeGenerationProtocolVersion;
      /** Rides every chip state so a terminal conversion (late ACK, run-end
       *  leftover report) can restore the queued item's full context. */
      const carried = carriedSteerContext(context);
      const localId = opts?.clientSteerId ?? `local-${v4()}`;
      /** The true submission time, carried through the ACK and failure chips so
       *  a later conversion sorts this steer by when it was SENT, not when its
       *  202 landed; otherwise a draft queued during the round-trip would drain
       *  ahead of a steer submitted before it. */
      const createdAt = opts?.createdAt ?? Date.now();
      /** If the steer loses its race with run finalization, its normal-send
       * fallback must still be tied to the generation it targeted. Otherwise
       * a newer run started by another tab can be replaced by this stale
       * fallback. Every fallback also carries a queue origin: an existing row
       * keeps its exact logical slot, while a composer-origin steer gets a
       * stable synthetic row so a predecessor 409 cannot discard its text or
       * files when the newer run wins. */
      const fallbackOrigin: QueuedMessageOrigin = opts?.queuedOrigin ?? {
        item: {
          id: localId,
          text: trimmed,
          createdAt,
          expectedPredecessorCreatedAt: targetGenerationCreatedAt,
          ...(files && { files }),
          ...carried,
          ...(context?.clientRequestId && {
            clientRequestId: context.clientRequestId,
          }),
          ...(context?.recoverySteerId && {
            recoverySteerId: context.recoverySteerId,
          }),
        },
        beforeIds: [],
        afterIds: [],
      };
      const fallbackContext: QueuedMessageContext = {
        ...context,
        expectedPredecessorCreatedAt: targetGenerationCreatedAt,
        queuedMessageOrigin: fallbackOrigin,
      };
      /** A queued-origin attempt must be reversible as the same queue item,
       *  not merely reproducible from its text. This preserves its identity,
       *  timestamp, priority, future fields, and original array position. */
      const restoreRejectedSteer = () => {
        if (opts?.queuedOrigin != null) {
          restoreQueued(opts.queuedOrigin);
        } else {
          enqueue(trimmed, { id: localId, createdAt, files, ...context });
        }
        rewakeDrain(conversationId);
      };
      if (opts?.queuedOrigin != null) {
        registerQueuedOrigin(opts.queuedOrigin);
      }
      upsertSteerChip(conversationId, {
        steerId: localId,
        text: trimmed,
        status: 'sending',
        createdAt,
        ...(files && { files }),
        ...(preempt && { preempt: true }),
        ...(targetGenerationCreatedAt != null && {
          generationCreatedAt: targetGenerationCreatedAt,
        }),
        generationProtocolVersion: targetGenerationProtocolVersion,
        ...(opts?.queuedOrigin && { queuedOrigin: opts.queuedOrigin }),
        ...carried,
      });
      scheduleSteerDispatch(conversationId, (settleDispatch) => {
        steerMessage(
          {
            conversationId,
            clientSteerId: localId,
            text: trimmed,
            ...(files && { files }),
            ...(carried.quotes && { quotes: carried.quotes }),
            ...(preempt && { preempt }),
            ...(targetGenerationCreatedAt != null && {
              generationCreatedAt: targetGenerationCreatedAt,
            }),
          },
          {
            onSuccess: (response) => {
              try {
                const acceptResponse = () => {
                  /** A 202 without the echo means a pre-quotes replica queued
                   *  the words without their excerpts. The quotes are NOT
                   *  re-staged here: the steer has not injected yet, so they
                   *  stay carried on the pending chip: a quote-less applied
                   *  event re-stages them at the actual loss, and a terminal
                   *  leftover conversion carries them onto the recovered row
                   *  instead (its normal send delivers quotes on any server).
                   *  Only a settled replay (an already-injected steer with no
                   *  future event to re-home the chip) reclaims immediately. */
                  const quotesRejected = carried.quotes != null && response.quotesAccepted !== true;
                  const canUseV2Receipt =
                    targetGenerationProtocolVersion === 2 && supportsGenerationProtocolV2(response);
                  if (canUseV2Receipt && response.settled === true) {
                    if (response.leftover === true) {
                      queueRecoveredSteer({
                        steerId: response.steerId,
                        clientSteerId: localId,
                        text: trimmed,
                        status: 'pending',
                        createdAt,
                        ...(files && { files }),
                        ...(targetGenerationCreatedAt != null && {
                          generationCreatedAt: targetGenerationCreatedAt,
                        }),
                        generationProtocolVersion: targetGenerationProtocolVersion,
                        ...(opts?.queuedOrigin && {
                          queuedOrigin: opts.queuedOrigin,
                        }),
                        ...carried,
                      });
                    } else {
                      if (quotesRejected) {
                        reclaimRejectedChipQuotes(conversationId, [localId, response.steerId]);
                      }
                      settleReceiptReplay(conversationId, localId, response.steerId);
                    }
                    return;
                  }
                  /** Unsupported runs retain the words as Steer, but never silently
                   * claim to have requested tool cancellation. */
                  if (
                    preempt &&
                    response.preempt !== true &&
                    visibleConversationRef.current === conversationId
                  ) {
                    showToast({
                      message: localize('com_ui_steer_preempt_unsupported'),
                      status: 'warning',
                    });
                  }
                  const acknowledged = {
                    steerId: response.steerId,
                    clientSteerId: localId,
                    text: trimmed,
                    status: 'pending',
                    createdAt,
                    ...(files && { files }),
                    ...(response.preempt === true && { preempt: true }),
                    ...(response.preemptRevision != null && {
                      preemptRevision: response.preemptRevision,
                    }),
                    ...(targetGenerationCreatedAt != null && {
                      generationCreatedAt: targetGenerationCreatedAt,
                    }),
                    generationProtocolVersion: targetGenerationProtocolVersion,
                    ...(opts?.queuedOrigin && {
                      queuedOrigin: opts.queuedOrigin,
                    }),
                    ...carried,
                  } satisfies PendingSteer;
                  if (acknowledgeSteer(conversationId, localId, acknowledged)) {
                    /** Terminal conversion re-homes the words as a queued
                     *  follow-up that sends via `ask`; the carried quotes ride
                     *  it there, so nothing is re-staged. */
                    queueRecoveredSteer(acknowledged);
                  }
                };
                if (hasPendingSteerCancel(conversationId, localId)) {
                  void cancelSteer({
                    conversationId,
                    steerId: response.steerId,
                    clientSteerId: localId,
                    generationCreatedAt:
                      targetGenerationCreatedAt ?? activeGenerationCreatedAt ?? undefined,
                  }).then(
                    ({ removed }) => {
                      clearPendingSteerCancel(conversationId, localId);
                      if (removed === true) {
                        /* Cancel won the race against its own POST. The words are
                           off the server now, so they go back to the user through
                           the same boundary as an immediate cancel: whole, and
                           into the queue when the composer will not take them.
                           Clearing the marker without this loses the message. */
                        rehomeSteer({
                          steerId: response.steerId,
                          clientSteerId: localId,
                          text: trimmed,
                          status: 'pending',
                          createdAt,
                          ...(files && { files }),
                          ...(targetGenerationCreatedAt != null && {
                            generationCreatedAt: targetGenerationCreatedAt,
                          }),
                          generationProtocolVersion: targetGenerationProtocolVersion,
                          ...(opts?.queuedOrigin && { queuedOrigin: opts.queuedOrigin }),
                          ...carried,
                        });
                        return;
                      }
                      /* The server kept the steer: it is live and will still
                         reach the agent. The chip the optimistic cancel hid
                         comes back through the ordinary acknowledgement, so it
                         settles like any other accepted steer. */
                      acceptResponse();
                      showToast({
                        message: localize('com_ui_steer_already_applied'),
                        status: 'info',
                      });
                    },
                    () => {
                      clearPendingSteerCancel(conversationId, localId);
                      /* Unknown outcome, but the POST was accepted: treat the
                         steer as live rather than claiming it is gone. */
                      acceptResponse();
                      showToast({
                        message: localize('com_ui_steer_cancel_failed'),
                        status: 'warning',
                      });
                    },
                  );
                  return;
                }
                acceptResponse();
              } finally {
                settleDispatch();
              }
            },
            onError: (error) => {
              try {
                clearPendingSteerCancel(conversationId, localId);
                if (isSteerAcceptedOrSettled(conversationId, localId)) {
                  replaceSteerChip(conversationId, localId, null);
                  return;
                }
                const code = getSteerErrorCode(error);
                const originStillVisible = visibleConversationRef.current === conversationId;
                if (code === 'NO_ACTIVE_RUN') {
                  // The run finished before the steer landed. While the final SSE
                  // is still settling, `ask()`'s in-flight guard would drop a
                  // direct send: queue it so the run-end drain fires it instead.
                  // The explicit empty array stops `ask` from vacuuming composer
                  // files staged for a DIFFERENT draft. A refused send (`false`)
                  // falls back to the queue too: the chip is already gone, so
                  // dropping the text here would lose it silently.
                  replaceSteerChip(conversationId, localId, null);
                  if (
                    !originStillVisible ||
                    isSubmittingRef.current ||
                    sendNow(trimmed, files ?? [], fallbackContext) === false
                  ) {
                    restoreRejectedSteer();
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
                  // NO_ACTIVE_RUN fallback and send once submission settled:
                  // queueing the refusal instead of dropping the text.
                  if (originStillVisible && !isSubmittingRef.current) {
                    if (sendNow(trimmed, files ?? [], fallbackContext) === false) {
                      restoreRejectedSteer();
                    }
                    return;
                  }
                  restoreRejectedSteer();
                  showToast({
                    message: localize('com_ui_steer_paused_queued'),
                    status: 'info',
                  });
                  return;
                }
                const errorData = (
                  error as {
                    response?: {
                      data?: { generationProtocolVersion?: unknown };
                    };
                  }
                )?.response?.data;
                if (
                  code === 'RUN_REPLACED' &&
                  targetGenerationProtocolVersion === 2 &&
                  supportsGenerationProtocolV2(errorData)
                ) {
                  /** A different live generation now owns this conversation. A
                   * normal-send fallback would replace that newer run (especially
                   * from a stale tab), so retain the instruction for its run-end
                   * drain regardless of this tab's local submission state. */
                  replaceSteerChip(conversationId, localId, null);
                  restoreRejectedSteer();
                  showToast({
                    message: localize('com_ui_steer_paused_queued'),
                    status: 'info',
                  });
                  return;
                }
                if (isDefiniteSteerRejection(error)) {
                  // A concrete origin 4xx proves the steer was rejected. Keep the
                  // ordinary failed controls (edit/queue/remove/retry) instead of
                  // the locked "delivery unknown" surface reserved for transport
                  // and 5xx ambiguity.
                  upsertSteerChip(conversationId, {
                    steerId: localId,
                    text: trimmed,
                    status: 'failed',
                    createdAt,
                    ...(files && { files }),
                    ...(preempt && { preempt: true }),
                    ...(targetGenerationCreatedAt != null && {
                      generationCreatedAt: targetGenerationCreatedAt,
                    }),
                    generationProtocolVersion: targetGenerationProtocolVersion,
                    ...(opts?.queuedOrigin && {
                      queuedOrigin: opts.queuedOrigin,
                    }),
                    ...carried,
                  });
                  return;
                }
                upsertSteerChip(conversationId, {
                  steerId: localId,
                  text: trimmed,
                  status: 'failed',
                  deliveryUncertain: true,
                  createdAt,
                  ...(files && { files }),
                  ...(preempt && { preempt: true }),
                  ...(targetGenerationCreatedAt != null && {
                    generationCreatedAt: targetGenerationCreatedAt,
                  }),
                  generationProtocolVersion: targetGenerationProtocolVersion,
                  ...(opts?.queuedOrigin && {
                    queuedOrigin: opts.queuedOrigin,
                  }),
                  ...carried,
                });
              } finally {
                settleDispatch();
              }
            },
          },
        );
      });
      return true;
    },
    [
      hasRealConvoId,
      conversationId,
      upsertSteerChip,
      replaceSteerChip,
      acknowledgeSteer,
      settleReceiptReplay,
      queueRecoveredSteer,
      rehomeSteer,
      reclaimRejectedChipQuotes,
      steerMessage,
      sendNow,
      enqueue,
      restoreQueued,
      rewakeDrain,
      registerQueuedOrigin,
      isSteerAcceptedOrSettled,
      hasPendingSteerCancel,
      clearPendingSteerCancel,
      cancelSteer,
      showToast,
      localize,
      activeGenerationCreatedAt,
      activeGenerationProtocolVersion,
      scheduleSteerDispatch,
    ],
  );

  /** Composer-originated steer: consumes the composer's attachments and quote
   *  chips so they ride the steer as one unit (the server re-fetches + encodes
   *  files and merges quotes at the injection boundary). Both are taken only
   *  after the guards pass — with `canSteer` true, `submitSteer` cannot
   *  refuse, so the drained context can never be stranded. */
  const steerFromComposer = useCallback(
    (text: string, preempt = false): boolean => {
      const trimmed = text.trim();
      if (composerDisabledRef.current || trimmed.length === 0 || filesLoading || !canSteer) {
        return false;
      }
      /** A live steer cannot change the provider request already in flight.
       * Preserve a staged reasoning choice as a full queued turn. */
      if (pendingReasoningOverride != null) {
        enqueue(trimmed, {
          files: takeComposerFiles(),
          ...takeComposerContext(),
        });
        takeComposerDraft();
        return true;
      }
      const consumed = submitSteer(trimmed, takeComposerFiles(), takeComposerQuotes(), {
        preempt,
      });
      if (consumed) {
        takeComposerDraft();
      }
      return consumed;
    },
    [
      filesLoading,
      canSteer,
      pendingReasoningOverride,
      enqueue,
      takeComposerFiles,
      takeComposerContext,
      takeComposerQuotes,
      takeComposerDraft,
      submitSteer,
    ],
  );

  /** Composer-originated queue: carries the composer's attachments, quote
   *  chips, and manual skill picks as one unit. */
  const queueFromComposer = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (composerDisabledRef.current || trimmed.length === 0 || filesLoading) {
        return false;
      }
      enqueue(trimmed, {
        files: takeComposerFiles(),
        ...takeComposerContext(),
      });
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
      opts?: SubmitSteerOptions,
    ) => {
      /** A failed interrupt-steer must retry AS an interrupt; resubmitting it
       *  as an ordinary steer would silently let generation run on. */
      submitSteer(text, steerFiles, context, {
        ...opts,
        clientSteerId: steerId,
      });
    },
    [submitSteer],
  );

  const removeSteer = useCallback(
    (steerId: string) => {
      replaceSteerChip(conversationId, steerId, null);
    },
    [conversationId, replaceSteerChip],
  );

  /**
   * Re-homes a steer the client just reclaimed from the server queue (see
   * `useSteerReclaim`) as a queued follow-up.
   *
   * Routed through the shared conversion rather than `enqueue` so it obeys the
   * same invariant as the leftover-steer path: the item keeps its ORIGINAL id
   * and `createdAt`, so a steer accepted before a later follow-up still drains
   * ahead of it; a fresh `Date.now()` would sort it last.
   *
   * The reclaim is a round-trip, so the run can end while it is in flight and
   * the drain can consume its one-shot run-end signal against an empty queue,
   * leaving nothing to auto-send this item. Rather than send it here, re-post
   * that spent signal so `useQueueDrain` runs again and decides: it owns the
   * completed-only rule, FIFO order, `NEW_CONVO` migration, and submitting via
   * `ask` (which, unlike the composer's `sendNow`, does not reset the form and
   * so cannot wipe a draft typed while the reclaim was in flight).
   *
   * Parked under the conversation rather than the index, so a run that ended
   * while the user was elsewhere still drains when they come back.
   */
  const queueReclaimedSteer = useCallback(
    (steer: PendingSteer) => {
      // A confirmed cancel has no parked server source. Restore one ordinary
      // queue item explicitly (the reclaim tombstone intentionally makes the
      // shared terminal converter ignore late payloads for these ids).
      if (steer.queuedOrigin != null) {
        restoreQueued(steer.queuedOrigin);
      } else {
        enqueue(steer.text, {
          id: steer.steerId,
          createdAt: steer.createdAt,
          files: steer.files,
          ...carriedSteerContext(steer),
          skipUsageMark: true,
        });
      }
      rewakeDrain(conversationId);
    },
    [conversationId, enqueue, rewakeDrain, restoreQueued],
  );

  /** Convert a failed/unsent steer chip into a queued follow-up. */
  const convertSteerToQueue = useCallback(
    (
      steerId: string,
      text: string,
      steerFiles?: TMessage['files'],
      context?: QueuedMessageContext,
      queuedOrigin?: QueuedMessageOrigin,
    ) => {
      replaceSteerChip(conversationId, steerId, null);
      if (queuedOrigin != null) {
        restoreQueued(queuedOrigin);
        return;
      }
      enqueue(text, { files: steerFiles, ...context });
    },
    [conversationId, replaceSteerChip, restoreQueued, enqueue],
  );

  /** Chip action: send a queued message into the live run instead. Keys on
   *  steer availability, not the default action: a queue-preferring user
   *  clicking send-now explicitly asked to inject into the live run. The
   *  item's attachments ride the steer; its quotes/skills travel as the
   *  restore context so a degraded steer requeues/sends with them intact.
   *  `preempt` escalates the steer to interrupt at the next safe token
   *  boundary; it only means something on the live-run path. */
  const sendLocalQueuedNow = useCallback(
    (item: QueuedMessage, opts?: { preempt?: boolean }) => {
      if (
        hasQueuedIntent(item.id) ||
        recoveryDisposition(jotaiStore.get(recoveryDispositionsFamily(queueKey)), item) != null
      ) {
        return;
      }
      /** In answer mode (and any other submission-owned non-steerable state)
       * there is no immediate path. Refuse before touching queue state so a
       * stale/direct caller cannot perform the old remove-and-restore no-op. */
      if (isSubmitting && (!duringRunActive || !canSteer || item.recoverySteerId != null)) {
        return;
      }
      /** Keep request-scoped reasoning on a new generation; injecting this
       * item into the active run would silently ignore the selection. */
      if (duringRunActive && item.reasoningOverride != null) {
        return;
      }
      /* No fallback to the captured item: the only way it is missing is that
         something else already took it, likely the run-end drain moments before
         this click landed. Re-sending it would send the same words twice. */
      const origin = takeQueued(item.id);
      if (origin == null) {
        return;
      }
      const taken = origin.item;
      if (duringRunActive && canSteer) {
        const consumed = submitSteer(
          taken.text,
          taken.files,
          { quotes: taken.quotes, manualSkills: taken.manualSkills },
          {
            ...(opts?.preempt === true && { preempt: true }),
            queuedOrigin: origin,
          },
        );
        if (!consumed) {
          restoreQueued(origin);
        }
        return;
      }
      if (!isSubmitting) {
        const lock = acquireQueueSendLock(sendLockKey, sendLockTimeoutMs);
        if (lock == null) {
          restoreQueued(origin);
          return;
        }
        idleSendLockRef.current = lock;
        const releaseLock = () => {
          releaseQueueSendLock(lock);
          if (idleSendLockRef.current === lock) {
            idleSendLockRef.current = null;
          }
        };
        // Explicit (possibly empty) overrides: the queued item is the full
        // submission context, never the composer's staged files/quotes/picks.
        let accepted: false | void;
        try {
          accepted = sendNow(taken.text, taken.files ?? [], {
            quotes: taken.quotes,
            manualSkills: taken.manualSkills,
            reasoningOverride: taken.reasoningOverride,
            clientRequestId: taken.clientRequestId,
            recoverySteerId: taken.recoverySteerId,
            expectedPredecessorCreatedAt: taken.expectedPredecessorCreatedAt,
            queuedMessageOrigin: origin,
          });
        } catch (error) {
          releaseLock();
          restoreQueued(origin);
          throw error;
        }
        if (accepted === false) {
          releaseLock();
          // `ask` refused without sending: restore the chip so the user's
          // text is never silently dropped (mirrors useQueueDrain).
          restoreQueued(origin);
        } else {
          releaseQueuedOrigin(origin);
        }
        return;
      }
      /** The run still owns the send slot but cannot accept a steer (approval
       *  pause/answer transition): put the untouched item back where it was. */
      restoreQueued(origin);
    },
    [
      takeQueued,
      jotaiStore,
      queueKey,
      duringRunActive,
      canSteer,
      submitSteer,
      isSubmitting,
      sendNow,
      sendLockKey,
      sendLockTimeoutMs,
      restoreQueued,
      releaseQueuedOrigin,
    ],
  );

  const queuedActionClaimsRef = useRef(new Set<string>());
  const sendQueuedNow = useCallback(
    (item: QueuedMessage, opts?: { preempt?: boolean }) => {
      /* A reasoning override belongs to the next provider request and cannot
         be injected into the one already running. Refuse before cancelling a
         durable server row, so it keeps its crash-safe ownership. */
      if (duringRunActive && item.reasoningOverride != null) {
        return;
      }
      if (item.server == null) {
        sendLocalQueuedNow(item, opts);
        return;
      }
      if (queuedActionClaimsRef.current.has(item.id)) {
        return;
      }
      queuedActionClaimsRef.current.add(item.id);
      void discardQueued(item)
        .then((discarded) => {
          if (discarded) {
            sendLocalQueuedNow(item, opts);
          }
        })
        .finally(() => {
          queuedActionClaimsRef.current.delete(item.id);
        });
    },
    [duringRunActive, discardQueued, sendLocalQueuedNow],
  );

  /** Abort the current run and auto-send this text once the abort settles. */
  const interruptAndSend = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (
        composerDisabledRef.current ||
        trimmed.length === 0 ||
        filesLoading ||
        !canControlGeneration
      ) {
        return false;
      }
      enqueue(trimmed, {
        front: true,
        files: takeComposerFiles(),
        ...takeComposerContext(),
      });
      takeComposerDraft();
      armDrainAfterAbort();
      stopGenerating();
      return true;
    },
    [
      filesLoading,
      canControlGeneration,
      enqueue,
      takeComposerFiles,
      takeComposerContext,
      takeComposerDraft,
      armDrainAfterAbort,
      stopGenerating,
    ],
  );

  /** Preempt the active step and continue the same response with the message. */
  const interruptSteer = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (
        composerDisabledRef.current ||
        trimmed.length === 0 ||
        filesLoading ||
        pausedOnApproval ||
        !canControlGeneration ||
        !hasRealConvoId
      ) {
        return false;
      }
      /* A staged reasoning choice belongs to a new generation, which a steer
         into the live one cannot carry. Falling back to interruptAndSend here
         would discard the partial answer this action promises to keep, so
         decline exactly as the disabled menu row does, on the first turn too,
         and leave the words in the composer, where Enter queues them as a
         turn of their own. */
      if (pendingReasoningOverride != null) {
        return false;
      }
      const consumed = submitSteer(trimmed, takeComposerFiles(), takeComposerQuotes(), {
        preempt: true,
      });
      if (consumed) {
        takeComposerDraft();
      }
      return consumed;
    },
    [
      filesLoading,
      pausedOnApproval,
      canControlGeneration,
      hasRealConvoId,
      pendingReasoningOverride,
      takeComposerFiles,
      takeComposerQuotes,
      takeComposerDraft,
      submitSteer,
    ],
  );

  /** Routes a during-run submit to the effective action. Returns true when consumed. */
  const submitDuringRun = useCallback(
    (text: string): boolean => {
      if (composerDisabledRef.current || !duringRunActive) {
        return false;
      }
      if (effectiveAction === 'interrupt') {
        return interruptSteer(text);
      }
      if (effectiveAction === 'steer') {
        return steerFromComposer(text);
      }
      return queueFromComposer(text);
    },
    [duringRunActive, effectiveAction, interruptSteer, steerFromComposer, queueFromComposer],
  );

  /** Memoized so consumers like `memo(Bar)` and `memo(Queue)` can bail on the
   * `steering` prop; a fresh literal here would defeat them every render. */
  return useMemo(
    () => ({
      enabled,
      queueKey,
      canSteer,
      canControlGeneration,
      duringRunActive,
      canSendQueuedNow,
      effectiveAction,
      defaultAction,
      pendingReasoningOverride,
      pausedOnApproval,
      setDefaultAction,
      submitDuringRun,
      steerFromComposer,
      queueFromComposer,
      submitSteer,
      retrySteer,
      removeSteer,
      convertSteerToQueue,
      queueReclaimedSteer,
      enqueue,
      removeQueued,
      holdQueued,
      toggleQueuedHold,
      discardQueued,
      dismissRecovery,
      rewakeDrain,
      reorderQueued,
      restoreQueuedOrder,
      sendQueuedNow,
      interruptAndSend,
      interruptSteer,
    }),
    [
      enabled,
      queueKey,
      canSteer,
      canControlGeneration,
      duringRunActive,
      canSendQueuedNow,
      effectiveAction,
      defaultAction,
      pendingReasoningOverride,
      pausedOnApproval,
      setDefaultAction,
      submitDuringRun,
      steerFromComposer,
      queueFromComposer,
      submitSteer,
      retrySteer,
      removeSteer,
      convertSteerToQueue,
      queueReclaimedSteer,
      enqueue,
      removeQueued,
      holdQueued,
      toggleQueuedHold,
      discardQueued,
      dismissRecovery,
      rewakeDrain,
      reorderQueued,
      restoreQueuedOrder,
      sendQueuedNow,
      interruptAndSend,
      interruptSteer,
    ],
  );
}

export type SteeringControls = ReturnType<typeof useSteering>;
