import { createServer } from 'node:http';
import { logger } from '@librechat/data-schemas';
import { configureServerTimeouts } from './server';

describe('configureServerTimeouts', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  });

  afterEach(() => {
    warn.mockRestore();
    delete process.versions.bun;
  });

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

  it('warns that Bun does not enforce the configured timeouts', () => {
    process.versions.bun = '1.3.13';

    configureServerTimeouts(createServer(), { HTTP_KEEP_ALIVE_TIMEOUT_MS: '70000' });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Bun does not enforce them'));
  });

  it('stays quiet under Bun when no timeout is configured', () => {
    process.versions.bun = '1.3.13';

    configureServerTimeouts(createServer(), {});

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when header or request timeouts fall below the connection sweep interval', () => {
    configureServerTimeouts(createServer(), {
      HTTP_HEADERS_TIMEOUT_MS: '5000',
      HTTP_REQUEST_TIMEOUT_MS: '10000',
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('HTTP_HEADERS_TIMEOUT_MS, HTTP_REQUEST_TIMEOUT_MS'),
    );
  });

  it('does not warn about sweep resolution for zero or above-interval timeouts', () => {
    configureServerTimeouts(createServer(), {
      HTTP_KEEP_ALIVE_TIMEOUT_MS: '1000',
      HTTP_HEADERS_TIMEOUT_MS: '80000',
      HTTP_REQUEST_TIMEOUT_MS: '0',
    });

    expect(warn).not.toHaveBeenCalled();
  });
});
