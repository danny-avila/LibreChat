import { initLogger } from 'braintrust';
import type { Logger } from 'braintrust';
import type { BraintrustConfig } from './config';
import { registerShutdownTask } from '../app/shutdown';
import { getBraintrustConfig } from './config';

export interface BraintrustController {
  readonly enabled: boolean;
  readonly logger?: Logger<true>;
  flush: () => Promise<void>;
}

const WARNING_CODE = 'LIBRECHAT_BRAINTRUST';
const FLUSH_TIMEOUT_MS = 5_000;

let activeLogger: Logger<true> | undefined;
let shutdownTaskRegistered = false;

function emitWarning(message: string): void {
  process.emitWarning(message, { code: WARNING_CODE });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timeout.unref?.();
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

export async function flushBraintrust(): Promise<void> {
  if (!activeLogger) {
    return;
  }

  await activeLogger.flush();
}

function makeController(): BraintrustController {
  return {
    get enabled() {
      return activeLogger != null;
    },
    get logger() {
      return activeLogger;
    },
    flush: flushBraintrust,
  };
}

function ensureShutdownTaskRegistered(): void {
  if (shutdownTaskRegistered) {
    return;
  }
  shutdownTaskRegistered = true;
  // Braintrust batches spans in a background flusher, so the final batch has to be
  // drained through the centralized shutdown coordinator (see ../app/shutdown.ts)
  // before the process exits, otherwise trailing spans are dropped on pod shutdown.
  registerShutdownTask(
    'braintrust',
    () =>
      withTimeout(flushBraintrust(), FLUSH_TIMEOUT_MS).catch((error) => {
        emitWarning(`Braintrust flush failed: ${getErrorMessage(error)}`);
      }),
    { priority: -100 },
  );
}

function createLogger(config: BraintrustConfig): Logger<true> {
  return initLogger({
    projectName: config.projectName,
    apiKey: config.apiKey,
    appUrl: config.appUrl,
  });
}

export function initializeBraintrust(env: NodeJS.ProcessEnv = process.env): BraintrustController {
  if (activeLogger) {
    return makeController();
  }

  const config = getBraintrustConfig(env);
  if (!config.enabled) {
    return makeController();
  }

  try {
    activeLogger = createLogger(config);
    ensureShutdownTaskRegistered();
  } catch (error) {
    emitWarning(`Braintrust initialization failed: ${getErrorMessage(error)}`);
  }

  return makeController();
}

export async function resetBraintrustForTests(): Promise<void> {
  try {
    await flushBraintrust().catch(() => undefined);
  } finally {
    activeLogger = undefined;
    shutdownTaskRegistered = false;
  }
}
