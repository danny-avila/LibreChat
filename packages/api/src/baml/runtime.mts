import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type {
  BamlFunctionSet,
  BamlPromptInput,
  BamlSelectedTool,
  BamlToolCallsOutcome,
  BamlToolFailure,
  BamlTurnChunk,
  BamlTurnResult,
} from '@librechat/agents/baml';
import type {
  PartialTextCursor,
  WireFailure,
  WireTurnPlan,
  WorkerMessage,
  WorkerMode,
  WorkerTurnInput,
} from './protocol';
import { BamlAbortError, BamlTransportError } from './errors';
import { projectTranscript } from './transcript';
import {
  BAML_CALL_TIMEOUT_MS,
  BAML_STREAM_FINAL_TIMEOUT_MS,
  BAML_STREAM_IDLE_TIMEOUT_MS,
  BAML_STREAM_START_TIMEOUT_MS,
  BAML_STREAM_TOTAL_TIMEOUT_MS,
  BAML_WORKER_ABORT_GRACE_MS,
  DECLARED_TOOLS,
  PORT_VERSION_MESSAGE,
  SUPPORTED_PORT_VERSION,
  TRANSPORT_FAILED_MESSAGE,
  TRANSPORT_TIMEOUT_MESSAGE,
  consumeCumulativeTextSnapshot,
  createPartialTextCursor,
  unboundToolMessage,
} from './protocol';

/**
 * The parent facade: the whole BAML port, minus anything native.
 *
 * This module is deliberately self-contained — no bridge, no generated SDK, no
 * CommonJS package import. Loading it costs one small ESM graph, which is what
 * makes `packages/api`'s ordinary CJS root able to stay native-free until a BAML
 * endpoint is actually initialized. Everything that must touch generated
 * bytecode happens in `./worker.mjs`, one single-use thread per operation.
 */

const WORKER_URL = new URL('./worker.mjs', import.meta.url);

type TimerHandle = ReturnType<typeof setTimeout>;

/** Injected by tests so deadlines are deterministic instead of wall-clock bound. */
export interface BamlTimers {
  readonly setTimeout: (handler: () => void, ms: number) => TimerHandle;
  readonly clearTimeout: (handle: TimerHandle) => void;
}

const REAL_TIMERS: BamlTimers = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

/**
 * Injected by tests so "was a worker thread ever constructed" is directly
 * observable instead of inferred from side effects like elapsed time or
 * provider request count. A precheck failure (an oversize transcript, an
 * unsupported port version) must never reach this factory at all.
 */
export interface BamlWorkerFactory {
  readonly createWorker: (url: URL) => Worker;
}

const REAL_WORKER_FACTORY: BamlWorkerFactory = {
  createWorker: (url) => new Worker(url),
};

/** Native error text goes here and nowhere else; the caller redacts and logs it. */
export interface BamlDiagnostic {
  readonly clientName: string;
  readonly stage: 'failure' | 'rejection' | 'worker';
  readonly detail: string;
}

export interface BamlRuntimeOptions {
  /** The exact persisted logical client name. Case-sensitive; never defaulted. */
  readonly clientName: string;
  readonly onDiagnostic?: (diagnostic: BamlDiagnostic) => void;
  readonly timers?: BamlTimers;
  readonly workers?: BamlWorkerFactory;
}

type OperationEvent =
  | { readonly type: 'chunk'; readonly snapshot: WireTurnPlan }
  | { readonly type: 'final'; readonly plan: WireTurnPlan }
  | { readonly type: 'failure'; readonly failure: WireFailure };

interface OperationParams {
  readonly mode: WorkerMode;
  readonly clientName: string;
  readonly input: WorkerTurnInput;
  readonly signal?: AbortSignal;
  readonly timers: BamlTimers;
  readonly workers: BamlWorkerFactory;
  readonly onDiagnostic?: (diagnostic: BamlDiagnostic) => void;
}

/**
 * One operation, one worker, one terminal outcome.
 *
 * The generator's `finally` is the single cleanup path, so exhaustion, an early
 * consumer `return()`, a thrown rejection, and an abort all release the signal
 * listener, the worker listeners, the deadlines, and the thread itself.
 */
