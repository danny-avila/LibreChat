import { createHash } from 'node:crypto';
import type { AgentRunPrincipal, AgentRunPrincipalInput } from '../envelope';
import type { JsonValue } from '../json';
import { cloneJsonValue } from '../json';

export const AGENT_TRIGGER_ENVELOPE_VERSION = 1 as const;
export const AGENT_TRIGGER_IDEMPOTENCY_PREFIX = 'trigger_';

export type AgentTriggerMode = 'fire' | 'steer';

export interface AgentTriggerSource {
  /** Stable identity of the configured source, such as a webhook or schedule id. */
  id: string;
  /** Source adapter kind. Core dispatch does not interpret this value. */
  type: string;
}

export interface AgentTriggerEvent {
  /** Stable identity assigned by the source for this event occurrence. */
  id: string;
  type: string;
  /** Unix time in milliseconds recorded by the source. */
  occurredAt: number;
  /** Sanitized source data; adapters must omit credentials and transport secrets. */
  payload?: JsonValue;
  source: AgentTriggerSource;
}

interface AgentTriggerTarget {
  agentId: string;
}

/**
 * One fire delivery represents one new conversation for this agent; retries
 * reuse the delivery id instead of starting another conversation.
 */
export type AgentFireTarget = AgentTriggerTarget;

export interface AgentSteerTarget extends AgentTriggerTarget {
  /** Existing conversation whose active generation receives the input. */
  conversationId: string;
  /** Fences delivery to the generation observed by the event adapter. */
  generationCreatedAt: number;
  /** Request an interrupt when supported; otherwise delivery stays queued. */
  preempt?: boolean;
}

interface AgentTriggerEnvelopeBase {
  version: typeof AGENT_TRIGGER_ENVELOPE_VERSION;
  requestId: string;
  /** Stable across retries of one source-event-to-target delivery. */
  deliveryId: string;
  /** Unix time in milliseconds recorded by the receiving host. */
  receivedAt: number;
  principal: AgentRunPrincipal;
  event: AgentTriggerEvent;
  /** Host-rendered agent input; source payload remains available in `event.payload`. */
  input: string;
}

export interface AgentFireTriggerEnvelope extends AgentTriggerEnvelopeBase {
  mode: 'fire';
  target: AgentFireTarget;
}

export interface AgentSteerTriggerEnvelope extends AgentTriggerEnvelopeBase {
  mode: 'steer';
  target: AgentSteerTarget;
}

export type AgentTriggerEnvelope = AgentFireTriggerEnvelope | AgentSteerTriggerEnvelope;

interface CreateAgentTriggerEnvelopeBase {
  requestId: string;
  deliveryId: string;
  receivedAt: number;
  principal: AgentRunPrincipalInput | null | undefined;
  event: AgentTriggerEvent;
  input: string;
}

export type CreateAgentTriggerEnvelopeInput =
  | (CreateAgentTriggerEnvelopeBase & {
      mode: 'fire';
      target: AgentFireTarget;
    })
  | (CreateAgentTriggerEnvelopeBase & {
      mode: 'steer';
      target: AgentSteerTarget;
    });

export class AgentTriggerEnvelopeError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'AgentTriggerEnvelopeError';
  }
}

function error(message: string): AgentTriggerEnvelopeError {
  return new AgentTriggerEnvelopeError(message);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw error(`${path} must be a non-empty string`);
  }
  return value;
}

function requireTimestamp(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw error(`${path} must be a non-negative integer timestamp`);
  }
  return value;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function createPrincipal(input: AgentRunPrincipalInput | null | undefined): AgentRunPrincipal {
  const principal: AgentRunPrincipal = {
    userId: requireString(input?.id, 'principal.id'),
  };
  if (input?.role != null) {
    principal.role = requireString(input.role, 'principal.role');
  }
  if (input?.tenantId != null) {
    principal.tenantId = requireString(input.tenantId, 'principal.tenantId');
  }
  return principal;
}

function createEvent(input: AgentTriggerEvent | null | undefined): AgentTriggerEvent {
  return {
    id: requireString(input?.id, 'event.id'),
    type: requireString(input?.type, 'event.type'),
    occurredAt: requireTimestamp(input?.occurredAt, 'event.occurredAt'),
    source: {
      id: requireString(input?.source?.id, 'event.source.id'),
      type: requireString(input?.source?.type, 'event.source.type'),
    },
    ...(input?.payload !== undefined && {
      payload: cloneJsonValue(input.payload, 'event.payload', error),
    }),
  };
}

