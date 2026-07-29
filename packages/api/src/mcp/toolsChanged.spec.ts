import {
  setMCPToolsChangedHandler,
  hasMCPToolsChangedHandler,
  notifyMCPToolsChanged,
} from './toolsChanged';

describe('MCP tools-changed dispatch', () => {
  afterEach(() => {
    setMCPToolsChangedHandler(null);
  });

  it('reports whether a handler is registered', () => {
    expect(hasMCPToolsChangedHandler()).toBe(false);
    setMCPToolsChangedHandler(jest.fn());
    expect(hasMCPToolsChangedHandler()).toBe(true);
    setMCPToolsChangedHandler(null);
    expect(hasMCPToolsChangedHandler()).toBe(false);
  });

  it('passes the server and user scope to the handler', async () => {
    const handler = jest.fn();
    setMCPToolsChangedHandler(handler);

    await notifyMCPToolsChanged({ serverName: 'dynamic', userId: 'user-1' });
    await notifyMCPToolsChanged({ serverName: 'dynamic' });

    expect(handler).toHaveBeenNthCalledWith(1, { serverName: 'dynamic', userId: 'user-1' });
    expect(handler).toHaveBeenNthCalledWith(2, { serverName: 'dynamic' });
  });

  it('awaits an async handler before returning', async () => {
    let finished = false;
    setMCPToolsChangedHandler(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished = true;
    });

    await notifyMCPToolsChanged({ serverName: 'dynamic' });

    expect(finished).toBe(true);
  });

  it('swallows handler errors - a notification has nowhere to report them', async () => {
    setMCPToolsChangedHandler(() => {
      throw new Error('cache unavailable');
    });

    await expect(notifyMCPToolsChanged({ serverName: 'dynamic' })).resolves.toBeUndefined();
  });

  it('swallows async handler rejections as well', async () => {
    setMCPToolsChangedHandler(() => Promise.reject(new Error('redis down')));

    await expect(notifyMCPToolsChanged({ serverName: 'dynamic' })).resolves.toBeUndefined();
  });

  it('does nothing when no handler is registered', async () => {
    await expect(notifyMCPToolsChanged({ serverName: 'dynamic' })).resolves.toBeUndefined();
  });
});
