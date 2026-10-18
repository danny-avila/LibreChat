/** Value at a dot-path inside a plain object, or undefined when the path leaves it. */
export function deepGet(obj: object, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, never>)[key];
  }
  return current;
}
