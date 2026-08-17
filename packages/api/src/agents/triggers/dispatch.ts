import type {
  AgentFireTriggerEnvelope,
  AgentSteerTriggerEnvelope,
  AgentTriggerEnvelope,
} from './envelope';
import { getAgentTriggerIdempotencyKey, parseAgentTriggerEnvelope } from './envelope';

export interface AgentTriggerDispatchContext {
  idempotencyKey: string;
  signal?: AbortSignal;
}

export class AgentTriggerDispatchError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'AgentTriggerDispatchError';
  }
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
  envelope: unknown,
  handlers: AgentTriggerDispatchHandlers<FireResult, SteerResult>,
  options?: { signal?: AbortSignal },
): Promise<FireResult | SteerResult> {
  let normalized: AgentTriggerEnvelope;
  try {
    normalized = parseAgentTriggerEnvelope(envelope);
  } catch (error) {
    throw new AgentTriggerDispatchError(error instanceof Error ? error.message : String(error));
  }
  const context: AgentTriggerDispatchContext = {
    idempotencyKey: getAgentTriggerIdempotencyKey(normalized),
    ...(options?.signal != null && { signal: options.signal }),
  };
  if (normalized.mode === 'fire') {
    return handlers.fire(normalized, context);
  }
  return handlers.steer(normalized, context);
}