async function* runOperation(params: OperationParams): AsyncGenerator<OperationEvent, void, void> {
  const { mode, clientName, input, signal, timers, workers, onDiagnostic } = params;
  const operationId = randomUUID();
  const worker = workers.createWorker(WORKER_URL);

  const queue: OperationEvent[] = [];
  let wake: (() => void) | null = null;
  let rejection: Error | null = null;
  let terminal = false;
  let disposed = false;
  let stepTimer: TimerHandle | null = null;
  let totalTimer: TimerHandle | null = null;

  const notify = (): void => {
    const resume = wake;
    wake = null;
    resume?.();
  };

  const clearStep = (): void => {
    if (stepTimer !== null) {
      timers.clearTimeout(stepTimer);
      stepTimer = null;
    }
  };

  const armStep = (ms: number): void => {
    clearStep();
    stepTimer = timers.setTimeout(() => {
      reject(new BamlTransportError(TRANSPORT_TIMEOUT_MESSAGE));
    }, ms);
  };

  const diagnose = (stage: BamlDiagnostic['stage'], detail: string | undefined): void => {
    if (detail != null && onDiagnostic != null) {
      onDiagnostic({ clientName, stage, detail });
    }
  };

  function reject(error: Error): void {
    if (terminal) {
      return;
    }
    terminal = true;
    rejection = error;
    notify();
  }

  const deliver = (event: OperationEvent): void => {
    if (terminal) {
      return;
    }
    queue.push(event);
    if (event.type !== 'chunk') {
      terminal = true;
    }
    notify();
  };

  const onMessage = (message: WorkerMessage): void => {
    if (message.operationId !== operationId) {
      return;
    }
    switch (message.type) {
      case 'ready':
        armStep(mode === 'call' ? BAML_CALL_TIMEOUT_MS : BAML_STREAM_START_TIMEOUT_MS);
        return;
      case 'chunk':
        armStep(BAML_STREAM_IDLE_TIMEOUT_MS);
        deliver({ type: 'chunk', snapshot: message.snapshot });
        return;
      case 'finalizing':
        armStep(BAML_STREAM_FINAL_TIMEOUT_MS);
        return;
      case 'final':
        deliver({ type: 'final', plan: message.plan });
        return;
      case 'failure':
        diagnose('failure', message.failure.detail);
        deliver({ type: 'failure', failure: message.failure });
        return;
      case 'rejection':
        diagnose('rejection', message.rejection.detail);
        reject(
          message.rejection.kind === 'abort'
            ? new BamlAbortError()
            : new BamlTransportError(TRANSPORT_FAILED_MESSAGE),
        );
        return;
    }
  };

  const onError = (error: Error): void => {
    diagnose('worker', error.message);
    reject(new BamlTransportError(TRANSPORT_FAILED_MESSAGE));
  };

  const onExit = (): void => {
    reject(new BamlTransportError(TRANSPORT_FAILED_MESSAGE));
  };

  const onAbort = (): void => {
    reject(new BamlAbortError());
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    clearStep();
    if (totalTimer !== null) {
      timers.clearTimeout(totalTimer);
      totalTimer = null;
    }
    signal?.removeEventListener('abort', onAbort);
    worker.off('message', onMessage);
    worker.off('error', onError);
    worker.off('exit', onExit);

    // A terminal outcome means the worker is finished, so the thread only has to
    // go away. Anything else — abort, deadline, an early consumer `return()` —
    // may still have a blocking native pull in flight, and a cooperative request
    // cannot be observed while it blocks. Ask, then force, within the grace.
    if (rejection === null && queue.length === 0 && terminal) {
      void worker.terminate();
      return;
    }
    try {
      worker.postMessage({ type: 'abort', operationId });
    } catch {
      // The port is already closed; forced termination below is the whole answer.
    }
    timers.setTimeout(() => {
      void worker.terminate();
    }, BAML_WORKER_ABORT_GRACE_MS);
  };

  worker.on('message', onMessage);
  worker.on('error', onError);
  worker.on('exit', onExit);
  signal?.addEventListener('abort', onAbort, { once: true });

  totalTimer = timers.setTimeout(
    () => {
      reject(new BamlTransportError(TRANSPORT_TIMEOUT_MESSAGE));
    },
    mode === 'call' ? BAML_CALL_TIMEOUT_MS : BAML_STREAM_TOTAL_TIMEOUT_MS,
  );

  try {
    worker.postMessage({ type: 'start', operationId, mode, clientName, input });

    for (;;) {
      if (rejection !== null) {
        throw rejection;
      }
      if (queue.length > 0) {
        yield queue.shift() as OperationEvent;
        continue;
      }
      if (terminal) {
        return;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    dispose();
  }
}

const publicFailure = (failure: WireFailure): BamlToolFailure => ({
  code: failure.code,
  message: failure.message,
  ...(failure.toolName == null ? {} : { toolName: failure.toolName }),
});

/**
 * A selection the caller did not bind this turn is reported, not dispatched and
 * not dropped: a host whose model keeps choosing an unbound tool would otherwise
 * see an empty assistant turn with no way to find out why.
 */
const toolCallsOutcome = (
  plan: WireTurnPlan,
  allowedTools: readonly string[],
): BamlToolCallsOutcome => {
  const allowed = new Set(allowedTools);
  const calls: BamlSelectedTool[] = [];
  const failures: BamlToolFailure[] = [];

  for (const tool of plan.tools) {
    if (!allowed.has(tool.name)) {
      failures.push({
        code: 'unbound',
        message: unboundToolMessage(tool.name),
        toolName: tool.name,
      });
      continue;
    }
    calls.push({ name: tool.name, args: tool.args });
  }

  return { kind: 'tool_calls', calls, failures };
};

/**
 * `meta` is absent on purpose. Bridge 0.15.0 exposes no verified PUBLIC call
 * metadata — the only counts reachable are on the stream's private `_acc`, which
 * neither survives the worker boundary nor counts as a supported surface — and
 * the port forbids fabricating zeros. BaseClient's fallback accounting owns
 * production token counting until a bridge release adds one.
 */
const finalOutcome = (plan: WireTurnPlan, allowedTools: readonly string[]): BamlTurnResult =>
  plan.tools.length === 0
    ? { kind: 'answer', text: plan.reply ?? '' }
    : toolCallsOutcome(plan, allowedTools);

/**
 * Runs before a worker exists, so an oversize transcript, an unsupported port
 * version, or an already-aborted caller costs nothing. `BaseChatModel` enters the
 * generator body before checking the signal, so without the abort check here an
 * already-cancelled call would still spawn a thread and issue a request.
 */
const precheck = (
  input: BamlPromptInput,
): { readonly failure: BamlToolFailure } | { readonly worker: WorkerTurnInput } => {
  if (input.signal?.aborted === true) {
    throw new BamlAbortError();
  }
  if (input.version !== SUPPORTED_PORT_VERSION) {
    return { failure: { code: 'schema_mismatch', message: PORT_VERSION_MESSAGE } };
  }
  const projected = projectTranscript(input.transcript);
  if (!projected.ok) {
    return { failure: publicFailure(projected.failure) };
  }
  return {
    worker: {
      userMessage: projected.value.userMessage,
      transcript: projected.value.transcript,
      allowedTools: [...input.allowedTools],
    },
  };
};

/**
 * Builds the port for ONE selected logical client. The name is required and
 * never validated against the compiled registry here: the facade must not load
 * the generated graph, so an unknown name becomes the worker's preflight
 * `model_error` on the first turn rather than a construction failure.
 */
export const createBamlFunctionSet = (options: BamlRuntimeOptions): BamlFunctionSet => {
  const clientName = options.clientName;
  if (typeof clientName !== 'string' || clientName.length === 0) {
    throw new TypeError('createBamlFunctionSet requires a non-empty clientName');
  }

  const timers = options.timers ?? REAL_TIMERS;
  const workers = options.workers ?? REAL_WORKER_FACTORY;
  const onDiagnostic = options.onDiagnostic;

  const operationParams = (
    mode: WorkerMode,
    input: BamlPromptInput,
    worker: WorkerTurnInput,
  ): OperationParams => ({
    mode,
    clientName,
    input: worker,
    timers,
    workers,
    ...(onDiagnostic == null ? {} : { onDiagnostic }),
    ...(input.signal == null ? {} : { signal: input.signal }),
  });

  return Object.freeze({
    version: SUPPORTED_PORT_VERSION,
    declaredTools: DECLARED_TOOLS,

    async takeTurn(input: BamlPromptInput): Promise<BamlTurnResult> {
      const checked = precheck(input);
      if ('failure' in checked) {
        return { kind: 'failure', failure: checked.failure };
      }

      for await (const event of runOperation(operationParams('call', input, checked.worker))) {
        if (event.type === 'failure') {
          return { kind: 'failure', failure: publicFailure(event.failure) };
        }
        if (event.type === 'final') {
          return finalOutcome(event.plan, input.allowedTools);
        }
      }

      throw new BamlTransportError(TRANSPORT_FAILED_MESSAGE);
    },

    async *streamTurn(input: BamlPromptInput): AsyncGenerator<BamlTurnChunk, void, void> {
      const checked = precheck(input);
      if ('failure' in checked) {
        yield { kind: 'failure', failure: checked.failure };
        return;
      }

      let cursor: PartialTextCursor = createPartialTextCursor();
      let toolTurn = false;

      for await (const event of runOperation(operationParams('stream', input, checked.worker))) {
        if (event.type === 'failure') {
          yield { kind: 'failure', failure: publicFailure(event.failure) };
          return;
        }

        if (event.type === 'final') {
          if (toolTurn || event.plan.tools.length > 0) {
            yield toolCallsOutcome(event.plan, input.allowedTools);
            return;
          }
          const step = consumeCumulativeTextSnapshot(cursor, event.plan);
          if (step.emission?.kind === 'failure') {
            yield { kind: 'failure', failure: publicFailure(step.emission.failure) };
          } else if (step.emission?.kind === 'text') {
            yield { kind: 'text', text: step.emission.text };
          }
          return;
        }

        // A structured turn is all-or-nothing: emitting a half-written call would
        // dispatch arguments the model has not finished writing.
        if (event.snapshot.tools.length > 0) {
          toolTurn = true;
          continue;
        }

        // `event.snapshot` crossed the worker boundary as runtime input, not a
        // trusted value — `consumeCumulativeTextSnapshot` is the one place that
        // owns the prefix/duplicate/divergence rules, so every chunk goes
        // through it rather than a second, hand-rolled copy of the same rules.
        const step = consumeCumulativeTextSnapshot(cursor, event.snapshot);
        cursor = step.cursor;
        if (step.emission?.kind === 'failure') {
          yield { kind: 'failure', failure: publicFailure(step.emission.failure) };
          return;
        }
        if (step.emission?.kind === 'text') {
          yield { kind: 'text', text: step.emission.text };
        }
      }

      throw new BamlTransportError(TRANSPORT_FAILED_MESSAGE);
    },
  });
};
