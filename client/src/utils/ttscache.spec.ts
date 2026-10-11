import { TextEncoder } from 'util';
import { webcrypto } from 'crypto';
import { TTS_CACHE_NAME, clearTTSCache, getTTSCacheKey } from './ttscache';

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
