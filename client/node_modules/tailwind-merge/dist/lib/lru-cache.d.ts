export interface LruCache<Key, Value> {
    get(key: Key): Value | undefined;
    set(key: Key, value: Value): void;
}
export declare function createLruCache<Key, Value>(maxCacheSize: number): LruCache<Key, Value>;
