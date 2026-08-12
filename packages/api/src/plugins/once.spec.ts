import { createMemoryOnceStore, getPluginHookOnceStore, setPluginHookOnceStore } from './once';

describe('createMemoryOnceStore', () => {
  it('returns true only the first time a key is marked', () => {
    const store = createMemoryOnceStore();
    expect(store.markOnce('a')).toBe(true);
    expect(store.markOnce('a')).toBe(false);
    expect(store.markOnce('b')).toBe(true);
  });

  it('evicts the least-recently-marked key, never an actively re-marked one', () => {
    const store = createMemoryOnceStore(2);
    expect(store.markOnce('active')).toBe(true);
    expect(store.markOnce('idle')).toBe(true);
    /** Re-marking refreshes recency, so "idle" is now the oldest key. */
    expect(store.markOnce('active')).toBe(false);
    expect(store.markOnce('new')).toBe(true);
    expect(store.markOnce('active')).toBe(false);
    /** Only the idle key was evicted and fires again. */
    expect(store.markOnce('idle')).toBe(true);
  });
});

describe('setPluginHookOnceStore', () => {
  afterEach(() => {
    setPluginHookOnceStore(undefined);
  });

  it('installs a replacement store and restores a fresh default when cleared', () => {
    const marked: string[] = [];
    setPluginHookOnceStore({
      markOnce(key) {
        marked.push(key);
        return true;
      },
    });
    expect(getPluginHookOnceStore().markOnce('shared-key')).toBe(true);
    expect(marked).toEqual(['shared-key']);
    setPluginHookOnceStore(undefined);
    expect(getPluginHookOnceStore().markOnce('fresh')).toBe(true);
    expect(getPluginHookOnceStore().markOnce('fresh')).toBe(false);
  });
});
