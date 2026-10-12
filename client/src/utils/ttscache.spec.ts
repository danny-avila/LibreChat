import { TextEncoder } from 'util';
import { webcrypto } from 'crypto';
import {
  putTTSCache,
  openTTSCache,
  clearTTSCache,
  TTS_CACHE_NAME,
  getTTSCacheKey,
  getTTSCacheEpoch,
} from './ttscache';

const text = 'a private assistant reply';

describe('getTTSCacheKey', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    Object.assign(globalThis, { TextEncoder });
  });

  it('never contains the message text and is a request path', async () => {
    const key = await getTTSCacheKey(text, 'alloy');
    expect(key).toMatch(/^\/tts-cache\/v1\/[0-9a-f]{64}$/);
    expect(key).not.toContain('private');
  });

  it('is stable for the same text and voice and differs by voice or text', async () => {
    const key = await getTTSCacheKey(text, 'alloy');
    expect(await getTTSCacheKey(text, 'alloy')).toBe(key);
    expect(await getTTSCacheKey(text, 'echo')).not.toBe(key);
    expect(await getTTSCacheKey('other', 'alloy')).not.toBe(key);
  });

  it('returns null for empty text', async () => {
    expect(await getTTSCacheKey('', 'alloy')).toBeNull();
  });
});

describe('clearTTSCache', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'caches');
  });

  it('deletes the tts cache', async () => {
    const del = jest.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, 'caches', { value: { delete: del }, configurable: true });
    await clearTTSCache();
    expect(del).toHaveBeenCalledWith(TTS_CACHE_NAME);
  });

  it('tolerates a missing Cache API and rejected deletes', async () => {
    await expect(clearTTSCache()).resolves.toBeUndefined();
    const del = jest.fn().mockRejectedValue(new Error('blocked'));
    Object.defineProperty(globalThis, 'caches', { value: { delete: del }, configurable: true });
    await expect(clearTTSCache()).resolves.toBeUndefined();
  });
});

