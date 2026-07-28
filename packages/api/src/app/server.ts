import { logger } from '@librechat/data-schemas';
import type { Server } from 'node:http';

/**
 * Node sweeps header/request timeouts on `connectionsCheckingInterval`, which is a
 * `createServer` option that `app.listen()` leaves at its 30s default. Values below this
 * are rounded up to it. `keepAliveTimeout` is socket-driven and stays exact.
 */
const TIMEOUT_SWEEP_RESOLUTION_MS = 30_000;

const parseTimeout = (value?: string): number | undefined => {
  if (value == null || value.trim() === '') {
    return undefined;
  }

  const timeout = Number(value);
  return Number.isSafeInteger(timeout) && timeout >= 0 ? timeout : undefined;
};

export const configureServerTimeouts = (
  server: Server,
  environment: NodeJS.ProcessEnv = process.env,
  versions: { bun?: string } = process.versions,
): void => {
  const keepAliveTimeout = parseTimeout(environment.HTTP_KEEP_ALIVE_TIMEOUT_MS);
  const keepAliveTimeoutBuffer = parseTimeout(environment.HTTP_KEEP_ALIVE_TIMEOUT_BUFFER_MS);
  const headersTimeout = parseTimeout(environment.HTTP_HEADERS_TIMEOUT_MS);
  const requestTimeout = parseTimeout(environment.HTTP_REQUEST_TIMEOUT_MS);

  if (keepAliveTimeout != null) {
    server.keepAliveTimeout = keepAliveTimeout;
  }
  if (keepAliveTimeoutBuffer != null) {
    server.keepAliveTimeoutBuffer = keepAliveTimeoutBuffer;
  }
  if (headersTimeout != null) {
    server.headersTimeout = headersTimeout;
  }
  if (requestTimeout != null) {
    server.requestTimeout = requestTimeout;
  }

  const configured = [keepAliveTimeout, keepAliveTimeoutBuffer, headersTimeout, requestTimeout];
  if (configured.every((value) => value == null)) {
    return;
  }

  /** Bun accepts and reflects these assignments back without enforcing them. */
  if (versions.bun != null) {
    logger.warn(
      'HTTP server timeouts are configured but Bun does not enforce them; run under Node.js for these settings to take effect.',
    );
  }

  const belowResolution = [
    { name: 'HTTP_HEADERS_TIMEOUT_MS', value: headersTimeout },
    { name: 'HTTP_REQUEST_TIMEOUT_MS', value: requestTimeout },
  ]
    .filter(({ value }) => value != null && value > 0 && value < TIMEOUT_SWEEP_RESOLUTION_MS)
    .map(({ name }) => name);

  if (belowResolution.length > 0) {
    logger.warn(
      `${belowResolution.join(', ')} set below the ${TIMEOUT_SWEEP_RESOLUTION_MS}ms connection sweep interval; expiry is only detected once per sweep, so the effective timeout is up to ${TIMEOUT_SWEEP_RESOLUTION_MS}ms.`,
    );
  }
};
