import { useCallback, useRef } from 'react';
import { useStore } from 'jotai';
import { useRecoilCallback } from 'recoil';
import { Constants, StepTypes, StepEvents, ContentTypes } from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  EventSubmission,
  TMessageContentParts,
  SubagentUpdateEvent,
  SandboxStartingEvent,
  PtcToolCallEvent,
} from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import type { AnnounceOptions } from '~/common';
import {
  closeParentSubagentProgress,
  listRegisteredSubagentProgressKeys,
  reduceSubagentProgress,
  registerSubagentProgressKey,
  removeSubagentProgressAtoms,
  subagentParentStreamOpenByToolCallId,
  subagentProgressByToolCallId,
  takeRegisteredSubagentProgressKeys,
  subagentProgressKey,
} from '~/components/Chat/Subagents/state';
import {
  applyReasoningDelta,
  applyToolCallCompleted,
  isSkillAuthoringToolCall,
  applyToolCallDelta,
  applySummarizeDelta,
  applyRunStepClosed,
  applyToolCallsStep,
  applyMessageDelta,
  finalizeSummaries,
  applyAgentUpdate,
  applySummaryStep,
  getEditPrefix,
} from './steps';
import {
  sandboxStartingByToolCallId,
  ptcTraceByToolCallId,
  PTC_TRACE_MAX_ENTRIES,
  ptcTraceKey,
} from '~/store';
import { MESSAGE_UPDATE_INTERVAL } from '~/common';

type TUseStepHandler = {
  announcePolite: (options: AnnounceOptions) => void;
  setMessages: (messages: TMessage[]) => void;
  getMessages: () => TMessage[] | undefined;
  /** @deprecated - isSubmitting should be derived from submission state */
  setIsSubmitting?: SetterOrUpdater<boolean>;
  lastAnnouncementTimeRef: React.MutableRefObject<number>;
  /**
   * Fired when a completed `create_file`/`edit_file` call targeted a
   * `skills/...` path. The caller owns the side effect (skill query cache
   * invalidation) so this hook stays free of query-client coupling.
   */
  onSkillAuthoringComplete?: () => void;
  onSubagentIndexChange?: (conversationId: string) => void;
};

type TStepEvent =
  | { event: StepEvents.ON_RUN_STEP; data: Agents.RunStep }
  | { event: StepEvents.ON_AGENT_UPDATE; data: Agents.AgentUpdate }
  | { event: StepEvents.ON_MESSAGE_DELTA; data: Agents.MessageDeltaEvent }
  | { event: StepEvents.ON_REASONING_DELTA; data: Agents.ReasoningDeltaEvent }
  | { event: StepEvents.ON_RUN_STEP_DELTA; data: Agents.RunStepDeltaEvent }
  | { event: StepEvents.ON_RUN_STEP_COMPLETED; data: { result: Agents.ToolEndEvent } }
  | { event: StepEvents.ON_RUN_STEP_CLOSED; data: Agents.RunStepClosedEvent }
  | { event: StepEvents.ON_SUMMARIZE_START; data: Agents.SummarizeStartEvent }
  | { event: StepEvents.ON_SUMMARIZE_DELTA; data: Agents.SummarizeDeltaEvent }
  | { event: StepEvents.ON_SUMMARIZE_COMPLETE; data: Agents.SummarizeCompleteEvent }
  | { event: StepEvents.ON_SUBAGENT_UPDATE; data: SubagentUpdateEvent }
  | { event: StepEvents.ON_SANDBOX_STARTING; data: SandboxStartingEvent }
  | { event: StepEvents.ON_PTC_TOOL_CALL; data: PtcToolCallEvent };

