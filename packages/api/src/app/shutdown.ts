import { logger } from '@librechat/data-schemas';
import type { Server } from 'http';

const SHUTDOWN_TIMEOUT_MS = 60_000;
const SIGNALS: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGQUIT', 'SIGHUP'];

export type ShutdownPhase = 'pre-drain' | 'post-drain';

export type ShutdownTaskOptions = {
  priority?: number;
  phase?: ShutdownPhase;
};

type ShutdownTask = {
  name: string;
  fn: () => void | Promise<void>;
  phase: ShutdownPhase;
  priority: number;
  registrationOrder: number;
};

const tasks: ShutdownTask[] = [];
let nextRegistrationOrder = 0;
let isShuttingDown = false;
let httpServer: Server | null = null;

/**
 * Register a cleanup task for graceful shutdown. Post-drain is the default phase.
 * Higher-priority tasks run first; tasks at the same priority retain registration order.
 * If one throws, subsequent tasks and the final exit are not blocked. Use this instead of
 * attaching `process.on('SIGTERM', ...)` handlers directly — multiple competing signal
 * handlers race with the HTTP drain because Node dispatches listeners in registration order
 * and any one of them can call `process.exit` before the HTTP server has finished closing.
 */
export function registerShutdownTask(
  name: string,
  fn: () => void | Promise<void>,
  options: ShutdownTaskOptions = {},
): void {
  const phase: ShutdownPhase = options.phase === 'pre-drain' ? 'pre-drain' : 'post-drain';
  const priority = Number.isFinite(options.priority) ? (options.priority ?? 0) : 0;
  tasks.push({ name, fn, phase, priority, registrationOrder: nextRegistrationOrder++ });
}

/**
 * Wires SIGTERM, SIGINT, SIGQUIT, and SIGHUP to a graceful shutdown
 * sequence: initiate HTTP server close to stop accepting new connections,
 * run pre-drain tasks while in-flight requests settle, await the HTTP drain,
 * run post-drain tasks, then `process.exit(0)`. After
 * SHUTDOWN_TIMEOUT_MS the process is force-exited with code 1 — a
 * safety net for long-lived connections such as SSE streams that may
 * not finish in time.
 */
export function setupGracefulShutdown(server: Server): void {
  httpServer = server;
  for (const signal of SIGNALS) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}

/**
 * @internal Reset module state for tests. Not part of the public API.
 */
export function __resetShutdownStateForTests(): void {
  tasks.length = 0;
  nextRegistrationOrder = 0;
  isShuttingDown = false;
  httpServer = null;
}

async function runShutdownTasks(phase: ShutdownPhase): Promise<void> {
  const orderedTasks = tasks
    .filter((task) => task.phase === phase)
    .sort(
      (left, right) =>
        right.priority - left.priority || left.registrationOrder - right.registrationOrder,
    );

  for (const task of orderedTasks) {
    try {
      logger.info(`Running ${phase} shutdown task: ${task.name}`);
      await task.fn();
    } catch (err) {
      logger.error(`Shutdown task "${task.name}" failed:`, err);
    }
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  logger.info(`Received ${signal}, draining HTTP server...`);

  const forceExit = setTimeout(() => {
    logger.warn(`Graceful shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  let exitCode = 0;

  const serverClosePromise = closeHttpServer().catch((err) => {
    logger.error('Error closing HTTP server during graceful shutdown:', err);
    exitCode = 1;
  });

  await runShutdownTasks('pre-drain');
  await serverClosePromise;
  await runShutdownTasks('post-drain');

  clearTimeout(forceExit);
  logger.info('Graceful shutdown complete, exiting');
  process.exit(exitCode);
}

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!httpServer || !httpServer.listening) {
      // SIGTERM can arrive during startup before the listen socket is open,
      // in which case there is nothing to drain. Node also surfaces this as
      // an ERR_SERVER_NOT_RUNNING error in the close callback — treated
      // below as a successful close so a routine shutdown doesn't trip
      // orchestrator restart/backoff with exit code 1.
      resolve();
      return;
    }
    httpServer.close((err) => {
      if (!err || (err as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
        resolve();
        return;
      }
      reject(err);
    });
  });
}
