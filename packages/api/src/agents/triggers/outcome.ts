import type { ConversationMethods, MessageMethods } from '@librechat/data-schemas';
import type { Agents } from 'librechat-data-provider';
import type { AgentTriggerExpectedAction } from './envelope';
import type { SerializableJobData } from '~/stream';

interface SettleAgentTriggerHandlingOutcomeInput {
  deliveryKey: string;
  conversationId: string;
  generationCreatedAt: number;
  status: 'applied' | 'completed_no_action' | 'failed' | 'cancelled';
  settledAt: Date;
  error?: string;
  action?: { toolName: string; toolCallId?: string };
}

interface CompletedToolEvidence {
  toolName: string;
  toolCallId?: string;
  arguments?: unknown;
}

export interface AgentEventRunOutcome {
  status: 'applied' | 'completed_no_action' | 'failed' | 'cancelled';
  action?: { toolName: string; toolCallId?: string };
}

export type AgentEventAppliedAction = NonNullable<AgentEventRunOutcome['action']>;

const MAX_RECEIPT_ID_LENGTH = 256;

function isBackgroundNonExecutionReceipt(value: unknown, argumentsValue: unknown): boolean {
  const parsedArguments = parseArguments(argumentsValue);
  if (
    parsedArguments == null ||
    typeof parsedArguments !== 'object' ||
    Array.isArray(parsedArguments) ||
    (parsedArguments as Record<string, unknown>).run_in_background !== true
  ) {
    return false;
  }
  const parsed = parseArguments(value);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }
  const receipt = parsed as Record<string, unknown>;
  return (
    (receipt.status === 'running' && typeof receipt.background_task_id === 'string') ||
    receipt.status === 'rejected'
  );
}

function toolEvidence(
  step: Agents.RunStep,
  nonExecutedToolCallIds: ReadonlySet<string>,
): CompletedToolEvidence[] {
  if (step.status === 'in_progress' || step.stepDetails?.type !== 'tool_calls') {
    return [];
  }
  return (step.stepDetails.tool_calls ?? []).flatMap((call) => {
    const executionStatus = (
      call as Agents.AgentToolCall & {
        executionStatus?: 'success' | 'error' | 'cancelled';
      }
    ).executionStatus;
    if (
      executionStatus === 'error' ||
      executionStatus === 'cancelled' ||
      (step.status !== 'completed' && executionStatus !== 'success')
    ) {
      return [];
    }
    if ('inputValidationError' in call && call.inputValidationError === true) {
      return [];
    }
    if (call.id != null && nonExecutedToolCallIds.has(call.id)) {
      return [];
    }
    if ('function' in call) {
      if (
        call.function.output == null ||
        isBackgroundNonExecutionReceipt(call.function.output, call.function.arguments)
      ) {
        return [];
      }
      return [
        {
          toolName: call.function.name,
          toolCallId: call.id,
          arguments: call.function.arguments,
        },
      ];
    }
    if (call.output == null || isBackgroundNonExecutionReceipt(call.output, call.args)) {
      return [];
    }
    return [
      {
        toolName: call.name,
        ...(call.id != null && { toolCallId: call.id }),
        arguments: call.args,
      },
    ];
  });
}

