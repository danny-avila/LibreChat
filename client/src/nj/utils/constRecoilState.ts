import { AtomOptions, RecoilState, selector } from 'recoil';

/**
 * Returns a RecoilState<T> that *always* returns the defaultValue (and throws away `set()` calls)
 *
 * Sometimes we want to disable togglable features (e.g. forcing temporary chat to always be on).
 * In those cases, the lowest possible lift is simply to disable the state changes altogether.
 *
 * LibreChat uses Recoil for local state; this function gives a way to create a constant while
 * keeping the rest of the codebase unaware (and thus less changes needed).
 */
export function constRecoilState<T>(key: string, defaultValue: T): RecoilState<T> {
  return selector<T>({
    key: key,
    get: () => defaultValue,
    set: () => {},
  });
}

/**
 * Same as `constRecoilState()`, but uses `AtomOptions` for its parameters.
 */
export function constRecoilStateOpts<T>(options: AtomOptions<T>): RecoilState<T> {
  return constRecoilState(options.key, options['default']);
}
