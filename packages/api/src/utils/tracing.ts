import { logger } from '@librechat/data-schemas';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isEnabled } from '~/utils/common';

/** @see https://github.com/langchain-ai/langchainjs — @langchain/core RunTree ALS */
const TRACING_ALS_KEY = Symbol.for('ls:tracing_async_local_storage');

let warnedMissing = false;

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
  if (!storage && !warnedMissing && isEnabled(process.env.LANGCHAIN_TRACING_V2)) {
    warnedMissing = true;
    logger.warn(
      '[runOutsideTracing] LANGCHAIN_TRACING_V2 is set but ALS not found — ' +
        'runOutsideTracing will be a no-op. ' +
        'Verify @langchain/core version still uses Symbol.for("ls:tracing_async_local_storage").',
    );
  }
  return storage ? storage.run(undefined as unknown, fn) : fn();
}
