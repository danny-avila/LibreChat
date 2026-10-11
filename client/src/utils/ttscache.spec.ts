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
    expect(key).toMatch(/^\/tts-cache\/[0-9a-f]{64}$/);
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
    entries.set(`https://chat.example/tts-cache/${'a'.repeat(64)}`, {} as Response);
    await openTTSCache();
    expect(Array.from(entries.keys())).toEqual([
      `https://chat.example/tts-cache/${'a'.repeat(64)}`,
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
  type Listener = () => void;
  const tabs: FakeChannel[] = [];
  class FakeChannel {
    listeners: Listener[] = [];
    constructor(readonly name: string) {
      tabs.push(this);
    }

    addEventListener(_type: 'message', listener: Listener) {
      this.listeners.push(listener);
    }

    postMessage() {
      tabs
        .filter((tab) => tab !== this && tab.name === this.name)
        .forEach((tab) => {
          tab.listeners.forEach((listener) => listener());
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
