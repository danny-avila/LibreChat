import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Constants } from 'librechat-data-provider';
import type { Agents } from 'librechat-data-provider';
import {
  useSubmitToolApprovalMutation,
  useSubmitAskAnswerMutation,
  type ResumeAgentFields,
} from '~/data-provider';
import { useChatContext } from '~/Providers/ChatContext';
import { useGetEphemeralAgent } from '~/store/agents';

/** Per-action submission lifecycle, surfaced to the cards so they can disable
 *  controls and explain a terminal outcome. */
type ActionStatus = 'idle' | 'submitting' | 'submitted' | 'expired' | 'error';

interface ApprovalContextValue {
  /** Record (or clear) a card's decision for its tool_call within an action. */
  setDecision: (
    actionId: string,
    toolCallId: string,
    decision: Agents.ToolApprovalResolution | null,
  ) => void;
  /** Current decision a card holds, if any (drives selected-state styling). */
  getDecision: (actionId: string, toolCallId: string) => Agents.ToolApprovalResolution | undefined;
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
  /** Fire the batched tool-approval resume for an action. */
  submitToolApproval: (actionId: string) => void;
  /** Fire the ask-user-question resume. */
  submitAskAnswer: (actionId: string, answer: string) => void;
  /** Lifecycle status for an action (so cards can disable / show messages). */
  getStatus: (actionId: string) => ActionStatus;
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
  registerToolCall: () => undefined,
  unregisterToolCall: () => undefined,
  getLeadToolCallId: () => undefined,
  getRegisteredCount: () => 0,
  isReady: () => false,
  submitToolApproval: () => undefined,
  submitAskAnswer: () => undefined,
  getStatus: () => 'idle',
};

const isExpiredError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
  return status === 409;
};

/**
 * Coordinates human-in-the-loop decisions for a single response message.
 *
 * An action may pause multiple tool calls (same `actionId`); each `ToolCall`
 * card registers its `tool_call_id` and records a decision here, and the
 * provider submits ONCE with the full `decisions[]` covering every paused call
 * (the server rejects a partial batch). Agent/endpoint fields for the resume
 * body are sourced from the active conversation exactly like a normal chat
 * message, so the route's shared middleware reconstructs the same agent.
 */
export default function ApprovalProvider({ children }: { children: React.ReactNode }) {
  const { conversation } = useChatContext();
  const getEphemeralAgent = useGetEphemeralAgent();
  const approvalMutation = useSubmitToolApprovalMutation();
  const askMutation = useSubmitAskAnswerMutation();

  /** actionId → (tool_call_id → resolution). Mutable ref + a version bump so
   *  reads are synchronous for `isReady`/submit while renders stay cheap. */
  const decisionsRef = useRef(new Map<string, Map<string, Agents.ToolApprovalResolution>>());
  const registeredRef = useRef(new Map<string, Set<string>>());
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((v) => v + 1), []);
  const [statusByAction, setStatusByAction] = useState<Record<string, ActionStatus>>({});

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
      ephemeralAgent: getEphemeralAgent(conversationId),
    };
  }, [conversation, getEphemeralAgent]);

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

  const submitToolApproval = useCallback(
    (actionId: string) => {
      const fields = buildResumeFields();
      const decided = decisionsRef.current.get(actionId);
      if (!fields || !decided || !isReady(actionId)) {
        return;
      }
      setStatusByAction((prev) => ({ ...prev, [actionId]: 'submitting' }));
      approvalMutation.mutate(
        { ...fields, actionId, decisions: Array.from(decided.values()) },
        {
          onSuccess: () => setStatusByAction((prev) => ({ ...prev, [actionId]: 'submitted' })),
          onError: (error) =>
            setStatusByAction((prev) => ({
              ...prev,
              [actionId]: isExpiredError(error) ? 'expired' : 'error',
            })),
        },
      );
    },
    [approvalMutation, buildResumeFields, isReady],
  );

  const submitAskAnswer = useCallback(
    (actionId: string, answer: string) => {
      const fields = buildResumeFields();
      if (!fields || answer.length === 0) {
        return;
      }
      setStatusByAction((prev) => ({ ...prev, [actionId]: 'submitting' }));
      askMutation.mutate(
        { ...fields, actionId, answer },
        {
          onSuccess: () => setStatusByAction((prev) => ({ ...prev, [actionId]: 'submitted' })),
          onError: (error) =>
            setStatusByAction((prev) => ({
              ...prev,
              [actionId]: isExpiredError(error) ? 'expired' : 'error',
            })),
        },
      );
    },
    [askMutation, buildResumeFields],
  );

  const value = useMemo<ApprovalContextValue>(
    () => ({
      setDecision,
      getDecision,
      registerToolCall,
      unregisterToolCall,
      getLeadToolCallId,
      getRegisteredCount,
      isReady,
      submitToolApproval,
      submitAskAnswer,
      getStatus,
    }),
    [
      setDecision,
      getDecision,
      registerToolCall,
      unregisterToolCall,
      getLeadToolCallId,
      getRegisteredCount,
      isReady,
      submitToolApproval,
      submitAskAnswer,
      getStatus,
    ],
  );

  return <ApprovalContext.Provider value={value}>{children}</ApprovalContext.Provider>;
}
