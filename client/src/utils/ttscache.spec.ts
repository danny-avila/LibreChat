import { TextEncoder } from 'util';
import { webcrypto } from 'crypto';
import {
  putTTSCache,
  openTTSCache,
  matchTTSCache,
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

  beforeEach(async () => {
    entries.clear();
    Object.defineProperty(globalThis, 'caches', {
      value: { open: jest.fn(async () => cache), delete: jest.fn(async () => true) },
      configurable: true,
    });
    /** A delete an earlier test left failing would otherwise be retried here. */
    await clearTTSCache();
    jest.clearAllMocks();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'caches');
  });

  it('deletes the legacy raw-text cache on every open and never opens it', async () => {
    await openTTSCache();
    await openTTSCache();
    expect(caches.delete).toHaveBeenCalledTimes(2);
    expect(caches.delete).toHaveBeenCalledWith('tts-responses');
    expect(caches.open).toHaveBeenCalledWith(TTS_CACHE_NAME);
    expect(caches.open).not.toHaveBeenCalledWith('tts-responses');
  });

  it('writes under the current session and skips a write started before logout', async () => {
    const epoch = getTTSCacheEpoch();
    await putTTSCache('/tts-cache/one', {} as Response, epoch);
    expect(cache.put).toHaveBeenCalledTimes(1);

    await clearTTSCache();
    await putTTSCache('/tts-cache/two', {} as Response, epoch);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it('treats a lookup that a clear overtakes as a miss', async () => {
    let release: () => void = () => undefined;
    entries.set('https://chat.example/tts-cache/v1/hit', {
      blob: () => new Promise<Blob>((resolve) => (release = () => resolve(new Blob(['a'])))),
    } as Response);
    const match = jest.fn(async (url: string) => entries.get(`https://chat.example${url}`));
    Object.assign(cache, { match });

    const lookup = matchTTSCache('/tts-cache/v1/hit');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await clearTTSCache();
    release();
    await expect(lookup).resolves.toBeUndefined();

    entries.set('https://chat.example/tts-cache/v1/hit', {
      blob: async () => new Blob(['a']),
    } as Response);
    await expect(matchTTSCache('/tts-cache/v1/hit')).resolves.toBeDefined();
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
    localStorage.clear();
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
    expect(del).toHaveBeenCalledWith(TTS_CACHE_NAME);
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
        key: TTS_CACHE_NAME,
        newValue: localStorage.getItem(TTS_CACHE_NAME),
      }),
    );
    await reading.putTTSCache('/tts-cache/late', {} as Response, epoch);
    await reading.putTTSCache('/tts-cache/next', {} as Response, reading.getTTSCacheEpoch());
    expect(put).not.toHaveBeenCalled();
  });

  /** Cache Storage shared by every tab and document; `failing` names whose delete rejects and
   *  `hanging` names whose delete never settles. */
  const fakeStorage = () => {
    const names = new Set<string>();
    const failing = new Set<string>();
    const hanging = new Set<string>();
    const storage = {
      names,
      failing,
      hanging,
      has: jest.fn(async (name: string) => names.has(name)),
      open: jest.fn(async (name: string) => {
        names.add(name);
        return { match: async () => ({ blob: async () => new Blob(['old']) }) };
      }),
      delete: jest.fn((name: string) => {
        if (hanging.has(name)) {
          return new Promise<boolean>(() => undefined);
        }
        if (failing.has(name)) {
          return Promise.reject(new Error('busy'));
        }
        return Promise.resolve(names.delete(name));
      }),
    };
    Object.defineProperty(globalThis, 'caches', { value: storage, configurable: true });
    return storage;
  };

  it('keeps the cache closed while its delete keeps failing', async () => {
    const storage = fakeStorage();
    storage.names.add(TTS_CACHE_NAME);
    storage.failing.add(TTS_CACHE_NAME);
    const tab = openTab();

    await tab.endTTSCacheSession();
    tab.openTTSCacheWrites();
    await expect(tab.openTTSCache()).rejects.toThrow();
    await expect(tab.matchTTSCache('/tts-cache/v1/any')).resolves.toBeUndefined();
    expect(storage.open).not.toHaveBeenCalledWith(TTS_CACHE_NAME);
  });

  it('retries a failed logout delete before the next session reads the cache', async () => {
    const storage = fakeStorage();
    storage.names.add(TTS_CACHE_NAME);
    storage.failing.add(TTS_CACHE_NAME);
    const tab = openTab();

    await tab.endTTSCacheSession();
    storage.failing.clear();
    tab.openTTSCacheWrites();
    await tab.openTTSCache();
    const deletedAt = storage.delete.mock.calls.findIndex(([name], index) => {
      return name === TTS_CACHE_NAME && index > 0;
    });
    const openedAt = storage.open.mock.calls.findIndex(([name]) => name === TTS_CACHE_NAME);
    expect(storage.delete.mock.invocationCallOrder[deletedAt]).toBeLessThan(
      storage.open.mock.invocationCallOrder[openedAt],
    );
  });

  it('finishes a logout delete cut short by navigation before the next document reads', async () => {
    const storage = fakeStorage();
    storage.names.add(TTS_CACHE_NAME);
    storage.hanging.add(TTS_CACHE_NAME);
    /** localStorage is full, so only Cache Storage can carry the marker across documents. */
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    /** The IdP redirect unloads the page while this delete is still running. */
    void openTab().endTTSCacheSession();
    await new Promise((resolve) => setTimeout(resolve, 0));

    storage.hanging.clear();
    const next = openTab();
    next.openTTSCacheWrites();
    await next.openTTSCache();
    const deletes = storage.delete.mock.calls.filter(([name]) => name === TTS_CACHE_NAME);
    expect(deletes).toHaveLength(2);
    const lastDelete = Math.max(
      ...storage.delete.mock.calls
        .map(([name], index) => (name === TTS_CACHE_NAME ? index : -1))
        .filter((index) => index >= 0)
        .map((index) => storage.delete.mock.invocationCallOrder[index]),
    );
    const openedAt = storage.open.mock.calls.findIndex(([name]) => name === TTS_CACHE_NAME);
    expect(lastDelete).toBeLessThan(storage.open.mock.invocationCallOrder[openedAt]);
    setItem.mockRestore();
  });

  it('reads nothing in a tab whose session another tab ended', async () => {
    Object.assign(globalThis, { BroadcastChannel: FakeChannel });
    const storage = fakeStorage();
    const stale = openTab();
    const leaving = openTab();
    stale.openTTSCacheWrites();

    await leaving.endTTSCacheSession();
    storage.names.add(TTS_CACHE_NAME);
    await expect(stale.matchTTSCache('/tts-cache/v1/any')).resolves.toBeUndefined();
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
