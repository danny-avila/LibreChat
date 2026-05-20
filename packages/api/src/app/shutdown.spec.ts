/// <reference types="jest" />
import http from 'http';
import {
  setupGracefulShutdown,
  registerShutdownTask,
  __resetShutdownStateForTests,
} from './shutdown';

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const triggerSignal = (signal: NodeJS.Signals): void => {
  const listeners = process.listeners(signal) as NodeJS.SignalsListener[];
  listeners.forEach((listener) => listener(signal));
};

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('setupGracefulShutdown', () => {
  let server: http.Server;
  let exitSpy: jest.SpyInstance;
  let originalSigterm: NodeJS.SignalsListener[];
  let originalSigint: NodeJS.SignalsListener[];
  let originalSigquit: NodeJS.SignalsListener[];
  let originalSighup: NodeJS.SignalsListener[];

  beforeEach(() => {
    server = http.createServer();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    originalSigterm = process.listeners('SIGTERM').slice() as NodeJS.SignalsListener[];
    originalSigint = process.listeners('SIGINT').slice() as NodeJS.SignalsListener[];
    originalSigquit = process.listeners('SIGQUIT').slice() as NodeJS.SignalsListener[];
    originalSighup = process.listeners('SIGHUP').slice() as NodeJS.SignalsListener[];
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGQUIT');
    process.removeAllListeners('SIGHUP');
    __resetShutdownStateForTests();
  });

  afterEach(() => {
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGQUIT');
    process.removeAllListeners('SIGHUP');
    originalSigterm.forEach((listener) => process.on('SIGTERM', listener));
    originalSigint.forEach((listener) => process.on('SIGINT', listener));
    originalSigquit.forEach((listener) => process.on('SIGQUIT', listener));
    originalSighup.forEach((listener) => process.on('SIGHUP', listener));
    exitSpy.mockRestore();
    if (server.listening) {
      server.close();
    }
    __resetShutdownStateForTests();
    jest.useRealTimers();
  });

  it('registers handlers for SIGTERM, SIGINT, SIGQUIT, and SIGHUP', () => {
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGQUIT', 'SIGHUP'] as NodeJS.Signals[]) {
      expect(process.listenerCount(signal)).toBe(0);
    }
    setupGracefulShutdown(server);
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGQUIT', 'SIGHUP'] as NodeJS.Signals[]) {
      expect(process.listenerCount(signal)).toBe(1);
    }
  });

  it('closes the server and exits 0 on SIGTERM', async () => {
    const closeSpy = jest.spyOn(server, 'close').mockImplementation((cb?: (err?: Error) => void) => {
      if (cb) {
        setImmediate(() => cb());
      }
      return server;
    });
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    await flush();
    await flush();
    expect(closeSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('closes the server and exits 0 on SIGINT', async () => {
    const closeSpy = jest.spyOn(server, 'close').mockImplementation((cb?: (err?: Error) => void) => {
      if (cb) {
        setImmediate(() => cb());
      }
      return server;
    });
    setupGracefulShutdown(server);
    triggerSignal('SIGINT');
    await flush();
    await flush();
    expect(closeSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 1 if server.close yields an error', async () => {
    const closeErr = new Error('close failed');
    jest.spyOn(server, 'close').mockImplementation((cb?: (err?: Error) => void) => {
      if (cb) {
        setImmediate(() => cb(closeErr));
      }
      return server;
    });
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    await flush();
    await flush();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('is idempotent — a second signal does not trigger another shutdown', async () => {
    const closeSpy = jest.spyOn(server, 'close');
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    triggerSignal('SIGTERM');
    await flush();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('force-exits with code 1 if shutdown exceeds the timeout', () => {
    jest.useFakeTimers();
    jest.spyOn(server, 'close').mockImplementation(() => server);
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    jest.advanceTimersByTime(60_000);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('runs registered tasks after server.close and before exit', async () => {
    const calls: string[] = [];
    jest.spyOn(server, 'close').mockImplementation((cb?: (err?: Error) => void) => {
      calls.push('server.close');
      if (cb) {
        setImmediate(() => cb());
      }
      return server;
    });
    registerShutdownTask('task-a', () => {
      calls.push('task-a');
    });
    registerShutdownTask('task-b', () => {
      calls.push('task-b');
    });
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    await flush();
    await flush();
    expect(calls).toEqual(['server.close', 'task-a', 'task-b']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('runs tasks in registration order', async () => {
    const order: string[] = [];
    jest.spyOn(server, 'close').mockImplementation((cb?: (err?: Error) => void) => {
      if (cb) {
        setImmediate(() => cb());
      }
      return server;
    });
    ['first', 'second', 'third'].forEach((name) => {
      registerShutdownTask(name, () => {
        order.push(name);
      });
    });
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    await flush();
    await flush();
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('continues subsequent tasks and still exits if one task throws', async () => {
    const calls: string[] = [];
    jest.spyOn(server, 'close').mockImplementation((cb?: (err?: Error) => void) => {
      if (cb) {
        setImmediate(() => cb());
      }
      return server;
    });
    registerShutdownTask('ok-before', () => {
      calls.push('ok-before');
    });
    registerShutdownTask('throws', () => {
      calls.push('throws');
      throw new Error('boom');
    });
    registerShutdownTask('ok-after', () => {
      calls.push('ok-after');
    });
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    await flush();
    await flush();
    expect(calls).toEqual(['ok-before', 'throws', 'ok-after']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('awaits async tasks before exiting', async () => {
    const calls: string[] = [];
    jest.spyOn(server, 'close').mockImplementation((cb?: (err?: Error) => void) => {
      if (cb) {
        setImmediate(() => cb());
      }
      return server;
    });
    registerShutdownTask('async-task', async () => {
      await new Promise((resolve) => setImmediate(resolve));
      calls.push('async-done');
    });
    setupGracefulShutdown(server);
    triggerSignal('SIGTERM');
    await flush();
    await flush();
    await flush();
    expect(calls).toEqual(['async-done']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
