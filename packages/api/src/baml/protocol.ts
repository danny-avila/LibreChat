import { createHash } from 'node:crypto';
import type { BamlDeclaredTool, BamlFailureCode, BamlPortVersion } from '@librechat/agents/baml';

/**
 * The port version this adapter speaks. Declared as a local literal rather than
 * re-exported from `@librechat/agents/baml`: importing that entry for its value
 * would run its registration side-effect inside the worker facade, which exists
 * to stay lightweight. The annotation still fails the build if the port moves.
 */
export const SUPPORTED_PORT_VERSION: BamlPortVersion = 1;

/**
 * Everything both sides of the BAML worker boundary agree on, and nothing that
 * touches the native graph. The parent facade and the worker each bundle this
 * module; it must stay free of `@boundaryml/baml-bridge`, of the generated SDK,
 * and of `node:worker_threads`, or importing the facade would pull the native
 * runtime the whole lazy-loading design exists to avoid.
 */

/** The compiled tool union in `baml_src/ns_host/protocol.baml`, mirrored. */
const COMPILED_TOOLS = [
  { name: 'get_weather', fields: { tool: 'literal:get_weather', city: 'string' } },
  { name: 'web_search', fields: { tool: 'literal:web_search', query: 'string' } },
] as const;

const fingerprint = (fields: Readonly<Record<string, string>>): string =>
  `sha256:${createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0, 32)}`;

/**
 * Hand-maintained in step with the BAML union. The fingerprint's job is to
 * detect drift between the schema a caller *binds* and the schema BAML
 * *compiled*, and the compiled schema is not reachable without the native
 * runtime — which is exactly what the facade may not load.
 */
export const DECLARED_TOOLS: readonly BamlDeclaredTool[] = Object.freeze(
  COMPILED_TOOLS.map((tool) =>
    Object.freeze({ name: tool.name, schemaFingerprint: fingerprint(tool.fields) }),
  ),
);

/** Non-user-configurable safety budgets, all owned by the parent. */
export const BAML_CALL_TIMEOUT_MS = 120_000;
export const BAML_STREAM_START_TIMEOUT_MS = 60_000;
export const BAML_STREAM_IDLE_TIMEOUT_MS = 30_000;
export const BAML_STREAM_FINAL_TIMEOUT_MS = 30_000;
export const BAML_STREAM_TOTAL_TIMEOUT_MS = 300_000;
export const BAML_WORKER_ABORT_GRACE_MS = 250;

/** Transcript bounds, measured in JavaScript string code units. */
export const MAX_TRANSCRIPT_ENTRIES = 1_000;
export const MAX_TRANSCRIPT_TEXT_CHARS = 2_000_000;
export const MAX_TOOL_RESULT_CHARS = 250_000;

/**
 * Public failure and rejection text. Stable and sanitized by construction: no
 * stack, path, environment name or value, credential, native constructor,
 * `$new`, or bridge internal may ever be interpolated into these.
 */
export const UNCOMPILED_CLIENT_MESSAGE =
  'The selected BAML model is not compiled for this server.';
export const TRANSPORT_FAILED_MESSAGE = 'BAML provider request failed.';
export const TRANSPORT_TIMEOUT_MESSAGE = 'BAML provider request timed out.';
export const TRANSCRIPT_TOO_LARGE_MESSAGE =
  'The conversation is too large to send to the selected BAML model.';
export const DIVERGENT_PARTIAL_MESSAGE =
  'The BAML model produced an inconsistent partial response.';
export const MODEL_ERROR_MESSAGE = 'The BAML model could not complete this turn.';
export const PARSE_ERROR_MESSAGE =
  'The BAML model returned a response that did not match the expected schema.';
export const PORT_VERSION_MESSAGE =
  'The BAML port version this request was built for is not supported.';
export const ABORT_MESSAGE = 'BAML turn aborted';

/** A tool the model selected that the caller did not bind this turn. */
export const unboundToolMessage = (name: string): string =>
  `The model selected the tool "${name}", which is not bound for this turn.`;

/** A tool selection as it crosses the worker boundary: plain data, never a generated instance. */
export interface WireToolSelection {
  readonly name: string;
  readonly args: Record<string, string | number | boolean | null>;
}

/** A `TurnPlan`, flattened. Generated class instances never cross the boundary. */
export interface WireTurnPlan {
  readonly reply: string | null;
  readonly tools: readonly WireToolSelection[];
}

/**
 * `message` is the stable public text. `detail` is native error text for the
 * redacted structured logger only — the parent strips it before the value
 * becomes a port outcome, so it can never reach a response, a document, or a
 * DTO.
 */
export interface WireFailure {
  readonly code: BamlFailureCode;
  readonly message: string;
  readonly toolName?: string;
  readonly detail?: string;
}

/** Rejections stay a closed pair: the caller aborted, or the transport did not deliver. */
export type WireRejectionKind = 'abort' | 'transport';

export interface WireRejection {
  readonly kind: WireRejectionKind;
  readonly message: string;
  readonly detail?: string;
}

export type WorkerMode = 'call' | 'stream';

export interface WorkerTurnInput {
  readonly userMessage: string;
  readonly transcript: string;
  readonly allowedTools: readonly string[];
}

export interface StartRequest {
  readonly type: 'start';
  readonly operationId: string;
  readonly mode: WorkerMode;
  readonly clientName: string;
  readonly input: WorkerTurnInput;
}

export interface AbortRequest {
  readonly type: 'abort';
  readonly operationId: string;
}

export type WorkerRequest = StartRequest | AbortRequest;

export interface ReadyMessage {
  readonly type: 'ready';
  readonly operationId: string;
}

/**
 * The stream is exhausted and the worker is about to make the blocking `final()`
 * pull. Without it the parent cannot tell "waiting for the next snapshot" from
 * "waiting for the final result", and the two have separate budgets.
 */
export interface FinalizingMessage {
  readonly type: 'finalizing';
  readonly operationId: string;
}

export interface ChunkMessage {
  readonly type: 'chunk';
  readonly operationId: string;
  readonly snapshot: WireTurnPlan;
}

export interface FinalMessage {
  readonly type: 'final';
  readonly operationId: string;
  readonly plan: WireTurnPlan;
}

export interface FailureMessage {
  readonly type: 'failure';
  readonly operationId: string;
  readonly failure: WireFailure;
}

export interface RejectionMessage {
  readonly type: 'rejection';
  readonly operationId: string;
  readonly rejection: WireRejection;
}

export type WorkerMessage =
  | ReadyMessage
  | FinalizingMessage
  | ChunkMessage
  | FinalMessage
  | FailureMessage
  | RejectionMessage;

/** One terminal message ends an operation; everything after it is ignored. */
export const isTerminalMessage = (message: WorkerMessage): boolean =>
  message.type === 'final' || message.type === 'failure' || message.type === 'rejection';
