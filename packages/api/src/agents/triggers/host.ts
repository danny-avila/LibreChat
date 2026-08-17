import { tenantStorage } from '@librechat/data-schemas';
import { Constants, EModelEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type {
  AgentFireTriggerEnvelope,
  AgentSteerTriggerEnvelope,
  AgentTriggerEnvelope,
} from './envelope';
import type { SteerRequestResult, SteerRunContext } from '../steering';
import type { AgentTriggerDispatchContext } from './dispatch';
import type { AgentRunPrincipal } from '../envelope';
import { dispatchAgentTrigger } from './dispatch';
import { handleSteerRequest } from '../steering';

const DEFAULT_FIRE_TIMEOUT_MS = 30_000;
const GENERATION_PROTOCOL_HEADER = 'x-librechat-generation-protocol';
const TRIGGER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 LibreChat-Agent-Trigger/1';

const PRE_CONNECT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

type MaybePromise<T> = T | Promise<T>;
type FireStatus = 'started' | 'resumed' | 'replaced' | 'settled';

export type AgentTriggerFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type AgentTriggerFailureCertainty = 'definite' | 'ambiguous';

export interface AgentTriggerExecutionErrorOptions {
  mode: 'fire' | 'steer';
  certainty: AgentTriggerFailureCertainty;
  retryable: boolean;
  code?: string;
  status?: number;
  retryAfter?: string;
}

/**
 * A typed delivery failure. `ambiguous` means the action may already be
 * committed; callers may retry only the same envelope so its idempotency key
 * remains unchanged.
 */
export class AgentTriggerExecutionError extends Error {
  readonly mode: 'fire' | 'steer';
  readonly certainty: AgentTriggerFailureCertainty;
  readonly retryable: boolean;
  readonly code?: string;
  readonly status?: number;
  readonly retryAfter?: string;

  constructor(message: string, options: AgentTriggerExecutionErrorOptions) {
    super(message);
    this.name = 'AgentTriggerExecutionError';
    this.mode = options.mode;
    this.certainty = options.certainty;
    this.retryable = options.retryable;
    this.code = options.code;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
  }
}

export interface AgentTriggerFireResult {
  mode: 'fire';
  status: FireStatus;
  conversationId: string;
  streamId?: string;
  generationCreatedAt?: number;
}

export interface AgentTriggerSteerResult {
  mode: 'steer';
  status: 'queued';
  conversationId: string;
  steerId: string;
  position: number;
  preempt: boolean;
  preemptRevision?: number;
  replayed?: boolean;
  settled?: boolean;
  leftover?: boolean;
}

export type AgentTriggerExecutionResult = AgentTriggerFireResult | AgentTriggerSteerResult;

export interface AgentTriggerExecutionHostDeps {
  /** Trusted root URL for this LibreChat server. */
  getBaseUrl: () => string;
  /** Mint a short-lived token for the envelope's already-authenticated principal. */
  mintToken: (
    principal: AgentRunPrincipal,
    envelope: AgentFireTriggerEnvelope,
  ) => MaybePromise<string>;
  /** Re-evaluate the principal's current role and per-agent ACL for a live steer. */
  checkAgentAccess: (principal: AgentRunPrincipal, agentId: string) => Promise<boolean>;
  /** Optional user-timezone resolver for dynamic date variables in a new run. */
  getTimezone?: (
    principal: AgentRunPrincipal,
    envelope: AgentFireTriggerEnvelope,
  ) => MaybePromise<string | undefined>;
  fetch?: AgentTriggerFetch;
  timeoutMs?: number;
  /** Test/embedding seam; production callers use the package steer guard ladder. */
  steer?: typeof handleSteerRequest;
}

export interface AgentTriggerExecutionHost {
  dispatch: (
    envelope: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<AgentTriggerExecutionResult>;
}

interface AbortScope {
  signal: AbortSignal;
  cleanup: () => void;
  timedOut: () => boolean;
}

function executionError(
  message: string,
  options: AgentTriggerExecutionErrorOptions,
): AgentTriggerExecutionError {
  return new AgentTriggerExecutionError(message, options);
}

function requireTimeout(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? DEFAULT_FIRE_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('Agent trigger fire timeout must be a positive integer');
  }
  return value;
}

function abortScope(parent: AbortSignal | undefined, timeoutMs: number): AbortScope {
  const controller = new AbortController();
  let timeoutReached = false;
  const onAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted === true) {
    onAbort();
  } else {
    parent?.addEventListener('abort', onAbort, { once: true });
  }
  const timeout = setTimeout(() => {
    timeoutReached = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timeoutReached,
    cleanup: () => {
      clearTimeout(timeout);
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

function errorCode(value: unknown): string | undefined {
  if (value == null || typeof value !== 'object' || !('code' in value)) {
    return undefined;
  }
  const code = value.code;
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

function errorMessage(value: unknown): string | undefined {
  if (value == null || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['error', 'message', 'code']) {
    if (key in record) {
      const message = record[key];
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }
  }
  return undefined;
}

function parseJson(value: string): unknown {
  if (value.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function fetchErrorCode(error: unknown): string | undefined {
  const read = (value: unknown): string | undefined => {
    if (value == null || typeof value !== 'object' || !('code' in value)) {
      return undefined;
    }
    const code = value.code;
    return typeof code === 'string' ? code : undefined;
  };
  if (error == null || typeof error !== 'object') {
    return undefined;
  }
  return ('cause' in error ? read(error.cause) : undefined) ?? read(error);
}

function isDefiniteConnectFailure(error: unknown): boolean {
  const code = fetchErrorCode(error);
  return (
    code != null &&
    (PRE_CONNECT_ERROR_CODES.has(code) || code.startsWith('ERR_TLS') || code.includes('CERT'))
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function abortCode(scope: AbortScope, parent: AbortSignal | undefined, fallback: string): string {
  if (scope.timedOut()) {
    return 'TIMEOUT';
  }
  if (parent?.aborted === true) {
    return 'ABORTED';
  }
  return fallback;
}

function requireToken(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || /\s/.test(value)) {
    throw executionError('Agent trigger token mint returned an invalid token', {
      mode: 'fire',
      certainty: 'definite',
      retryable: false,
      code: 'INVALID_TOKEN',
    });
  }
  return value;
}

function fireUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw executionError('Agent trigger base URL is invalid', {
      mode: 'fire',
      certainty: 'definite',
      retryable: false,
      code: 'INVALID_BASE_URL',
    });
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw executionError('Agent trigger base URL must be an HTTP(S) URL without credentials', {
      mode: 'fire',
      certainty: 'definite',
      retryable: false,
      code: 'INVALID_BASE_URL',
    });
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/agents/chat/${EModelEndpoint.agents}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function requireString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requireSafeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function fireStatus(value: unknown): FireStatus | undefined {
  return value === 'started' || value === 'resumed' || value === 'replaced' || value === 'settled'
    ? value
    : undefined;
}

function parseFireResult(payload: unknown): AgentTriggerFireResult | undefined {
  if (payload == null || typeof payload !== 'object') {
    return undefined;
  }
  const status = fireStatus('status' in payload ? payload.status : undefined);
  const conversationId = requireString(
    'conversationId' in payload ? payload.conversationId : undefined,
  );
  if (status == null || conversationId == null) {
    return undefined;
  }
  const streamId = requireString('streamId' in payload ? payload.streamId : undefined);
  if (status !== 'settled' && streamId == null) {
    return undefined;
  }
  const generationCreatedAt = requireSafeInteger(
    'generationCreatedAt' in payload ? payload.generationCreatedAt : undefined,
  );
  return {
    mode: 'fire',
    status,
    conversationId,
    ...(streamId != null && { streamId }),
    ...(generationCreatedAt != null && { generationCreatedAt }),
  };
}

async function fire(
  envelope: AgentFireTriggerEnvelope,
  context: AgentTriggerDispatchContext,
  deps: AgentTriggerExecutionHostDeps,
  timeoutMs: number,
): Promise<AgentTriggerFireResult> {
  if (context.signal?.aborted === true) {
    throw executionError('Agent trigger fire was aborted before dispatch', {
      mode: 'fire',
      certainty: 'definite',
      retryable: true,
      code: 'ABORTED',
    });
  }

  let token: string;
  let timezone: string | undefined;
  let url: string;
  try {
    token = requireToken(await deps.mintToken(envelope.principal, envelope));
    timezone = await deps.getTimezone?.(envelope.principal, envelope);
    url = fireUrl(deps.getBaseUrl());
  } catch (error) {
    if (error instanceof AgentTriggerExecutionError) {
      throw error;
    }
    throw executionError(
      `Agent trigger fire setup failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        mode: 'fire',
        certainty: 'definite',
        retryable: false,
        code: 'SETUP_FAILED',
      },
    );
  }

  const scope = abortScope(context.signal, timeoutMs);
  let response: Response;
  try {
    const fetcher: AgentTriggerFetch = deps.fetch ?? globalThis.fetch;
    response = await fetcher(url, {
      method: 'POST',
      signal: scope.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': TRIGGER_USER_AGENT,
        'x-request-id': context.idempotencyKey,
        [GENERATION_PROTOCOL_HEADER]: '2',
      },
      body: JSON.stringify({
        text: envelope.input,
        endpoint: EModelEndpoint.agents,
        agent_id: envelope.target.agentId,
        parentMessageId: Constants.NO_PARENT,
        isContinued: false,
        isRegenerate: false,
        clientRequestId: context.idempotencyKey,
        generationProtocolVersion: 2,
        ...(typeof timezone === 'string' && timezone.trim().length > 0
          ? { timezone: timezone.trim() }
          : {}),
      }),
    });
  } catch (error) {
    scope.cleanup();
    const definite = isDefiniteConnectFailure(error);
    const message = error instanceof Error ? error.message : String(error);
    throw executionError(
      `Agent trigger fire ${definite ? 'could not connect' : 'has an unknown outcome'}: ${message}`,
      {
        mode: 'fire',
        certainty: definite ? 'definite' : 'ambiguous',
        retryable: true,
        code: abortCode(scope, context.signal, 'NETWORK_ERROR'),
      },
    );
  }

  let raw = '';
  try {
    raw = await response.text();
  } catch (error) {
    if (response.ok) {
      throw executionError(
        `Agent trigger fire response has an unknown outcome: ${
          error instanceof Error ? error.message : String(error)
        }`,
        {
          mode: 'fire',
          certainty: 'ambiguous',
          retryable: true,
          code: abortCode(scope, context.signal, 'INVALID_RESPONSE'),
          status: response.status,
        },
      );
    }
  } finally {
    scope.cleanup();
  }
  const payload = parseJson(raw);
  if (!response.ok) {
    const message = errorMessage(payload) ?? (raw.slice(0, 300) || 'request rejected');
    throw executionError(`Agent trigger fire was rejected (${response.status}): ${message}`, {
      mode: 'fire',
      certainty: 'definite',
      retryable: isRetryableStatus(response.status),
      code: errorCode(payload) ?? 'FIRE_REJECTED',
      status: response.status,
      ...(response.headers.get('retry-after') != null && {
        retryAfter: response.headers.get('retry-after') ?? undefined,
      }),
    });
  }
  if (
    payload != null &&
    typeof payload === 'object' &&
    'status' in payload &&
    payload.status === 'aborted'
  ) {
    throw executionError('Agent trigger fire was aborted before generation started', {
      mode: 'fire',
      certainty: 'definite',
      retryable: false,
      code: 'START_ABORTED',
      status: response.status,
    });
  }
  const result = parseFireResult(payload);
  if (result == null) {
    throw executionError('Agent trigger fire returned an invalid success response', {
      mode: 'fire',
      certainty: 'ambiguous',
      retryable: true,
      code: 'INVALID_RESPONSE',
      status: response.status,
    });
  }
  return result;
}

function parseSteerResult(result: SteerRequestResult): AgentTriggerSteerResult | undefined {
  const { body } = result;
  if (result.status !== 202 || body.status !== 'queued') {
    return undefined;
  }
  const conversationId = requireString(body.conversationId);
  const steerId = requireString(body.steerId);
  const position = requireSafeInteger(body.position);
  if (
    conversationId == null ||
    steerId == null ||
    position == null ||
    typeof body.preempt !== 'boolean'
  ) {
    return undefined;
  }
  const preemptRevision = requireSafeInteger(body.preemptRevision);
  return {
    mode: 'steer',
    status: 'queued',
    conversationId,
    steerId,
    position,
    preempt: body.preempt,
    ...(preemptRevision != null && { preemptRevision }),
    ...(typeof body.replayed === 'boolean' && { replayed: body.replayed }),
    ...(typeof body.settled === 'boolean' && { settled: body.settled }),
    ...(typeof body.leftover === 'boolean' && { leftover: body.leftover }),
  };
}

function matchesTarget(run: SteerRunContext, envelope: AgentSteerTriggerEnvelope): boolean {
  return run.agentId === envelope.target.agentId && isAgentsEndpoint(run.endpoint);
}

async function steer(
  envelope: AgentSteerTriggerEnvelope,
  context: AgentTriggerDispatchContext,
  deps: AgentTriggerExecutionHostDeps,
): Promise<AgentTriggerSteerResult> {
  if (context.signal?.aborted === true) {
    throw executionError('Agent trigger steer was aborted before dispatch', {
      mode: 'steer',
      certainty: 'definite',
      retryable: true,
      code: 'ABORTED',
    });
  }

  let response: SteerRequestResult;
  try {
    response = await (deps.steer ?? handleSteerRequest)(
      { id: envelope.principal.userId, tenantId: envelope.principal.tenantId },
      {
        conversationId: envelope.target.conversationId,
        generationCreatedAt: envelope.target.generationCreatedAt,
        text: envelope.input,
        clientSteerId: context.idempotencyKey,
        preempt: envelope.target.preempt === true,
      },
      {
        generationProtocolVersion: 2,
        requireIdempotentDelivery: true,
        checkAgentAccess: async (run) =>
          matchesTarget(run, envelope) &&
          (await deps.checkAgentAccess(envelope.principal, envelope.target.agentId)),
      },
    );
  } catch (error) {
    throw executionError(
      `Agent trigger steer has an unknown outcome: ${
        error instanceof Error ? error.message : String(error)
      }`,
      {
        mode: 'steer',
        certainty: 'ambiguous',
        retryable: true,
        code: 'STEER_ERROR',
      },
    );
  }

  if (response.status !== 202) {
    const code = errorCode(response.body) ?? 'STEER_REJECTED';
    throw executionError(
      `Agent trigger steer was rejected (${response.status}): ${
        errorMessage(response.body) ?? code
      }`,
      {
        mode: 'steer',
        certainty: 'definite',
        retryable: isRetryableStatus(response.status),
        code,
        status: response.status,
      },
    );
  }
  const parsed = parseSteerResult(response);
  if (parsed == null) {
    throw executionError('Agent trigger steer returned an invalid success response', {
      mode: 'steer',
      certainty: 'ambiguous',
      retryable: true,
      code: 'INVALID_RESPONSE',
      status: response.status,
    });
  }
  if (parsed.conversationId !== envelope.target.conversationId) {
    throw executionError('Agent trigger steer returned a mismatched conversation', {
      mode: 'steer',
      certainty: 'ambiguous',
      retryable: true,
      code: 'INVALID_RESPONSE',
      status: response.status,
    });
  }
  return parsed;
}

function runAsPrincipal<T>(
  envelope: AgentTriggerEnvelope,
  context: AgentTriggerDispatchContext,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantStorage.run(
    {
      userId: envelope.principal.userId,
      tenantId: envelope.principal.tenantId,
      requestId: context.idempotencyKey,
    },
    fn,
  );
}

/**
 * Creates the trusted, source-neutral execution host. Schedules, webhooks,
 * queues, MCP adapters, and internal events all call the same `dispatch` and
 * therefore share authorization, idempotency, tenant, and failure semantics.
 */
export function createAgentTriggerExecutionHost(
  deps: AgentTriggerExecutionHostDeps,
): AgentTriggerExecutionHost {
  const timeoutMs = requireTimeout(deps.timeoutMs);
  return {
    dispatch: (envelope, options) =>
      dispatchAgentTrigger(
        envelope,
        {
          fire: (normalized, context) =>
            runAsPrincipal(normalized, context, () => fire(normalized, context, deps, timeoutMs)),
          steer: (normalized, context) =>
            runAsPrincipal(normalized, context, () => steer(normalized, context, deps)),
        },
        options,
      ),
  };
}
