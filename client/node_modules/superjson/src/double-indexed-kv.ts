export class DoubleIndexedKV<K, V> {
  keyToValue = new Map<K, V>();
  valueToKey = new Map<V, K>();

  set(key: K, value: V) {
    this.keyToValue.set(key, value);
    this.valueToKey.set(value, key);
  }

  getByKey(key: K): V | undefined {
    return this.keyToValue.get(key);
  }

  getByValue(value: V): K | undefined {
    return this.valueToKey.get(value);
  }

  clear() {
    this.keyToValue.clear();
    this.valueToKey.clear();
  }
}