describe('openTTSCache and putTTSCache', () => {
  const entries = new Map<string, Response>();
  const cache = {
    keys: jest.fn(async () => Array.from(entries.keys(), (url) => ({ url }))),
    delete: jest.fn(async (request: { url: string }) => entries.delete(request.url)),
    put: jest.fn(async (url: string, response: Response) => {
      entries.set(`https://chat.example${url}`, response);
    }),
  };

  beforeEach(() => {
    entries.clear();
    jest.clearAllMocks();
    Object.defineProperty(globalThis, 'caches', {
      value: { open: jest.fn(async () => cache), delete: jest.fn(async () => true) },
      configurable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'caches');
  });

  it('drops entries keyed by raw message text and keeps hashed ones', async () => {
    entries.set('https://chat.example/a%20private%20assistant%20reply', {} as Response);
    entries.set('https://chat.example/tts-cache/private%20reply', {} as Response);
    entries.set(`https://chat.example/tts-cache/${'b'.repeat(64)}`, {} as Response);
    entries.set(`https://chat.example/tts-cache/v1/${'a'.repeat(64)}`, {} as Response);
    await openTTSCache();
    expect(Array.from(entries.keys())).toEqual([
      `https://chat.example/tts-cache/v1/${'a'.repeat(64)}`,
    ]);
  });

  it('writes under the current session and skips a write started before logout', async () => {
    const epoch = getTTSCacheEpoch();
    await putTTSCache('/tts-cache/one', {} as Response, epoch);
    expect(cache.put).toHaveBeenCalledTimes(1);

    await clearTTSCache();
    await putTTSCache('/tts-cache/two', {} as Response, epoch);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected write so playback is unaffected', async () => {
    cache.put.mockRejectedValueOnce(new Error('QuotaExceededError'));
    await expect(
      putTTSCache('/tts-cache/full', {} as Response, getTTSCacheEpoch()),
    ).resolves.toBeUndefined();
  });
});

describe('cross-tab logout', () => {
  type Listener = (event: { data: string }) => void;
  const tabs: FakeChannel[] = [];
  class FakeChannel {
    listeners: Listener[] = [];
    constructor(readonly name: string) {
      tabs.push(this);
    }

    addEventListener(_type: 'message', listener: Listener) {
      this.listeners.push(listener);
    }

    postMessage(data: string) {
      tabs
        .filter((tab) => tab !== this && tab.name === this.name)
        .forEach((tab) => {
          tab.listeners.forEach((listener) => listener({ data }));
        });
    }
  }

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'BroadcastChannel');
    Reflect.deleteProperty(globalThis, 'caches');
  });

  /** Each isolated module load is a separate tab sharing one Cache Storage. */
  const openTab = (): typeof import('./ttscache') => {
    let tab: typeof import('./ttscache') | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      tab = require('./ttscache') as typeof import('./ttscache');
    });
    return tab as typeof import('./ttscache');
  };

  it('drops a write in flight in another tab when this tab logs out', async () => {
    Object.assign(globalThis, { BroadcastChannel: FakeChannel });
    const put = jest.fn();
    Object.defineProperty(globalThis, 'caches', {
      value: { open: async () => ({ keys: async () => [], put }), delete: async () => true },
      configurable: true,
    });
    const reading = openTab();
    const leaving = openTab();

    const epoch = reading.getTTSCacheEpoch();
    await leaving.endTTSCacheSession();
    await reading.putTTSCache('/tts-cache/late', {} as Response, epoch);

    expect(put).not.toHaveBeenCalled();
  });

  it('keeps a still-signed-in tab from caching new audio until it authenticates again', async () => {
    Object.assign(globalThis, { BroadcastChannel: FakeChannel });
    const put = jest.fn();
    Object.defineProperty(globalThis, 'caches', {
      value: { open: async () => ({ keys: async () => [], put }), delete: async () => true },
      configurable: true,
    });
    const stale = openTab();
    const leaving = openTab();
    stale.openTTSCacheWrites();

    await leaving.endTTSCacheSession();
    await stale.putTTSCache('/tts-cache/after', {} as Response, stale.getTTSCacheEpoch());
    expect(put).not.toHaveBeenCalled();

    stale.openTTSCacheWrites();
    await stale.putTTSCache('/tts-cache/next', {} as Response, stale.getTTSCacheEpoch());
    expect(put).toHaveBeenCalledWith('/tts-cache/next', {});
  });

  it('still ends the session where a channel cannot be opened', async () => {
    Object.assign(globalThis, {
      BroadcastChannel: class {
        constructor() {
          throw new Error('SecurityError');
        }
      },
    });
    const del = jest.fn(async () => true);
    Object.defineProperty(globalThis, 'caches', { value: { delete: del }, configurable: true });

    await expect(openTab().endTTSCacheSession()).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith('tts-responses');
  });

  it('drops a write in flight in another tab after a manual clear, then caches again', async () => {
    Object.assign(globalThis, { BroadcastChannel: FakeChannel });
    const put = jest.fn();
    Object.defineProperty(globalThis, 'caches', {
      value: { open: async () => ({ keys: async () => [], put }), delete: async () => true },
      configurable: true,
    });
    const reading = openTab();
    const clearing = openTab();

    const epoch = reading.getTTSCacheEpoch();
    await clearing.clearTTSCache();
    await reading.putTTSCache('/tts-cache/late', {} as Response, epoch);
    expect(put).not.toHaveBeenCalled();

    await reading.putTTSCache('/tts-cache/new', {} as Response, reading.getTTSCacheEpoch());
    expect(put).toHaveBeenCalledWith('/tts-cache/new', {});
  });

  it('retries the legacy purge on the next open after a failed one', async () => {
    const keys = jest
      .fn()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValue([{ url: 'https://chat.example/raw%20text' }]);
    const del = jest.fn(async () => true);
    Object.defineProperty(globalThis, 'caches', {
      value: { open: async () => ({ keys, delete: del }) },
      configurable: true,
    });
    const tab = openTab();

    await tab.openTTSCache();
    expect(del).not.toHaveBeenCalled();
    await tab.openTTSCache();
    expect(del).toHaveBeenCalledWith({ url: 'https://chat.example/raw%20text' });
  });

  it('purges raw keys written back by an older tab after a sign-in', async () => {
    const stored = new Set<string>();
    const cache = {
      keys: async () => Array.from(stored, (url) => ({ url })),
      delete: async (request: { url: string }) => stored.delete(request.url),
    };
    Object.defineProperty(globalThis, 'caches', {
      value: { open: async () => cache },
      configurable: true,
    });
    const tab = openTab();

    await tab.openTTSCache();
    stored.add('https://chat.example/previous%20user%20reply');
    tab.openTTSCacheWrites();
    await tab.openTTSCache();
    expect(Array.from(stored)).toEqual([]);
  });

  it('purges again after another tab clears the cache', async () => {
    Object.assign(globalThis, { BroadcastChannel: FakeChannel });
    const stored = new Set<string>();
    const cache = {
      keys: async () => Array.from(stored, (url) => ({ url })),
      delete: async (request: { url: string }) => stored.delete(request.url),
    };
    Object.defineProperty(globalThis, 'caches', {
      value: { open: async () => cache, delete: async () => true },
      configurable: true,
    });
    const tab = openTab();
    const other = openTab();
    tab.getTTSCacheEpoch();

    await tab.openTTSCache();
    await other.endTTSCacheSession();
    stored.add('https://chat.example/raw%20reply');
    await tab.openTTSCache();
    expect(Array.from(stored)).toEqual([]);
  });

  it('drops audio a request started before this tab authenticated', async () => {
    const put = jest.fn();
    Object.defineProperty(globalThis, 'caches', {
      value: { open: async () => ({ keys: async () => [], put }), delete: async () => true },
      configurable: true,
    });
    const tab = openTab();
    await tab.endTTSCacheSession();

    const epoch = tab.getTTSCacheEpoch();
    tab.openTTSCacheWrites();
    await tab.putTTSCache('/tts-cache/stale', {} as Response, epoch);
    expect(put).not.toHaveBeenCalled();
  });

  it('retries a failed logout delete before the next session reads the cache', async () => {
    const del = jest.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue(true);
    const open = jest.fn(async () => ({ keys: async () => [] }));
    Object.defineProperty(globalThis, 'caches', {
      value: { open, delete: del },
      configurable: true,
    });
    const tab = openTab();

    await tab.endTTSCacheSession();
    tab.openTTSCacheWrites();
    await tab.openTTSCache();
    expect(del).toHaveBeenCalledTimes(2);
    expect(del.mock.invocationCallOrder[1]).toBeLessThan(open.mock.invocationCallOrder[0]);
  });

  it('carries a logout to other tabs through storage events without BroadcastChannel', async () => {
    const put = jest.fn();
    Object.defineProperty(globalThis, 'caches', {
      value: { open: async () => ({ keys: async () => [], put }), delete: async () => true },
      configurable: true,
    });
    const reading = openTab();
    const leaving = openTab();
    const epoch = reading.getTTSCacheEpoch();

    await leaving.endTTSCacheSession();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'tts-responses',
        newValue: localStorage.getItem('tts-responses'),
      }),
    );
    await reading.putTTSCache('/tts-cache/late', {} as Response, epoch);
    await reading.putTTSCache('/tts-cache/next', {} as Response, reading.getTTSCacheEpoch());
    expect(put).not.toHaveBeenCalled();
  });

  it('keeps caching after a manual clear from settings', async () => {
    const put = jest.fn();
    Object.defineProperty(globalThis, 'caches', {
      value: { open: async () => ({ keys: async () => [], put }), delete: async () => true },
      configurable: true,
    });
    const tab = openTab();

    await tab.clearTTSCache();
    await tab.putTTSCache('/tts-cache/again', {} as Response, tab.getTTSCacheEpoch());
    expect(put).toHaveBeenCalledTimes(1);
  });
});