function nonExecutedHITLToolCallIds(
  job: Pick<SerializableJobData, 'userSubmittedMessageFieldPaths'>,
  content: Agents.MessageContentComplex[],
): Set<string> {
  const ids = new Set<string>();
  for (const provenance of job.userSubmittedMessageFieldPaths ?? []) {
    if (provenance.field !== 'decision_response' && provenance.field !== 'decision_reason') {
      continue;
    }
    const match = /^\/content\/(\d+)\/tool_call\/output$/.exec(provenance.path);
    const index = match == null ? Number.NaN : Number(match[1]);
    const part = Number.isSafeInteger(index) ? content[index] : undefined;
    if (part == null || typeof part !== 'object' || !('tool_call' in part)) {
      continue;
    }
    const toolCall = part.tool_call;
    if (toolCall?.id != null && toolCall.id.length > 0) {
      ids.add(toolCall.id);
    }
  }
  return ids;
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** Classifies terminal run evidence once for both checkpoint commit and public receipt. */
export function classifyAgentEventRunOutcome(
  job: SerializableJobData,
  runSteps: Agents.RunStep[],
  content: Agents.MessageContentComplex[] = [],
): AgentEventRunOutcome {
  const action = findAgentEventAppliedAction(job.agentEventExpectedAction, runSteps, content, job);
  if (action != null) {
    return { status: 'applied', action };
  }
  if (job.status === 'error') {
    return { status: 'failed' };
  }
  if (job.status === 'aborted') {
    return { status: 'cancelled' };
  }
  return { status: 'completed_no_action' };
}

/** Finds qualifying action evidence without requiring the generation to be terminal yet. */
export function findAgentEventAppliedAction(
  expectedAction: AgentTriggerExpectedAction | undefined,
  runSteps: Agents.RunStep[],
  content: Agents.MessageContentComplex[] = [],
  provenance: Pick<SerializableJobData, 'userSubmittedMessageFieldPaths'> = {},
): AgentEventAppliedAction | undefined {
  if (expectedAction == null) {
    return undefined;
  }
  const nonExecutedToolCallIds = nonExecutedHITLToolCallIds(provenance, content);
  const action = runSteps
    .flatMap((step) => toolEvidence(step, nonExecutedToolCallIds))
    .find((item) => matchesExpectedAction(item, expectedAction));
  return action == null
    ? undefined
    : {
        toolName: action.toolName.slice(0, MAX_RECEIPT_ID_LENGTH),
        ...(action.toolCallId == null
          ? {}
          : { toolCallId: action.toolCallId.slice(0, MAX_RECEIPT_ID_LENGTH) }),
      };
}

function containsSubset(value: unknown, subset: unknown): boolean {
  if (Array.isArray(subset)) {
    return (
      Array.isArray(value) &&
      value.length === subset.length &&
      subset.every((expected, index) => containsSubset(value[index], expected))
    );
  }
  if (subset == null || typeof subset !== 'object') {
    return Object.is(value, subset);
  }
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.entries(subset).every(([key, expected]) =>
    containsSubset((value as Record<string, unknown>)[key], expected),
  );
}

function matchesExpectedAction(
  evidence: CompletedToolEvidence,
  expected: AgentTriggerExpectedAction,
): boolean {
  const nameMatches =
    evidence.toolName === expected.toolName ||
    evidence.toolName.startsWith(`${expected.toolName}_mcp_`);
  return (
    nameMatches &&
    (expected.argumentSubset == null ||
      containsSubset(parseArguments(evidence.arguments), expected.argumentSubset))
  );
}

export function createAgentEventTerminalHandler(methods: {
  settleAgentTriggerHandlingOutcome: (
    input: SettleAgentTriggerHandlingOutcomeInput,
  ) => Promise<boolean>;
  getAgentEventActorSnapshot: ConversationMethods['getAgentEventActorSnapshot'];
  resolveAgentEventActorReconciliation: ConversationMethods['resolveAgentEventActorReconciliation'];
  getMessage: MessageMethods['getMessage'];
}): (
  streamId: string,
  job: SerializableJobData,
  runSteps: Agents.RunStep[],
  content?: Agents.MessageContentComplex[],
) => Promise<void> {
  return async (
    streamId: string,
    job: SerializableJobData,
    runSteps: Agents.RunStep[],
    content: Agents.MessageContentComplex[] = [],
  ) => {
    if (job.agentEventDeliveryKey == null) {
      return;
    }
    const conversationId = job.conversationId ?? streamId;
    const outcome = classifyAgentEventRunOutcome(job, runSteps, content);
    let committedAction: AgentEventAppliedAction | undefined;
    let compensated = false;
    const snapshot = await methods.getAgentEventActorSnapshot({
      user: job.userId,
      conversationId,
      ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
    });
    const lifecycle = snapshot?.reconciliations.find(
      (item) => item.invocationId === job.agentEventDeliveryKey,
    );
    if (lifecycle != null) {
      if (lifecycle.status === 'settled') {
        /** A compensated receipt still tombstones its invocation id, but its
         * external effect was explicitly undone — replaying it as applied
         * would tell the source the operation stands and suppress the
         * new-invocation retry that compensation requires. */
        if (lifecycle.resolution === 'action_compensated') {
          compensated = true;
        } else {
          committedAction = lifecycle.action;
        }
      } else if (lifecycle.status !== 'history_persisted') {
        throw new Error(
          `Agent event actor ${job.agentEventDeliveryKey} requires ${lifecycle.status} reconciliation`,
        );
      } else {
        const [userMessage, responseMessage] = await Promise.all([
          methods.getMessage({
            user: job.userId,
            messageId: `${job.agentEventDeliveryKey}:user`,
          }),
          methods.getMessage({
            user: job.userId,
            messageId: `${job.agentEventDeliveryKey}:assistant`,
          }),
        ]);
        if (
          userMessage?.conversationId !== conversationId ||
          userMessage.isCreatedByUser !== true ||
          responseMessage?.conversationId !== conversationId ||
          responseMessage.isCreatedByUser !== false ||
          responseMessage.parentMessageId !== userMessage.messageId
        ) {
          throw new Error(
            `Agent event actor ${job.agentEventDeliveryKey} has invalid durable message history`,
          );
        }
        /** The persistence lifecycle was created by the same CAS that advanced
         * the actor head, and history_persisted is written only after the
         * controller's post-commit message barrier. Resolving BEFORE settlement
         * makes the receipt's status CAS the serialization point against a
         * concurrent compensation: whichever transition wins determines the
         * public outcome, and a crash between this resolve and the settle
         * below converges through the retained receipt's replay. The receipt
         * keeps its full action proof either way, so nothing is lost if the
         * settle write never lands. */
        const resolved = await methods.resolveAgentEventActorReconciliation({
          user: job.userId,
          conversationId,
          ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
          invocationId: lifecycle.invocationId,
          checkpoint: lifecycle.checkpoint,
          resolution: 'checkpoint_verified',
        });
        if (resolved) {
          committedAction = lifecycle.action;
        } else {
          const reread = await methods.getAgentEventActorSnapshot({
            user: job.userId,
            conversationId,
            ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
          });
          const raced = reread?.reconciliations.find(
            (item) => item.invocationId === job.agentEventDeliveryKey,
          );
          if (raced?.status === 'settled' && raced.resolution === 'action_compensated') {
            compensated = true;
          } else {
            throw new Error(
              `Agent event actor ${job.agentEventDeliveryKey} settlement receipt was not retained`,
            );
          }
        }
      }
    }
    let settlementOutcome: AgentEventRunOutcome = outcome;
    if (compensated) {
      settlementOutcome = { status: 'failed' };
    } else if (committedAction != null) {
      settlementOutcome = { status: 'applied', action: committedAction };
    }
    const settledAt = new Date(job.completedAt ?? Date.now());
    const settled = await methods.settleAgentTriggerHandlingOutcome({
      deliveryKey: job.agentEventDeliveryKey,
      conversationId,
      generationCreatedAt: job.createdAt,
      status: settlementOutcome.status,
      settledAt,
      ...(settlementOutcome.status === 'failed' && {
        error: compensated
          ? 'Applied event actor action was explicitly compensated'
          : (job.error ?? 'Generation failed'),
      }),
      ...(settlementOutcome.action != null && { action: settlementOutcome.action }),
    });
    if (!settled) {
      throw new Error(`Failed to settle agent event delivery ${job.agentEventDeliveryKey}`);
    }
  };
}
