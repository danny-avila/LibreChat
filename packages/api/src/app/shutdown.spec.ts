/// <reference types="jest" />
import http from 'http';
import { setupGracefulShutdown } from './shutdown';

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const triggerSignal = (signal: NodeJS.Signals): void => {
  const listeners = process.listeners(signal) as NodeJS.SignalsListener[];
  listeners.forEach((listener) => listener(signal));
};

describe('setupGracefulShutdown', () => {
  let server: http.Server;
  let exitSpy: jest.SpyInstance;
  let originalSigterm: NodeJS.SignalsListener[];
  let originalSigint: NodeJS.SignalsListener[];

  beforeEach(() => {
    server = http.createServer();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    originalSigterm = process.listeners('SIGTERM').slice() as NodeJS.SignalsListener[];
    originalSigint = process.listeners('SIGINT').slice() as NodeJS.SignalsListener[];
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  afterEach(() => {
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    originalSigterm.forEach((listener) => process.on('SIGTERM', listener));
    originalSigint.forEach((listener) => process.on('SIGINT', listener));
    exitSpy.mockRestore();
    if (server.listening) {
      server.close();
    }
    jest.useRealTimers();
  });

  it('registers handlers for SIGTERM and SIGINT', () => {
    expect(process.listenerCount('SIGTERM')).toBe(0);
    expect(process.listenerCount('SIGINT')).toBe(0);
    setupGracefulShutdown(server);
    expect(process.listenerCount('SIGTERM')).toBe(1);
    expect(process.listenerCount('SIGINT')).toBe(1);
  });

  it('closes the server and exits 0 on SIGTERM', (done) => {
    const closeSpy = jest.spyOn(server, 'close');
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    setImmediate(() => {
      expect(closeSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
      done();
    });
  });

  it('closes the server and exits 0 on SIGINT', (done) => {
    const closeSpy = jest.spyOn(server, 'close');
    setupGracefulShutdown(server);
    triggerSignal('SIGINT');
    setImmediate(() => {
      expect(closeSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
      done();
    });
  });

  it('exits 1 if server.close yields an error', (done) => {
    const closeErr = new Error('close failed');
    jest.spyOn(server, 'close').mockImplementation((cb?: (err?: Error) => void) => {
      if (cb) {
        setImmediate(() => cb(closeErr));
      }
      return server;
    });
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    setImmediate(() => {
      expect(exitSpy).toHaveBeenCalledWith(1);
      done();
    });
  });

  it('is idempotent — a second signal does not trigger another shutdown', (done) => {
    const closeSpy = jest.spyOn(server, 'close');
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    triggerSignal('SIGTERM');
    expect(closeSpy).toHaveBeenCalledTimes(1);
    // server.close on a non-listening server schedules its callback via
    // setImmediate; drain it before afterEach restores the process.exit spy
    // so the real process.exit(1) cannot kill the test runner.
    setImmediate(done);
  });

  it('force-exits with code 1 if shutdown exceeds the timeout', () => {
    jest.useFakeTimers();
    jest.spyOn(server, 'close').mockImplementation(() => server);
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    jest.advanceTimersByTime(60_000);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
