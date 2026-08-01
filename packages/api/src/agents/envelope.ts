import type { TEphemeralAgent } from 'librechat-data-provider';
import type { ChatCompletionRequest } from './openai';
import type { ResponseRequest } from './responses';

export const AGENT_RUN_ENVELOPE_VERSION = 1 as const;

export type AgentRunProtocol = 'chat.completions' | 'responses';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface AgentRunPrincipal {
  userId: string;
  role?: string;
  tenantId?: string;
}

export interface AgentRunPrincipalInput {
  id?: string;
  role?: string;
  tenantId?: string;
}

/** LibreChat request fields consumed by execution but not declared by the public protocols. */
export interface AgentRunPayloadExtensions {
  ephemeralAgent?: TEphemeralAgent | null;
  manualSkills?: string[];
  timezone?: string;
  isTemporary?: boolean;
}

export type ChatCompletionRunPayload = ChatCompletionRequest & AgentRunPayloadExtensions;
export type ResponsesRunPayload = ResponseRequest & AgentRunPayloadExtensions;

interface AgentRunEnvelopeBase {
  version: typeof AGENT_RUN_ENVELOPE_VERSION;
  requestId: string;
  receivedAt: number;
  principal: AgentRunPrincipal;
}

export interface ChatCompletionRunEnvelope extends AgentRunEnvelopeBase {
  protocol: 'chat.completions';
  payload: ChatCompletionRunPayload;
}

export interface ResponsesRunEnvelope extends AgentRunEnvelopeBase {
  protocol: 'responses';
  payload: ResponsesRunPayload;
}

export type AgentRunEnvelope = ChatCompletionRunEnvelope | ResponsesRunEnvelope;

export type CreateAgentRunEnvelopeInput =
  | {
      protocol: 'chat.completions';
      requestId: string;
      receivedAt: number;
      principal: AgentRunPrincipalInput | null | undefined;
      payload: ChatCompletionRunPayload;
    }
  | {
      protocol: 'responses';
      requestId: string;
      receivedAt: number;
      principal: AgentRunPrincipalInput | null | undefined;
      payload: ResponsesRunPayload;
    };

type CreateChatCompletionRunEnvelopeInput = Extract<
  CreateAgentRunEnvelopeInput,
  { protocol: 'chat.completions' }
>;
type CreateResponsesRunEnvelopeInput = Extract<
  CreateAgentRunEnvelopeInput,
  { protocol: 'responses' }
>;

export class AgentRunEnvelopeError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'AgentRunEnvelopeError';
  }
}

function assertNonEmptyString(value: string | undefined, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AgentRunEnvelopeError(`${path} must be a non-empty string`);
  }
  return value;
}

function cloneJsonValue(value: unknown, path: string, ancestors: WeakSet<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AgentRunEnvelopeError(`${path} must contain only finite numbers`);
    }
    return value;
  }

  if (typeof value !== 'object') {
    throw new AgentRunEnvelopeError(`${path} contains a non-JSON ${typeof value} value`);
  }

  if (ancestors.has(value)) {
    throw new AgentRunEnvelopeError(`${path} contains a circular reference`);
  }

  ancestors.add(value);

  try {
    const symbolKeys = Object.getOwnPropertySymbols(value);
    if (symbolKeys.length > 0) {
      throw new AgentRunEnvelopeError(`${path} contains symbol keys`);
    }

    if (Array.isArray(value)) {
      const extraKeys = Object.getOwnPropertyNames(value).filter((key) => {
        if (key === 'length') {
          return false;
        }
        const index = Number(key);
        return (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= value.length ||
          String(index) !== key
        );
      });
      if (extraKeys.length > 0) {
        throw new AgentRunEnvelopeError(`${path} contains non-index array properties`);
      }

      const cloned: JsonValue[] = [];
      for (let index = 0; index < value.length; index++) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new AgentRunEnvelopeError(
            `${path} contains a sparse array entry at index ${index}`,
          );
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          throw new AgentRunEnvelopeError(`${path}[${index}] must not be an accessor property`);
        }
        const itemValue: unknown = descriptor.value;
        cloned.push(cloneJsonValue(itemValue, `${path}[${index}]`, ancestors));
      }
      return cloned;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      const typeName = value.constructor?.name ?? 'object';
      throw new AgentRunEnvelopeError(`${path} contains a non-plain ${typeName} value`);
    }

    const cloned: { [key: string]: JsonValue } = {};
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable !== true) {
        throw new AgentRunEnvelopeError(`${path}.${key} must be an enumerable property`);
      }
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new AgentRunEnvelopeError(`${path}.${key} must not be an accessor property`);
      }
      const propertyValue: unknown = descriptor.value;
      Object.defineProperty(cloned, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: cloneJsonValue(propertyValue, `${path}.${key}`, ancestors),
      });
    }
    return cloned;
  } finally {
    ancestors.delete(value);
  }
}

function createPrincipal(input: AgentRunPrincipalInput | null | undefined): AgentRunPrincipal {
  const userId = assertNonEmptyString(input?.id, 'principal.id');
  const principal: AgentRunPrincipal = { userId };

  if (input?.role != null) {
    principal.role = assertNonEmptyString(input.role, 'principal.role');
  }
  if (input?.tenantId != null) {
    principal.tenantId = assertNonEmptyString(input.tenantId, 'principal.tenantId');
  }

  return principal;
}

/**
 * Creates the versioned, transport-safe request that crosses the agent execution seam.
 * Runtime objects, provider clients, callbacks, credentials, and Express state belong to
 * the execution host and must never be added to this envelope.
 */
export function createAgentRunEnvelope(
  input: CreateChatCompletionRunEnvelopeInput,
): ChatCompletionRunEnvelope;
export function createAgentRunEnvelope(
  input: CreateResponsesRunEnvelopeInput,
): ResponsesRunEnvelope;
export function createAgentRunEnvelope(input: CreateAgentRunEnvelopeInput): AgentRunEnvelope {
  const receivedProtocol: string = input.protocol;
  const requestId = assertNonEmptyString(input.requestId, 'requestId');
  if (!Number.isSafeInteger(input.receivedAt) || input.receivedAt < 0) {
    throw new AgentRunEnvelopeError('receivedAt must be a non-negative integer timestamp');
  }

  const payload = cloneJsonValue(input.payload, 'payload', new WeakSet());
  const base = {
    version: AGENT_RUN_ENVELOPE_VERSION,
    requestId,
    receivedAt: input.receivedAt,
    principal: createPrincipal(input.principal),
  };

  if (input.protocol === 'chat.completions') {
    return {
      ...base,
      protocol: input.protocol,
      payload: payload as unknown as ChatCompletionRunPayload,
    };
  }

  if (input.protocol === 'responses') {
    return {
      ...base,
      protocol: input.protocol,
      payload: payload as unknown as ResponsesRunPayload,
    };
  }

  throw new AgentRunEnvelopeError(`Unsupported agent run protocol: ${receivedProtocol}`);
}
