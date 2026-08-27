import type {
  AgentTriggerDeliveryMethods,
  ConversationMethods,
  MessageMethods,
} from '@librechat/data-schemas';
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

async function hasDurableAgentEventHistory(input: {
  getMessage: MessageMethods['getMessage'];
  user: string;
  conversationId: string;
  deliveryKey: string;
}): Promise<boolean> {
  const [userMessage, responseMessage] = await Promise.all([
    input.getMessage({ user: input.user, messageId: `${input.deliveryKey}:user` }),
    input.getMessage({ user: input.user, messageId: `${input.deliveryKey}:assistant` }),
  ]);
  return (
    userMessage?.conversationId === input.conversationId &&
    userMessage.isCreatedByUser === true &&
    responseMessage?.conversationId === input.conversationId &&
    responseMessage.isCreatedByUser === false &&
    responseMessage.parentMessageId === userMessage.messageId
  );
}

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

export interface AgentEventActionRecorder {
  observeToolEnd(data: {
    input?: unknown;
    backgroundDelivery?: boolean;
    outputFiltered?: boolean;
    output?: unknown;
  }): void;
  read(): AgentEventAppliedAction | undefined;
}

/**
 * Captures qualifying applied-action evidence at tool-execution time, in graph
 * context, instead of trusting the asynchronously populated run-step
 * collection to be observable the instant `sendMessage` resolves. The recorder
 * applies the SAME fences as run-step evidence — exact tool name (with the MCP
 * suffix form), the declared argument subset, an error-free result, and the
 * background non-execution receipt exclusion. HITL never reaches the fork path
 * and non-executed approvals never emit a tool end, so the non-execution id
 * set has no equivalent here. Only the first qualifying execution is retained;
 * run-step evidence remains the fallback for paths that bypass the tool-end
 * chain (e.g. programmatic tool calling).
 */
export function createAgentEventActionRecorder(
  expectedAction: AgentTriggerExpectedAction | undefined,
): AgentEventActionRecorder {
  let receipt: AgentEventAppliedAction | undefined;
  return {
    observeToolEnd(data) {
      if (expectedAction == null || receipt != null || data == null) {
        return;
      }
      /** A background-task delivery reports the ORIGINAL tool's name on a
       * later poll turn — evidence of work some earlier turn dispatched,
       * never proof that THIS invocation performed its action. */
      if (data.backgroundDelivery === true) {
        return;
      }
      /** Policy-withheld output is still proof of a successful foreground
       * execution — but with the content blank, a background launch handle
       * would be indistinguishable from a real result, so a call the model
       * detached can never qualify through this shape. */
      if (data.outputFiltered === true) {
        const parsedInput = parseArguments(data.input);
        if (
          parsedInput != null &&
          typeof parsedInput === 'object' &&
          !Array.isArray(parsedInput) &&
          (parsedInput as Record<string, unknown>).run_in_background === true
        ) {
          return;
        }
      }
      const output = data.output as
        | { name?: unknown; tool_call_id?: unknown; content?: unknown; status?: unknown }
        | null
        | undefined;
      if (
        output == null ||
        typeof output !== 'object' ||
        typeof output.name !== 'string' ||
        output.name.length === 0 ||
        output.content == null ||
        output.status === 'error'
      ) {
        return;
      }
      if (
        typeof output.content === 'string' &&
        isBackgroundNonExecutionReceipt(output.content, data.input)
      ) {
        return;
      }
      const toolCallId =
        typeof output.tool_call_id === 'string' && output.tool_call_id.length > 0
          ? output.tool_call_id
          : undefined;
      const evidence: CompletedToolEvidence = {
        toolName: output.name,
        ...(toolCallId == null ? {} : { toolCallId }),
        arguments: data.input,
      };
      if (!matchesExpectedAction(evidence, expectedAction)) {
        return;
      }
      receipt = {
        toolName: evidence.toolName.slice(0, MAX_RECEIPT_ID_LENGTH),
        ...(toolCallId == null ? {} : { toolCallId: toolCallId.slice(0, MAX_RECEIPT_ID_LENGTH) }),
      };
    },
    read: () => receipt,
  };
}

