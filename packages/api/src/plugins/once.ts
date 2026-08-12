const DEFAULT_ONCE_CAPACITY = 10_000;

/**
 * Owner of cross-run "fired once" state for SessionStart and `once: true`
 * plugin hooks. Naming the owner as a seam lets `/api` substitute a shared
 * conversation-scoped store (e.g. the Redis/keyv cache layer) so once-state
 * survives replicas; the default in-memory store is per-process by design —
 * a multi-replica deployment over-fires rather than ever dropping a hook.
 */
export interface PluginHookOnceStore {
  /** Records the key; resolves true only the first time the key is seen. */
  markOnce(key: string): boolean | Promise<boolean>;
}

/**
 * Bounded in-memory store with least-recently-marked eviction: re-marking an
 * existing key refreshes its recency, so keys of active conversations are
 * touched every turn and eviction under the capacity bound only reaches the
 * conversations idle longest — a busy deployment cannot evict (and thereby
 * re-fire) a conversation that is still in use.
 */
export function createMemoryOnceStore(
  capacity: number = DEFAULT_ONCE_CAPACITY,
): PluginHookOnceStore {
  const keys = new Set<string>();
  return {
    markOnce(key: string): boolean {
      if (keys.has(key)) {
        keys.delete(key);
        keys.add(key);
        return false;
      }
      if (keys.size >= capacity) {
        const oldest = keys.values().next().value;
        if (oldest !== undefined) {
          keys.delete(oldest);
        }
      }
      keys.add(key);
      return true;
    },
  };
}

let store: PluginHookOnceStore = createMemoryOnceStore();

export function setPluginHookOnceStore(next: PluginHookOnceStore | undefined): void {
  store = next ?? createMemoryOnceStore();
}

export function getPluginHookOnceStore(): PluginHookOnceStore {
  return store;
}
