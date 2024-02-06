type Updater<T> = T | ((prevValue: T) => T);
export type SetState<T> = (nextValue: Updater<T>, 
/**
 * Will not update state when destroyed.
 * Developer should make sure this is safe to ignore.
 */
ignoreDestroy?: boolean) => void;
/**
 * Same as React.useState but `setState` accept `ignoreDestroy` param to not to setState after destroyed.
 * We do not make this auto is to avoid real memory leak.
 * Developer should confirm it's safe to ignore themselves.
 */
export default function useSafeState<T>(defaultValue?: T | (() => T)): [T, SetState<T>];
export {};