export function createAgentEventTerminalHandler(methods: {
  settleAgentTriggerHandlingOutcome: (
    input: SettleAgentTriggerHandlingOutcomeInput,
  ) => Promise<boolean>;
  getAgentEventActorSnapshot: ConversationMethods['getAgentEventActorSnapshot'];
  resolveAgentEventActorReconciliation: ConversationMethods['resolveAgentEventActorReconciliation'];
  clearAgentEventActorReconciliation: ConversationMethods['clearAgentEventActorReconciliation'];
  settleAgentEventActorReceipt: AgentTriggerDeliveryMethods['settleAgentEventActorReceipt'];
  getAgentEventActorReceipt: AgentTriggerDeliveryMethods['getAgentEventActorReceipt'];
  backfillAgentEventActorReceipt: AgentTriggerDeliveryMethods['backfillAgentEventActorReceipt'];
  completeAgentEventActorLegacyTurn: ConversationMethods['completeAgentEventActorLegacyTurn'];
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
    const settledAt = new Date(job.completedAt ?? Date.now());
    let committedAction: AgentEventAppliedAction | undefined;
    let compensated = false;
    let actorReceiptSettled = false;
    const snapshot = await methods.getAgentEventActorSnapshot({
      user: job.userId,
      conversationId,
      ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
    });
    const lifecycle = snapshot?.reconciliations.find(
      (item) => item.invocationId === job.agentEventDeliveryKey,
    );
    let durableReceipt =
      job.agentEventBindingId == null
        ? null
        : await methods.getAgentEventActorReceipt({
            deliveryKey: job.agentEventDeliveryKey,
            user: job.userId,
            ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
            bindingId: job.agentEventBindingId,
            conversationId,
          });
    if (durableReceipt != null) {
      actorReceiptSettled = true;
      /** Settlement owns public batch propagation and lane cleanup as well as
       * the private receipt. Replaying the exact settlement repairs a crash
       * after the atomic root write but before either idempotent side effect. */
      const finalized = await methods.settleAgentEventActorReceipt({
        deliveryKey: job.agentEventDeliveryKey,
        user: job.userId,
        ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
        bindingId: durableReceipt.bindingId,
        conversationId,
        generationCreatedAt: job.createdAt,
        status: durableReceipt.resolution === 'action_compensated' ? 'failed' : 'applied',
        settledAt: durableReceipt.settledAt,
        ...(durableReceipt.resolution === 'action_compensated' && {
          error: 'Applied event actor action was explicitly compensated',
        }),
        receipt: {
          resolution: durableReceipt.resolution,
          checkpoint: durableReceipt.checkpoint,
          action: durableReceipt.action,
        },
      });
      if (!finalized) {
        throw new Error(
          `Agent event actor ${job.agentEventDeliveryKey} terminal receipt could not be finalized`,
        );
      }
      if (durableReceipt.resolution === 'action_compensated') {
        compensated = true;
      } else {
        committedAction = durableReceipt.action;
      }
      if (lifecycle != null) {
        const cleared = await methods.clearAgentEventActorReconciliation({
          user: job.userId,
          conversationId,
          ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
          invocationId: job.agentEventDeliveryKey,
          checkpoint: durableReceipt.checkpoint,
          resolution: durableReceipt.resolution,
        });
        if (!cleared) {
          throw new Error(
            `Agent event actor ${job.agentEventDeliveryKey} terminal marker could not be cleared`,
          );
        }
      }
    } else if (lifecycle != null) {
      if (lifecycle.status === 'settled') {
        /** Compatibility for receipts written by the pre-delivery-ledger build:
         * copy the exact terminal proof only when the already-public handling
         * outcome agrees, then remove the embedded representation. */
        if (job.agentEventBindingId != null && lifecycle.resolution != null) {
          const legacyCompensated = lifecycle.resolution === 'action_compensated';
          /** A pre-ledger owner can settle the embedded lifecycle and crash
           * before publishing the matching delivery outcome. Terminalize that
           * exact started generation first; replay is idempotent when an older
           * owner already completed the public write. The resulting terminal
           * handling is then the delivery-side proof required by migration. */
          const legacyStatus = legacyCompensated ? 'failed' : 'applied';
          const legacyError = legacyCompensated
            ? 'Applied event actor action was explicitly compensated'
            : undefined;
          const terminalized = await methods.settleAgentTriggerHandlingOutcome({
            deliveryKey: job.agentEventDeliveryKey,
            conversationId,
            generationCreatedAt: job.createdAt,
            status: legacyStatus,
            settledAt: lifecycle.observedAt,
            ...(legacyError == null ? {} : { error: legacyError }),
            ...(!legacyCompensated && { action: lifecycle.action }),
          });
          if (!terminalized) {
            throw new Error(
              `Agent event actor ${job.agentEventDeliveryKey} legacy public outcome could not be recovered`,
            );
          }
          const migrated = await methods.backfillAgentEventActorReceipt({
            deliveryKey: job.agentEventDeliveryKey,
            user: job.userId,
            ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
            bindingId: job.agentEventBindingId,
            conversationId,
            generationCreatedAt: job.createdAt,
            status: legacyStatus,
            settledAt: lifecycle.observedAt,
            ...(legacyError == null ? {} : { error: legacyError }),
            receipt: {
              resolution: lifecycle.resolution,
              checkpoint: lifecycle.checkpoint,
              action: lifecycle.action,
            },
          });
          if (!migrated) {
            throw new Error(
              `Agent event actor ${job.agentEventDeliveryKey} legacy receipt could not be migrated`,
            );
          }
          const cleared = await methods.clearAgentEventActorReconciliation({
            user: job.userId,
            conversationId,
            ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
            invocationId: job.agentEventDeliveryKey,
            checkpoint: lifecycle.checkpoint,
            resolution: lifecycle.resolution,
          });
          if (!cleared) {
            throw new Error(
              `Agent event actor ${job.agentEventDeliveryKey} migrated marker could not be cleared`,
            );
          }
          actorReceiptSettled = true;
        }
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
      } else if (job.agentEventBindingId != null) {
        const historyIsDurable = await hasDurableAgentEventHistory({
          getMessage: methods.getMessage,
          user: job.userId,
          conversationId,
          deliveryKey: job.agentEventDeliveryKey,
        });
        if (!historyIsDurable) {
          throw new Error(
            `Agent event actor ${job.agentEventDeliveryKey} has invalid durable message history`,
          );
        }
        const stored = await methods.settleAgentEventActorReceipt({
          deliveryKey: job.agentEventDeliveryKey,
          user: job.userId,
          ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
          bindingId: job.agentEventBindingId,
          conversationId,
          generationCreatedAt: job.createdAt,
          status: 'applied',
          settledAt,
          ...(lifecycle.actionAdmitted === true && { requiresActionAdmission: true }),
          receipt: {
            resolution: 'checkpoint_verified',
            checkpoint: lifecycle.checkpoint,
            action: lifecycle.action,
          },
        });
        if (!stored) {
          durableReceipt = await methods.getAgentEventActorReceipt({
            deliveryKey: job.agentEventDeliveryKey,
            user: job.userId,
            ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
            bindingId: job.agentEventBindingId,
            conversationId,
          });
          if (durableReceipt == null) {
            throw new Error(
              `Agent event actor ${job.agentEventDeliveryKey} terminal receipt was not retained`,
            );
          }
        }
        durableReceipt ??= {
          bindingId: job.agentEventBindingId,
          resolution: 'checkpoint_verified',
          checkpoint: lifecycle.checkpoint,
          action: lifecycle.action,
          settledAt,
        };
        actorReceiptSettled = true;
        if (durableReceipt.resolution === 'action_compensated') {
          compensated = true;
        } else {
          committedAction = durableReceipt.action;
        }
        const cleared = await methods.clearAgentEventActorReconciliation({
          user: job.userId,
          conversationId,
          ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
          invocationId: job.agentEventDeliveryKey,
          checkpoint: durableReceipt.checkpoint,
          resolution: durableReceipt.resolution,
        });
        if (!cleared) {
          throw new Error(
            `Agent event actor ${job.agentEventDeliveryKey} terminal marker could not be cleared`,
          );
        }
      } else {
        /** A generation created before binding identity was added must finish
         * through the old receipt path; inventing binding scope here would be
         * less safe than retaining the already-deployed mixed-version logic. */
        const historyIsDurable = await hasDurableAgentEventHistory({
          getMessage: methods.getMessage,
          user: job.userId,
          conversationId,
          deliveryKey: job.agentEventDeliveryKey,
        });
        if (!historyIsDurable) {
          throw new Error(
            `Agent event actor ${job.agentEventDeliveryKey} has invalid durable message history`,
          );
        }
        const resolved = await methods.resolveAgentEventActorReconciliation({
          user: job.userId,
          conversationId,
          ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
          invocationId: lifecycle.invocationId,
          checkpoint: lifecycle.checkpoint,
          resolution: 'checkpoint_verified',
        });
        if (!resolved) {
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
        } else {
          committedAction = lifecycle.action;
        }
      }
    }
    let settlementOutcome: AgentEventRunOutcome = outcome;
    if (compensated) {
      settlementOutcome = { status: 'failed' };
    } else if (committedAction != null) {
      settlementOutcome = { status: 'applied', action: committedAction };
    }
    if (job.agentEventLegacyTurnToken != null && snapshot?.legacyTurn != null) {
      if (snapshot.legacyTurn.token !== job.agentEventLegacyTurnToken) {
        throw new Error(
          `Legacy event actor turn ${job.agentEventLegacyTurnToken} lost token ownership`,
        );
      }
      const historyIsDurable = await hasDurableAgentEventHistory({
        getMessage: methods.getMessage,
        user: job.userId,
        conversationId,
        deliveryKey: job.agentEventDeliveryKey,
      });
      if (!historyIsDurable) {
        throw new Error(
          `Legacy event actor ${job.agentEventDeliveryKey} has invalid durable message history`,
        );
      }
      const sealed = await methods.completeAgentEventActorLegacyTurn({
        user: job.userId,
        conversationId,
        ...(job.tenantId == null ? {} : { tenantId: job.tenantId }),
        token: job.agentEventLegacyTurnToken,
      });
      if (!sealed) {
        throw new Error(`Failed to seal legacy event actor turn ${job.agentEventLegacyTurnToken}`);
      }
    }
    if (actorReceiptSettled) {
      return;
    }
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
