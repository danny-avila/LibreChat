import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { atom, useRecoilState } from 'recoil';
import { Constants } from 'librechat-data-provider';
import type { Agents } from 'librechat-data-provider';
import {
  useSubmitToolApprovalMutation,
  useSubmitAskAnswerMutation,
  type ResumeAgentFields,
} from '~/data-provider';
import { resolveAskUserQuestionPart } from '~/utils/approval';
import { ChatContext } from '~/Providers/ChatContext';
import { useGetEphemeralAgent } from '~/store/agents';

/** Per-action submission lifecycle, surfaced to the cards so they can disable
 *  controls and explain a terminal outcome. */
type ActionStatus = 'idle' | 'submitting' | 'submitted' | 'expired' | 'error';

/**
 * Ask-answer submit status keyed by `actionId`. This lives in Recoil, NOT the
 * {@link ApprovalContext} React state, because the PRIMARY answer surface is
 * the composer in `ChatForm` — which renders OUTSIDE `ApprovalProvider` (that
 * only wraps message content). A React context read there degrades to the
 * inert {@link FALLBACK}, so an in-flight lock / expired status tracked in the
 * context would never engage for the composer. A global atom is visible to
 * both the composer (`useAskAnswerMode`) and the message-content card
 * (`AskUserQuestion`), so a fast double-submit is actually blocked and a
 * terminal (expired/error) state surfaces on either surface.
 */
const askSubmitStatusAtom = atom<Record<string, ActionStatus>>({
  key: 'askAnswerSubmitStatus',
  default: {},
});

/** Shared read/write for the ask-answer submit status. */
export function useAskSubmitStatus(): {
  getAskStatus: (actionId: string) => ActionStatus;
  setAskStatus: (actionId: string, status: ActionStatus) => void;
} {
  const [statusMap, setStatusMap] = useRecoilState(askSubmitStatusAtom);
  const getAskStatus = useCallback(
    (actionId: string): ActionStatus => statusMap[actionId] ?? 'idle',
    [statusMap],
  );
  const setAskStatus = useCallback(
    (actionId: string, status: ActionStatus) =>
      setStatusMap((prev) => ({ ...prev, [actionId]: status })),
    [setStatusMap],
  );
  return { getAskStatus, setAskStatus };
}

interface ApprovalContextValue {
  /** Record (or clear) a card's decision for its tool_call within an action. */
  setDecision: (
    actionId: string,
    toolCallId: string,
    decision: Agents.ToolApprovalResolution | null,
  ) => void;
  /** Current decision a card holds, if any (drives selected-state styling). */
  getDecision: (actionId: string, toolCallId: string) => Agents.ToolApprovalResolution | undefined;
  /** Every recorded decision for an action, in registration order (the submit batch). */
  getDecisions: (actionId: string) => Agents.ToolApprovalResolution[];
  /** Declare that a tool_call belongs to an action so submit can require all. */
  registerToolCall: (actionId: string, toolCallId: string) => void;
  /** Drop a tool_call's registration when its card unmounts, so a resolved/removed
   *  card can't keep `isReady` false and wedge the batch submit. */
  unregisterToolCall: (actionId: string, toolCallId: string) => void;
  /** The first-registered tool_call for an action — the single card that owns
   *  the batch submit button (avoids N buttons across sibling cards). */
  getLeadToolCallId: (actionId: string) => string | undefined;
  /** Number of tool calls paused under an action (for a "1 of N" label). */
  getRegisteredCount: (actionId: string) => number;
  /** True once every registered tool_call in the action has a decision. */
  isReady: (actionId: string) => boolean;
  /** Lifecycle status for an action (so cards can disable / show messages). */
  getStatus: (actionId: string) => ActionStatus;
  /** Set an action's submission status (driven by the cards' submit via `useResumeSubmit`). */
  setStatus: (actionId: string, status: ActionStatus) => void;
}

const ApprovalContext = createContext<ApprovalContextValue | null>(null);

/** Cards call this; outside a provider it degrades to inert no-ops so a tool
 *  call without an active approval never crashes. */
export const useApprovalContext = (): ApprovalContextValue => {
  const ctx = useContext(ApprovalContext);
  return ctx ?? FALLBACK;
};

const FALLBACK: ApprovalContextValue = {
  setDecision: () => undefined,
  getDecision: () => undefined,
  getDecisions: () => [],
  registerToolCall: () => undefined,
  unregisterToolCall: () => undefined,
  getLeadToolCallId: () => undefined,
  getRegisteredCount: () => 0,
  isReady: () => false,
  getStatus: () => 'idle',
  setStatus: () => undefined,
};

