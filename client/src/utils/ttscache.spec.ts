import { TextEncoder } from 'util';
import { webcrypto } from 'crypto';
import {
  clearTTSCache,
  getTTSCacheKey,
  hasCachedTTSAudio,
  setCachedTTSAudio,
  getCachedTTSAudio,
  getTTSCacheGeneration,
} from './ttscache';

const text = 'a private assistant reply';
const audio = (label: string) => new Blob([label], { type: 'audio/mpeg' });

beforeEach(() => {
  clearTTSCache();
});

describe('getTTSCacheKey', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    Object.assign(globalThis, { TextEncoder });
  });

  it('is a SHA-256 hash that never contains the message text', async () => {
    const key = await getTTSCacheKey(text, 'alloy');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
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

describe('in-memory audio cache', () => {
  it('returns stored audio and misses unknown keys', () => {
    const recording = audio('one');
    setCachedTTSAudio('one', recording, getTTSCacheGeneration());
    expect(getCachedTTSAudio('one')).toBe(recording);
    expect(getCachedTTSAudio('two')).toBeUndefined();
    expect(hasCachedTTSAudio()).toBe(true);
  });

  it('evicts the least recently used entry beyond its cap', () => {
    const generation = getTTSCacheGeneration();
    for (let index = 0; index < 50; index += 1) {
      setCachedTTSAudio(`key-${index}`, audio(`${index}`), generation);
    }
    /** Playing the oldest entry makes it the most recent, so the next one goes instead. */
    expect(getCachedTTSAudio('key-0')).toBeDefined();
    setCachedTTSAudio('key-50', audio('50'), generation);

    expect(getCachedTTSAudio('key-0')).toBeDefined();
    expect(getCachedTTSAudio('key-1')).toBeUndefined();
    expect(getCachedTTSAudio('key-50')).toBeDefined();
  });

  it('empties on clear', () => {
    setCachedTTSAudio('one', audio('one'), getTTSCacheGeneration());
    clearTTSCache();
    expect(getCachedTTSAudio('one')).toBeUndefined();
    expect(hasCachedTTSAudio()).toBe(false);
  });

  it('drops audio from a request that was in flight across a clear', () => {
    const generation = getTTSCacheGeneration();
    clearTTSCache();
    setCachedTTSAudio('late', audio('late'), generation);
    expect(getCachedTTSAudio('late')).toBeUndefined();

    setCachedTTSAudio('next', audio('next'), getTTSCacheGeneration());
    expect(getCachedTTSAudio('next')).toBeDefined();
  });
});

describe('legacy Cache Storage cleanup', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'caches');
  });

  it('deletes the cache earlier versions persisted', async () => {
    const del = jest.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, 'caches', { value: { delete: del }, configurable: true });
    clearTTSCache();
    await Promise.resolve();
    expect(del).toHaveBeenCalledWith('tts-responses');
  });

  it('tolerates a missing Cache API and a rejected delete', async () => {
    Reflect.deleteProperty(globalThis, 'caches');
    expect(() => clearTTSCache()).not.toThrow();

    const del = jest.fn().mockRejectedValue(new Error('blocked'));
    Object.defineProperty(globalThis, 'caches', { value: { delete: del }, configurable: true });
    expect(() => clearTTSCache()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(del).toHaveBeenCalled();
  });
});
