class TTLCache {
  constructor({ ttlMs = 30_000, maxEntries = 200 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  _pruneExpired(now = Date.now()) {
    for (const [key, entry] of this.store) {
      if (entry.expires <= now) {
        this.store.delete(key);
      } else {
        break;
      }
    }
  }

  get(key) {
    const now = Date.now();
    const hit = this.store.get(key);
    if (!hit) {
      return undefined;
    }
    if (hit.expires <= now) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh LRU order
    this.store.delete(key);
    this.store.set(key, { ...hit, expires: hit.expires });
    return hit.value;
  }

  set(key, value) {
    const now = Date.now();
    const expires = now + this.ttlMs;
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, { value, expires });

    if (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this._pruneExpired(now);
  }

  clear() {
    this.store.clear();
  }
}

module.exports = TTLCache;

