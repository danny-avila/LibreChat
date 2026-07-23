import type { Server } from 'node:http';

interface HttpServerEnvironment {
  HTTP_KEEP_ALIVE_TIMEOUT_MS?: string;
  HTTP_KEEP_ALIVE_TIMEOUT_BUFFER_MS?: string;
  HTTP_HEADERS_TIMEOUT_MS?: string;
  HTTP_REQUEST_TIMEOUT_MS?: string;
}

const parseTimeout = (value?: string): number | undefined => {
  if (value == null || value.trim() === '') {
    return undefined;
  }

  const timeout = Number(value);
  return Number.isSafeInteger(timeout) && timeout >= 0 ? timeout : undefined;
};

export const configureServerTimeouts = (
  server: Server,
  environment: HttpServerEnvironment = process.env,
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
};
