function valuesOfObj<T>(record: Record<string, T>): T[] {
  if ('values' in Object) {
    // eslint-disable-next-line es5/no-es6-methods
    return Object.values(record);
  }

  const values: T[] = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const key in record) {
    if (record.hasOwnProperty(key)) {
      values.push(record[key]);
    }
  }

  return values;
}

export function find<T>(
  record: Record<string, T>,
  predicate: (v: T) => boolean
): T | undefined {
  const values = valuesOfObj(record);
  if ('find' in values) {
    // eslint-disable-next-line es5/no-es6-methods
    return values.find(predicate);
  }

  const valuesNotNever = values as T[];

  for (let i = 0; i < valuesNotNever.length; i++) {
    const value = valuesNotNever[i];
    if (predicate(value)) {
      return value;
    }
  }

  return undefined;
}

export function forEach<T>(
  record: Record<string, T>,
  run: (v: T, key: string) => void
) {
  Object.entries(record).forEach(([key, value]) => run(value, key));
}

export function includes<T>(arr: T[], value: T) {
  return arr.indexOf(value) !== -1;
}

export function findArr<T>(
  record: T[],
  predicate: (v: T) => boolean
): T | undefined {
  for (let i = 0; i < record.length; i++) {
    const value = record[i];
    if (predicate(value)) {
      return value;
    }
  }

  return undefined;
}
