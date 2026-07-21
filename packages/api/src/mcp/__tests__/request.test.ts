import { EventEmitter } from 'events';

import { getMCPRequestContext, cleanupMCPRequestContextForReq } from '~/mcp/request';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

function createResponse({ ended = false } = {}): EventEmitter & {
  writableEnded: boolean;
  finished: boolean;
  destroyed: boolean;
} {
  const res = new EventEmitter() as EventEmitter & {
    writableEnded: boolean;
    finished: boolean;
    destroyed: boolean;
  };
  res.writableEnded = ended;
  res.finished = ended;
  res.destroyed = false;
  return res;
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('MCP request context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not create a response-scoped context after the response has finished', () => {
    const req = {};
    const res = createResponse({ ended: true });

    expect(getMCPRequestContext(req, res)).toBeUndefined();
  });

  it('keeps job-scoped contexts alive after response finish until explicit cleanup', async () => {
    const req = {};
    const res = createResponse();
    const context = getMCPRequestContext(req, undefined, { cleanupOnResponse: false });
    const disconnect = jest.fn().mockResolvedValue(undefined);
    context?.connections.set('server', { disconnect });

    expect(getMCPRequestContext(req, res)).toBe(context);

    res.emit('finish');
    await nextTick();

    expect(disconnect).not.toHaveBeenCalled();

    await cleanupMCPRequestContextForReq(req);

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(context?.connections.size).toBe(0);
    expect(context?.pending.size).toBe(0);
  });

  it('cleans response-scoped contexts when the response finishes', async () => {
    const req = {};
    const res = createResponse();
    const context = getMCPRequestContext(req, res);
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const pendingDisconnect = jest.fn().mockResolvedValue(undefined);

    context?.connections.set('server', { disconnect });
    context?.pending.set('pending-server', Promise.resolve({ disconnect: pendingDisconnect }));

    res.emit('finish');
    await nextTick();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(pendingDisconnect).toHaveBeenCalledTimes(1);
    expect(context?.connections.size).toBe(0);
    expect(context?.pending.size).toBe(0);
  });
});
