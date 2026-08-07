import type { MCPToolsChangedEvent } from './toolsChanged';
import {
  setMCPToolsChangedHandler,
  hasMCPToolsChangedHandler,
  notifyMCPToolsChanged,
} from './toolsChanged';

const createEvent = (name = 'one'): MCPToolsChangedEvent => ({
  serverName: 'dynamic',
  serverConfig: { type: 'streamable-http', url: 'https://mcp.example.com' },
  tools: [{ name, inputSchema: { type: 'object' } }],
});

describe('MCP tools-changed dispatch', () => {
  afterEach(() => {
    setMCPToolsChangedHandler(null);
    jest.useRealTimers();
  });

  it('reports whether a handler is registered', () => {
    expect(hasMCPToolsChangedHandler()).toBe(false);
    setMCPToolsChangedHandler(jest.fn());
    expect(hasMCPToolsChangedHandler()).toBe(true);
    setMCPToolsChangedHandler(null);
    expect(hasMCPToolsChangedHandler()).toBe(false);
  });

  it('passes a complete server snapshot and user scope to the handler', async () => {
    const handler = jest.fn();
    const event = { ...createEvent(), userId: 'user-1' };
    setMCPToolsChangedHandler(handler);

    await notifyMCPToolsChanged(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('awaits an async handler before returning', async () => {
    let finished = false;
    setMCPToolsChangedHandler(async () => {
      await Promise.resolve();
      finished = true;
    });

    await notifyMCPToolsChanged(createEvent());

    expect(finished).toBe(true);
  });

  it('coalesces an in-flight burst and publishes the newest snapshot last', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const published: string[] = [];
    const handler = jest.fn(async (event: MCPToolsChangedEvent) => {
      published.push(event.tools[0].name);
      if (event.tools[0].name === 'one') {
        await firstBlocked;
      }
    });
    setMCPToolsChangedHandler(handler);

    const first = notifyMCPToolsChanged(createEvent('one'));
    await Promise.resolve();
    const second = notifyMCPToolsChanged(createEvent('two'));
    const third = notifyMCPToolsChanged(createEvent('three'));
    releaseFirst?.();
    await Promise.all([first, second, third]);

    expect(published).toEqual(['one', 'three']);
  });

  it('retries a failed cache publication without rejecting the notification handler', async () => {
    jest.useFakeTimers();
    const handler = jest
      .fn<Promise<void>, [MCPToolsChangedEvent]>()
      .mockRejectedValueOnce(new Error('Redis down'))
      .mockResolvedValue(undefined);
    setMCPToolsChangedHandler(handler);

    await expect(notifyMCPToolsChanged(createEvent())).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(250);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('stops dispatching when the handler is unregistered during an in-flight failure', async () => {
    let rejectPublication: ((error: Error) => void) | undefined;
    const publication = new Promise<void>((_, reject) => {
      rejectPublication = reject;
    });
    const handler = jest.fn(() => publication);
    setMCPToolsChangedHandler(handler);

    const notification = notifyMCPToolsChanged(createEvent());
    await Promise.resolve();
    setMCPToolsChangedHandler(null);
    rejectPublication?.(new Error('publisher shutting down'));

    await expect(notification).resolves.toBeUndefined();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no handler is registered', async () => {
    await expect(notifyMCPToolsChanged(createEvent())).resolves.toBeUndefined();
  });
});
