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

const MAX_RECEIPT_ID_LENGTH = 256;

function toolEvidence(step: Agents.RunStep): CompletedToolEvidence[] {
  if (step.status !== 'completed' || step.stepDetails.type !== 'tool_calls') {
    return [];
  }
  return (step.stepDetails.tool_calls ?? []).flatMap((call) => {
    if ('function' in call) {
      if (call.function.output == null) {
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
    if (call.output == null || call.inputValidationError === true) {
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

function containsSubset(value: unknown, subset: unknown): boolean {
  if (subset == null || typeof subset !== 'object' || Array.isArray(subset)) {
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
}) {
  return async (streamId: string, job: SerializableJobData, runSteps: Agents.RunStep[]) => {
    if (job.agentEventDeliveryKey == null) {
      return;
    }
    const evidence = runSteps.flatMap(toolEvidence);
    const action =
      job.agentEventExpectedAction == null
        ? undefined
        : evidence.find((item) => matchesExpectedAction(item, job.agentEventExpectedAction!));
    const settledAt = new Date(job.completedAt ?? Date.now());
    const status =
      action != null
        ? 'applied'
        : job.status === 'error'
          ? 'failed'
          : job.status === 'aborted'
            ? 'cancelled'
            : 'completed_no_action';
    const settled = await methods.settleAgentTriggerHandlingOutcome({
      deliveryKey: job.agentEventDeliveryKey,
      conversationId: job.conversationId ?? streamId,
      generationCreatedAt: job.createdAt,
      status,
      settledAt,
      ...(status === 'failed' && { error: job.error ?? 'Generation failed' }),
      ...(action != null && {
        action: {
          toolName: action.toolName.slice(0, MAX_RECEIPT_ID_LENGTH),
          ...(action.toolCallId != null && {
            toolCallId: action.toolCallId.slice(0, MAX_RECEIPT_ID_LENGTH),
          }),
        },
      }),
    });
    if (!settled) {
      throw new Error(`Failed to settle agent event delivery ${job.agentEventDeliveryKey}`);
    }
  };
}