const isExpiredError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
  return status === 409;
};

/**
 * Coordinates human-in-the-loop decisions for a single response message.
 *
 * An action may pause multiple tool calls (same `actionId`); each `ToolApproval`
 * card registers its `tool_call_id` and records a decision here, and the lead card
 * submits ONCE with the full `decisions[]` covering every paused call (the server
 * rejects a partial batch).
 *
 * Intentionally PURE state — it does NOT read `ChatContext`, the agent store, or
 * React Query. Message content renders in places without those providers (shared /
 * exported views, tests), so the provider must be safe to mount anywhere. The
 * context-dependent submit lives in {@link useResumeSubmit}, which the cards call —
 * and the cards only render inside a live chat view where those providers exist.
 */
export default function ApprovalProvider({ children }: { children: React.ReactNode }) {
  /** actionId → (tool_call_id → resolution). Mutable ref + a version bump so
   *  reads are synchronous for `isReady`/submit while renders stay cheap. */
  const decisionsRef = useRef(new Map<string, Map<string, Agents.ToolApprovalResolution>>());
  const registeredRef = useRef(new Map<string, Set<string>>());
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((v) => v + 1), []);
  const [statusByAction, setStatusByAction] = useState<Record<string, ActionStatus>>({});

  const registerToolCall = useCallback(
    (actionId: string, toolCallId: string) => {
      const set = registeredRef.current.get(actionId) ?? new Set<string>();
      if (set.has(toolCallId)) {
        return;
      }
      set.add(toolCallId);
      registeredRef.current.set(actionId, set);
      /** A newly-registered call shifts the lead / "of N" count for sibling
       *  cards — re-render so they reflect it. */
      rerender();
    },
    [rerender],
  );

  const unregisterToolCall = useCallback(
    (actionId: string, toolCallId: string) => {
      const set = registeredRef.current.get(actionId);
      if (!set || !set.has(toolCallId)) {
        return;
      }
      set.delete(toolCallId);
      // Also drop any decision it held so a stale entry can't linger.
      decisionsRef.current.get(actionId)?.delete(toolCallId);
      if (set.size === 0) {
        registeredRef.current.delete(actionId);
        decisionsRef.current.delete(actionId);
      }
      rerender();
    },
    [rerender],
  );

  const getLeadToolCallId = useCallback(
    (actionId: string) => registeredRef.current.get(actionId)?.values().next().value,
    [],
  );

  const getRegisteredCount = useCallback(
    (actionId: string) => registeredRef.current.get(actionId)?.size ?? 0,
    [],
  );

  const setDecision = useCallback(
    (actionId: string, toolCallId: string, decision: Agents.ToolApprovalResolution | null) => {
      const map = decisionsRef.current.get(actionId) ?? new Map();
      if (decision == null) {
        map.delete(toolCallId);
      } else {
        map.set(toolCallId, decision);
      }
      decisionsRef.current.set(actionId, map);
      rerender();
    },
    [rerender],
  );

  const getDecision = useCallback(
    (actionId: string, toolCallId: string) => decisionsRef.current.get(actionId)?.get(toolCallId),
    [],
  );

  const getDecisions = useCallback(
    (actionId: string) => Array.from(decisionsRef.current.get(actionId)?.values() ?? []),
    [],
  );

  const isReady = useCallback((actionId: string) => {
    const registered = registeredRef.current.get(actionId);
    const decided = decisionsRef.current.get(actionId);
    if (!registered || registered.size === 0) {
      return false;
    }
    for (const toolCallId of registered) {
      if (!decided?.has(toolCallId)) {
        return false;
      }
    }
    return true;
  }, []);

  const getStatus = useCallback(
    (actionId: string): ActionStatus => statusByAction[actionId] ?? 'idle',
    [statusByAction],
  );

  const setStatus = useCallback((actionId: string, status: ActionStatus) => {
    setStatusByAction((prev) => ({ ...prev, [actionId]: status }));
  }, []);

  const value = useMemo<ApprovalContextValue>(
    () => ({
      setDecision,
      getDecision,
      getDecisions,
      registerToolCall,
      unregisterToolCall,
      getLeadToolCallId,
      getRegisteredCount,
      isReady,
      getStatus,
      setStatus,
    }),
    [
      setDecision,
      getDecision,
      getDecisions,
      registerToolCall,
      unregisterToolCall,
      getLeadToolCallId,
      getRegisteredCount,
      isReady,
      getStatus,
      setStatus,
    ],
  );

  return <ApprovalContext.Provider value={value}>{children}</ApprovalContext.Provider>;
}

