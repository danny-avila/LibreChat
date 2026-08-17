import type {
  AgentFireTriggerEnvelope,
  AgentSteerTriggerEnvelope,
  AgentTriggerEnvelope,
} from './envelope';
import { getAgentTriggerIdempotencyKey } from './envelope';

export interface AgentTriggerDispatchContext {
  idempotencyKey: string;
  signal?: AbortSignal;
}

export interface AgentTriggerDispatchHandlers<Result> {
  fire: (
    envelope: AgentFireTriggerEnvelope,
    context: AgentTriggerDispatchContext,
  ) => Promise<Result>;
  steer: (
    envelope: AgentSteerTriggerEnvelope,
    context: AgentTriggerDispatchContext,
  ) => Promise<Result>;
}

/** Routes a normalized trigger without coupling its source to an execution transport. */
export function dispatchAgentTrigger<Result>(
  envelope: AgentTriggerEnvelope,
  handlers: AgentTriggerDispatchHandlers<Result>,
  options?: { signal?: AbortSignal },
): Promise<Result> {
  const context: AgentTriggerDispatchContext = {
    idempotencyKey: getAgentTriggerIdempotencyKey(envelope),
    ...(options?.signal != null && { signal: options.signal }),
  };
  if (envelope.mode === 'fire') {
    return handlers.fire(envelope, context);
  }
  return handlers.steer(envelope, context);
}