export function createAgentTriggerEnvelope(
  input: CreateAgentTriggerEnvelopeInput,
): AgentTriggerEnvelope {
  const receivedMode: string = input.mode;
  const base: AgentTriggerEnvelopeBase = {
    version: AGENT_TRIGGER_ENVELOPE_VERSION,
    requestId: requireString(input.requestId, 'requestId'),
    deliveryId: requireString(input.deliveryId, 'deliveryId'),
    receivedAt: requireTimestamp(input.receivedAt, 'receivedAt'),
    principal: createPrincipal(input.principal),
    event: createEvent(input.event),
    input: requireString(input.input, 'input'),
  };

  if (input.mode === 'fire') {
    return {
      ...base,
      mode: input.mode,
      target: { agentId: requireString(input.target?.agentId, 'target.agentId') },
    };
  }

  if (input.mode === 'steer') {
    const target = input.target;
    if (target?.preempt != null && typeof target.preempt !== 'boolean') {
      throw error('target.preempt must be a boolean');
    }
    return {
      ...base,
      mode: input.mode,
      target: {
        agentId: requireString(target?.agentId, 'target.agentId'),
        conversationId: requireString(target?.conversationId, 'target.conversationId'),
        generationCreatedAt: requireTimestamp(
          target?.generationCreatedAt,
          'target.generationCreatedAt',
        ),
        ...(target?.preempt != null && { preempt: target.preempt }),
      },
    };
  }

  throw error(`Unsupported agent trigger mode: ${receivedMode}`);
}

/**
 * Validates and detaches an envelope received from a queue or another process.
 * Unknown versions, modes, and malformed v1 fields fail closed before dispatch.
 */
export function parseAgentTriggerEnvelope(input: unknown): AgentTriggerEnvelope {
  const envelope = requireRecord(cloneJsonValue(input, 'envelope', error), 'envelope');
  if (envelope.version !== AGENT_TRIGGER_ENVELOPE_VERSION) {
    throw error(`Unsupported agent trigger envelope version: ${String(envelope.version)}`);
  }

  const mode = envelope.mode;
  if (mode !== 'fire' && mode !== 'steer') {
    throw error(`Unsupported agent trigger mode: ${String(mode)}`);
  }

  const principalInput = requireRecord(envelope.principal, 'principal');
  const principal: AgentRunPrincipal = {
    userId: requireString(principalInput.userId, 'principal.userId'),
  };
  if (principalInput.role != null) {
    principal.role = requireString(principalInput.role, 'principal.role');
  }
  if (principalInput.tenantId != null) {
    principal.tenantId = requireString(principalInput.tenantId, 'principal.tenantId');
  }

  const eventInput = requireRecord(envelope.event, 'event');
  const sourceInput = requireRecord(eventInput.source, 'event.source');
  const event: AgentTriggerEvent = {
    id: requireString(eventInput.id, 'event.id'),
    type: requireString(eventInput.type, 'event.type'),
    occurredAt: requireTimestamp(eventInput.occurredAt, 'event.occurredAt'),
    source: {
      id: requireString(sourceInput.id, 'event.source.id'),
      type: requireString(sourceInput.type, 'event.source.type'),
    },
    ...(eventInput.payload !== undefined && { payload: eventInput.payload as JsonValue }),
  };

  const base: AgentTriggerEnvelopeBase = {
    version: AGENT_TRIGGER_ENVELOPE_VERSION,
    requestId: requireString(envelope.requestId, 'requestId'),
    deliveryId: requireString(envelope.deliveryId, 'deliveryId'),
    receivedAt: requireTimestamp(envelope.receivedAt, 'receivedAt'),
    principal,
    event,
    input: requireString(envelope.input, 'input'),
  };
  const target = requireRecord(envelope.target, 'target');

  if (mode === 'fire') {
    return {
      ...base,
      mode,
      target: { agentId: requireString(target.agentId, 'target.agentId') },
    };
  }

  if (target.preempt != null && typeof target.preempt !== 'boolean') {
    throw error('target.preempt must be a boolean');
  }
  return {
    ...base,
    mode,
    target: {
      agentId: requireString(target.agentId, 'target.agentId'),
      conversationId: requireString(target.conversationId, 'target.conversationId'),
      generationCreatedAt: requireTimestamp(
        target.generationCreatedAt,
        'target.generationCreatedAt',
      ),
      ...(target.preempt != null && { preempt: target.preempt }),
    },
  };
}

/**
 * Stable idempotency key for one target delivery. Its character set and length
 * are accepted by both generation `clientRequestId` and steering `clientSteerId`.
 */
export function getAgentTriggerIdempotencyKey(envelope: AgentTriggerEnvelope): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        envelope.version,
        envelope.principal.tenantId ?? '',
        envelope.principal.userId,
        envelope.event.source.type,
        envelope.event.source.id,
        envelope.event.type,
        envelope.event.id,
        envelope.deliveryId,
        envelope.mode,
        envelope.target.agentId,
        envelope.mode === 'steer' ? envelope.target.conversationId : '',
      ]),
    )
    .digest('hex');
  return `${AGENT_TRIGGER_IDEMPOTENCY_PREFIX}${digest}`;
}
