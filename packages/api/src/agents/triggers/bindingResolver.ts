import { Constants } from 'librechat-data-provider';
import type { ConversationMethods, IMessage, MessageMethods } from '@librechat/data-schemas';
import type { AgentTriggerDispatchContext } from './dispatch';
import type { AgentContinueTriggerEnvelope } from './envelope';
import type { AgentTriggerContinuePreparation, AgentTriggerExecutionHostDeps } from './host';
import { AgentTriggerExecutionError } from './host';

type ContinueResolver = NonNullable<AgentTriggerExecutionHostDeps['prepareContinue']>;

export interface AgentEventContinueResolverDeps {
  methods: Pick<ConversationMethods, 'getAgentEventBinding'> & Pick<MessageMethods, 'getMessages'>;
  fallback?: ContinueResolver;
  enabled?: () => boolean;
}

function timestamp(message: IMessage): number {
  const value = message.createdAt;
  return value instanceof Date ? value.getTime() : new Date(value ?? 0).getTime();
}

function latestAssistant(messages: IMessage[]): string {
  const assistants = messages
    .filter((message) => message.isCreatedByUser === false)
    .sort((left, right) => {
      const time = timestamp(left) - timestamp(right);
      return time === 0 ? left.messageId.localeCompare(right.messageId) : time;
    });
  return assistants[assistants.length - 1]?.messageId ?? Constants.NO_PARENT;
}

function invalidBinding(message: string, retryable = false): AgentTriggerExecutionError {
  return new AgentTriggerExecutionError(message, {
    mode: 'continue',
    certainty: 'definite',
    retryable,
    code: 'EVENT_BINDING_INVALID',
    status: retryable ? 503 : 404,
  });
}

/** Resolves the branch leaf at dispatch time so queued events never persist a stale parent. */
export function createAgentEventContinueResolver({
  methods,
  fallback,
  enabled,
}: AgentEventContinueResolverDeps): ContinueResolver {
  return async (
    envelope: AgentContinueTriggerEnvelope,
    context: AgentTriggerDispatchContext,
  ): Promise<AgentTriggerContinuePreparation | undefined> => {
    const { bindingId, sourceKeyId } = envelope.target;
    if (bindingId == null || sourceKeyId == null) {
      return fallback?.(envelope, context);
    }
    if (enabled?.() !== true) {
      throw new AgentTriggerExecutionError(
        'Event-driven child turns are disabled on this worker.',
        {
          mode: 'continue',
          certainty: 'definite',
          retryable: true,
          deferWithoutAttempt: true,
          code: 'EVENT_BINDING_DISABLED',
          status: 503,
        },
      );
    }

    let binding;
    let messages;
    try {
      binding = await methods.getAgentEventBinding({
        user: envelope.principal.userId,
        bindingId,
        sourceKeyId,
        ...(envelope.principal.tenantId == null ? {} : { tenantId: envelope.principal.tenantId }),
      });
    } catch (error) {
      throw invalidBinding(
        `Event binding state is temporarily unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
        true,
      );
    }
    if (
      binding == null ||
      binding.conversationId !== envelope.target.conversationId ||
      binding.agentId !== envelope.target.agentId ||
      binding.binding.bindingId !== bindingId ||
      binding.binding.sourceKeyId !== sourceKeyId
    ) {
      throw invalidBinding('The event binding no longer authorizes this child thread.');
    }
    try {
      messages = await methods.getMessages({
        user: envelope.principal.userId,
        conversationId: binding.conversationId,
      });
    } catch (error) {
      throw invalidBinding(
        `Event actor history is temporarily unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
        true,
      );
    }
    return {
      status: 'ready',
      input: envelope.input,
      parentMessageId: latestAssistant(messages),
    };
  };
}
