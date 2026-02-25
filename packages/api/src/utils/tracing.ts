import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '@librechat/data-schemas';

/** @see https://github.com/langchain-ai/langchainjs — @langchain/core RunTree ALS */
const TRACING_ALS_KEY = Symbol.for('ls:tracing_async_local_storage');

/**
 * Runs `fn` outside the LangGraph/LangSmith tracing AsyncLocalStorage context
 * so I/O handles (child processes, sockets, timers) created during `fn`
 * do not permanently retain the RunTree → graph config → message data chain.
 *
 * Relies on the private symbol `ls:tracing_async_local_storage` from `@langchain/core`.
 * If the symbol is absent, falls back to calling `fn()` directly.
 */
export function runOutsideTracing<T>(fn: () => T): T {
  const storage = (globalThis as typeof globalThis & Record<symbol, AsyncLocalStorage<unknown>>)[
    TRACING_ALS_KEY
  ];
  return storage ? storage.run(undefined as unknown, fn) : fn();
}

/** One-time check at import time — warns if the ALS symbol is missing */
const storage = (globalThis as typeof globalThis & Record<symbol, AsyncLocalStorage<unknown>>)[
  TRACING_ALS_KEY
];
if (!storage) {
  logger.warn(
    '[runOutsideTracing] LangSmith tracing ALS not found — runOutsideTracing will be a no-op. ' +
      'Verify @langchain/core version still uses Symbol.for("ls:tracing_async_local_storage").',
  );
}