/**
 * Submit hook for the approval cards. Sources the resume body's agent/endpoint
 * fields from the active conversation (so the route's shared `buildEndpointOption`
 * middleware reconstructs the same agent) and fires the resume mutation, threading
 * the result back into the action's status.
 *
 * Reads `ChatContext` / the agent store / React Query. The cards render it from
 * live chat views but ALSO from contexts without a `ChatContext.Provider` (e.g. a
 * subagent tool paused inside a portaled dialog, or a search/citation render that
 * passes chat context as a prop), so it reads the context non-throwingly: with no
 * conversation, `buildResumeFields` returns null and the controls are inert rather
 * than crashing.
 */
export function useResumeSubmit() {
  const chatContext = useContext(ChatContext);
  const conversation = chatContext?.conversation;
  const getEphemeralAgent = useGetEphemeralAgent();
  const approvalMutation = useSubmitToolApprovalMutation();
  const askMutation = useSubmitAskAnswerMutation();
  const { getDecisions, isReady, setStatus } = useApprovalContext();
  /** Ask status lives in Recoil so it works from the composer (outside the
   *  provider); tool-approval status stays on the context. */
  const { setAskStatus } = useAskSubmitStatus();

  const buildResumeFields = useCallback((): ResumeAgentFields | null => {
    const conversationId = conversation?.conversationId;
    if (!conversationId || conversationId === Constants.NEW_CONVO) {
      return null;
    }
    return {
      conversationId,
      endpoint: conversation?.endpoint,
      endpointType: conversation?.endpointType,
      agent_id: conversation?.agent_id,
      model: conversation?.model,
      spec: conversation?.spec,
      // Ephemeral agents derive their instructions from promptPrefix — re-send it so
      // the resumed run rebuilds the same graph and matches the server fingerprint.
      promptPrefix: conversation?.promptPrefix,
      ephemeralAgent: getEphemeralAgent(conversationId),
    };
  }, [conversation, getEphemeralAgent]);

  const submitToolApproval = useCallback(
    (actionId: string) => {
      const fields = buildResumeFields();
      const decisions = getDecisions(actionId);
      if (!fields || decisions.length === 0 || !isReady(actionId)) {
        return;
      }
      setStatus(actionId, 'submitting');
      approvalMutation.mutate(
        { ...fields, actionId, decisions },
        {
          onSuccess: () => setStatus(actionId, 'submitted'),
          onError: (error) => setStatus(actionId, isExpiredError(error) ? 'expired' : 'error'),
        },
      );
    },
    [approvalMutation, buildResumeFields, getDecisions, isReady, setStatus],
  );

  const submitAskAnswer = useCallback(
    (actionId: string, answer: string, opts?: { onSuccess?: () => void }) => {
      const fields = buildResumeFields();
      if (!fields || answer.length === 0) {
        return;
      }
      setAskStatus(actionId, 'submitting');
      askMutation.mutate(
        { ...fields, actionId, answer },
        {
          onSuccess: () => {
            setAskStatus(actionId, 'submitted');
            /**
             * Drop the synthetic question part now that the run is resuming: the
             * server streams the resumed segment at ABSOLUTE content indices
             * continuing after the pre-pause parts — the exact slot this appended
             * part occupies. Left in place it blocks that index and the resumed
             * output doesn't render until finalize. The Q&A's durable record is
             * the ask_user_question tool call itself.
             */
            const messages = chatContext?.getMessages?.();
            if (messages && chatContext?.setMessages) {
              let changed = false;
              const next = messages.map((message) => {
                const resolved = resolveAskUserQuestionPart(message, actionId, answer);
                if (resolved !== message) {
                  changed = true;
                }
                return resolved;
              });
              if (changed) {
                chatContext.setMessages(next);
              }
            }
            /**
             * Caller cleanup (clearing the composer / selection) runs ONLY on
             * success: the composer is the user's sole copy of a free-form
             * answer, so a failed resume (400 on the answer cap, expiry, a
             * network error) must leave it intact for the user to trim/retry.
             */
            opts?.onSuccess?.();
          },
          onError: (error) => setAskStatus(actionId, isExpiredError(error) ? 'expired' : 'error'),
        },
      );
    },
    [askMutation, buildResumeFields, setAskStatus, chatContext],
  );

  return { submitToolApproval, submitAskAnswer };
}
