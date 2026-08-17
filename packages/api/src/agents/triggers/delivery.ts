import { createHash } from 'node:crypto';
import type { AgentTriggerEnvelope } from './envelope';
import { getAgentTriggerIdempotencyKey, parseAgentTriggerEnvelope } from './envelope';

export const MAX_AGENT_TRIGGER_ENVELOPE_BYTES: number = 1024 * 1024;

export interface AgentTriggerEnqueueOptions {
  /** Trusted lane override. Matching lanes dispatch strictly in enqueue order. */
  orderingKey?: string;
  /** Delays first eligibility without changing source occurrence time. */
  availableAt?: Date;
}

export interface PreparedAgentTriggerDelivery {
  deliveryKey: string;
  fingerprint: string;
  orderingKey: string;
  envelope: AgentTriggerEnvelope;
  user: string;
  tenantId?: string;
  availableAt: Date;
}

export class AgentTriggerDeliveryError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'AgentTriggerDeliveryError';
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function requireAvailableAt(value: Date | undefined): Date {
  const availableAt = value ?? new Date();
  if (!(availableAt instanceof Date) || !Number.isFinite(availableAt.getTime())) {
    throw new AgentTriggerDeliveryError('availableAt must be a valid Date');
  }
  return new Date(availableAt);
}

function orderingIdentity(
  envelope: AgentTriggerEnvelope,
  configuredKey: string | undefined,
): string {
  let lane: unknown;
  if (configuredKey != null) {
    const trimmed = configuredKey.trim();
    if (trimmed.length === 0 || trimmed.length > 256) {
      throw new AgentTriggerDeliveryError('orderingKey must contain between 1 and 256 characters');
    }
    lane = ['explicit', trimmed];
  } else {
    lane = [
      'default',
      envelope.event.source.type,
      envelope.event.source.id,
      envelope.mode,
      envelope.target.agentId,
      envelope.mode === 'steer' ? envelope.target.conversationId : '',
    ];
  }
  return `trigger_lane_${digest([
    envelope.principal.tenantId ?? '',
    envelope.principal.userId,
    lane,
  ])}`;
}

/** Validates, bounds, detaches, and fingerprints one durable source delivery. */
export function prepareAgentTriggerDelivery(
  value: unknown,
  options: AgentTriggerEnqueueOptions = {},
): PreparedAgentTriggerDelivery {
  const envelope = parseAgentTriggerEnvelope(value);
  const serialized = canonicalJson(envelope);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_AGENT_TRIGGER_ENVELOPE_BYTES) {
    throw new AgentTriggerDeliveryError(
      `Agent trigger envelope exceeds ${MAX_AGENT_TRIGGER_ENVELOPE_BYTES} bytes`,
    );
  }

  // requestId and receivedAt identify an ingress attempt, not the logical
  // source-event-to-target delivery. Excluding them lets a retried ingress use
  // a fresh request trace without weakening content-conflict detection.
  const { requestId: _requestId, receivedAt: _receivedAt, ...durableIdentity } = envelope;
  return {
    deliveryKey: getAgentTriggerIdempotencyKey(envelope),
    fingerprint: digest(durableIdentity),
    orderingKey: orderingIdentity(envelope, options.orderingKey),
    envelope,
    user: envelope.principal.userId,
    ...(envelope.principal.tenantId != null && { tenantId: envelope.principal.tenantId }),
    availableAt: requireAvailableAt(options.availableAt),
  };
}