export default function useStepHandler({
  setMessages,
  getMessages,
  announcePolite,
  lastAnnouncementTimeRef,
  onSkillAuthoringComplete,
  onSubagentIndexChange,
}: TUseStepHandler) {
  const subagentStore = useStore();
  const toolCallIdMap = useRef(new Map<string, string | undefined>());
  const messageMap = useRef(new Map<string, TMessage>());
  const stepMap = useRef(new Map<string, Agents.RunStep>());
  /** Buffer for deltas that arrive before their corresponding run step */
  const pendingDeltaBuffer = useRef(new Map<string, TStepEvent[]>());
  /** Coalesces rapid-fire summarize delta renders into a single rAF frame */
  const summarizeDeltaRaf = useRef<number | null>(null);
  /** Coalesces per-token message/reasoning delta cache writes into one rAF frame.
   * `deltaFlushScheduled` (not the handle) gates scheduling: the handle is
   * assigned after `requestAnimationFrame` returns, which would race a
   * synchronously-invoked callback. */
  const messageDeltaRaf = useRef<number | null>(null);
  const deltaFlushScheduled = useRef(false);
  const pendingDeltaFlushIds = useRef(new Set<string>());
  const pendingDeltaFlushRef = useRef<(() => void) | null>(null);
  /**
   * Maps `SubagentUpdateEvent.subagentRunId` → one concrete parent content-part
   * occurrence. `payload.parentToolCallId` narrows the candidates when present,
   * but provider IDs are not unique enough to be the atom identity: they may be
   * reused across messages or even within one message. Forward (oldest-first)
   * claiming preserves creation order for both modern and legacy envelopes.
   */
  const subagentRunToInvocationKey = useRef(new Map<string, string>());
  const claimedSubagentInvocationKeys = useRef(new Set<string>());
  /**
   * Buffers for envelopes that arrive before their `subagent` tool call is
   * reflected in `messageMap`. Keyed by `subagentRunId`. Once a tool call is
   * claimed we drain the buffer into the Recoil atom in arrival order.
   */
  const pendingSubagentBuffer = useRef(
    new Map<string, { parentMessageId: string; events: SubagentUpdateEvent[] }>(),
  );
  const getCurrentMessages = useCallback(
    (messages: TMessage[]) => {
      const freshMessages = getMessages();
      return freshMessages && freshMessages.length >= messages.length ? freshMessages : messages;
    },
    [getMessages],
  );

  /** Both content parts and ticker lines are aggregated incrementally
   *  into the atom as each `ON_SUBAGENT_UPDATE` arrives; we never
   *  retain the raw event array, so no rolling window is needed. A
   *  talkative subagent can emit thousands of deltas without growing
   *  memory past what the structural output requires. */

  /**
   * Resolves a subagent run to an occurrence-scoped parent invocation key.
   */
  const resolveSubagentInvocationKey = useCallback(
    (payload: SubagentUpdateEvent, parentMessageId: string): string | undefined => {
      const cached = subagentRunToInvocationKey.current.get(payload.subagentRunId);
      if (cached != null) return cached;
      if (parentMessageId === '') return undefined;

      // Claim one concrete content-part occurrence. Providers can repeat a
      // tool_call ID even within one assistant message, so raw IDs alone are
      // not sufficient identity for either the card or its live progress.
      const preferred = messageMap.current.get(parentMessageId);
      // `runId` gives us the expected parent message. If that message has not
      // arrived yet, buffer instead of claiming a same-ID call from another
      // parallel response; the mapping is permanent once claimed.
      if (preferred == null) return undefined;
      for (const [messageId, message] of [[parentMessageId, preferred] as const]) {
        const content = message.content;
        if (!Array.isArray(content)) continue;
        for (let i = 0; i < content.length; i++) {
          const part = content[i];
          if (part?.type !== ContentTypes.TOOL_CALL) continue;
          const tc = (part as { [ContentTypes.TOOL_CALL]?: { id?: string; name?: string } })[
            ContentTypes.TOOL_CALL
          ];
          if (
            tc?.name === Constants.SUBAGENT &&
            tc.id &&
            (payload.parentToolCallId == null || tc.id === payload.parentToolCallId) &&
            !claimedSubagentInvocationKeys.current.has(subagentProgressKey(messageId, tc.id, i))
          ) {
            const invocationKey = subagentProgressKey(messageId, tc.id, i);
            subagentRunToInvocationKey.current.set(payload.subagentRunId, invocationKey);
            claimedSubagentInvocationKeys.current.add(invocationKey);
            return invocationKey;
          }
        }
      }

      return undefined;
    },
    [],
  );

  /**
   * Merges an incoming {@link SubagentUpdateEvent} into the atom bucket keyed
   * by the parent `tool_call_id`. Buffers early-arriving events whose tool call
   * is not yet mapped, and replays the buffer once correlation completes.
   */
  const applySubagentUpdate = useCallback(
    (payload: SubagentUpdateEvent, parentMessageId: string): void => {
      const invocationKey = resolveSubagentInvocationKey(payload, parentMessageId);

      if (!invocationKey) {
        const pending = pendingSubagentBuffer.current.get(payload.subagentRunId) ?? {
          parentMessageId,
          events: [],
        };
        pending.events.push(payload);
        pendingSubagentBuffer.current.set(payload.subagentRunId, pending);
        return;
      }

      const pending = pendingSubagentBuffer.current.get(payload.subagentRunId);
      if (pending && pending.events.length > 0) {
        pendingSubagentBuffer.current.delete(payload.subagentRunId);
      }
      const toApply = pending ? [...pending.events, payload] : [payload];

      registerSubagentProgressKey(invocationKey);
      subagentStore.set(subagentParentStreamOpenByToolCallId(invocationKey), true);
      subagentStore.set(subagentProgressByToolCallId(invocationKey), (prev) =>
        reduceSubagentProgress(prev, toApply, 'parent', true),
      );
    },
    [resolveSubagentInvocationKey, subagentStore],
  );

  /**
   * Resets all accumulated subagent state. Kept for conversation-switch
   * cleanup (see top-level hook usage) but NOT called from `clearStepMaps`:
   * the collapsed SubagentCall ticker and its panel read from these atoms to
   * render the child's content parts, and we want that history to remain
   * visible after the stream ends so the user can reopen the panel for
   * auditability. The atoms are bounded by aggregated structure and
   * per-conversation (one atom per subagent spawn), so growth is proportional
   * to messages: the same growth profile as the rest of the conversation
   * state.
   */
  const resetSubagentAtoms = useCallback((): void => {
    for (const invocationKey of takeRegisteredSubagentProgressKeys()) {
      /** Clear before freeing: `remove` drops the cached family member but
       *  tells nothing still subscribed to it, so anything mounted at this
       *  boundary has to see the empty value first. */
      subagentStore.set(subagentProgressByToolCallId(invocationKey), null);
      subagentStore.set(subagentParentStreamOpenByToolCallId(invocationKey), false);
      removeSubagentProgressAtoms(invocationKey);
    }
  }, [subagentStore]);

  const closeParentSubagentStreams = useCallback((): void => {
    for (const invocationKey of listRegisteredSubagentProgressKeys()) {
      subagentStore.set(subagentParentStreamOpenByToolCallId(invocationKey), false);
      subagentStore.set(subagentProgressByToolCallId(invocationKey), closeParentSubagentProgress);
    }
  }, [subagentStore]);

  /** Tool-call ids whose sandbox-starting atom is set, so completion can clear them. */
  const knownSandboxAtomKeys = useRef(new Set<string>());

  const sandboxStore = useStore();
  const setSandboxStarting = useCallback(
    (toolCallId: string): void => {
      knownSandboxAtomKeys.current.add(toolCallId);
      sandboxStore.set(sandboxStartingByToolCallId(toolCallId), true);
    },
    [sandboxStore],
  );

  const clearSandboxStarting = useCallback(
    (toolCallId?: string | null): void => {
      if (!toolCallId || !knownSandboxAtomKeys.current.has(toolCallId)) {
        return;
      }
      knownSandboxAtomKeys.current.delete(toolCallId);
      sandboxStore.set(sandboxStartingByToolCallId(toolCallId), false);
    },
    [sandboxStore],
  );

  const resetSandboxAtoms = useCallback((): void => {
    for (const toolCallId of knownSandboxAtomKeys.current) {
      sandboxStore.set(sandboxStartingByToolCallId(toolCallId), false);
    }
    knownSandboxAtomKeys.current.clear();
  }, [sandboxStore]);

  /** PTC tool call ids with a live trace, so the atoms can be released. */
  const knownPtcAtomKeys = useRef(new Set<string>());

  /**
   * Folds one `on_ptc_tool_call` envelope into its program's trace: the
   * `running` event appends a row, the settling event updates that row in
   * place by `call_id`. Order follows the sandbox's dispatch order, which is
   * what the code reads like; a round trip can settle out of order.
   */
  const applyPtcToolCall = useRecoilCallback(
    ({ set }) =>
      (event: PtcToolCallEvent, parentMessageId: string): void => {
        const { tool_call_id: toolCallId, call_id: callId, name, status } = event;
        /** No parent message means no occurrence to scope this to; a raw
         *  `tool_call_id` would leak the rows into whichever card reused it. */
        if (!toolCallId || !callId || !parentMessageId) {
          return;
        }
        const atomKey = ptcTraceKey(parentMessageId, toolCallId);
        knownPtcAtomKeys.current.add(atomKey);
        set(ptcTraceByToolCallId(atomKey), (previous) => {
          const index = previous.entries.findIndex((entry) => entry.callId === callId);
          const entry = {
            callId,
            name,
            status,
            ...(event.args ? { args: event.args } : {}),
            ...(event.error ? { error: event.error } : {}),
            ...(event.durationMs != null ? { durationMs: event.durationMs } : {}),
          };

          if (index !== -1) {
            const next = [...previous.entries];
            next[index] = { ...previous.entries[index], ...entry };
            return { entries: next, dropped: previous.dropped };
          }

          /** A settle whose row is gone, evicted by the cap, or pruned across
           *  a resume gap, must not reappear at the tail out of order. */
          if (status !== 'running') {
            return previous;
          }

          const appended = [...previous.entries, entry];
          const overflow = appended.length - PTC_TRACE_MAX_ENTRIES;
          if (overflow <= 0) {
            return { entries: appended, dropped: previous.dropped };
          }
          return {
            entries: appended.slice(overflow),
            dropped: previous.dropped + overflow,
          };
        });
      },
    [],
  );

  const resetPtcAtoms = useRecoilCallback(
    ({ reset }) =>
      (): void => {
        for (const atomKey of knownPtcAtomKeys.current) {
          reset(ptcTraceByToolCallId(atomKey));
        }
        knownPtcAtomKeys.current.clear();
      },
    [],
  );

  /**
   * Settles rows still marked `running` after a stream gap as `interrupted`.
   * Inner calls carry no durable state: they are not content parts, so the
   * resume snapshot cannot rebuild them and a settling event lost in the gap
   * is never replayed, and that means such a row would otherwise spin forever.
   *
   * Marked, not removed: a call can also still be executing across the
   * reconnect, and its settling event then arrives normally on the restored
   * live stream. That event updates this row in place, so the call reports its
   * real outcome. Deleting the row would strand it: a settle whose row is
   * gone is dropped rather than re-appended out of order, and the call would
   * vanish from the trace despite having run. Settled rows are untouched.
   */
  const prunePtcTraces = useRecoilCallback(
    ({ set }) =>
      (): void => {
        for (const atomKey of knownPtcAtomKeys.current) {
          set(ptcTraceByToolCallId(atomKey), (previous) =>
            previous.entries.some((entry) => entry.status === 'running')
              ? {
                  ...previous,
                  entries: previous.entries.map((entry) =>
                    entry.status === 'running'
                      ? { ...entry, status: 'interrupted' as const }
                      : entry,
                  ),
                }
              : previous,
          );
        }
      },
    [],
  );

  const stepHandler = useCallback(
    (stepEvent: TStepEvent, submission: EventSubmission) => {
      const submissionMessages = submission.messages ?? [];
      const getEventMessages = (candidateMessages: TMessage[]) =>
        submission.isRegenerate ? candidateMessages : getCurrentMessages(candidateMessages);
      const messages = getEventMessages(submissionMessages);
      const { userMessage } = submission;
      const getRegenerateResponseIds = (responseMessageId: string) => {
        const ids = new Set<string>();
        const addId = (id?: string | null) => {
          if (!id) {
            return;
          }
          ids.add(id);
          ids.add(id.replace(/_+$/, ''));
        };
        addId(responseMessageId);
        addId(submission.initialResponse?.messageId);
        addId(submission.userMessage?.responseMessageId);
        return ids;
      };
      const shouldRemoveRegenerateResponse = (message: TMessage, responseMessageId: string) =>
        submission.isRegenerate &&
        !message.isCreatedByUser &&
        getRegenerateResponseIds(responseMessageId).has(message.messageId);
      const shouldRemoveInitialResponse = (message: TMessage, responseMessageId: string) => {
        const initialResponseId = submission.initialResponse?.messageId;
        return (
          !submission.isRegenerate &&
          !message.isCreatedByUser &&
          initialResponseId != null &&
          initialResponseId !== responseMessageId &&
          message.messageId === initialResponseId &&
          message.parentMessageId === userMessage.messageId
        );
      };
      const ensureUserMessagePresent = (
        candidateMessages: TMessage[],
        responseMessageId: string,
      ) => {
        if (
          submission.isRegenerate ||
          !userMessage?.messageId ||
          candidateMessages.some((message) => message.messageId === userMessage.messageId)
        ) {
          return candidateMessages;
        }

        /** Insert before the row's first CHILD as well as before the response
         *  row: abandoned responses from preempted attempts are children of
         *  this user message and may already sit in the list. Landing the
         *  parent after them orders children before their parent, which the
         *  message tree renders as phantom root branches (a folded thread). */
        let insertIndex = candidateMessages.length;
        for (let i = 0; i < candidateMessages.length; i++) {
          const message = candidateMessages[i];
          if (
            message.messageId === responseMessageId ||
            message.parentMessageId === userMessage.messageId
          ) {
            insertIndex = i;
            break;
          }
        }
        if (insertIndex >= candidateMessages.length) {
          return [...candidateMessages, userMessage as TMessage];
        }

        const nextMessages = [...candidateMessages];
        nextMessages.splice(insertIndex, 0, userMessage as TMessage);
        return nextMessages;
      };
      const getResponseBaseMessages = (
        candidateMessages: TMessage[],
        responseMessageId: string,
        ensureUserMessage = false,
      ) => {
        const currentMessages = getEventMessages(candidateMessages);
        if (!submission.isRegenerate) {
          const nextMessages = currentMessages.filter(
            (message) => !shouldRemoveInitialResponse(message, responseMessageId),
          );
          return ensureUserMessage
            ? ensureUserMessagePresent(nextMessages, responseMessageId)
            : nextMessages;
        }
        return currentMessages.filter(
          (message) => !shouldRemoveRegenerateResponse(message, responseMessageId),
        );
      };
      const mergeResponseMessage = (
        candidateMessages: TMessage[],
        updatedResponse: TMessage,
        responseMessageId: string,
        options?: { ensureUserMessage?: boolean },
      ) => {
        const currentMessages = getResponseBaseMessages(
          candidateMessages,
          responseMessageId,
          options?.ensureUserMessage === true,
        );
        const hasResponseMessage = currentMessages.some(
          (msg) => msg.messageId === responseMessageId,
        );
        return hasResponseMessage
          ? currentMessages.map((msg) =>
              msg.messageId === responseMessageId ? updatedResponse : msg,
            )
          : [...currentMessages, updatedResponse];
      };
      /**
       * Per-token deltas fold into `messageMap` immediately (authoritative), but
       * the cache write, and the buildTree + message-tree walk it triggers,
       * flushes at most once per frame. Non-delta events keep writing
       * synchronously from `messageMap`, so a trailing flush after them merges
       * the same authoritative state; `clearStepMaps` cancels the flush at run
       * boundaries (same lifecycle as the summarize coalescing above).
       */
      const scheduleCoalescedMessagesFlush = (responseMessageId: string) => {
        pendingDeltaFlushIds.current.add(responseMessageId);
        const flush = () => {
          deltaFlushScheduled.current = false;
          messageDeltaRaf.current = null;
          pendingDeltaFlushRef.current = null;
          const ids = pendingDeltaFlushIds.current;
          pendingDeltaFlushIds.current = new Set();
          let candidate = messages;
          for (const id of ids) {
            const latest = messageMap.current.get(id);
            if (!latest) {
              continue;
            }
            candidate = mergeResponseMessage(candidate, latest, id, { ensureUserMessage: true });
            setMessages(candidate);
          }
        };
        /** Exposed so terminal/read boundaries (abort, error, pending-action)
         * can apply the queued tokens synchronously via `flushPendingDeltas`. */
        pendingDeltaFlushRef.current = flush;
        if (deltaFlushScheduled.current) {
          return;
        }
        deltaFlushScheduled.current = true;
        messageDeltaRaf.current = requestAnimationFrame(flush);
      };
      let parentMessageId =
        submission.isRegenerate && submission.initialResponse?.parentMessageId
          ? submission.initialResponse.parentMessageId
          : userMessage.messageId;

      const currentTime = Date.now();
      if (currentTime - lastAnnouncementTimeRef.current > MESSAGE_UPDATE_INTERVAL) {
        announcePolite({ message: 'composing', isStatus: true });
        lastAnnouncementTimeRef.current = currentTime;
      }

      /** Activity labels honor the same `editPrefixCleared` flag `getEditPrefix` reads, so a
       *  batch's tool cards and its header land in one index space. */
      const { initialContent, editPrefixOffset } = getEditPrefix(submission);

      if (stepEvent.event === StepEvents.ON_RUN_STEP) {
        const runStep = stepEvent.data;
        let responseMessageId = runStep.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }
        if (!responseMessageId) {
          console.warn('No message id found in run step event');
          return;
        }

        stepMap.current.set(runStep.id, runStep);

        let response = messageMap.current.get(responseMessageId);

        if (!response) {
          // Find the actual response message. Regenerate submissions can target
          // an earlier branch while the visible history still ends at a later
          // assistant message, so never seed a regenerated response from the
          // conversation tail.
          const lastMessage = messages[messages.length - 1] as TMessage;
          const responseMessage =
            !submission.isRegenerate && lastMessage && !lastMessage.isCreatedByUser
              ? lastMessage
              : (submission?.initialResponse as TMessage);

          // For edit scenarios, initialContent IS the complete starting content (not to be merged)
          // For resume scenarios (no editedContent), initialContent is empty and we use existingContent
          const existingContent = responseMessage?.content ?? [];
          const mergedContent: TMessageContentParts[] =
            initialContent.length > 0 ? initialContent : existingContent;

          response = {
            ...responseMessage,
            parentMessageId,
            conversationId: userMessage.conversationId,
            messageId: responseMessageId,
            content: mergedContent,
          };

          messageMap.current.set(responseMessageId, response);

          // Get fresh messages to handle multi-tab scenarios where messages may have loaded
          // after this handler started (Tab 2 may have more complete history now)
          const currentMessages = getResponseBaseMessages(messages, responseMessageId, true);

          // Remove any existing response placeholder
          let updatedMessages = currentMessages.filter(
            (message) =>
              message.messageId !== responseMessageId &&
              !shouldRemoveRegenerateResponse(message, responseMessageId) &&
              !shouldRemoveInitialResponse(message, responseMessageId),
          );

          // Ensure userMessage is present (multi-tab: Tab 2 may not have it yet).
          // Regenerate reuses an existing user turn; its submission userMessage is only
          // a transport placeholder and must not become a new visible branch.
          // (`ensureUserMessagePresent` no-ops for regenerate and inserts in
          // parent-before-children order otherwise.)
          updatedMessages = ensureUserMessagePresent(updatedMessages, responseMessageId);

          setMessages([...updatedMessages, response]);
        }

        if (runStep.stepDetails.type === StepTypes.TOOL_CALLS) {
          const { message: updatedResponse, toolCallId } = applyToolCallsStep(
            response,
            runStep,
            editPrefixOffset,
          );
          if (toolCallId) {
            toolCallIdMap.current.set(runStep.id, toolCallId);
          }
          messageMap.current.set(responseMessageId, updatedResponse);
          setMessages(
            mergeResponseMessage(messages, updatedResponse, responseMessageId, {
              ensureUserMessage: true,
            }),
          );
        }

        if (runStep.summary != null) {
          const updatedResponse = applySummaryStep(
            messageMap.current.get(responseMessageId) ?? response,
            runStep,
            editPrefixOffset,
          );
          messageMap.current.set(responseMessageId, updatedResponse);
          setMessages(
            mergeResponseMessage(messages, updatedResponse, responseMessageId, {
              ensureUserMessage: true,
            }),
          );
        }

        const bufferedDeltas = pendingDeltaBuffer.current.get(runStep.id);
        if (bufferedDeltas && bufferedDeltas.length > 0) {
          pendingDeltaBuffer.current.delete(runStep.id);
          for (const bufferedDelta of bufferedDeltas) {
            stepHandler(bufferedDelta, submission);
          }
        }
      } else if (stepEvent.event === StepEvents.ON_AGENT_UPDATE) {
        const { agent_update } = stepEvent.data;
        let responseMessageId = agent_update.runId || '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }
        if (!responseMessageId) {
          console.warn('No message id found in agent update event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response) {
          const updatedResponse = applyAgentUpdate(response, stepEvent.data, editPrefixOffset);
          messageMap.current.set(responseMessageId, updatedResponse);
          setMessages(
            mergeResponseMessage(messages, updatedResponse, responseMessageId, {
              ensureUserMessage: true,
            }),
          );
        }
      } else if (stepEvent.event === StepEvents.ON_MESSAGE_DELTA) {
        const messageDelta = stepEvent.data;
        const runStep = stepMap.current.get(messageDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          const buffer = pendingDeltaBuffer.current.get(messageDelta.id) ?? [];
          buffer.push({ event: StepEvents.ON_MESSAGE_DELTA, data: messageDelta });
          pendingDeltaBuffer.current.set(messageDelta.id, buffer);
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response) {
          const result = applyMessageDelta(response, runStep, messageDelta, editPrefixOffset);
          if (result.foldedEditPrefix && submission != null) {
            submission.editPrefixFirstPartFolded = true;
          }
          if (result.updated) {
            messageMap.current.set(responseMessageId, result.message);
            scheduleCoalescedMessagesFlush(responseMessageId);
          }
        }
      } else if (stepEvent.event === StepEvents.ON_REASONING_DELTA) {
        const reasoningDelta = stepEvent.data;
        const runStep = stepMap.current.get(reasoningDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          const buffer = pendingDeltaBuffer.current.get(reasoningDelta.id) ?? [];
          buffer.push({ event: StepEvents.ON_REASONING_DELTA, data: reasoningDelta });
          pendingDeltaBuffer.current.set(reasoningDelta.id, buffer);
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response) {
          const result = applyReasoningDelta(response, runStep, reasoningDelta, editPrefixOffset);
          if (result.foldedEditPrefix && submission != null) {
            submission.editPrefixFirstPartFolded = true;
          }
          if (result.updated) {
            messageMap.current.set(responseMessageId, result.message);
            scheduleCoalescedMessagesFlush(responseMessageId);
          }
        }
      } else if (stepEvent.event === StepEvents.ON_RUN_STEP_DELTA) {
        const runStepDelta = stepEvent.data;
        const runStep = stepMap.current.get(runStepDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          const buffer = pendingDeltaBuffer.current.get(runStepDelta.id) ?? [];
          buffer.push({ event: StepEvents.ON_RUN_STEP_DELTA, data: runStepDelta });
          pendingDeltaBuffer.current.set(runStepDelta.id, buffer);
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        const updatedResponse =
          response &&
          applyToolCallDelta(
            response,
            runStep,
            runStepDelta,
            toolCallIdMap.current.get(runStepDelta.id) ?? '',
            editPrefixOffset,
          );
        if (updatedResponse) {
          messageMap.current.set(responseMessageId, updatedResponse);
          setMessages(
            mergeResponseMessage(messages, updatedResponse, responseMessageId, {
              ensureUserMessage: true,
            }),
          );
        }
      } else if (stepEvent.event === StepEvents.ON_RUN_STEP_COMPLETED) {
        const { result } = stepEvent.data;

        const { id: stepId } = result;
        clearSandboxStarting(result.tool_call?.id);

        const runStep = stepMap.current.get(stepId);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          const buffer = pendingDeltaBuffer.current.get(stepId) ?? [];
          buffer.push({ event: StepEvents.ON_RUN_STEP_COMPLETED, data: stepEvent.data });
          pendingDeltaBuffer.current.set(stepId, buffer);
          return;
        }

        if (isSkillAuthoringToolCall(result.tool_call)) {
          onSkillAuthoringComplete?.();
        }

        const response = messageMap.current.get(responseMessageId);
        if (response) {
          const updatedResponse = applyToolCallCompleted(
            response,
            runStep,
            result,
            editPrefixOffset,
          );
          messageMap.current.set(responseMessageId, updatedResponse);
          setMessages(
            mergeResponseMessage(messages, updatedResponse, responseMessageId, {
              ensureUserMessage: true,
            }),
          );
        }
      } else if (stepEvent.event === StepEvents.ON_RUN_STEP_CLOSED) {
        const closed = stepEvent.data;
        const runStep = stepMap.current.get(closed.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        /**
         * A closure for a step this client never saw opened is not an error
         * worth surfacing; it happens on reconnect, where the replay may
         * start after the step was created.
         */
        if (!runStep || !responseMessageId) {
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (!response) {
          return;
        }

        const updatedResponse = applyRunStepClosed(response, runStep, closed, editPrefixOffset);
        if (!updatedResponse) {
          return;
        }
        messageMap.current.set(responseMessageId, updatedResponse);
        setMessages(
          mergeResponseMessage(messages, updatedResponse, responseMessageId, {
            ensureUserMessage: true,
          }),
        );
      } else if (stepEvent.event === StepEvents.ON_SANDBOX_STARTING) {
        setSandboxStarting(stepEvent.data.tool_call_id);
      } else if (stepEvent.event === StepEvents.ON_PTC_TOOL_CALL) {
        /** `runId` is the response message id (the run configurable's
         *  `run_id`), the same correlation the subagent path uses. */
        let responseMessageId = stepEvent.data.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
        }
        applyPtcToolCall(stepEvent.data, responseMessageId);
      } else if (stepEvent.event === StepEvents.ON_SUBAGENT_UPDATE) {
        let responseMessageId = stepEvent.data.runId;
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
        }
        applySubagentUpdate(stepEvent.data, responseMessageId);
        if (
          stepEvent.data.phase === 'start' ||
          stepEvent.data.phase === 'stop' ||
          stepEvent.data.phase === 'error'
        ) {
          const conversationId = [
            submission?.userMessage?.conversationId,
            submission?.initialResponse?.conversationId,
            submission?.conversation?.conversationId,
          ].find((id) => id && id !== Constants.NEW_CONVO && id !== Constants.PENDING_CONVO);
          if (conversationId) onSubagentIndexChange?.(conversationId);
        }
      } else if (stepEvent.event === StepEvents.ON_SUMMARIZE_START) {
        announcePolite({ message: 'summarize_started', isStatus: true });
      } else if (stepEvent.event === StepEvents.ON_SUMMARIZE_DELTA) {
        const deltaData = stepEvent.data;
        const runStep = stepMap.current.get(deltaData.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          const buffer = pendingDeltaBuffer.current.get(deltaData.id) ?? [];
          buffer.push({ event: StepEvents.ON_SUMMARIZE_DELTA, data: deltaData });
          pendingDeltaBuffer.current.set(deltaData.id, buffer);
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response) {
          const updatedResponse = applySummarizeDelta(
            response,
            runStep,
            deltaData,
            editPrefixOffset,
          );
          messageMap.current.set(responseMessageId, updatedResponse);
          if (summarizeDeltaRaf.current == null) {
            summarizeDeltaRaf.current = requestAnimationFrame(() => {
              summarizeDeltaRaf.current = null;
              const latest = messageMap.current.get(responseMessageId);
              if (latest) {
                const currentMessages = submission.isRegenerate ? messages : getMessages() || [];
                setMessages(mergeResponseMessage(currentMessages, latest, responseMessageId));
              }
            });
          }
        }
      } else if (stepEvent.event === StepEvents.ON_SUMMARIZE_COMPLETE) {
        const completeData = stepEvent.data;
        const completeRunStep = stepMap.current.get(completeData.id);
        let completeMessageId = completeRunStep?.runId ?? '';
        if (completeMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          completeMessageId = submission?.initialResponse?.messageId ?? '';
        }

        const targetMessage = messageMap.current.get(completeMessageId);
        if (!targetMessage) {
          return;
        }

        /** Scoped to the owning step's slot when the step is known; see `finalizeSummaries`. */
        const completeIndex =
          completeRunStep != null ? completeRunStep.index + editPrefixOffset : -1;
        const finalized = finalizeSummaries(targetMessage, completeData, completeIndex);
        if (finalized) {
          announcePolite({
            message: completeData.error ? 'summarize_failed' : 'summarize_completed',
            isStatus: true,
          });
          const currentMessages = submission.isRegenerate ? messages : getMessages() || [];
          messageMap.current.set(completeMessageId, finalized);
          setMessages(mergeResponseMessage(currentMessages, finalized, completeMessageId));
        }
      } else {
        const _exhaustive: never = stepEvent;
        console.warn('Unhandled step event', (_exhaustive as TStepEvent).event);
      }
    },
    [
      getMessages,
      lastAnnouncementTimeRef,
      announcePolite,
      setMessages,
      getCurrentMessages,
      applySubagentUpdate,
      onSubagentIndexChange,
      setSandboxStarting,
      clearSandboxStarting,
      applyPtcToolCall,
      onSkillAuthoringComplete,
    ],
  );

  /** Cancels a queued delta flush so it can't overwrite a terminal write:
   * once a final handler has written the server's authoritative message, a
   * trailing frame reading the older streaming copy from `messageMap` must
   * never land on top of it. */
  const cancelPendingDeltaFlush = useCallback(() => {
    if (messageDeltaRaf.current != null) {
      cancelAnimationFrame(messageDeltaRaf.current);
      messageDeltaRaf.current = null;
    }
    deltaFlushScheduled.current = false;
    pendingDeltaFlushRef.current = null;
    pendingDeltaFlushIds.current.clear();
  }, []);

  /** Applies a queued delta flush synchronously (then cancels the frame).
   * For boundaries that READ the cache or synthesize from it (abort's
   * partial-response capture, error cards, pending-action application), the
   * queued tokens must land first or the stopped/errored message loses them. */
  const flushPendingDeltas = useCallback(() => {
    if (messageDeltaRaf.current != null) {
      cancelAnimationFrame(messageDeltaRaf.current);
      messageDeltaRaf.current = null;
    }
    const flush = pendingDeltaFlushRef.current;
    pendingDeltaFlushRef.current = null;
    deltaFlushScheduled.current = false;
    if (flush) {
      flush();
    }
  }, []);

  const clearStepMaps = useCallback(() => {
    if (summarizeDeltaRaf.current != null) {
      cancelAnimationFrame(summarizeDeltaRaf.current);
      summarizeDeltaRaf.current = null;
    }
    cancelPendingDeltaFlush();
    toolCallIdMap.current.clear();
    messageMap.current.clear();
    stepMap.current.clear();
    pendingDeltaBuffer.current.clear();
    subagentRunToInvocationKey.current.clear();
    claimedSubagentInvocationKeys.current.clear();
    pendingSubagentBuffer.current.clear();
    closeParentSubagentStreams();
    /** Unlike subagent atoms below, sandbox-starting flags are transient
     *  status with no audit value; reset them at this boundary so an
     *  interrupted cold boot can't leak a stale "starting" label onto a
     *  later tool call that reuses the same id (e.g. `call_0`). */
    resetSandboxAtoms();
    /** Intentionally NOT calling `resetSubagentAtoms()` here: users need
     *  to be able to reopen the SubagentCall dialog after completion to
     *  audit what the child did. `resetSubagentAtoms` is returned below
     *  so callers can wipe atoms on conversation-switch (see
     *  `useEventHandlers`); that's the correct cleanup boundary:
     *  persisted `subagent_content` takes over for historical messages
     *  once the conversation is saved, and we prevent unbounded
     *  atomFamily growth across multi-conversation sessions. */
  }, [cancelPendingDeltaFlush, closeParentSubagentStreams, resetSandboxAtoms]);

  /**
   * Sync a message into the step handler's messageMap.
   * Call this after receiving sync event to ensure subsequent deltas
   * build on the synced content, not stale content.
   */
  const syncStepMessage = useCallback(
    (message: TMessage) => {
      if (!message?.messageId) return;
      messageMap.current.set(message.messageId, { ...message });
      const ready = [...pendingSubagentBuffer.current.entries()].filter(
        ([, pending]) => pending.parentMessageId === message.messageId,
      );
      for (const [subagentRunId, pending] of ready) {
        pendingSubagentBuffer.current.delete(subagentRunId);
        for (const event of pending.events) {
          applySubagentUpdate(event, message.messageId);
        }
      }
    },
    [applySubagentUpdate],
  );

  return {
    stepHandler,
    clearStepMaps,
    resetSubagentAtoms,
    resetPtcAtoms,
    prunePtcTraces,
    syncStepMessage,
    cancelPendingDeltaFlush,
    flushPendingDeltas,
  };
}
