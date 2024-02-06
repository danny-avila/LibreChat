export default function useMemo<Value, Condition = any[]>(getValue: () => Value, condition: Condition, shouldUpdate: (prev: Condition, next: Condition) => boolean): Value;
