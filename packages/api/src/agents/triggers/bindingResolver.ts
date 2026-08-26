import { Constants } from 'librechat-data-provider';
import type { ConversationMethods, MessageMethods } from '@librechat/data-schemas';
import type { AgentTriggerContinuePreparation, AgentTriggerExecutionHostDeps } from './host';
import type { AgentContinueTriggerEnvelope } from './envelope';
import type { AgentTriggerDispatchContext } from './dispatch';
import { isAgentEventRetentionActive } from '../eventRetention';
import { AgentTriggerExecutionError } from './host';

type ContinueResolver = NonNullable<AgentTriggerExecutionHostDeps['prepareContinue']>;

export interface AgentEventContinueResolverDeps {
  methods: Pick<ConversationMethods, 'getAgentEventBinding' | 'getConvo'> &
    Pick<MessageMethods, 'getMessages'>;
  getGenerationJob?: (conversationId: string) => Promise<
    | {
        status?: string;
        metadata?: { terminalPersistencePending?: boolean };
      }
    | null
    | undefined
  >;
  fallback?: ContinueResolver;
  enabled?: () => boolean;
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
  getGenerationJob,
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
    let latestAssistant;
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
      binding.binding.sourceKeyId !== sourceKeyId ||
      !isAgentEventRetentionActive(binding.expiredAt)
    ) {
      throw invalidBinding('The event binding no longer authorizes this child thread.');
    }
    let parent;
    try {
      parent = await methods.getConvo(
        envelope.principal.userId,
        binding.lineage.parentConversationId,
      );
    } catch (error) {
      throw invalidBinding(
        `Event binding parent state is temporarily unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
        true,
      );
    }
    if (
      parent == null ||
      parent.subagentThread != null ||
      parent.agent_id !== binding.lineage.parentAgentId ||
      (parent.tenantId ?? undefined) !== envelope.principal.tenantId ||
      !isAgentEventRetentionActive(parent.expiredAt)
    ) {
      throw invalidBinding('The event binding parent no longer authorizes this child thread.');
    }
    if (getGenerationJob != null) {
      let active;
      try {
        active = await getGenerationJob(binding.conversationId);
      } catch (error) {
        throw invalidBinding(
          `Event actor generation state is temporarily unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
          true,
        );
      }
      if (
        active?.status === 'running' ||
        active?.status === 'requires_action' ||
        active?.metadata?.terminalPersistencePending === true
      ) {
        throw new AgentTriggerExecutionError('The event actor is still handling an earlier turn.', {
          mode: 'continue',
          certainty: 'definite',
          retryable: true,
          deferWithoutAttempt: true,
          code: 'EVENT_ACTOR_NOT_READY',
          status: 409,
        });
      }
    }
    try {
      [latestAssistant] = await methods.getMessages(
        {
          user: envelope.principal.userId,
          conversationId: binding.conversationId,
          isCreatedByUser: false,
        },
        'messageId createdAt',
        { sort: { createdAt: -1, _id: -1 }, limit: 1 },
      );
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
      parentMessageId: latestAssistant?.messageId ?? Constants.NO_PARENT,
    };
  };
}
