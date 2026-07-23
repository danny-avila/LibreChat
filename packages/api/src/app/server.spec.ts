import { createServer } from 'node:http';

import { configureServerTimeouts } from './server';

describe('configureServerTimeouts', () => {
  it('preserves Node.js defaults when variables are unset', () => {
    const server = createServer();
    const defaults = {
      keepAliveTimeout: server.keepAliveTimeout,
      keepAliveTimeoutBuffer: server.keepAliveTimeoutBuffer,
      headersTimeout: server.headersTimeout,
      requestTimeout: server.requestTimeout,
    };

    configureServerTimeouts(server, {});

    expect(server.keepAliveTimeout).toBe(defaults.keepAliveTimeout);
    expect(server.keepAliveTimeoutBuffer).toBe(defaults.keepAliveTimeoutBuffer);
    expect(server.headersTimeout).toBe(defaults.headersTimeout);
    expect(server.requestTimeout).toBe(defaults.requestTimeout);
  });

  it('applies configured timeout values', () => {
    const server = createServer();

    configureServerTimeouts(server, {
      HTTP_KEEP_ALIVE_TIMEOUT_MS: '70000',
      HTTP_KEEP_ALIVE_TIMEOUT_BUFFER_MS: '5000',
      HTTP_HEADERS_TIMEOUT_MS: '80000',
      HTTP_REQUEST_TIMEOUT_MS: '300000',
    });

    expect(server.keepAliveTimeout).toBe(70_000);
    expect(server.keepAliveTimeoutBuffer).toBe(5_000);
    expect(server.headersTimeout).toBe(80_000);
    expect(server.requestTimeout).toBe(300_000);
  });

  it('ignores invalid values and permits zero to disable a timeout', () => {
    const server = createServer();
    const defaultKeepAliveTimeout = server.keepAliveTimeout;
    const defaultHeadersTimeout = server.headersTimeout;

    configureServerTimeouts(server, {
      HTTP_KEEP_ALIVE_TIMEOUT_MS: '-1',
      HTTP_KEEP_ALIVE_TIMEOUT_BUFFER_MS: '0',
      HTTP_HEADERS_TIMEOUT_MS: 'not-a-number',
      HTTP_REQUEST_TIMEOUT_MS: '0',
    });

    expect(server.keepAliveTimeout).toBe(defaultKeepAliveTimeout);
    expect(server.keepAliveTimeoutBuffer).toBe(0);
    expect(server.headersTimeout).toBe(defaultHeadersTimeout);
    expect(server.requestTimeout).toBe(0);
  });
});
