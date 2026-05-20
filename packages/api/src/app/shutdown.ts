import { logger } from '@librechat/data-schemas';
import type { Server } from 'http';

const SHUTDOWN_TIMEOUT_MS = 60_000;

/**
 * Wires SIGTERM and SIGINT to a graceful HTTP shutdown. Without this, Node.js
 * exits immediately on signal and in-flight HTTP requests are reset, plus
 * downstream connections (Mongoose, Redis, etc.) are torn down mid-operation.
 * The handler stops accepting new connections, lets existing requests complete,
 * and then exits cleanly. After SHUTDOWN_TIMEOUT_MS the process is
 * force-exited — a safety net for long-lived connections such as SSE streams
 * that may not finish in time.
 */
export function setupGracefulShutdown(server: Server): void {
  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}, draining HTTP server...`);

    server.close((err) => {
      if (err) {
        logger.error('Error closing HTTP server during graceful shutdown:', err);
        process.exit(1);
      }
      logger.info('HTTP server closed cleanly, exiting');
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn(`Graceful shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
