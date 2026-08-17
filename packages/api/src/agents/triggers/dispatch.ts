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

/**
 * Host-owned execution adapters. Each handler must enforce current authorization,
 * limits, persistence, and the supplied idempotency identity before accepting work.
 */
export interface AgentTriggerDispatchHandlers<FireResult, SteerResult> {
  fire: (
    envelope: AgentFireTriggerEnvelope,
    context: AgentTriggerDispatchContext,
  ) => Promise<FireResult>;
  steer: (
    envelope: AgentSteerTriggerEnvelope,
    context: AgentTriggerDispatchContext,
  ) => Promise<SteerResult>;
}

/** Routes a normalized trigger without coupling its source to an execution transport. */
export function dispatchAgentTrigger<FireResult, SteerResult>(
  envelope: AgentTriggerEnvelope,
  handlers: AgentTriggerDispatchHandlers<FireResult, SteerResult>,
  options?: { signal?: AbortSignal },
): Promise<FireResult | SteerResult> {
  const context: AgentTriggerDispatchContext = {
    idempotencyKey: getAgentTriggerIdempotencyKey(envelope),
    ...(options?.signal != null && { signal: options.signal }),
  };
  if (envelope.mode === 'fire') {
    return handlers.fire(envelope, context);
  }
  return handlers.steer(envelope, context);
}
